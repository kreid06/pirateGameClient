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
        this.hoveredModule = null;
        this.lastModuleInteraction = 0;
        this.moduleInteractionCooldown = 1000; // 1 second cooldown
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

        window.addEventListener('mousemove', (e) => {
            if (!this.gameState?.ready) return;
            
            // Check each ship for module hover
            let foundModule = null;
            this.gameState.ships.forEach(ship => {
                const module = this.renderSystem.checkModuleHover(
                    { x: e.clientX, y: e.clientY },
                    ship
                );
                if (module) {
                    foundModule = module;
                    // console.log('[GameClient] Module hover:', {
                    //     moduleId: module.id,
                    //     moduleType: module.constructor.name,
                    //     shipId: ship.id,
                    //     position: module.worldPosition
                    // });
                }
            });

            // Update hovered module
            if (foundModule !== this.hoveredModule) {
                if (this.hoveredModule) {
                    // Clear previous hover
                    this.gameState.hud.clearModuleInfo();
                }
                this.hoveredModule = foundModule;
                if (foundModule) {
                    // Show new module info
                    const canMount = this.gameState.player.state.isBoarded &&
                                   this.gameState.player.state.boardedShipId === foundModule.ship.id;
                    this.gameState.hud.showModuleInfo(foundModule, canMount);
                }
            }
        });

        window.addEventListener('mouseout', () => {
            if (this.hoveredModule) {
                this.gameState.hud.clearModuleInfo();
                this.hoveredModule = null;
            }
        });

        window.addEventListener('moduleInteract', (event) => {
            if (!this.gameState?.player) return;
            
            const now = Date.now();
            if (now - this.lastModuleInteraction < this.moduleInteractionCooldown) {
                console.log('[GameClient] Module interaction on cooldown:', {
                    timeLeft: ((this.moduleInteractionCooldown - (now - this.lastModuleInteraction)) / 1000).toFixed(1) + 's'
                });
                return;
            }

            this.lastModuleInteraction = now;
            const player = this.gameState.player;

            // If already mounted, only handle unmounting
            if (player.state.mountedModule) {
                console.log('[GameClient] Unmounting from module:', {
                    moduleId: player.state.mountedModule.id,
                    moduleType: player.state.mountedModule.constructor.name
                });
                player.unmountModule();
                return;
            }

            // Otherwise try to mount if hovering over a module
            if (this.hoveredModule) {
                const module = this.hoveredModule;
                const dx = player.position.x - module.worldPosition.x;
                const dy = player.position.y - module.worldPosition.y;
                const distance = Math.sqrt(dx * dx + dy * dy);

                console.log('[GameClient] Attempting module mount:', {
                    moduleId: module.id,
                    moduleType: module.constructor.name,
                    distance: distance.toFixed(1),
                    playerPos: { x: player.position.x.toFixed(1), y: player.position.y.toFixed(1) },
                    modulePos: { x: module.worldPosition.x.toFixed(1), y: module.worldPosition.y.toFixed(1) }
                });

                if (player.state.canInteractWithModule) {
                    player.mountModule(module);
                } else {
                    console.log('[GameClient] Cannot mount: Too far from module', {
                        distance: distance.toFixed(1),
                        requiredDistance: module.getInteractionRadius()
                    });
                }
            }
        });
    }

    gameLoop(timestamp) {
        if (!this.running || !this.gameState?.ready) return;

        const deltaTime = Math.min(timestamp - this.lastTime, this.targetDelta);
        this.lastTime = timestamp;

        // Update input system with player state and get input once
        this.inputSystem.setState(this.gameState);
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
