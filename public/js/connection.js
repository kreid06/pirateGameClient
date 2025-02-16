//connection.js

import { AuthService } from './auth.js';
import { Engine, World, Bodies, Body } from 'matter-js';
import { WebSocketFrame } from './network/WebSocketFrame.js';
import { PhysicsManager } from './network/physics/PhysicsManager.js';
import { MessageTypes, GameStates, ErrorCodes } from './network/protocol/MessageTypes.js';
import { MessageHandler } from './network/handlers/MessageHandler.js';
import { ConnectionState } from './network/state/ConnectionState.js';
import { InputManager } from './network/managers/InputManager.js';

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
    constructor(playerId, auth) {
        // Initialize managers
        this.physics = new PhysicsManager();
        this.messageHandler = new MessageHandler(this);
        this.connectionState = new ConnectionState();
        this.inputManager = new InputManager();
        
        // Initialize connection state
        this.auth = auth;
        this.playerId = this.validatePlayerId(playerId, auth);
        this.authenticated = false;
        this.ready = false;
        
        // Initialize network state
        this.socket = null;
        this.pendingMessages = [];
        this.lastMessageTime = Date.now();
        
        // Start connection
        this.initSocket().catch(error => {
            this.handleError(error, 'INITIALIZATION_ERROR');
        });
    }

    validatePlayerId(playerId, auth) {
        const authPlayerId = auth?.getPlayerId();
        if (playerId !== authPlayerId) {
            console.warn('[UDP] Player ID mismatch:', {
                provided: playerId,
                authId: authPlayerId
            });
            return authPlayerId;
        }
        return playerId;
    }

    async initSocket() {
        if (this.socket) return;

        const token = this.auth?.getToken();
        if (!token) {
            throw new Error('No auth token available');
        }

        const wsUrl = new URL('ws://192.168.8.3:8080/game/connect');
        wsUrl.searchParams.append('token', token);
        
        this.socket = new WebSocket(wsUrl);
        this.socket.binaryType = 'arraybuffer';
        
        this.socket.onopen = () => this.connectionState.transition('CONNECTING', 'Socket opened');
        this.socket.onmessage = (event) => this.messageHandler.handle(event);
        this.socket.onerror = (error) => this.handleError(error, 'SOCKET_ERROR');
        this.socket.onclose = (event) => this.handleClose(event);
    }

    handleError(error, type) {
        console.error(`[UDP] Error (${type}):`, error.message);
        this.connectionState.transition('ERROR', error.message);
        
        if (this.onError) {
            this.onError(error, type);
        }
    }

    handleClose(event) {
        this.connectionState.transition('DISCONNECTED', event.reason || 'Connection closed');
        this.cleanup();
    }

    cleanup() {
        this.physics.cleanup();
        this.inputManager.cleanup();
        
        if (this.socket) {
            this.socket.close();
            this.socket = null;
        }
    }

    // Expose necessary methods for external use
    sendMovementData(x, y, rotation, timestamp) {
        if (!this.authenticated) return;
        
        const buffer = new ArrayBuffer(17); // type(1) + x(4) + y(4) + rotation(4) + time(4)
        const view = new DataView(buffer);
        
        view.setUint8(0, MessageTypes.GAME_MSG_PLAYER_STATE);
        view.setFloat32(1, x, true);
        view.setFloat32(5, y, true);
        view.setFloat32(9, rotation, true);
        view.setUint32(13, timestamp, true);
        
        this.sendMessage(buffer);
    }

    sendMessage(data) {
        if (!this.socket?.readyState === WebSocket.OPEN) {
            this.pendingMessages.push(data);
            return;
        }

        try {
            const frame = WebSocketFrame.createBinaryFrame(data);
            this.socket.send(frame);
        } catch (error) {
            this.handleError(error, 'SEND_ERROR');
        }
    }

    handleAuthSuccess(authData) {
        this.connectionState.transition('AUTHENTICATED', 'Auth successful');
        this.playerId = authData.playerId;
        this.connectTime = authData.connectTime;
        this.authenticated = true;
        
        // Initialize physics for player
        this.physics.createPlayerBody();
        
        // Notify game that we're ready
        window.dispatchEvent(new CustomEvent('gameStateReady', {
            detail: {
                playerId: this.playerId,
                connectTime: this.connectTime
            }
        }));
    }

    handleWorldUpdate(worldState) {
        if (!this.authenticated) return;

        // Update server time
        this.serverTime = worldState.serverTime;

        // Handle player updates
        worldState.playerStates.forEach(player => {
            if (player.id !== this.playerId) {
                this.updateOtherPlayer(player);
            } else {
                // Update physics and input prediction
                const serverState = {
                    x: player.x,
                    y: player.y,
                    angle: player.rotation
                };

                // Update physics state
                this.physics.reconcileState(serverState);
                
                // Update input prediction
                this.inputManager.updatePredictedState(serverState);
                this.inputManager.processServerUpdate(worldState.serverTime);
            }
        });
    }

    updateOtherPlayer(playerState) {
        // Implement other player updates
        // This will be used when we add multiplayer rendering
        console.log('[UDP] Updating other player:', playerState);
    }

    startAuthProcess() {
        console.log('[UDP] Starting auth process');
        const token = this.auth?.getToken();
        if (!token) {
            this.handleError(new Error('No auth token available'), 'AUTH_ERROR');
            return;
        }

        const buffer = new ArrayBuffer(3); // type(1) + version(2)
        const view = new DataView(buffer);
        view.setUint8(0, MessageTypes.GAME_MSG_AUTH_RESPONSE);
        view.setUint16(1, 1, true); // protocol version

        this.sendMessage(buffer);
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
