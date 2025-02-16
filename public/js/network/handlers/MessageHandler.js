import { MessageTypes, GameStates, ErrorCodes } from '../protocol/MessageTypes.js';

export class MessageHandler {
    constructor(connection) {
        this.connection = connection;
        this.handlers = new Map();

        // Register default handlers
        this.registerDefaultHandlers();
    }

    handle(event) {
        if (!(event.data instanceof ArrayBuffer)) {
            console.warn('[MessageHandler] Received non-binary message');
            return;
        }

        const view = new DataView(event.data);
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
    }

    registerDefaultHandlers() {
        // Handle connect message (0x21)
        this.registerHandler(MessageTypes.GAME_MSG_CONNECT, (data) => {
            try {
                const view = new DataView(data);
                const state = view.getUint8(1);
                
                console.log('[MessageHandler] Connect message received:', { state });
                if (state === GameStates.VERIFYING) {
                    this.connection.startAuthProcess();
                }
            } catch (error) {
                console.error('[MessageHandler] Error parsing connect message:', error);
            }
        });

        // Handle auth response (0x24)
        this.registerHandler(MessageTypes.GAME_MSG_AUTH_RESPONSE, (data) => {
            const view = new DataView(data);
            const state = view.getUint8(1);
            const playerId = view.getUint32(2, true);
            const connectTime = view.getUint32(6, true);

            console.log('[MessageHandler] Auth response:', { state, playerId, connectTime });

            if (state === GameStates.ACCEPTED) {
                this.connection.handleAuthSuccess({
                    playerId,
                    connectTime,
                    state
                });
            } else {
                this.connection.handleError(new Error('Auth rejected'), 'AUTH_REJECTED');
            }
        });

        // Handle world state (0x30)
        this.registerHandler(MessageTypes.GAME_MSG_WORLD_STATE, (data) => {
            try {
                const view = new DataView(data);
                if (data.byteLength < 8) {
                    console.error('[MessageHandler] World state message too short');
                    return;
                }

                const state = view.getUint8(1);
                const worldState = {
                    serverTime: view.getUint32(2, true),
                    playerCount: view.getUint16(6, true),
                    playerStates: []
                };

                let offset = 8;
                for (let i = 0; i < worldState.playerCount && offset + 16 <= data.byteLength; i++) {
                    const playerState = {
                        id: view.getUint32(offset, true),
                        x: view.getFloat32(offset + 4, true),
                        y: view.getFloat32(offset + 8, true),
                        rotation: view.getFloat32(offset + 12, true)
                    };
                    worldState.playerStates.push(playerState);
                    offset += 16;
                }

                console.log('[MessageHandler] World state received:', worldState);
                this.connection.handleWorldUpdate(worldState);
            } catch (error) {
                console.error('[MessageHandler] Error parsing world state:', error);
            }
        });
    }

    registerHandler(type, handler) {
        this.handlers.set(type, handler);
    }

    unregisterHandler(type) {
        this.handlers.delete(type);
    }
}
