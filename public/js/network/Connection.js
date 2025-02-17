import { PhysicsManager } from "../physics/PhysicsManager";
import { MessageHandler } from "./handlers/MessageHandler";
import { ConnectionState } from "./state/ConnectionState";
import { InputManager } from "./managers/InputManager";
import { GAME_CONSTANTS } from "../core/constants";
import { Config } from "../utils/config.js";  // Add this import

export class Connection {
    constructor(playerId, auth) {
        if (!auth?.getToken()) {
            throw new Error('Cannot initialize connection without valid auth token');
        }
        
        this.initialize(playerId, auth);
        this.setupManagers();
        this.initSocket().catch(this.handleError.bind(this));
    }

    initialize(playerId, auth) {
        this.playerId = this.validatePlayerId(playerId, auth);
        this.auth = auth;
        this.authenticated = false;
        this.ready = false;
        this.socket = null;
        this.pendingMessages = [];
        this.sequenceNumber = 0;
        this.lastMessageTime = Date.now();
    }

    setupManagers() {
        this.physics = new PhysicsManager();
        this.messageHandler = new MessageHandler(this);
        this.connectionState = new ConnectionState();
        this.inputManager = new InputManager();
    }

    async initSocket() {
        if (this.socket) return;

        const token = this.auth?.getToken();
        if (!token) {
            this.handleError(new Error('Lost auth token'), 'AUTH_ERROR');
            window.dispatchEvent(new Event('gameLogout'));
            return;
        }

        try {
            const wsUrl = new URL(`${Config.GAME_SERVER}/game/connect`);
            wsUrl.searchParams.append('token', token);
            
            console.log('[Connection] Connecting to:', wsUrl.toString());
            this.socket = new WebSocket(wsUrl);
            this.socket.binaryType = 'arraybuffer';
            
            this.setupSocketHandlers();
        } catch (error) {
            this.handleError(error, 'SOCKET_ERROR');
            throw error;
        }
    }

    setupSocketHandlers() {
        this.socket.onopen = () => {
            this.connectionState.transition(GAME_CONSTANTS.CONNECTING);
            this.sendAuthRequest();
        };

        this.socket.onmessage = (event) => this.messageHandler.handle(event);
        this.socket.onerror = (error) => this.handleError(error);
        this.socket.onclose = (event) => this.handleClose(event);
    }

    sendMessage(data) {
        if (!this.isSocketReady()) {
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

    sendAuthRequest() {
        const token = this.auth?.getToken();
        if (!token) {
            this.handleError(new Error('No auth token'), 'AUTH_ERROR');
            return;
        }

        const message = this.createAuthMessage(token);
        this.sendMessage(message);
    }

    createAuthMessage(token) {
        const encoder = new TextEncoder();
        const tokenBytes = encoder.encode(token);
        const buffer = new ArrayBuffer(5 + tokenBytes.length);
        const view = new DataView(buffer);

        view.setUint8(0, MessageTypes.GAME_MSG_AUTH_RESPONSE);
        view.setUint32(1, tokenBytes.length, true);
        new Uint8Array(buffer, 5).set(tokenBytes);

        return buffer;
    }

    handleAuthSuccess(data) {
        this.authenticated = true;
        this.playerId = data.playerId;
        this.connectionState.transition(GAME_CONSTANTS.CONNECTED);
        this.physics.createPlayerBody();
        this.emitGameReady();
    }

    handleWorldUpdate(worldState) {
        if (!this.authenticated) return;

        this.serverTime = worldState.serverTime;
        worldState.playerStates.forEach(player => {
            if (player.id !== this.playerId) {
                this.updateOtherPlayer(player);
            } else {
                this.reconcilePlayerState(player);
            }
        });
    }

    cleanup() {
        if (this.physics) {
            this.physics.cleanup();
        }
        if (this.inputManager) {
            this.inputManager.cleanup();
        }
        if (this.socket) {
            this.socket.close();
            this.socket = null;
        }
    }

    // Helper methods
    isSocketReady() {
        return this.socket?.readyState === WebSocket.OPEN;
    }

    validatePlayerId(playerId, auth) {
        return auth?.getPlayerId() || playerId;
    }

    handleError(error, type = 'GENERAL_ERROR') {
        console.error(`[Connection] ${type}:`, error);
        this.connectionState.transition(GAME_CONSTANTS.ERROR);
    }

    handleClose(event) {
        this.connectionState.transition(GAME_CONSTANTS.DISCONNECTED);
        this.cleanup();
    }

    emitGameReady() {
        window.dispatchEvent(new CustomEvent('gameReady', {
            detail: {
                playerId: this.playerId,
                serverTime: this.serverTime
            }
        }));
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
