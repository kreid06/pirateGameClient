import { MessageTypes, GameStates, ErrorCodes } from '../protocol/MessageTypes.js';

export class MessageHandler {
    constructor(connection) {
        this.connection = connection;
        this.handlers = new Map();

        // Register default handlers
        this.registerDefaultHandlers();
    }

    handle(event) {
        try {
            const view = new DataView(event.data);
            const messageType = view.getUint8(0);

            switch (messageType) {
                case MessageTypes.GAME_MSG_AUTH_CHALLENGE:
                    this.handleAuthChallenge();
                    break;
                case MessageTypes.GAME_MSG_AUTH_SUCCESS:
                    this.handleAuthSuccess(view);
                    break;
                // ... other message handlers ...
                default:
                    if (!(event.data instanceof ArrayBuffer)) {
                        console.warn('[MessageHandler] Received non-binary message');
                        return;
                    }

                    const msgType = view.getUint8(0);

                    try {
                        const handler = this.handlers.get(msgType);
                        if (handler) {
                            handler(event.data);
                        } else {
                            console.warn(`[MessageHandler] No handler for message type: 0x${msgType.toString(16)}`);
                        }
                    } catch (error) {
                        console.error('[MessageHandler] Error handling message:', error);
                        this.connection.handleError(error, 'MESSAGE_HANDLING_ERROR');
                    }
                    break;
            }
        } catch (error) {
            console.error('[MessageHandler] Error:', error);
        }
    }

    registerDefaultHandlers() {
        // Handle connect message (0x21)
        this.registerHandler(MessageTypes.GAME_MSG_CONNECT, (data) => {
            const view = new DataView(data);
            const state = view.getUint8(1);
            
            console.log('[MessageHandler] Connect message received:', { state });
            if (state === GameStates.VERIFYING) {
                this.connection.startAuthProcess();
            }
        });

        // Handle auth response (0x24)
        this.registerHandler(MessageTypes.GAME_MSG_AUTH_RESPONSE, (data) => {
            const view = new DataView(data);
            const state = view.getUint8(1);
            
            if (state === GameStates.ACCEPTED) {
                this.connection.handleAuthSuccess({
                    playerId: view.getUint32(2, true),
                    connectTime: view.getUint32(6, true)
                });
            } else {
                this.connection.handleError(new Error('Auth rejected'), 'AUTH_REJECTED');
            }
        });

        // Handle world state (0x30)
        this.registerHandler(MessageTypes.GAME_MSG_WORLD_STATE, (data) => {
            try {
                const view = new DataView(data);
                
                // Message structure:
                // type (1) + state (1) + length (2) + time (4) + playerCount (2) + bounds (16) + flags (4)
                const HEADER_SIZE = 30;
                
                if (data.byteLength < HEADER_SIZE) {
                    console.error('[MessageHandler] World state message too short:', data.byteLength);
                    return;
                }

                const state = view.getUint8(1);
                const payloadLength = view.getUint16(2, true);
                const serverTime = view.getUint32(4, true);
                const playerCount = view.getUint16(8, true);

                // Parse world bounds
                const worldBounds = {
                    minX: view.getFloat32(10, true),
                    minY: view.getFloat32(14, true),
                    maxX: view.getFloat32(18, true),
                    maxY: view.getFloat32(22, true)
                };

                // Parse flags
                const gameFlags = view.getUint32(26, true);

                console.log('[MessageHandler] Parsing world state:', {
                    state,
                    payloadLength,
                    serverTime,
                    playerCount,
                    worldBounds,
                    gameFlags
                });

                // Initialize world state object
                const worldState = {
                    state,
                    serverTime,
                    playerCount,
                    playerStates: [],
                    bounds: worldBounds,
                    flags: gameFlags
                };

                // Process any player states that follow
                if (data.byteLength > HEADER_SIZE) {
                    const PLAYER_DATA_SIZE = 16; // id(4) + x(4) + y(4) + rotation(4)
                    let offset = HEADER_SIZE;

                    for (let i = 0; i < playerCount && offset + PLAYER_DATA_SIZE <= data.byteLength; i++) {
                        const playerState = {
                            id: view.getUint32(offset, true),
                            x: view.getFloat32(offset + 4, true),
                            y: view.getFloat32(offset + 8, true),
                            rotation: view.getFloat32(offset + 12, true)
                        };

                        if (this.validatePlayerState(playerState)) {
                            worldState.playerStates.push(playerState);
                        }

                        offset += PLAYER_DATA_SIZE;
                    }
                }

                this.connection.handleWorldUpdate(worldState);
            } catch (error) {
                console.error('[MessageHandler] Error parsing world state:', error);
            }
        });
    }

    validatePlayerState(state) {
        return (
            state &&
            Number.isFinite(state.x) &&
            Number.isFinite(state.y) &&
            Number.isFinite(state.rotation) &&
            typeof state.id === 'number' &&
            state.id >= 0
        );
    }

    registerHandler(type, handler) {
        this.handlers.set(type, handler);
    }

    unregisterHandler(type) {
        this.handlers.delete(type);
    }
}
