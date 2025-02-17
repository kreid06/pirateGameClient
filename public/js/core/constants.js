export const GAME_CONSTANTS = {
    // Network Settings
    WEBSOCKET_URL: 'ws://localhost:8080/game/connect',
    AUTH_ENDPOINTS: {
        login: '/api/players/login',
        register: '/api/players/register',
        logout: '/api/players/logout'
    },
    
    // Game Grid
    GRID_SIZE: 250,
    MAX_GRID_POS: Number.MAX_SAFE_INTEGER,
    MIN_GRID_POS: Number.MIN_SAFE_INTEGER,
    
    // Player Movement
    MOVEMENT_SPEED: 40,
    ROTATION_SPEED: 0.1,
    
    // Network Update Rates
    SEND_RATE: 50,  // 20 updates per second
    INTERPOLATION_DELAY: 100,  // ms
    
    // Cache Settings
    TOKEN_CACHE_TTL: 60000,  // 60 seconds
    
    // View Settings
    DEFAULT_VIEW_CENTER: {
        x: window.innerWidth / 2,
        y: window.innerHeight / 2
    },
    
    // Game States
    STATES: {
        DISCONNECTED: 'disconnected',
        CONNECTING: 'connecting',
        CONNECTED: 'connected',
        ERROR: 'error'
    }
};

// Input Key Mappings
export const INPUT_KEYS = {
    UP: new Set(['ArrowUp', 'w', 'W']),
    DOWN: new Set(['ArrowDown', 's', 'S']),
    LEFT: new Set(['ArrowLeft', 'a', 'A']),
    RIGHT: new Set(['ArrowRight', 'd', 'D'])
};
