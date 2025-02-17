import { Engine, World, Bodies, Body, Vector, Vertices, Composite, Events } from 'matter-js';
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
        
        console.log('[Physics] Manager initialized');
    }

    setupCollisionHandlers() {
        Events.on(this.engine, 'collisionStart', (event) => {
            event.pairs.forEach((pair) => {
                console.log('[Physics] Collision between:', pair.bodyA.label, 'and', pair.bodyB.label);
            });
        });
    }

    createPlayerBody(x = 0, y = 0) {
        const body = Bodies.circle(x, y, 20, {
            friction: 0.001,           // Very low friction
            frictionAir: 0.05,         // Moderate air resistance
            mass: 1,
            density: 0.001,
            restitution: 0.2,         // Less bouncy
            label: 'player',
            collisionFilter: {
                category: 0x0002,
                mask: 0x0001
            }
        });

        World.add(this.world, body);
        this.bodies.set('player', body);
        console.log('[Physics] Created player body:', body);
        return body;
    }

    createShipBody(ship) {
        // Center the vertices around origin (0,0)
        const vertices = [
            { x: 225, y: 95 },
            { x: 360, y: 25 },
            { x: 360, y: -25 },
            { x: 225, y: -95 },
            { x: -225, y: -95 },
            { x: -275, y: 0 },
            { x: -225, y: 95 }
        ];

        // Create the body with centered vertices
        const body = Bodies.fromVertices(0, 0, [vertices], {
            isStatic: true,
            friction: 0.1,
            label: `ship_${ship.id}`,
            angle: ship.rotation,
            collisionFilter: {
                category: 0x0001,
                mask: 0x0002
            }
        });

        // Set the position after creation
        Body.setPosition(body, ship.position);

        // Store debug vertices relative to body center
        body.debugVertices = vertices;

        World.add(this.world, body);
        this.bodies.set(ship.id, body);
        
        console.log('[Physics] Ship body created:', {
            position: body.position,
            vertices: vertices,
            bounds: body.bounds
        });

        return body;
    }

    // Add method to modify vertices at runtime for testing
    modifyShipVertices(shipId, newVertices) {
        const body = this.bodies.get(shipId);
        if (!body) return;

        // Remove old body
        World.remove(this.world, body);

        // Create new body with updated vertices
        const updatedBody = Bodies.fromVertices(
            body.position.x,
            body.position.y,
            [newVertices],
            {
                ...body,
                isStatic: true
            }
        );

        // Store debug vertices
        updatedBody.debugVertices = [...newVertices];

        // Add new body
        World.add(this.world, updatedBody);
        this.bodies.set(shipId, updatedBody);

        console.log('[Physics] Updated ship vertices:', newVertices);
    }

    updateBodies(gameState) {
        const playerBody = this.bodies.get('player');
        if (playerBody && gameState.worldPos) {
            // Update position without changing velocity
            Body.setPosition(playerBody, {
                x: gameState.worldPos.x,
                y: gameState.worldPos.y
            });
            Body.setAngle(playerBody, gameState.rotation);

            // Update game state with precise physics positions
            gameState.worldPos.x = playerBody.position.x;
            gameState.worldPos.y = playerBody.position.y;
        }

        // Update ship bodies
        gameState.ships.forEach(ship => {
            const shipBody = this.bodies.get(ship.id);
            if (shipBody) {
                Body.setPosition(shipBody, {
                    x: ship.position.x,
                    y: ship.position.y
                });
                Body.setAngle(shipBody, ship.rotation);
            } else {
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

    applyForce(body, force) {
        if (!body) return;
        
        // Scale force for better control
        const scaledForce = {
            x: force.x * 0.001,  // Adjust these scaling factors
            y: force.y * 0.001   // to control movement sensitivity
        };

        Body.applyForce(body, body.position, scaledForce);
        
        // Debug logging
        console.log('[Physics] Force applied:', {
            original: force,
            scaled: scaledForce,
            velocity: body.velocity,
            speed: Math.sqrt(body.velocity.x ** 2 + body.velocity.y ** 2)
        });
    }

    cleanup() {
        World.clear(this.world);
        Engine.clear(this.engine);
    }
}
