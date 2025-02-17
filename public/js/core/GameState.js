import { Brigantine } from '../entities/ships/Ship.js';

export class GameState {
    constructor() {
        this.ready = false;
        this.worldPos = { x: 0, y: 0 };
        this.rotation = 0;
        this.ships = new Map();
        this.otherPlayers = new Map();
        this.lastUpdateTime = performance.now();
        
        // Physics properties
        this.physics = {
            // Tune these values for desired feel
            maxSpeed: 300,
            acceleration: 1000,
            deceleration: 0.92,
            rotationSpeed: 0.1,
            mass: 1,
            force: {
                x: 0,
                y: 0
            }
        };

        this.velocity = { x: 0, y: 0 };
        this.worldPos = { x: 0, y: 0 };
        this.rotation = 0;

        this.interpolation = {
            delay: 50,
            bufferSize: 30,
            smoothing: 0.6,
            positions: new Map()
        };

        // Add movement state
        this.velocity = { x: 0, y: 0 };
        this.acceleration = { x: 0, y: 0 };

        // Movement constants
        this.moveSpeed = 200;
        this.strafeSpeed = 150;

        // Create physics manager
        this.physicsManager = new PhysicsManager();
        
        // Add static ships and their physics bodies
        this.ships = new Map();
        this.addStaticShips();
        
        // Create player physics body
        this.physicsManager.createPlayerBody(0, 0);
    }

    addStaticShips() {
        // Add a brigantine at -500,0
        const brigantine = new Brigantine(-500, 0, 0, 'static_ship_1');
        this.ships.set(brigantine.id, brigantine);
        console.log('[GameState] Added static brigantine at:', brigantine.position);
    }

    applyForce(force) {
        // F = ma, so a = F/m
        const acceleration = {
            x: force.x / this.physics.mass,
            y: force.y / this.physics.mass
        };

        this.velocity.x += acceleration.x;
        this.velocity.y += acceleration.y;
    }

    applyInput(input) {
        // Update rotation to face mouse
        if (input.mousePos) {
            this.rotation = this.calculateRotation(input.mousePos);
        }

        // Calculate movement force based on input
        const force = { x: 0, y: 0 };
        const acceleration = this.physics.acceleration;

        if (input.forward || input.backward || input.strafeLeft || input.strafeRight) {
            // Forward/Backward force along rotation
            if (input.forward) {
                force.x += Math.cos(this.rotation) * acceleration;
                force.y += Math.sin(this.rotation) * acceleration;
            }
            if (input.backward) {
                force.x -= Math.cos(this.rotation) * acceleration * 0.7; // Slower backward movement
                force.y -= Math.sin(this.rotation) * acceleration * 0.7;
            }

            // Strafe force perpendicular to rotation
            if (input.strafeLeft) {
                force.x -= Math.cos(this.rotation + Math.PI/2) * acceleration * 0.8;
                force.y -= Math.sin(this.rotation + Math.PI/2) * acceleration * 0.8;
            }
            if (input.strafeRight) {
                force.x += Math.cos(this.rotation + Math.PI/2) * acceleration * 0.8;
                force.y += Math.sin(this.rotation + Math.PI/2) * acceleration * 0.8;
            }

            // Apply the calculated force
            this.applyForce(force);
        }
    }

    update(deltaTime) {
        // Update physics first
        this.physicsManager.update(deltaTime);
        
        // Update positions from physics simulation
        this.physicsManager.updateBodies(this);

        const dt = deltaTime * 0.001; // Convert to seconds

        // Apply physics
        // Update velocity
        this.velocity.x *= this.physics.deceleration;
        this.velocity.y *= this.physics.deceleration;

        // Clamp velocity to max speed
        const currentSpeed = Math.sqrt(this.velocity.x * this.velocity.x + this.velocity.y * this.velocity.y);
        if (currentSpeed > this.physics.maxSpeed) {
            const scale = this.physics.maxSpeed / currentSpeed;
            this.velocity.x *= scale;
            this.velocity.y *= scale;
        }

        // Update position based on velocity and delta time
        this.worldPos.x += this.velocity.x * dt;
        this.worldPos.y += this.velocity.y * dt;

        // Log physics state for debugging
        console.log('[Physics] State:', {
            pos: { x: Math.round(this.worldPos.x), y: Math.round(this.worldPos.y) },
            vel: { x: Math.round(this.velocity.x), y: Math.round(this.velocity.y) },
            speed: Math.round(currentSpeed)
        });

        this.lastUpdateTime = performance.now();
    }

    updatePlayer(position, rotation) {
        this.worldPos = position;
        this.rotation = rotation;
    }

    updateShip(shipData) {
        const { id, x, y, r } = shipData;
        const shipId = typeof id === 'bigint' ? id.toString() : id;
        
        let ship = this.ships.get(shipId);
        if (!ship) {
            ship = new Brigantine(x, y, r || 0, shipId);
            this.ships.set(shipId, ship);
        }
        
        ship.position.x = x;
        ship.position.y = y;
        ship.rotation = r || 0;
        
        return ship;
    }

    calculateRotation(mousePos) {
        return Math.atan2(
            mousePos.y - this.worldPos.y,
            mousePos.x - this.worldPos.x
        );
    }
}
