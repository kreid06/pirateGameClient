import { Engine, World, Bodies, Body, Composite } from 'matter-js';
import { GAME_CONSTANTS } from '../core/constants.js';

export class PhysicsManager {
    constructor() {
        this.engine = Engine.create({
            enableSleeping: false,
            constraintIterations: 2
        });
        
        this.world = this.engine.world;
        this.world.gravity.y = 0;
        this.bodies = new Map();
        this.lastUpdateTime = performance.now();
        this.updateRate = 1000 / 60;  // 60 FPS

        // Collision handling
        Engine.run(this.engine);
        this.setupCollisionHandlers();
    }

    setupCollisionHandlers() {
        const runner = this.engine.runner;
        Events.on(this.engine, 'collisionStart', (event) => {
            event.pairs.forEach((pair) => {
                console.log('[Physics] Collision between:', pair.bodyA.label, 'and', pair.bodyB.label);
            });
        });
    }

    createPlayerBody(x = 0, y = 0) {
        const body = Bodies.circle(x, y, 20, {
            friction: 0.1,
            frictionAir: 0.02,
            mass: 80,
            label: 'player'
        });

        World.add(this.world, body);
        this.bodies.set('player', body);
        return body;
    }

    createShipBody(ship) {
        // Create ship hull using vertices that match the render path
        const vertices = [
            { x: 225, y: 90 },
            { x: 500, y: 0 },
            { x: 225, y: -90 },
            { x: -225, y: -90 },
            { x: -325, y: 0 },
            { x: -225, y: 90 }
        ];

        const body = Bodies.fromVertices(ship.position.x, ship.position.y, [vertices], {
            isStatic: true,  // Ships don't move for now
            friction: 0.1,
            label: `ship_${ship.id}`,
            angle: ship.rotation
        });

        World.add(this.world, body);
        this.bodies.set(ship.id, body);
        return body;
    }

    updateBodies(gameState) {
        // Update player position from physics simulation
        const playerBody = this.bodies.get('player');
        if (playerBody && gameState.worldPos) {
            gameState.worldPos.x = playerBody.position.x;
            gameState.worldPos.y = playerBody.position.y;
            gameState.rotation = playerBody.angle;
        }

        // Update any other bodies as needed
        gameState.ships.forEach(ship => {
            if (!this.bodies.has(ship.id)) {
                this.createShipBody(ship);
            }
        });
    }

    update(deltaTime) {
        Engine.update(this.engine, deltaTime);
        return this.getState();
    }

    getState() {
        const playerBody = this.bodies.get('player');
        if (!playerBody) return null;

        return {
            x: playerBody.position.x,
            y: playerBody.position.y,
            angle: playerBody.angle,
            velocity: playerBody.velocity
        };
    }

    cleanup() {
        World.clear(this.world);
        Engine.clear(this.engine);
    }
}
