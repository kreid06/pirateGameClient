//gameClient.js

import { Ship, Brigantine } from '../entities/ships/Ship.js';
import { RenderSystem, RENDER_LAYERS } from '../rendering/RenderSystem.js';
import { InputSystem } from '../input/InputSystem.js';
import { GameState } from './GameState.js';
import { Connection } from '../network/Connection.js';  // Updated import path
import { AuthService } from '../auth/auth.js';

export class GameClient {
    constructor() {
        this.auth = AuthService.getInstance();
        this.state = new GameState();
        this.renderSystem = new RenderSystem(document.getElementById('gameCanvas'));
        
        // Force initial resize
        this.renderSystem.handleResize();
        
        this.inputSystem = new InputSystem();
        this.connection = null; // Don't create connection immediately
        
        this.setupEventListeners();
        this.gameLoop = this.gameLoop.bind(this);
        
        // Start the game loop immediately for testing
        this.state.ready = true;
        requestAnimationFrame(this.gameLoop);
        console.log('[Game] Starting local test mode...');

        this.lastTime = 0;
        this.targetDelta = 1000/60;  // Target 60 FPS
        this.running = false;  // Don't start until initialized
    }

    async init() {
        // Initialize game state first
        this.gameState = new GameState();
        
        // Initialize local test player
        await this.gameState.initPlayer('local_player', {
            name: 'Test Player',
            x: 0,
            y: 0,
            rotation: 0
        });

        // Initialize static ships after player
        this.gameState.addStaticShips();

        // Start game loop only after initialization
        this.running = true;
        this.lastFrameTime = performance.now();
        requestAnimationFrame(this.gameLoop.bind(this));

        console.log('[GameClient] Initialized with player:', this.gameState.player);
    }

    setupEventListeners() {
        // Remove or comment out server connection related code for now
        window.addEventListener('gameStateReady', (event) => {
            console.log('[Game] State ready event received');
        });

        window.addEventListener('resize', () => {
            this.renderSystem.handleResize();
        });

        window.addEventListener('toggleDebugDraw', () => {
            if (this.renderSystem) {
                this.renderSystem.toggleDebugDraw();
            }
        });

        window.addEventListener('playerJump', () => {
            if (this.gameState?.player) {
                this.gameState.player.startJump();
            }
        });

        // Comment out server connection code for testing
        /*
        window.addEventListener('startGame', () => {
            const playerId = this.auth.getPlayerId();
            const token = this.auth.getToken();
            
            if (playerId && token) {
                this.connection = new Connection(playerId, this.auth);
                this.state.ready = true;
                requestAnimationFrame(this.gameLoop);
            } else {
                console.warn('[Game] Cannot start without valid auth');
                this.auth.showLoginForm();
            }
        });
        */
    }

    gameLoop(timestamp) {
        if (!this.running || !this.gameState?.ready) return;

        const deltaTime = Math.min(timestamp - this.lastTime, this.targetDelta);
        this.lastTime = timestamp;

        // Get input with mouse position relative to viewport
        const input = this.inputSystem.getInput(
            this.gameState.worldPos,
            this.renderSystem.viewport
        );

        if (input) {
            this.gameState.applyInput(input);
        }

        // Update and render
        this.gameState.update(deltaTime);
        this.renderSystem.render(this.gameState);

        requestAnimationFrame(this.gameLoop);
    }

    handleInput(input) {
        // Apply input to game state
        this.state.applyInput(input);
        
        // Send to network if connected
        if (this.connection?.inputManager) {
            this.connection.inputManager.addInput(input);
        }
    }

    cleanup() {
        // Clear game state
        this.isRunning = false;
        // Additional cleanup as needed
    }
}

// Initialize game when ready
window.addEventListener('startGame', () => new GameClient());
