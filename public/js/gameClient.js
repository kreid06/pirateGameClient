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
        this.islands = [];
        this.connection = new UDPConnection(this.playerId);
        this.connection.onIslandsReceived = (islands) => {
            this.islands = islands;
            console.log('[GameClient] Received islands:', islands.length);
        };
        this.connection.onShipReceived = (shipData) => {
            // Convert numeric ID from server to numeric type for consistency
            this.handleShipUpdate({
                type: 'brigantine',
                id: 1, // Use the server's numeric ID instead of 'ship1'
                x: shipData.x,
                y: shipData.y,
                r: shipData.rotation,
                sailCount: shipData.sailCount,
                cannonCount: shipData.cannonCount
            });
        };
        
        this.pendingModules = new Map(); // Add pending modules storage
        
        this.connection.onSailsReceived = (sails) => {
            console.log('[GameClient] Received sail data:', sails.length, 'sails');
            sails.forEach(sail => {
                console.log('[GameClient] Processing sail for ship:', sail.attachedToShipId, typeof sail.attachedToShipId);
                const ship = this.ships.get(sail.attachedToShipId);
                if (ship) {
                    ship.addModule({ ...sail, type: 'sail' });
                } else {
                    // Queue the sail if ship not found
                    if (!this.pendingModules.has(sail.attachedToShipId)) {
                        this.pendingModules.set(sail.attachedToShipId, []);
                    }
                    console.log(`[GameClient] Queuing sail for ship ${sail.attachedToShipId}`);
                    this.pendingModules.get(sail.attachedToShipId).push({ ...sail, type: 'sail' });
                }
            });
        };

        this.connection.onCannonsReceived = (cannons) => {
            console.log('[GameClient] Received cannon data:', cannons.length, 'cannons');
            cannons.forEach(cannon => {
                const ship = this.ships.get(cannon.attachedToShipId);
                if (ship) {
                    ship.addModule({ ...cannon, type: 'cannon' });
                } else {
                    // Queue the cannon if ship not found
                    if (!this.pendingModules.has(cannon.attachedToShipId)) {
                        this.pendingModules.set(cannon.attachedToShipId, []);
                    }
                    console.log(`[GameClient] Queuing cannon for ship ${cannon.attachedToShipId}`);
                    this.pendingModules.get(cannon.attachedToShipId).push({ ...cannon, type: 'cannon' });
                }
            });
        };

        this.connection.onSteeringReceived = (steering) => {
            console.log('[GameClient] Received steering data');
            const ship = this.ships.get(steering.attachedToShipId);
            if (ship) {
                ship.addModule({ ...steering, type: 'steering' });
            } else {
                // Queue the steering if ship not found
                if (!this.pendingModules.has(steering.attachedToShipId)) {
                    this.pendingModules.set(steering.attachedToShipId, []);
                }
                console.log(`[GameClient] Queuing steering for ship ${steering.attachedToShipId}`);
                this.pendingModules.get(steering.attachedToShipId).push({ ...steering, type: 'steering' });
            }
        };
        
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
        this.coordsDisplay = document.getElementById('coordinates');
        this.setupMouseTracking();
        this.ships = new Map();
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

    updateCoordinates() {
        if (this.coordsDisplay) {
            this.coordsDisplay.textContent = `Screen: (${Math.round(this.mousePos.x)}, ${Math.round(this.mousePos.y)}) World: (${Math.round(this.worldPos.x)}, ${Math.round(this.worldPos.y)})`;
        }
    }

    render() {
        // Clear canvas
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Update coordinates display
        this.updateCoordinates();
        
        // Draw grid
        this.movement.drawGrid(this.ctx);
        
        // Save the canvas state before transformations
        this.ctx.save();
        
        // Apply world transform for islands and ships - Fix: Inverse the world position
        this.ctx.translate(MovementData.VIEW_CENTER.x - this.worldPos.x, 
                         MovementData.VIEW_CENTER.y - this.worldPos.y);
        
        // Draw all islands
        for (const island of this.islands) {
            this.ctx.beginPath();
            this.ctx.arc(island.x, island.y, island.radius, 0, Math.PI * 2);
            this.ctx.fillStyle = '#7B5B3B';  // Brown color for islands
            this.ctx.fill();
            this.ctx.strokeStyle = '#5A4229';  // Darker brown for border
            this.ctx.lineWidth = 2;
            this.ctx.stroke();
        }
        
        // Draw all ships in the same world space as islands
        this.ships.forEach(ship => ship.render(this.ctx));
        
        // Restore canvas state
        this.ctx.restore();
        
        // Draw player (always centered)
        this.ctx.save();
        this.ctx.translate(MovementData.VIEW_CENTER.x, MovementData.VIEW_CENTER.y);
        this.ctx.rotate(this.rotation);
        
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

    handleShipUpdate(shipData) {
        const { id, type, x, y, r } = shipData;
        console.log('[GameClient] Handling ship update:', { id, type, x, y, r });
        
        let ship = this.ships.get(id);
        
        if (!ship) {
            switch (type) {
                case 'brigantine':
                    ship = new Brigantine(x, y, r, id);
                    this.ships.set(id, ship);
                    console.log(`[GameClient] Created new ship ${id}, checking for ${this.pendingModules.has(id) ? 'pending' : 'no'} modules`);
                    
                    // Process any pending modules for this ship
                    if (this.pendingModules.has(id)) {
                        const pendingCount = this.pendingModules.get(id).length;
                        console.log(`[GameClient] Processing ${pendingCount} pending modules for ship ${id}`);
                        this.pendingModules.get(id).forEach(module => {
                            ship.addModule(module);
                        });
                        this.pendingModules.delete(id);
                    }
                    break;
            }
        }
        
        if (ship) {
            ship.serverUpdate(shipData);
        }
    }
}

// Ship base class
class Ship {
    constructor(x, y, r, id) {
        this.position = { x, y };
        this.rotation = r;
        this.id = id;
        this.modules = new Map();  // Unified module management
        this.path = null;
    }

    serverUpdate(data) {
        this.position.x = data.x;
        this.position.y = data.y;
        this.rotation = data.r;
    }

    addModule(moduleData) {
        const { id, type, x = 0, y = 0, r = 0, quality = 1, efficiency = 1, bindX = 0, bindY = 0, rotation = r } = moduleData || {};
        
        if (!id || !type) {
            console.warn(`[Ship ${this.id}] Invalid module data:`, moduleData);
            return;
        }

        let module;
        // Use rotation from data if available, otherwise fall back to r
        const finalRotation = typeof rotation === 'number' ? rotation : r;
        const rotationStr = finalRotation.toFixed(2);
        const bindPos = `(${bindX}, ${bindY})`;

        // Create the appropriate module type
        switch (type) {
            case 'sail':
                console.log(`[Ship ${this.id}] Creating new sail at ${bindPos}, rotation: ${rotationStr}, efficiency: ${efficiency}`);
                module = new Sail(x, y, finalRotation, id, quality, efficiency);
                break;
            case 'cannon':
                console.log(`[Ship ${this.id}] Creating new cannon at ${bindPos}, rotation: ${rotationStr}, efficiency: ${efficiency}`);
                module = new Cannon(x, y, finalRotation, id, quality, efficiency);
                break;
            case 'steering':
                console.log(`[Ship ${this.id}] Creating new steering wheel at ${bindPos}, rotation: ${rotationStr}`);
                module = new SteeringWheel(x, y, finalRotation, id, quality);
                break;
            default:
                console.warn(`[Ship ${this.id}] Unknown module type:`, type);
                return;
        }

        // Set up the module
        module.ship = this;
        module.bindPosition = { x: bindX, y: bindY };
        this.modules.set(id, module);
        console.log(`[Ship ${this.id}] Module ${id} (${type}) added successfully at rotation ${rotationStr}`);
    }

    removeModule(moduleId) {
        const module = this.modules.get(moduleId);
        if (module) {
            module.ship = null;
            this.modules.delete(moduleId);
        }
    }
}

class Brigantine extends Ship {
    constructor(x, y, r, id) {
        super(x, y, r, id);
        console.log(`[Ship ${id}] Creating new Brigantine ship at (${x.toFixed(2)}, ${y.toFixed(2)}), rotation: ${r.toFixed(2)}`);
    }

    render(ctx) {
        ctx.save();
        
        // Position the ship in world space
        ctx.translate(this.position.x, this.position.y);
        
        // Apply ship rotation
        ctx.rotate(this.rotation);
        
        // Draw ship hull
        console.log(`[Ship ${this.id}] Drawing hull at (${this.position.x.toFixed(2)}, ${this.position.y.toFixed(2)})`);
        this.path = new Path2D();
        this.path.moveTo(225, 90);
        this.path.quadraticCurveTo(500, 0, 225, -90);
        this.path.lineTo(-225, -90);
        this.path.quadraticCurveTo(-325, 0, -225, 90);
        this.path.closePath();

        ctx.fillStyle = '#D2B48C';
        ctx.strokeStyle = '#8B4513';
        ctx.lineWidth = 10;
        ctx.fill(this.path);
        ctx.stroke(this.path);

        // Render modules - they will inherit ship's transform
        this.modules.forEach(module => {
            module.interpolate();
            module.render(ctx);
        });
        
        ctx.restore();
    }
}

class ShipComponent {
    constructor(x, y, r, id, quality) {
        console.log(`[Component ${id}] Initializing with rotation: ${r.toFixed(2)}`);
        this.position = { x, y };
        this.rotation = r;
        this.targetRotation = r;  // Initialize target rotation to match initial rotation
        this.id = id;
        this.quality = quality;
        this.health = 100 * quality;
        this.ship = null;
    }

    serverUpdate(data) {
        if (data.health !== undefined) this.health = data.health;
        if (data.r !== undefined) this.targetRotation = data.r;
    }

    interpolate() {
        if (this.targetRotation !== undefined) {
            this.rotation = lerp(this.rotation, this.targetRotation, 0.1);
        }
    }
}

class Cannon extends ShipComponent {
    constructor(x, y, r, id, quality, efficiency) {
        super(x, y, r, id, quality);
        console.log(`[Cannon ${id}] Created with rotation:`, r.toFixed(2), 
                    r === 0 ? '(WARNING: Zero rotation)' : '');
        this.weaponDamage = 100 * efficiency;
        this.paths = { base: null, turret: null };
    }

    render(ctx) {
        ctx.save();
        // First translate to the module's bind position
        ctx.translate(this.bindPosition.x, this.bindPosition.y);

        // Draw base at ship's rotation (don't rotate it)
        this.paths.base = new Path2D();
        this.drawBase(this.paths.base);
        ctx.fillStyle = '#8B4513';
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 2;
        ctx.fill(this.paths.base);
        ctx.stroke(this.paths.base);

        // Now rotate for the cannon's own rotation (this is the turret rotation)
        ctx.rotate(this.rotation);

        // Draw turret
        this.paths.turret = new Path2D();
        this.drawTurret(this.paths.turret);
        ctx.fillStyle = '#000000';
        ctx.fill(this.paths.turret);

        // Log rotation values for debugging
        console.log(`[Cannon ${this.id}] Rendering at:`, {
            bindPos: `(${this.bindPosition.x}, ${this.bindPosition.y})`,
            rotation: this.rotation.toFixed(2),
            shipRotation: this.ship?.rotation.toFixed(2)
        });

        ctx.restore();
    }

    drawBase(path) {
        path.moveTo(15, 10);
        path.lineTo(-15, 10);
        path.lineTo(-15, -10);
        path.lineTo(15, -10);
        path.closePath();
    }

    drawTurret(path) {
        path.moveTo(10, 15);
        path.lineTo(-10, 15);
        path.lineTo(-8, -45);
        path.lineTo(8, -45);
        path.closePath();
    }

    serverUpdate(data) {
        super.serverUpdate(data);
        if (this.targetRotation !== undefined) {
            console.log(`[Cannon ${this.id}] Rotation update:`, {
                current: this.rotation.toFixed(2),
                target: this.targetRotation.toFixed(2)
            });
        }
    }
}

class SteeringWheel extends ShipComponent {
    constructor(x, y, r, id, quality) {
        super(x, y, r, id, quality);
        this.path = null;
    }

    render(ctx) {
        ctx.save();
        ctx.translate(this.position.x, this.position.y);
        ctx.rotate(this.rotation);

        this.path = new Path2D();
        this.path.moveTo(-10, -20);
        this.path.lineTo(10, -20);
        this.path.lineTo(10, 20);
        this.path.lineTo(-10, 20);
        this.path.closePath();

        ctx.fillStyle = '#8B4513';
        ctx.fill(this.path);

        ctx.restore();
    }
}

class Sail extends ShipComponent {
    constructor(x, y, r, id, quality, efficiency) {
        super(x, y, r, id, quality);
        this.efficiency = efficiency;
    }

    render(ctx) {
        // Use existing sail rendering code but relative to bind position
        ctx.save(); // Add save to match restore
        ctx.rotate(this.rotation);
        
        // Draw sail
        ctx.beginPath();
        ctx.moveTo(0, 130);
        ctx.quadraticCurveTo(50 + this.efficiency, 0, 0, -130);
        ctx.lineTo(0, -130);
        ctx.closePath();
        
        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 2;
        ctx.fill();
        ctx.stroke();

        // Draw mast
        ctx.rotate(-this.rotation);
        ctx.beginPath();
        ctx.arc(0, 0, 15, 0, Math.PI * 2);
        ctx.fillStyle = '#D2B48C';
        ctx.strokeStyle = '#8B4513';
        ctx.lineWidth = 4;
        ctx.fill();
        ctx.stroke();
        
        ctx.restore(); // Add matching restore
    }
}

// Helper function for interpolation
function lerp(start, end, t) {
    return start * (1 - t) + end * t;
}

window.onload = () => new GameClient();