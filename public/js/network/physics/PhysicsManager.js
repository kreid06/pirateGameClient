import { Engine, World, Bodies, Body } from 'matter-js';

export class PhysicsManager {
    constructor() {
        this.engine = Engine.create({
            enableSleeping: false,
            constraintIterations: 2
        });
        
        this.world = this.engine.world;
        this.world.gravity.y = 0;
        
        this.playerBody = this.createPlayerBody();
        this.lastUpdateTime = performance.now();
        this.updateRate = 1000 / 60;

        // Add physics constants
        this.constants = {
            baseForce: 0.0005,    // Base force magnitude
            maxForce: 0.001,      // Maximum force magnitude
            angularForce: 0.0002, // Rotation force
            friction: 0.1,        // Body friction
            drag: 0.02,           // Air resistance
            mass: 80             // Player mass
        };
    }

    createPlayerBody() {
        // Create circular body for player
        const body = Bodies.circle(0, 0, 20, {
            friction: this.constants.friction,
            frictionAir: this.constants.drag,
            mass: this.constants.mass,
            inertia: Infinity, // Prevent rotation from collisions
            label: 'player'
        });

        World.add(this.world, body);
        this.playerBody = body;
        return body;
    }

    applyMovementForce(input) {
        if (!this.playerBody) return null;

        const force = { x: 0, y: 0 };
        const forceValue = this.constants.baseForce;

        // Calculate force vector based on input
        if (input.up) force.y -= forceValue;
        if (input.down) force.y += forceValue;
        if (input.left) force.x -= forceValue;
        if (input.right) force.x += forceValue;

        // Normalize diagonal movement
        if (force.x !== 0 && force.y !== 0) {
            const magnitude = Math.sqrt(force.x * force.x + force.y * force.y);
            force.x = (force.x / magnitude) * forceValue;
            force.y = (force.y / magnitude) * forceValue;
        }

        // Apply force to body
        Body.applyForce(this.playerBody, this.playerBody.position, force);

        // Return current state
        return this.getState();
    }

    getState() {
        if (!this.playerBody) return null;
        
        return {
            x: this.playerBody.position.x,
            y: this.playerBody.position.y,
            angle: this.playerBody.angle,
            velocity: {
                x: this.playerBody.velocity.x,
                y: this.playerBody.velocity.y
            }
        };
    }

    update(deltaTime) {
        if (!this.playerBody) return null;

        Engine.update(this.engine, deltaTime);
        return this.getState();
    }

    applyForce(force) {
        if (!this.playerBody) return;
        Body.applyForce(this.playerBody, this.playerBody.position, force);
    }

    cleanup() {
        World.clear(this.world);
        Engine.clear(this.engine);
    }
}
