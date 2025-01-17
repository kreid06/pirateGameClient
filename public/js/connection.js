//connection.js

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

export class MovementData {
    static GRID_SIZE = 250;
    static MAX_GRID_POS = Number.MAX_SAFE_INTEGER;
    static MIN_GRID_POS = Number.MIN_SAFE_INTEGER;
    static VIEW_CENTER = {
        x: window.innerWidth / 2,
        y: window.innerHeight / 2
    };
    static SEND_RATE = 100; // 10 messages per second
    static lastSendTime = 0;
    static sentCount = 0;
    
    constructor(x, y, z, rotation, playerId) {
        // Validate world position
        this.worldX = this.validateNumber(x);
        this.worldY = this.validateNumber(y);
        this.z = this.validateNumber(z);
        this.rotation = this.validateNumber(rotation);
        this.playerId = Math.floor(this.validateNumber(playerId));

        // Log position update
        // console.log('[MovementData] Position update:', {
        //     x: this.worldX,
        //     y: this.worldY,
        //     rotation: this.rotation,
        //     playerId: this.playerId
        // });

        const now = Date.now();
        if (now - MovementData.lastSendTime >= MovementData.SEND_RATE) {
            MovementData.lastSendTime = now;
            MovementData.sentCount++;
            
            console.log('[MovementData] Sending position:', {
                worldX: this.worldX,
                worldY: this.worldY,
                rotation: this.rotation,
                playerId: this.playerId,
                timestamp: now,
                messageCount: MovementData.sentCount,
                sendRate: Math.round(1000 / (now - MovementData.lastSendTime))
            });
        }

        // Calculate screen transform
        this.screenX = MovementData.VIEW_CENTER.x;
        this.screenY = MovementData.VIEW_CENTER.y;
        this.worldOffsetX = -this.worldX;
        this.worldOffsetY = -this.worldY;
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
            ctx.save();
            this.applyTransform(ctx);
            
            ctx.strokeStyle = '#000000';
            ctx.lineWidth = 1;
            
            // Calculate visible area (inverted)
            const screenWidth = window.innerWidth * 2;
            const screenHeight = window.innerHeight * 2;
            const gridSize = MovementData.GRID_SIZE;
            
            // Invert grid boundaries calculation
            const startX = Math.floor((screenWidth/2 + this.worldX) / gridSize) * gridSize;
            const startY = Math.floor((screenHeight/2 + this.worldY) / gridSize) * gridSize;
            const endX = Math.ceil((-screenWidth/2 + this.worldX) / gridSize) * gridSize;
            const endY = Math.ceil((-screenHeight/2 + this.worldY) / gridSize) * gridSize;
            
            // Draw vertical lines (reversed)
            for (let x = endX; x <= startX; x += gridSize) {
                ctx.beginPath();
                ctx.moveTo(x, endY);
                ctx.lineTo(x, startY);
                ctx.stroke();
            }
            
            // Draw horizontal lines (reversed)
            for (let y = endY; y <= startY; y += gridSize) {
                ctx.beginPath();
                ctx.moveTo(endX, y);
                ctx.lineTo(startX, y);
                ctx.stroke();
            }
            
            ctx.restore();
        } catch (error) {
            console.error('[Grid] Drawing error:', error);
        }
    }
}

export class WebRTCConnection {
    constructor(playerId) {
        this.playerId = playerId;
        this.peerConnection = new RTCPeerConnection({
            iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
        });
        this.signaling = new WebSocket('ws://192.168.8.3:8080');
        this.setupSignalingHandlers();
        this.setupPeerConnection();
    }

    setupSignalingHandlers() {
        this.signaling.onopen = async () => {
            console.log('[WebRTC] Signaling connected');
            const offer = await this.peerConnection.createOffer();
            await this.peerConnection.setLocalDescription(offer);
            const offerMessage = JSON.stringify({
                type: 'offer',
                sdp: offer
            });
            console.log('[WebRTC] Sending offer');
            this.signaling.send(offerMessage);
        };

        this.signaling.onmessage = async (event) => {
            try {
                let messageData;
                if (event.data instanceof Blob) {
                    messageData = await new Response(event.data).text();
                } else {
                    messageData = event.data;
                }
                
                console.log('[WebRTC] Received message:', messageData);
                
                const message = JSON.parse(messageData);
                
                if (message.type === 'answer') {
                    await this.peerConnection.setRemoteDescription(new RTCSessionDescription(message));
                    console.log('[WebRTC] Remote description set');
                } else if (message.candidate) {
                    await this.peerConnection.addIceCandidate(new RTCIceCandidate(message));
                    console.log('[WebRTC] ICE candidate added');
                }
            } catch (error) {
                console.error('[WebRTC] Message handling error:', error);
            }
        };
    }

    async handleSignalingMessage(data) {
        try {
            const message = JSON.parse(data);
            console.log('[WebRTC] Parsed message:', message);

            if (message.type === 'answer') {
                await this.peerConnection.setRemoteDescription(new RTCSessionDescription(message));
                console.log('[WebRTC] Remote description set');
            } else if (message.candidate) {
                await this.peerConnection.addIceCandidate(new RTCIceCandidate(message));
                console.log('[WebRTC] ICE candidate added');
            }
        } catch (error) {
            console.error('[WebRTC] Message handling error:', error);
            console.log('[WebRTC] Raw message:', data);
        }
    }

    setupPeerConnection() {
        this.peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                this.signaling.send(JSON.stringify(event.candidate));
            }
        };

        this.movementChannel = this.peerConnection.createDataChannel('movement', {
            ordered: false,
            maxRetransmits: 0
        });

        this.movementChannel.onopen = () => {
            console.log('[WebRTC] Movement channel opened - Ready for data');
            this.isConnected = true;
            this.sendPendingMovements();
        };

        this.peerConnection.ondatachannel = (event) => {
            console.log('[WebRTC] Received remote data channel');
            const channel = event.channel;
            channel.onmessage = (e) => console.log('[WebRTC] Received:', e.data);
        };
    }

    sendMovementData(data) {
        if (!this.isConnected) {
            this.pendingMovements.push(data);
            console.log('[WebRTC] Movement queued, waiting for connection');
            return;
        }

        try {
            const buffer = data.toBuffer();
            this.movementChannel.send(buffer);
            console.log('[WebRTC] Movement sent:', data);
        } catch (error) {
            console.error('[WebRTC] Send failed:', error);
            this.pendingMovements.push(data);
        }
    }

    sendPendingMovements() {
        while (this.pendingMovements.length > 0) {
            const data = this.pendingMovements.shift();
            this.sendMovementData(data);
        }
    }
}

export class UDPConnection {
    constructor(playerId) {
        this.playerId = playerId;
        this.connected = false;
        this.serverReady = false;
        this.lastSentTime = 0;
        this.messageCount = 0;
        this.initSocket();
    }

    initSocket() {
        try {
            this.socket = new WebSocket('ws://192.168.8.3:8080');
            this.socket.binaryType = 'arraybuffer';
            
            // Monitor connection state
            this.socket.onopen = () => {
                console.log('[UDP] Socket opened, sending handshake');
                this.socket.send(JSON.stringify({
                    type: 'handshake',
                    playerId: this.playerId
                }));
            };

            this.socket.onclose = () => {
                this.connected = false;
                this.serverReady = false;
                if (this.retryAttempts < this.maxRetries) {
                    setTimeout(() => this.initSocket(), 1000);
                    this.retryAttempts++;
                }
            };

            this.socket.onerror = (error) => {
                console.error('[UDP] Socket error:', error);
            };

            this.socket.onmessage = (event) => {
                if (event.data === 'READY') {
                    this.connected = true;
                    this.serverReady = true;
                    this.retryAttempts = 0;
                    console.log('[UDP] Connection established');
                }
            };
        } catch (error) {
            console.error('[UDP] Connection failed:', error);
            this.retryConnection();
        }
    }

    setupSocket() {
        try {
            // Use correct WebSocket upgrade headers
            const wsUrl = 'ws://192.168.8.3:8080';
            this.socket = new WebSocket(wsUrl);
            this.socket.binaryType = 'arraybuffer';
            
            // Add custom headers through URL params
            const headers = {
                'Upgrade': 'websocket',
                'Connection': 'Upgrade',
                'Sec-WebSocket-Version': '13',
                'Sec-WebSocket-Protocol': 'binary'
            };

            this.setupSocketHandlers();
            console.log('[UDP] Attempting connection with headers:', headers);
        } catch (error) {
            console.error('[UDP] Socket creation failed:', error);
            this.retryConnection();
        }
    }

    setupSocketHandlers() {
        this.socket.onopen = () => {
            console.log('[UDP] WebSocket connected, sending handshake');
            const handshake = {
                type: 'handshake',
                playerId: this.playerId,
                protocol: 'binary'
            };
            this.socket.send(JSON.stringify(handshake));
        };

        this.socket.onmessage = (event) => {
            console.log('[UDP] Raw message received:', event.data);
            if (event.data === 'READY') {
                console.log('[UDP] Server acknowledged connection');
                this.connected = true;
                this.serverReady = true;
            }
        };

        this.socket.onerror = (error) => {
            console.error('[UDP] WebSocket error:', error);
            this.connected = false;
            this.serverReady = false;
        };

        this.socket.onclose = (event) => {
            console.log('[UDP] Connection closed:', event.code, event.reason);
            this.connected = false;
            this.serverReady = false;
            this.retryConnection();
        };
    }

    retryConnection() {
        if (this.retryAttempts < this.maxRetries) {
            this.retryAttempts++;
            const delay = Math.min(1000 * Math.pow(2, this.retryAttempts), 5000);
            console.log(`[UDP] Retrying connection ${this.retryAttempts}/${this.maxRetries} in ${delay}ms`);
            setTimeout(() => this.initSocket(), delay);
        }
    }

    sendMovementData(x, y, rotation) {
        if (!this.connected || !this.serverReady) {
            console.warn('[UDP] Not connected or server not ready');
            return;
        }

        const now = Date.now();
        if (now - this.lastSentTime >= MovementData.SEND_RATE) {
            try {
                const movement = new MovementData(x, y, 0, rotation, this.playerId);
                const buffer = movement.toBuffer();
                this.socket.send(buffer);
                
                this.lastSentTime = now;
                this.messageCount++;
                
                console.log('[UDP] Movement sent:', {
                    x, y, rotation,
                    messageCount: this.messageCount,
                    timestamp: now,
                    socketState: this.socket.readyState
                });
            } catch (error) {
                console.error('[UDP] Send failed:', error);
            }
        }
    }

    createMovementBuffer(movement) {
        const buffer = new ArrayBuffer(20);
        const view = new DataView(buffer);
        
        view.setFloat32(0, movement.x, true);
        view.setFloat32(4, movement.y, true);
        view.setFloat32(8, movement.z, true);
        view.setFloat32(12, movement.rotation, true);
        view.setInt32(16, movement.playerId, true);
        
        return buffer;
    }
}

export class InputHandler {
    static MOVEMENT_SPEED = 5;
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