//connection.js

import { AuthService } from './auth.js';

class WebSocketFrame {
    static createBinaryFrame(data) {
        const payload = new Uint8Array(data);
        const payloadLength = payload.length;
        
        // Determine frame size based on payload length
        let frameSize = 0;
        let offset = 2; // Basic header size
        
        if (payloadLength < 126) {
            frameSize = payloadLength + 6; // Header(2) + Mask(4) + Payload
        } else if (payloadLength < 65536) {
            frameSize = payloadLength + 8; // Header(2) + Length(2) + Mask(4) + Payload
            offset = 4;
        } else {
            frameSize = payloadLength + 14; // Header(2) + Length(8) + Mask(4) + Payload
            offset = 10;
        }
        
        const frame = new Uint8Array(frameSize);
        const mask = new Uint8Array(4);
        crypto.getRandomValues(mask);
        
        // Set header
        frame[0] = 0x82; // Binary frame (0x02) with FIN bit (0x80)
        
        // Set length
        if (payloadLength < 126) {
            frame[1] = 0x80 | payloadLength;
        } else if (payloadLength < 65536) {
            frame[1] = 0x80 | 126;
            frame[2] = (payloadLength >> 8) & 0xFF;
            frame[3] = payloadLength & 0xFF;
        } else {
            frame[1] = 0x80 | 127;
            const lengthBytes = new DataView(new ArrayBuffer(8));
            lengthBytes.setBigUint64(0, BigInt(payloadLength));
            frame.set(new Uint8Array(lengthBytes.buffer), 2);
        }
        
        // Add mask
        frame.set(mask, offset);
        
        // Add masked payload
        for (let i = 0; i < payloadLength; i++) {
            frame[offset + 4 + i] = payload[i] ^ mask[i % 4];
        }
        
        return frame.buffer;
    }
}

class Island {
    constructor(x, y, radius) {
        this.x = x;
        this.y = y;
        this.radius = radius;
    }

    draw(ctx) {
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fillStyle = '#7B5B3B';  // Brown color for islands
        ctx.fill();
        ctx.strokeStyle = '#5A4229';  // Darker brown for border
        ctx.lineWidth = 2;
        ctx.stroke();
    }
}

export class MovementData {
    static GRID_SIZE = 250;
    static MAX_GRID_POS = Number.MAX_SAFE_INTEGER;
    static MIN_GRID_POS = Number.MIN_SAFE_INTEGER;
    static VIEW_CENTER = {
        x: window.innerWidth / 2,
        y: window.innerHeight / 2
    };
    static SEND_RATE = 50; // Increase to 20 updates per second (50ms)
    static lastSendTime = 0;
    static sentCount = 0;
    static islands = [];
    
    constructor(x, y, z, rotation, playerId) {
        // Validate world position
        this.worldX = this.validateNumber(x);
        this.worldY = this.validateNumber(y);
        this.z = this.validateNumber(z);
        this.rotation = this.validateNumber(rotation);
        this.playerId = Math.floor(this.validateNumber(playerId));

        const now = Date.now();
        if (now - MovementData.lastSendTime >= MovementData.SEND_RATE) {
            MovementData.lastSendTime = now;
            MovementData.sentCount++;
        }

        // Calculate screen transform
        this.screenX = MovementData.VIEW_CENTER.x;
        this.screenY = MovementData.VIEW_CENTER.y;
        this.worldOffsetX = -this.worldX;
        this.worldOffsetY = -this.worldY;
    }

    // Add new method to draw coordinates
    drawCoordinates(ctx) {
        if (!ctx) return;
        
        // Save current transform
        ctx.save();
        
        // Reset transform for UI elements
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        
        // Draw coordinate text
        ctx.font = '14px Arial';
        ctx.fillStyle = '#000000';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        
        const text = `X: ${Math.round(this.worldX)} Y: ${Math.round(this.worldY)}`;
        ctx.fillText(text, 10, 10);
        
        // Restore transform
        ctx.restore();
    }
    
    applyTransform(ctx) {
        ctx.save();
        // Center view on screen
        ctx.translate(MovementData.VIEW_CENTER.x, MovementData.VIEW_CENTER.y);
        // Move world opposite to player movement
        ctx.translate(this.worldOffsetX, this.worldOffsetY);
    }

    restoreTransform(ctx) {
        ctx.restore();
    }

    validateNumber(value) {
        // Check type
        if (typeof value !== 'number') {
            console.warn('[MovementData] Invalid type:', typeof value);
            return 0;
        }
        
        // Check for NaN/Infinity
        if (!Number.isFinite(value)) {
            console.warn('[MovementData] Non-finite value:', value);
            return 0;
        }
        
        // Clamp to valid range
        return Math.min(Math.max(value, MovementData.MIN_GRID_POS), MovementData.MAX_GRID_POS);
    }

    snapToGrid(value) {
        return Math.round(value / MovementData.GRID_SIZE) * MovementData.GRID_SIZE;
    }

    toBuffer() {
        const buffer = new ArrayBuffer(20);
        const view = new DataView(buffer);
        
        view.setFloat32(0, this.worldX, true);
        view.setFloat32(4, this.worldY, true);
        view.setFloat32(8, this.z, true);
        view.setFloat32(12, this.rotation, true);
        view.setInt32(16, this.playerId, true);

        return buffer;
    }

    drawGrid(ctx) {
        if (!ctx) return;

        try {
            // No need to use applyTransform here as it's called from the game render
            ctx.strokeStyle = '#000000';
            ctx.lineWidth = 0.5;
            ctx.globalAlpha = 0.3;
            
            const gridSize = MovementData.GRID_SIZE;
            const viewWidth = window.innerWidth;
            const viewHeight = window.innerHeight;
            
            // Calculate grid boundaries based on view and current position
            const leftBound = Math.floor((this.worldX - viewWidth) / gridSize) * gridSize;
            const rightBound = Math.ceil((this.worldX + viewWidth) / gridSize) * gridSize;
            const topBound = Math.floor((this.worldY - viewHeight) / gridSize) * gridSize;
            const bottomBound = Math.ceil((this.worldY + viewHeight) / gridSize) * gridSize;
            
            // Draw vertical lines
            for (let x = leftBound; x <= rightBound; x += gridSize) {
                ctx.beginPath();
                ctx.moveTo(x, topBound);
                ctx.lineTo(x, bottomBound);
                ctx.stroke();
            }
            
            // Draw horizontal lines
            for (let y = topBound; y <= bottomBound; y += gridSize) {
                ctx.beginPath();
                ctx.moveTo(leftBound, y);
                ctx.lineTo(rightBound, y);
                ctx.stroke();
            }
            
            ctx.globalAlpha = 1.0;
        } catch (error) {
            console.error('[Grid] Drawing error:', error);
        }
    }

    static parseIslandData(buffer) {
        const view = new DataView(buffer);
        const messageType = view.getUint8(0);
        const islandCount = view.getInt32(1, true);
        const islands = [];
        
        console.log('[Islands] Starting to parse', islandCount, 'islands');
        
        let offset = 5;  // Skip message type and count
        for (let i = 0; i < islandCount; i++) {
            const x = view.getFloat32(offset, true);
            const y = view.getFloat32(offset + 4, true);
            const radius = view.getFloat32(offset + 8, true);
            const island = new Island(x, y, radius);
            islands.push(island);
            
            console.log(`[Islands] Created island ${i + 1}/${islandCount}:`, {
                x: x.toFixed(2),
                y: y.toFixed(2),
                radius: radius.toFixed(2)
            });
            
            offset += 12;  // Each island is 12 bytes (3 floats)
        }
        
        MovementData.islands = islands;
        console.log('[Islands] Finished parsing all islands');
    }
    
    drawIslands(ctx) {
        if (!ctx) return;
        
        try {
            this.applyTransform(ctx);
            MovementData.islands.forEach(island => island.draw(ctx));
            this.restoreTransform(ctx);
        } catch (error) {
            console.error('[Islands] Drawing error:', error);
        }
    }

    static updateViewCenter() {
        MovementData.VIEW_CENTER = {
            x: window.innerWidth / 2,
            y: window.innerHeight / 2
        };
    }
}

// Add window resize handler
window.addEventListener('resize', () => {
    MovementData.updateViewCenter();
});

export class UDPConnection {
    // Update message type definitions
    static MSG_TYPE = {
        // Connection & Authentication (0x20-0x2F)
        GAME_MSG_CONNECT: 0x21,
        GAME_MSG_AUTH_RESPONSE: 0x24,
        GAME_MSG_ERROR: 0x2F,
        GAME_MSG_INPUT: 0x25,
        
        // Game State Messages (0x30-0x3F)
        GAME_MSG_WORLD_STATE: 0x30,
        GAME_MSG_PLAYER_STATE: 0x31,
        GAME_MSG_ENTITY_UPDATE: 0x32,
        GAME_MSG_SPAWN: 0x33,
        GAME_MSG_DESPAWN: 0x34,
        GAME_MSG_DISCONNECT: 0x35
    };

    static GAME_STATE = {
        VERIFYING: 0x01,
        ACCEPTED: 0x02,
        REJECTED: 0x03
    };

    static GAME_ERR = {
        AUTH: 0x01,
        INVALID_TOKEN: 0x02,
        DUPLICATE: 0x03,
        TIMEOUT: 0x04,
        PROTOCOL: 0x05,
        SERVICE_UNAVAILABLE: 0x06
    };

    // Update input flags to match protocol
    static INPUT_FLAGS = {
        FORWARD: 1 << 0,  // W
        BACKWARD: 1 << 1, // S
        LEFT: 1 << 2,     // A
        RIGHT: 1 << 3,    // D
        ACTION1: 1 << 4,  // Primary action
        ACTION2: 1 << 5   // Secondary action
    };

    // Add these new methods to handle protocol messages
    handleConnectMessage(data) {
        const view = new DataView(data);
        const state = view.getUint8(1); // Get connection state
        
        this.logState('CONNECTING', 'Connect message received');
        if (state === UDPConnection.GAME_STATE.VERIFYING) {
            this.startAuthProcess();
        }
    }

    handleAuthResponse(data) {
        const view = new DataView(data);
        const state = view.getUint8(1);
        const playerId = view.getUint32(2, true);
        const connectTime = view.getUint32(6, true);

        if (state === UDPConnection.GAME_STATE.ACCEPTED) {
            this.logState('AUTHENTICATED', 'Auth successful');
            this.playerId = playerId;
            this.connectTime = connectTime;
            this.authenticated = true;
            
            // Start game loop when auth is accepted
            this.logState(UDPConnection.CONNECTION_STATES.READY, 'Starting game loop');
            this.gameReady = true;
            
            // Dispatch game start event
            window.dispatchEvent(new CustomEvent('gameStateReady', {
                detail: {
                    playerId: this.playerId,
                    connectTime: this.connectTime
                }
            }));

            if (this.onAuthSuccess) this.onAuthSuccess(playerId);
        } else {
            this.handleError(new Error('Auth rejected'), 'AUTH_REJECTED');
        }
    }

    handleErrorMessage(data) {
        const view = new DataView(data);
        const errorCode = view.getUint8(1);
        const messageLength = view.getUint16(2, true);
        const decoder = new TextDecoder();
        const errorMessage = decoder.decode(data.slice(4, 4 + messageLength));

        console.error('[UDP] Server error:', {
            code: `0x${errorCode.toString(16)}`,
            message: errorMessage
        });

        switch (errorCode) {
            case UDPConnection.GAME_ERR.AUTH:
            case UDPConnection.GAME_ERR.INVALID_TOKEN:
                if (this.onAuthError) this.onAuthError(errorMessage);
                break;
            case UDPConnection.GAME_ERR.DUPLICATE:
                if (this.onDuplicateConnection) this.onDuplicateConnection();
                break;
            default:
                this.handleError(new Error(errorMessage), 'SERVER_ERROR');
        }
    }

    // Update message handler to use new protocol
    handleMessage(event) {
        if (!(event.data instanceof ArrayBuffer)) {
            console.warn('[UDP] Received non-binary message');
            return;
        }

        const view = new DataView(event.data);
        const msgType = view.getUint8(0);

        // Log message receipt
        this.logMessage(event.data, msgType);

        try {
            switch (msgType) {
                case UDPConnection.MSG_TYPE.GAME_MSG_CONNECT:
                    this.handleConnectMessage(event.data);
                    break;

                case UDPConnection.MSG_TYPE.GAME_MSG_AUTH_RESPONSE:
                    this.handleAuthResponse(event.data);
                    break;

                case UDPConnection.MSG_TYPE.GAME_MSG_ERROR:
                    this.handleErrorMessage(event.data);
                    break;

                case UDPConnection.MSG_TYPE.GAME_MSG_WORLD_STATE:
                    console.log("worldstate")
                    this.handleWorldState(event.data);
                    break;

                case UDPConnection.MSG_TYPE.GAME_MSG_PLAYER_STATE:
                    if (this.authenticated) {
                        this.handlePlayerState(event.data);
                    }
                    break;

                case UDPConnection.MSG_TYPE.GAME_MSG_DISCONNECT:
                    this.handleDisconnect(event.data);
                    break;

                default:
                    if (this.messageHandlers.has(msgType)) {
                        this.messageHandlers.get(msgType).forEach(handler => {
                            try {
                                handler(event.data);
                            } catch (error) {
                                console.error('[UDP] Handler error:', error);
                            }
                        });
                    }
            }
        } catch (error) {
            console.error('[UDP] Message handling error:', error);
            this.handleError(error, 'MESSAGE_PROCESSING_ERROR');
        }
    }

    // Add method to send input messages
    sendInput(inputFlags, rotation, clientTime) {
        if (!this.authenticated) return;

        const buffer = new ArrayBuffer(16); // type(1) + flags(2) + rotation(4) + time(4)
        const view = new DataView(buffer);
        
        view.setUint8(0, UDPConnection.MSG_TYPE.GAME_MSG_INPUT);
        view.setUint16(1, inputFlags, true);
        view.setFloat32(3, rotation, true);
        view.setUint32(7, clientTime, true);
        
        this.sendMessage(buffer);
    }

    // Add game states
    static GAME_STATE = {
        NONE: 0x00,
        VERIFYING: 0x01,
        ACCEPTED: 0x02,
        REJECTED: 0x03
    };

    // Add error codes
    static GAME_ERR = {
        NONE: 0x00,
        AUTH: 0x01,
        INVALID_TOKEN: 0x02,
        DUPLICATE: 0x03,
        TIMEOUT: 0x04,
        PROTOCOL: 0x05,
        SERVICE_UNAVAILABLE: 0x06
    };

    // Add input flags
    static INPUT_FLAGS = {
        NONE: 0x0000,
        FORWARD: 1 << 0,    // W
        BACKWARD: 1 << 1,   // S
        LEFT: 1 << 2,       // A
        RIGHT: 1 << 3,      // D
        ACTION1: 1 << 4,    // Primary action
        ACTION2: 1 << 5,    // Secondary action
        
        // Combined states
        STRAFE_LEFT: (1 << 0) | (1 << 2),   // FORWARD | LEFT
        STRAFE_RIGHT: (1 << 0) | (1 << 3)    // FORWARD | RIGHT
    };

    // Add message creation methods for the new protocol
    createMessageHeader(type, length, flags = 0, sequence = 0) {
        const buffer = new ArrayBuffer(8); // type(1) + flags(1) + sequence(2) + length(4)
        const view = new DataView(buffer);
        
        view.setUint8(0, type);
        view.setUint8(1, flags);
        view.setUint16(2, sequence, true);
        view.setUint32(4, length, true);
        
        return buffer;
    }

    createInputMessage(inputFlags, changedFlags, rotation, clientTime, ping) {
        const headerBuffer = this.createMessageHeader(
            UDPConnection.MSG_TYPE.GAME_MSG_INPUT,
            12  // size of input message payload
        );
        
        const buffer = new ArrayBuffer(20); // header(8) + payload(12)
        const view = new DataView(buffer);
        
        // Copy header
        new Uint8Array(buffer).set(new Uint8Array(headerBuffer));
        
        // Set payload
        view.setUint16(8, inputFlags, true);
        view.setUint16(10, changedFlags, true);
        view.setFloat32(12, rotation, true);
        view.setUint32(16, clientTime, true);
        view.setUint16(18, ping, true);
        
        return buffer;
    }

    createAuthRequest(token, version) {
        try {
            // Encode token to Uint8Array
            const encoder = new TextEncoder();
            const tokenBytes = encoder.encode(token);
            
            // Create fixed-size buffer for token
            const paddedToken = new Uint8Array(256);
            // Copy token bytes, up to 256 bytes
            paddedToken.set(tokenBytes.slice(0, 256));
            
            // Create message buffer
            const headerBuffer = this.createMessageHeader(
                UDPConnection.MSG_TYPE.GAME_MSG_AUTH_REQUEST,
                258  // 256 for token + 2 for version
            );
            
            const buffer = new ArrayBuffer(266); // header(8) + token(256) + version(2)
            const view = new DataView(buffer);
            
            // Copy header
            new Uint8Array(buffer).set(new Uint8Array(headerBuffer));
            
            // Copy padded token
            new Uint8Array(buffer).set(paddedToken, 8);
            
            // Set version
            view.setUint16(264, version, true);
            
            console.log('[UDP] Auth request created:', {
                tokenLength: tokenBytes.length,
                totalLength: buffer.byteLength
            });
            
            return buffer;
        } catch (error) {
            console.error('[UDP] Auth request creation failed:', error);
            throw new Error('Failed to create auth request: ' + error.message);
        }
    }

    // Add connection states
    static CONN_STATE = {
        DISCONNECTED: 0x00,
        CONNECTING: 0x01,
    };

    // Add error codes
    static ERR_CODE = {
        INVALID_TOKEN: 0x01,
        SERVER_FULL: 0x02,
        ALREADY_CONNECTED: 0x03,
        BAD_VERSION: 0x04,
        BAD_STATE: 0x05
    };

    // Add message creation helpers
    createMessageHeader(type, payloadLength, flags = 0x00) {
        const header = new ArrayBuffer(4);
        const view = new DataView(header);
        view.setUint8(0, type);
        view.setUint8(1, flags);
        view.setUint16(2, payloadLength, false); // big endian
        return header;
    }

    createConnectRequest() {
        const token = this.auth?.getToken();
        if (!token) throw new Error('No auth token available');

        const tokenBytes = new TextEncoder().encode(token);
        const header = this.createMessageHeader(UDPConnection.MSG_TYPE.CONNECT_REQUEST, tokenBytes.length);
        
        const message = new Uint8Array(4 + tokenBytes.length);
        message.set(new Uint8Array(header), 0);
        message.set(tokenBytes, 4);
        
        return message.buffer;
    }

    // Add protocol constants
    static PROTOCOL_VERSION = 1;
    static USERNAME_MAX_LENGTH = 32;
    
    // Add movement flags
    static MOVE_FLAGS = {
        LEFT: 0x01,
        RIGHT: 0x02,
        UP: 0x04,
        DOWN: 0x08
    };

    // Define connection states before they're used
    static CONNECTION_STATES = {
        DISCONNECTED: 'DISCONNECTED',
        HANDSHAKE: 'HANDSHAKE',
        AUTH_REQUIRED: 'AUTH_REQUIRED',
        AUTHENTICATED: 'AUTHENTICATED',
        READY: 'READY',
        ERROR: 'ERROR',
        CONNECTING: 'CONNECTING',
        CONNECTED: 'CONNECTED'
    };

    // Add error codes
    static SOCKET_ERRORS = {
        ECONNREFUSED: 'ECONNREFUSED',
        ETIMEDOUT: 'ETIMEDOUT',
        ECONNRESET: 'ECONNRESET',
        EPIPE: 'EPIPE',
        ABNORMAL_CLOSURE: 'ABNORMAL_CLOSURE'  // Add this
    };

    // Add error messages
    static ERROR_MESSAGES = {
        ECONNREFUSED: 'Connection refused by server',
        ETIMEDOUT: 'Connection timed out',
        ECONNRESET: 'Connection reset by server',
        EPIPE: 'Broken pipe - server closed connection',
        ABNORMAL_CLOSURE: 'Connection closed abnormally by the server'
    };

    // Update connection types
    static CONNECTION_TYPE = {
        WEBSOCKET: 'websocket' // Keep for fallback
    };

   

    constructor(playerId, auth) {
        // Initialize critical properties first
        this.stateLog = [];
        this.connectionState = UDPConnection.CONNECTION_STATES.DISCONNECTED;
        
        // Initialize message queues and processing state
        this.messageQueue = [];
        this.preAuthQueue = [];
        this.pendingMessages = [];
        this.messageProcessing = {
            active: false,
            lastProcessed: 0,
            processInterval: 50 // Process messages every 50ms
        };
        
        // Initialize connection tracking
        this.initializing = false;
        this.connecting = false;
        this.connectionAttempts = 0;
        this.maxConnectionAttempts = 5;
        
        // Initialize core properties
        this.auth = auth;
        this.connected = false;
        this.serverReady = false;
        this.authenticated = false;
        this.ready = false;

        // Validate and store player ID
        const authPlayerId = auth?.getPlayerId();
        if (playerId !== authPlayerId) {
            console.warn('[UDP] Player ID mismatch:', {
                provided: playerId,
                authId: authPlayerId
            });
            this.playerId = authPlayerId;
        } else {
            this.playerId = playerId;
        }

        // Initialize connection health tracking
        this.connectionHealth = {
            lastMessageTime: Date.now(),
            messageCount: 0,
            healthyThreshold: 5000,
            reconnectDelay: 1000
        };

        console.log('[UDP] Initializing connection with player ID:', this.playerId);
        
        // Single initialization call
        if (!this.initializing) {
            this.initializing = true;
            this.initSocket().catch(error => {
                console.error('[UDP] Initial connection failed:', error);
                this.handleError(error, this.getSocketErrorType(error));
            }).finally(() => {
                this.initializing = false;
            });
        }
        
        // Add message type mappings for better logging
        this.messageTypes = {
            128: 'CONNECT_SUCCESS',
            129: 'WORLD_STATE',
            96: 'ENTITY_UPDATE',
            0x80: 'PLAYER_MSG_CONNECT',
            0x81: 'PLAYER_MSG_AUTH',
            0x8F: 'PLAYER_MSG_ERROR',
            0x30: 'MSG_WORLD_STATE',
        };

        // Add message listeners map
        this.messageListeners = new Map();
        
        // Add default message types if needed
        // Add message log buffer
        this.messageLog = {
            capacity: 100,
            messages: [],
            enabled: true
        };

        // Add message listeners
        this.messageHandlers = new Map();
    }

    logState(state, reason) {
        try {
            const timestamp = new Date().toISOString();
            if (!this.stateLog) {
                this.stateLog = []; // Ensure stateLog exists
            }
            
            if (this.connectionState !== state) {
                console.log(`[UDP] State transition: ${this.connectionState} -> ${state} (${reason})`);
                this.stateLog.push({ timestamp, from: this.connectionState, to: state, reason });
                this.connectionState = state;
                
                if (this.onStateChange) {
                    this.onStateChange(state, reason);
                }
            }
        } catch (error) {
            console.error('[UDP] Error logging state:', {
                state,
                reason,
                error: error.message
            });
        }
    }

    async initSocket() {
        try {
            if (this.connecting) {
                console.log('[UDP] Connection attempt already in progress');
                return;
            }
            this.connecting = true;

            // Initialize socketState
            this.socketState = {
                closing: false,
                messageQueue: [],
                lastMessageTime: Date.now()
            };

            const token = this.auth?.getToken();
            if (!token) {
                throw new Error('No auth token available');
            }

            // Build WebSocket URL with token as query parameter
            const wsUrl = new URL('ws://192.168.8.3:8080/game/connect');
            wsUrl.searchParams.append('token', token);
            
            console.log('[UDP] Connecting to:', wsUrl.toString().replace(token, '***'));
            
            this.socket = new WebSocket(wsUrl);
            this.socket.binaryType = 'arraybuffer';

            // Bind handleMessage to class instance
            this.handleMessage = this.handleMessage.bind(this);

            // Set up socket handlers immediately
            this.socket.onopen = () => {
                console.log('[UDP] WebSocket connection opened');
                this.logState(UDPConnection.CONNECTION_STATES.CONNECTING, 'Socket opened');
                
                // Log debugging info
                console.log('[UDP] Socket state after open:', {
                    readyState: this.socket.readyState,
                    binaryType: this.socket.binaryType,
                    protocol: this.socket.protocol
                });
            };

            // Enhanced message handler with more logging
            this.socket.onmessage = this.handleMessage;

            // Add error logging
            this.socket.onerror = (error) => {
                console.error('[UDP] WebSocket error in state', this.connectionState, error);
            };

            this.socket.onclose = (event) => {
                console.log('[UDP] Connection closed in state', this.connectionState, {
                    code: event.code,
                    reason: event.reason || 'No reason provided',
                    wasClean: event.wasClean
                });
            };

        } catch (error) {
            console.error('[UDP] Socket initialization failed:', error);
            this.handleError(error, this.getSocketErrorType(error));
        } finally {
            this.connecting = false;
        }
    }

    // Add these new methods
    addMessageHandler(type, handler) {
        if (!this.messageHandlers.has(type)) {
            this.messageHandlers.set(type, new Set());
        }
        this.messageHandlers.get(type).add(handler);
        console.log(`[UDP] Added handler for message type: 0x${type.toString(16)}`);
    }

    removeMessageHandler(type, handler) {
        if (this.messageHandlers.has(type)) {
            this.messageHandlers.get(type).delete(handler);
        }
    }

    logMessage(message, type) {
        if (!this.messageLog.enabled) return;
        
        this.messageLog.messages.push({
            timestamp: new Date().toISOString(),
            type: type,
            data: message,
            state: this.connectionState
        });

        // Keep log size in check
        while (this.messageLog.messages.length > this.messageLog.capacity) {
            this.messageLog.messages.shift();
        }
    }

    // Example usage in your game:
    setupMessageHandlers() {
        // Add handlers for specific message types
        this.addMessageHandler(0x20, (data) => {
            console.log('[UDP] Player state update received');
            this.handlePlayerState(data);
        });

        this.addMessageHandler(0x30, (data) => {
            console.log('[UDP] World state update received');
            this.handleWorldState(data);
        });
    }

    handleWorldState(data) {
        const view = new DataView(data);
        const msgType = view.getUint8(0);  // Should be 0x30 (MSG_WORLD_STATE)
        const state = view.getUint8(1);    // Game state (0x02 for ACCEPTED)
        
        console.log('[UDP] World state received:', {
            type: `0x${msgType.toString(16)}`,
            state: `0x${state.toString(16)}`
        });

        if (state === UDPConnection.GAME_STATE.ACCEPTED) {
            console.log('[UDP] Game state ACCEPTED, starting game loop');
            
            // Update connection state
            this.logState(UDPConnection.CONNECTION_STATES.READY, 'World state accepted');
            this.authenticated = true;
            this.ready = true;
            
            // Dispatch game ready event
            window.dispatchEvent(new CustomEvent('gameStateReady', {
                detail: {
                    playerId: this.playerId,
                    timestamp: Date.now()
                }
            }));

            // Process any queued messages
            this.processMessageQueue();
            
            // Optional: Start sending periodic updates if needed
            this.startGameLoop();
        }
    }

    startGameLoop() {
        if (this.gameLoopInterval) {
            clearInterval(this.gameLoopInterval);
        }

        // Start sending regular updates to server (if needed)
        this.gameLoopInterval = setInterval(() => {
            if (this.ready && this.authenticated) {
                // Your game loop logic here
                if (this.onGameTick) {
                    this.onGameTick();
                }
            }
        }, 50); // 20Hz update rate
    }

    // Add missing methods
    startAuthProcess() {
        console.log('[UDP] Starting auth process');
        const token = this.auth?.getToken();
        if (!token) {
            this.handleError(new Error('No auth token available'), 'AUTH_ERROR');
            return;
        }

        // Send auth request
        const authRequest = this.createAuthRequest(token, UDPConnection.PROTOCOL_VERSION);
        this.sendMessage(authRequest);
    }

    handleError(error, type = 'UNKNOWN') {
        console.error(`[UDP] Error (${type}):`, error.message);
        
        // Log to state history
        this.logState('ERROR', `${type}: ${error.message}`);
        
        // Notify any error handlers
        if (this.onError) {
            this.onError(error, type);
        }

        // Handle specific error types
        switch (type) {
            case 'AUTH_ERROR':
                if (this.onAuthError) this.onAuthError(error.message);
                break;
            case 'CONNECTION_ERROR':
                this.reconnect();
                break;
        }
    }

    processMessageQueue() {
        if (!this.ready || !this.messageQueue.length) return;

        console.log('[UDP] Processing queued messages:', this.messageQueue.length);
        
        while (this.messageQueue.length > 0) {
            const message = this.messageQueue.shift();
            this.handleGameMessage(message.type, message.data);
        }
    }

    sendMessage(data) {
        if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
            console.warn('[UDP] Cannot send message - socket not ready');
            return;
        }

        try {
            const frame = WebSocketFrame.createBinaryFrame(data);
            this.socket.send(frame);
        } catch (error) {
            console.error('[UDP] Send error:', error);
            this.handleError(error, 'SEND_ERROR');
        }
    }

    sendMovementData(x, y, rotation, timestamp) {
        if (!this.authenticated) {
            console.warn('[UDP] Cannot send movement - not authenticated');
            return;
        }

        const buffer = new ArrayBuffer(17); // type(1) + x(4) + y(4) + rot(4) + time(4)
        const view = new DataView(buffer);
        
        view.setUint8(0, UDPConnection.MSG_TYPE.GAME_MSG_PLAYER_STATE);
        view.setFloat32(1, x, true);
        view.setFloat32(5, y, true);
        view.setFloat32(9, rotation, true);
        view.setUint32(13, timestamp, true);
        
        this.sendMessage(buffer);
    }

    reconnect() {
        if (this.connecting) return;
        
        console.log('[UDP] Attempting reconnection');
        this.connectionAttempts++;
        
        if (this.connectionAttempts <= this.maxConnectionAttempts) {
            setTimeout(() => {
                this.initSocket();
            }, this.connectionHealth.reconnectDelay);
        } else {
            console.error('[UDP] Max reconnection attempts reached');
            this.handleError(new Error('Max reconnection attempts reached'), 'CONNECTION_FAILED');
        }
    }
}
export class InputHandler {
    // Increase base movement speed
    static MOVEMENT_SPEED = 40;
    
    static KEYS = {
        UP: new Set(['ArrowUp', 'w', 'W']),
        DOWN: new Set(['ArrowDown', 's', 'S']),
        LEFT: new Set(['ArrowLeft', 'a', 'A']),
        RIGHT: new Set(['ArrowRight', 'd', 'D'])
    };

    constructor() {
        this.keyStates = new Map([
            ['UP', false],
            ['DOWN', false],
            ['LEFT', false],
            ['RIGHT', false]
        ]);
        this.setupListeners();
        console.log('[Input] Handler initialized');
    }

    setupListeners() {
        window.addEventListener('keydown', (e) => {
            const key = e.key.toLowerCase();
            console.log('[Input] Key pressed:', key);
            
            for (const [direction, keys] of Object.entries(InputHandler.KEYS)) {
                if (keys.has(e.key) || keys.has(key)) {
                    e.preventDefault();
                    this.keyStates.set(direction, true);
                    console.log('[Input] Direction set:', direction);
                }
            }
        });

        window.addEventListener('keyup', (e) => {
            const key = e.key.toLowerCase();
            for (const [direction, keys] of Object.entries(InputHandler.KEYS)) {
                if (keys.has(e.key) || keys.has(key)) {
                    e.preventDefault();
                    this.keyStates.set(direction, false);
                }
            }
        });
    }

    getMovementVector() {
        const vector = { x: 0, y: 0 };
        
        if (this.keyStates.get('UP')) vector.y -= InputHandler.MOVEMENT_SPEED;
        if (this.keyStates.get('DOWN')) vector.y += InputHandler.MOVEMENT_SPEED;
        if (this.keyStates.get('LEFT')) vector.x -= InputHandler.MOVEMENT_SPEED;
        if (this.keyStates.get('RIGHT')) vector.x += InputHandler.MOVEMENT_SPEED;

        if (vector.x !== 0 || vector.y !== 0) {
            console.log('[Input] Movement vector:', vector);
        }
        
        return vector;
    }
}
