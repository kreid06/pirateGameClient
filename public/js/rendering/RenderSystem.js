import { GameMap } from './map.js';  // Update import
import { GAME_CONSTANTS } from '../core/constants.js';

export const RENDER_LAYERS = {
    BACKGROUND: 0,
    GRID: 1,
    ISLANDS: 2,
    SHIPS: 3,
    SHIP_MODULES: 4,
    PLAYERS: 5,      // Player layer is now after ships but before UI
    OTHER_PLAYERS: 6,
    UI: 7
};

export class RenderSystem {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.renderQueue = new Map();
        this.gridSize = GAME_CONSTANTS.GRID_SIZE || 250;
        
        // Initialize canvas size
        this.handleResize();
        
        for (const layer of Object.values(RENDER_LAYERS)) {
            this.renderQueue.set(layer, []);
        }

        // Add camera and viewport properties
        this.camera = {
            x: 0,
            y: 0,
            scale: 1
        };
        
        this.viewport = {
            width: window.innerWidth,
            height: window.innerHeight,
            center: { x: window.innerWidth / 2, y: window.innerHeight / 2 }
        };

        this.debugDraw = false;

        this.map = new GameMap(GAME_CONSTANTS.GRID_SIZE);

        console.log('[Render] Initialized with viewport:', {
            width: this.viewport.width,
            height: this.viewport.height,
            center: this.viewport.center
        });
    }

    toggleDebugDraw() {
        this.debugDraw = !this.debugDraw;
        console.log('[Render] Debug drawing:', this.debugDraw ? 'enabled' : 'disabled');
    }

    queueForRendering(object, layer, zIndex = 0) {
        if (!this.renderQueue.has(layer)) {
            console.warn(`[Render] Invalid layer: ${layer}`);
            return;
        }
        this.renderQueue.get(layer).push({ object, zIndex });
    }

    clearRenderQueue() {
        this.renderQueue.forEach(layer => layer.length = 0);
    }

    processRenderQueue() {
        for (const layer of Object.values(RENDER_LAYERS)) {
            const queue = this.renderQueue.get(layer);
            if (!queue || queue.length === 0) continue;

            queue.sort((a, b) => a.zIndex - b.zIndex);
            
            queue.forEach(({ object }) => {
                if (typeof object === 'function') {
                    object(this.ctx);
                } else if (object.render) {
                    object.render(this.ctx);
                }
            });
        }
        
        this.clearRenderQueue();
    }

    render(gameState) {
        if (!gameState?.ready) {
            console.warn('[Render] Game state not ready');
            return;
        }

        if (!gameState?.player) {
            console.warn('[Render] Game state player not initialized');
            return;
        }

        // Use player's physics position
        const playerPos = gameState.player.position;
        if (!playerPos) {
            console.warn('[Render] Player position not available');
            return;
        }

        // Update camera to track player position
        this.camera.x = playerPos.x;
        this.camera.y = playerPos.y;

        // Clear and prepare canvas
        this.ctx.clearRect(0, 0, this.viewport.width, this.viewport.height);
        this.ctx.save();

        // Setup camera transform
        const centerX = this.viewport.width / 2;
        const centerY = this.viewport.height / 2;
        this.ctx.translate(centerX, centerY);
        this.ctx.translate(-this.camera.x, -this.camera.y);

        // Use Map class for background and grid
        this.map.renderBackground(this.ctx, this.viewport, this.camera);
        this.map.renderGrid(this.ctx, this.viewport, this.camera);

        // Draw ships
        if (gameState.ships) {
            gameState.ships.forEach(ship => {
                this.queueForRendering(ship, RENDER_LAYERS.SHIPS);
            });
        }

        // Queue player render using player's own render method
        this.queueForRendering(
            (ctx) => gameState.player.render(ctx),
            RENDER_LAYERS.PLAYERS,
            1
        );

        // Process render queue
        this.processRenderQueue();

        // Draw physics debug if enabled
        if (this.debugDraw) {
            // Draw player physics
            if (gameState.player) {
                gameState.player.renderPhysicsBody(this.ctx);
            }

            // Draw ship physics and boundaries
            gameState.ships.forEach(ship => {
                ship.renderPhysicsBody(this.ctx);
                if (gameState.playerState.isMounted) {
                    ship.renderDeckBoundaries(this.ctx);
                }
            });
        }

        this.ctx.restore();
    }

    handleResize() {
        // Set canvas size to match window size
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
        
        // Update viewport settings
        this.viewport = {
            width: window.innerWidth,
            height: window.innerHeight,
            center: { 
                x: window.innerWidth / 2,
                y: window.innerHeight / 2
            }
        };

        // Prevent blurry rendering
        this.ctx.imageSmoothingEnabled = true;
    }

    // Add other rendering methods...
}
