//gameClient.js

import { UDPConnection, MovementData } from './connection.js';

class GameClient {
    static FPS = 30;
    static FRAME_TIME = 1000 / GameClient.FPS;
    static UPDATE_RATE = 1000 / 20; // 20 updates per second

    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.playerId = Math.floor(Math.random() * 1000);
        this.connection = new UDPConnection(this.playerId);
        
        // Initialize world and player state
        this.worldPos = { x: 0, y: 0 };
        this.rotation = 0;
        this.speed = 5;
        
        this.setupCanvas();
        this.setupInput();
        
        // Initialize movement with complete state
        this.movement = new MovementData(
            this.worldPos.x,
            this.worldPos.y,
            0,
            this.rotation,
            this.playerId
        );
        
        this.lastFrameTime = 0;
        this.lastUpdateTime = 0;
        this.mousePos = { x: 0, y: 0 };
        this.setupMouseTracking();
        this.gameLoop();
    }

    setupCanvas() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
    }

    setupInput() {
        this.keys = {};
        window.addEventListener('keydown', (e) => {
            this.keys[e.code] = true;
        });

        window.addEventListener('keyup', (e) => {
            this.keys[e.code] = false;
        });
    }

    setupMouseTracking() {
        window.addEventListener('mousemove', (e) => {
            this.mousePos.x = e.clientX;
            this.mousePos.y = e.clientY;
            this.updateRotation();
        });
    }

    updateRotation() {
        // Calculate angle between player and cursor
        const dx = this.mousePos.x - MovementData.VIEW_CENTER.x;
        const dy = this.mousePos.y - MovementData.VIEW_CENTER.y;
        this.rotation = Math.atan2(dy, dx);
    }

    updateWorldPosition() {
        let moved = false;
        const oldX = this.worldPos.x;
        const oldY = this.worldPos.y;

        // Movement direction based on rotation
        if (this.keys['KeyW']) { // Forward
            this.worldPos.x += Math.cos(this.rotation) * this.speed;
            this.worldPos.y += Math.sin(this.rotation) * this.speed;
            moved = true;
        }
        if (this.keys['KeyS']) { // Backward
            this.worldPos.x -= Math.cos(this.rotation) * this.speed;
            this.worldPos.y -= Math.sin(this.rotation) * this.speed;
            moved = true;
        }
        if (this.keys['KeyA']) { // Strafe Left
            this.worldPos.x += Math.sin(this.rotation) * this.speed;
            this.worldPos.y -= Math.cos(this.rotation) * this.speed;
            moved = true;
        }
        if (this.keys['KeyD']) { // Strafe Right
            this.worldPos.x -= Math.sin(this.rotation) * this.speed;
            this.worldPos.y += Math.cos(this.rotation) * this.speed;
            moved = true;
        }

        // Update movement if position changed
        if (moved) {
            this.movement = new MovementData(
                this.worldPos.x,
                this.worldPos.y,
                0,
                this.rotation,
                this.playerId
            );
            this.connection.sendMovementData(
                this.worldPos.x,
                this.worldPos.y,
                this.rotation
            );
        }
    }

    sendInputToServer() {
        const movement = new MovementData(
            this.worldPos.x,
            this.worldPos.y,
            0,
            this.playerPos.rotation,
            this.playerId
        );
        this.connection.sendMovementData(movement);
    }

    update() {
        // Move world opposite to desired player movement
        if (this.keys['ArrowUp'] || this.keys['KeyW']) this.worldPos.y += this.speed;
        if (this.keys['ArrowDown'] || this.keys['KeyS']) this.worldPos.y -= this.speed;
        if (this.keys['ArrowLeft'] || this.keys['KeyA']) this.worldPos.x += this.speed;
        if (this.keys['ArrowRight'] || this.keys['KeyD']) this.worldPos.x -= this.speed;

        // Update movement with world position
        this.movement = new MovementData(
            this.worldPos.x,
            this.worldPos.y,
            0,
            0,
            this.playerId
        );

        // Send world position to server
        this.connection.sendMovementData(
            this.worldPos.x,
            this.worldPos.y,
            0
        );
    }

    render() {
        // Clear canvas
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Draw grid
        this.movement.drawGrid(this.ctx);
        
        // Draw rotated player
        this.ctx.save();
        this.ctx.translate(MovementData.VIEW_CENTER.x, MovementData.VIEW_CENTER.y);
        this.ctx.rotate(this.rotation);
        
        // Draw square centered at origin
        this.ctx.fillStyle = 'red';
        this.ctx.fillRect(-10, -10, 20, 20);
        
        this.ctx.restore();
    }

    gameLoop(timestamp) {
        const delta = timestamp - this.lastFrameTime;
        
        if (delta >= GameClient.FRAME_TIME) {
            this.lastFrameTime = timestamp - (delta % GameClient.FRAME_TIME);
            
            // Update position based on current key states
            this.updateWorldPosition();
            
            // Render frame
            this.render();
        }
        
        requestAnimationFrame((ts) => this.gameLoop(ts));
    }
}

window.onload = () => new GameClient();