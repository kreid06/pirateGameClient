export class AuthService {
    static AUTH_ENDPOINTS = {
        login: '/api/players/login',
        register: '/api/players/register',
        logout: '/api/players/logout'
    };

    // Add singleton pattern to prevent multiple instances
    static instance = null;

    static getInstance() {
        if (!AuthService.instance) {
            AuthService.instance = new AuthService();
        }
        return AuthService.instance;
    }

    constructor() {
        // Prevent multiple instances
        if (AuthService.instance) {
            return AuthService.instance;
        }
        AuthService.instance = this;

        // Add verification lock
        this.verifying = false;
        // Increase cache TTL to reduce verification frequency
        this.CACHE_TTL = 60000; // 60 seconds
        this.token = localStorage.getItem('gameToken');
        this.player = JSON.parse(localStorage.getItem('playerData'));
        this.tokenCache = new Map();
        
        // Ensure player ID is properly initialized from storage
        this._playerId = this.player?.playerid || null;
        console.log('[Auth] Initialized with player ID:', this._playerId);
    }

    async login(username, password) {
        try {
            console.log('[Auth] Attempting login...');
            const response = await fetch(AuthService.AUTH_ENDPOINTS.login, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json'
                },
                credentials: 'include',
                body: JSON.stringify({ username, password })
            });

            if (!response.ok) {
                const error = await response.text();
                throw new Error(error || 'Login failed');
            }

            const data = await response.json();
            if (!data.token) {
                throw new Error('No token received from auth server');
            }

            console.log('[Auth] Step 2: Received auth token');
            this.setSession(data.token, data.player);
            return data;
        } catch (error) {
            console.error('[Auth] Login failed:', error);
            throw error;
        }
    }

    async register(username, password) {
        try {
            const response = await fetch(`${AuthService.API_URL}${AuthService.AUTH_ENDPOINTS.register}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });

            if (!response.ok) throw new Error('Registration failed');

            const data = await response.json();
            this.setSession(data.token, data.player);
            return data;
        } catch (error) {
            console.error('[Auth] Registration failed:', error);
            throw error;
        }
    }

    // Add method to get cached validation
    getCachedValidation(token) {
        const cached = this.tokenCache.get(token);
        if (cached && (Date.now() - cached.timestamp < AuthService.CACHE_TTL)) {
            return cached;
        }
        return null;
    }

    setSession(token, player) {
        this.token = token;
        this.player = player;
        localStorage.setItem('gameToken', token);
        localStorage.setItem('playerData', JSON.stringify(player));
        
        // Update player ID when session changes
        if (player?.playerid) {
            this._playerId = player.playerid;
            console.log('[Auth] Updated player ID:', this._playerId);
        }
    }

    clearSession() {
        this.token = null;
        this.player = null;
        localStorage.removeItem('gameToken');
        localStorage.removeItem('playerData');
        this._playerId = null;
        console.log('[Auth] Cleared player ID');
    }

    // Replace getPlayerId with centralized player ID management
    getPlayerId() {
        if (!this._playerId && this.player?.playerid) {
            this._playerId = this.player.playerid;
            console.log('[Auth] Retrieved player ID:', this._playerId);
        }
        return this._playerId;
    }

    getToken() {
        return this.token;
    }
}
