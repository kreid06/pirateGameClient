import { GAME_CONSTANTS } from '../core/constants.js';

export const RENDER_LAYERS = {
    BACKGROUND: 0,
    GRID: 1,
    ISLANDS: 2,
    SHIPS: 3,
    OTHER_PLAYERS: 4,
    PLAYERS: 5,
    MODULES: 6,
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

        console.log('[Render] Initialized with viewport:', {
            width: this.viewport.width,
            height: this.viewport.height,
            center: this.viewport.center
        });
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

    drawGrid(ctx) {
        if (!ctx) return;

        try {
            ctx.save();
            ctx.strokeStyle = '#2c3e50';
            ctx.lineWidth = 1;
            ctx.globalAlpha = 0.2;

            // Calculate visible area
            const leftEdge = -this.viewport.center.x + this.camera.x;
            const rightEdge = this.viewport.center.x + this.camera.x;
            const topEdge = -this.viewport.center.y + this.camera.y;
            const bottomEdge = this.viewport.center.y + this.camera.y;

            // Calculate grid lines positions
            const startX = Math.floor(leftEdge / this.gridSize) * this.gridSize;
            const endX = Math.ceil(rightEdge / this.gridSize) * this.gridSize;
            const startY = Math.floor(topEdge / this.gridSize) * this.gridSize;
            const endY = Math.ceil(bottomEdge / this.gridSize) * this.gridSize;

            // Draw vertical lines
            for (let x = startX; x <= endX; x += this.gridSize) {
                ctx.beginPath();
                ctx.moveTo(x, startY);
                ctx.lineTo(x, endY);
                ctx.stroke();
            }

            // Draw horizontal lines
            for (let y = startY; y <= endY; y += this.gridSize) {
                ctx.beginPath();
                ctx.moveTo(startX, y);
                ctx.lineTo(endX, y);
                ctx.stroke();
            }

            // Draw coordinate labels
            ctx.fillStyle = '#34495e';
            ctx.font = '12px Arial';
            ctx.globalAlpha = 0.5;
            
            for (let x = startX; x <= endX; x += this.gridSize) {
                for (let y = startY; y <= endY; y += this.gridSize) {
                    ctx.fillText(`${x},${y}`, x + 5, y + 15);
                }
            }

            ctx.restore();
        } catch (error) {
            console.error('[Grid] Drawing error:', error);
        }
    }

    render(gameState) {
        if (!gameState.worldPos) {
            console.warn('[Render] No player position available');
            return;
        }

        // Update camera to track player position
        this.camera.x = gameState.worldPos.x;
        this.camera.y = gameState.worldPos.y;

        console.log('[Render] Camera position:', {
            x: this.camera.x,
            y: this.camera.y,
            player: gameState.worldPos
        });

        // Clear the entire canvas
        this.ctx.clearRect(0, 0, this.viewport.width, this.viewport.height);
        
        // Save context state
        this.ctx.save();
        
        // Center the view and apply camera transform
        const centerX = this.viewport.width / 2;
        const centerY = this.viewport.height / 2;
        
        // Move to center of screen
        this.ctx.translate(centerX, centerY);
        
        // Apply camera offset (negative to move world opposite to player)
        this.ctx.translate(-this.camera.x, -this.camera.y);
        
        console.log('[Render] Drawing world at offset:', {
            centerX, centerY,
            cameraOffset: { x: -this.camera.x, y: -this.camera.y }
        });

        // Draw background and grid
        this.drawBackground(this.ctx);
        this.drawGrid(this.ctx);

        // Draw all ships
        gameState.ships.forEach(ship => {
            console.log('[Render] Drawing ship at:', ship.position);
            this.queueForRendering(ship, RENDER_LAYERS.SHIPS);
        });

        // Draw player last
        this.drawPlayer(this.ctx, gameState);
        
        // Process render queue
        this.processRenderQueue();
        
        // Restore context state
        this.ctx.restore();
    }

    drawPlayer(ctx, gameState) {
        if (!gameState.worldPos) return;
        
        console.log('[Render] Player draw position:', {
            x: gameState.worldPos.x,
            y: gameState.worldPos.y,
            rotation: gameState.rotation
        });

        ctx.save();
        // Draw player circle
        ctx.beginPath();
        ctx.fillStyle = '#e74c3c';  // Red color
        ctx.strokeStyle = '#c0392b';
        ctx.lineWidth = 2;
        ctx.arc(gameState.worldPos.x, gameState.worldPos.y, 20, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        
        // Draw direction indicator
        ctx.beginPath();
        ctx.moveTo(gameState.worldPos.x, gameState.worldPos.y);
        const directionLength = 25;
        ctx.lineTo(
            gameState.worldPos.x + Math.cos(gameState.rotation) * directionLength,
            gameState.worldPos.y + Math.sin(gameState.rotation) * directionLength
        );
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 3;
        ctx.stroke();
        ctx.restore();
    }

    drawDebugInfo(gameState) {
        const coords = document.getElementById('coordinates');
        if (coords) {
            coords.textContent = `X: ${Math.round(gameState.worldPos.x)}, Y: ${Math.round(gameState.worldPos.y)}`;
        }
    }

    drawBackground(ctx) {
        // Draw water background
        ctx.save();
        ctx.fillStyle = '#87CEEB'; // Deep blue water color
        ctx.fillRect(
            -this.viewport.center.x + this.camera.x,
            -this.viewport.center.y + this.camera.y,
            this.viewport.width,
            this.viewport.height
        );
        ctx.restore();
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
