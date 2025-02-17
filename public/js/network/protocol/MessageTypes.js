export const MessageTypes = {
    // Connection & Auth
    GAME_MSG_CONNECT: 0x01,
    GAME_MSG_AUTH_CHALLENGE: 0x02,
    GAME_MSG_AUTH_RESPONSE: 0x03,
    GAME_MSG_AUTH_SUCCESS: 0x04,
    GAME_MSG_AUTH_FAILURE: 0x05,
    GAME_MSG_DISCONNECT: 0x06,
    
    // Game State
    GAME_MSG_WORLD_STATE: 0x10,
    GAME_MSG_PLAYER_STATE: 0x11,
    GAME_MSG_INPUT: 0x12,
    
    // Entity Management
    GAME_MSG_ENTITY_SPAWN: 0x20,
    GAME_MSG_ENTITY_DESPAWN: 0x21,
    GAME_MSG_ENTITY_UPDATE: 0x22,
    
    // Ship & Module
    GAME_MSG_SHIP_UPDATE: 0x30,
    GAME_MSG_MODULE_UPDATE: 0x31,
    GAME_MSG_MODULE_ACTION: 0x32,
    
    // Error & System
    GAME_MSG_ERROR: 0xFF
};

export const GameStates = {
    DISCONNECTED: 0,
    CONNECTING: 1,
    AUTHENTICATING: 2,
    CONNECTED: 3,
    ACTIVE: 4,
    ERROR: 5
};

export const ErrorCodes = {
    NONE: 0x00,
    AUTH_FAILED: 0x01,
    INVALID_TOKEN: 0x02,
    DUPLICATE_CONNECTION: 0x03,
    TIMEOUT: 0x04,
    PROTOCOL_ERROR: 0x05,
    SERVER_ERROR: 0x06
};
