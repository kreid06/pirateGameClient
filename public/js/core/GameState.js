import { Brigantine } from '../entities/ships/Ship.js';
import { PhysicsManager } from '../physics/PhysicsManager.js';

export class GameState {
    constructor() {
        this.ready = false;
        this.worldPos = { x: 0, y: 0 };
        this.rotation = 0;
        this.ships = new Map();
        this.otherPlayers = new Map();
        this.lastUpdateTime = performance.now();
        
        // Adjust physics properties for better control
        this.physics = {
            maxForce: 1,             // Increased base force
            acceleration: 0.1,        // More responsive acceleration
            deceleration: 0.98,      // Slight deceleration
            maxSpeed: 2,            // Maximum speed limit
            turnSpeed: 0.05,         // Rotation speed
            // Movement multipliers
            forward: 1.0,            // Full power forward
            backward: 0.5,           // Half power backward
            strafe: 0.7,             // 70% power for strafing
            force: { x: 0, y: 0 }
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

        // Get player physics body
        const playerBody = this.physicsManager.bodies.get('player');
        if (!playerBody) return;

        // Calculate force vector
        let force = { x: 0, y: 0 };

        if (input.forward || input.backward || input.strafeLeft || input.strafeRight) {
            if (input.forward) {
                force.x += Math.cos(this.rotation) * this.physics.maxForce * this.physics.forward;
                force.y += Math.sin(this.rotation) * this.physics.maxForce * this.physics.forward;
            }
            if (input.backward) {
                force.x -= Math.cos(this.rotation) * this.physics.maxForce * this.physics.backward;
                force.y -= Math.sin(this.rotation) * this.physics.maxForce * this.physics.backward;
            }
            if (input.strafeLeft) {
                force.x -= Math.cos(this.rotation + Math.PI/2) * this.physics.maxForce * this.physics.strafe;
                force.y -= Math.sin(this.rotation + Math.PI/2) * this.physics.maxForce * this.physics.strafe;
            }
            if (input.strafeRight) {
                force.x += Math.cos(this.rotation + Math.PI/2) * this.physics.maxForce * this.physics.strafe;
                force.y += Math.sin(this.rotation + Math.PI/2) * this.physics.maxForce * this.physics.strafe;
            }

            // Scale force based on speed
            const currentSpeed = Math.sqrt(playerBody.velocity.x ** 2 + playerBody.velocity.y ** 2);
            if (currentSpeed > this.physics.maxSpeed) {
                const scale = this.physics.maxSpeed / currentSpeed;
                force.x *= scale;
                force.y *= scale;
            }

            // Apply the force with debug logging
            console.log('[Physics] Applying force:', {
                force,
                currentSpeed,
                position: this.worldPos,
                rotation: this.rotation
            });
            this.physicsManager.applyForce(playerBody, force);
        }
    }

    update(deltaTime) {
        // Update physics first
        this.physicsManager.update(deltaTime);
        
        // Get updated positions from physics
        const physicsState = this.physicsManager.getState();
        if (physicsState) {
            this.worldPos.x = physicsState.x;
            this.worldPos.y = physicsState.y;
            // Only update rotation from input, not physics
        }

        // Update physics bodies with new state
        this.physicsManager.updateBodies(this);
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
