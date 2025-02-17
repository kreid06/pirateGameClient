export class GameMap {  // Renamed to avoid conflict with built-in Map
    constructor(gridSize = 250) {
        this.tiles = new Map();  // Using built-in Map
        this.gridSize = gridSize;
        this.backgroundColor = '#87CEEB';  // Sky blue water
        
        // Grid appearance
        this.grid = {
            color: '#2c3e50',
            lineWidth: 1,
            alpha: 0.2,
            labelColor: '#34495e',
            labelFont: '12px Arial',
            labelAlpha: 0.5
        };
    }

    setTile(x, y, tile) {
        this.tiles.set(`${x},${y}`, tile);
    }

    getTile(x, y) {
        return this.tiles.get(`${x},${y}`);
    }

    deleteTile(x, y) {
        this.tiles.delete(`${x},${y}`);
    }

    clear() {
        this.tiles.clear();
    }

    renderBackground(ctx, viewport, camera) {
        ctx.save();
        ctx.fillStyle = this.backgroundColor;
        ctx.fillRect(
            -viewport.center.x + camera.x,
            -viewport.center.y + camera.y,
            viewport.width,
            viewport.height
        );
        ctx.restore();
    }

    renderGrid(ctx, viewport, camera) {
        if (!ctx) return;

        try {
            ctx.save();
            ctx.strokeStyle = this.grid.color;
            ctx.lineWidth = this.grid.lineWidth;
            ctx.globalAlpha = this.grid.alpha;

            // Calculate visible area
            const leftEdge = -viewport.center.x + camera.x;
            const rightEdge = viewport.center.x + camera.x;
            const topEdge = -viewport.center.y + camera.y;
            const bottomEdge = viewport.center.y + camera.y;

            // Calculate grid boundaries
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
            this.renderGridLabels(ctx, startX, endX, startY, endY);

            ctx.restore();
        } catch (error) {
            console.error('[Map] Grid rendering error:', error);
        }
    }

    renderGridLabels(ctx, startX, endX, startY, endY) {
        ctx.fillStyle = this.grid.labelColor;
        ctx.font = this.grid.labelFont;
        ctx.globalAlpha = this.grid.labelAlpha;
        
        for (let x = startX; x <= endX; x += this.gridSize) {
            for (let y = startY; y <= endY; y += this.gridSize) {
                ctx.fillText(`${x},${y}`, x + 5, y + 15);
            }
        }
    }
}