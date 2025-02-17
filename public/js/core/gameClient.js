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
        const deltaTime = timestamp - (this.state.lastUpdateTime || timestamp);
        this.state.lastUpdateTime = timestamp;
        
        // Process inputs with camera position for mouse coordinate conversion
        if (this.inputSystem && this.renderSystem) {
            const input = this.inputSystem.getInput(
                this.state.worldPos,
                this.renderSystem.viewport
            );
            if (input) {
                this.handleInput(input);
            }
        }
        
        // Update game state
        this.state.update(deltaTime);
        
        // Render frame
        this.renderSystem.render(this.state);
        
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
