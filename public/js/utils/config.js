export const Config = {
    // Remove AUTH_SERVER and getAuthEndpoint since we're using relative paths now
    GAME_SERVER: `ws://${import.meta.env.VITE_AUTH_SERVER_HOST || '192.168.8.3'}:${import.meta.env.VITE_AUTH_SERVER_PORT || '8080'}`
};
