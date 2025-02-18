import { Engine, World, Bodies, Body, Events, Runner } from 'matter-js';
import { CollisionSystem } from './CollisionSystem.js';

export class PhysicsManager {
    constructor() {
        this.engine = Engine.create({
            enableSleeping: true,
            gravity: { x: 0, y: 0 }
        });

        this.world = this.engine.world;
        this.bodies = new Map();
        this.collisionSystem = new CollisionSystem();
        this.fixedTimeStep = 1000/60;
        this.accumulator = 0;

        // Set up all collision events
        Events.on(this.engine, 'collisionStart', (event) => {
            event.pairs.forEach(pair => {
                // Handle all collision types for initial contact
                // console.log('[Physics] Collision Start:', {
                //     bodyA: pair.bodyA.label,
                //     bodyB: pair.bodyB.label,
                //     categoryA: pair.bodyA.collisionFilter?.category?.toString(16),
                //     categoryB: pair.bodyB.collisionFilter?.category?.toString(16)
                // });
                this.collisionSystem.handleCollisionStart(pair.bodyA, pair.bodyB);
            });
        });

        Events.on(this.engine, 'collisionActive', (event) => {
            event.pairs.forEach(pair => {
                // Only process sensor collisions during active state
                if (this.isSensorCollision(pair.bodyA, pair.bodyB)) {
                    this.collisionSystem.handleCollisionActive(pair.bodyA, pair.bodyB);
                }
            });
        });

        Events.on(this.engine, 'collisionEnd', (event) => {
            event.pairs.forEach(pair => {
                // Only process sensor collision endings
                if (this.isSensorCollision(pair.bodyA, pair.bodyB)) {
                    console.log('[Physics] Sensor Collision End:', {
                        bodyA: pair.bodyA.label,
                        bodyB: pair.bodyB.label
                    });
                    this.collisionSystem.handleCollisionEnd(pair.bodyA, pair.bodyB);
                }
            });
        });
    }

    isSensorCollision(bodyA, bodyB) {
        // Check if either body is a sensor or has sensor-related categories
        return bodyA.isSensor || bodyB.isSensor || 
               bodyA.collisionFilter?.category === this.collisionSystem.categories.SHIP_DETECT ||
               bodyB.collisionFilter?.category === this.collisionSystem.categories.SHIP_DETECT;
    }

    addBody(id, body, options = {}) {
        // Ensure collision filter is properly set
        if (!body.collisionFilter) {
            body.collisionFilter = {
                category: this.collisionSystem.categories.DEFAULT,
                mask: 0xFFFFFFFF,
                group: 0
            };
        }

        // Set collision filter based on body type
        if (body.label?.startsWith('player')) {
            const filter = this.collisionSystem.getCollisionFilter('PLAYER');
            if (filter) {
                body.collisionFilter = filter;
            }
        } else if (body.label?.startsWith('ship_hull')) {
            const filter = this.collisionSystem.getCollisionFilter('SHIP_HULL');
            if (filter) {
                body.collisionFilter = filter;
            }
        }

        // Verify collision filter is complete
        if (!body.collisionFilter.group) {
            body.collisionFilter.group = 0;
        }

        World.add(this.world, body);
        this.bodies.set(id, body);
        this.collisionSystem.addBody(id, body);

        console.log('[Physics] Added body:', { 
            id, label: body.label,
            category: body.collisionFilter?.category
        });
    }

    getBodiesState() {
        const state = new Map();
        this.bodies.forEach((body, id) => {
            state.set(id, {
                position: { ...body.position },
                angle: body.angle,
                velocity: { ...body.velocity },
                angularVelocity: body.angularVelocity,
                label: body.label,
                isSensor: body.isSensor,
                category: body.collisionFilter?.category
            });
        });
        return state;
    }

    update(deltaTime) {
        this.accumulator += deltaTime;
        while (this.accumulator >= this.fixedTimeStep) {
            Engine.update(this.engine, this.fixedTimeStep);
            this.accumulator -= this.fixedTimeStep;
        }

        // Debug logging every second
        if (Math.floor(this.engine.timing.timestamp / 1000) % 1 === 0) {
            this.collisionSystem.debugCollisionState();
        }

        return {
            bodies: this.getBodiesState(),
            time: this.engine.timing.timestamp
        };
    }

    applyForce(body, force) {
        if (!body) {
            console.warn('[Physics] Cannot apply force: body is null');
            return;
        }

        Body.applyForce(body, 
            body.position,  // Apply force at body's center
            {
                x: force.x,
                y: force.y
            }
        );

        // Debug force application
        if (Math.floor(this.engine.timing.timestamp / 1000) % 1 === 0) {
    
        }
    }

    isBodyOnShip(body, shipBody) {
        if (!body || !shipBody) {
            console.warn('[Physics] Missing bodies for ship check');
            return false;
        }

        // Get the ship's vertices to create a bounding box
        const vertices = shipBody.vertices;
        const bounds = {
            min: {
                x: Math.min(...vertices.map(v => v.x)),
                y: Math.min(...vertices.map(v => v.y))
            },
            max: {
                x: Math.max(...vertices.map(v => v.x)),
                y: Math.max(...vertices.map(v => v.y))
            }
        };

        // Check if player is within ship bounds
        const checkPoint = {
            x: body.position.x,
            y: body.position.y + body.circleRadius + 1  // Check slightly below player
        };

        const isInside = this.isPointInsideBounds(checkPoint, bounds);

        console.log('[Physics] Ship boarding check:', {
            bodyId: body.label,
            shipId: shipBody.label,
            checkPoint,
            bounds,
            isInside
        });

        return isInside;
    }

    isPointInsideBounds(point, bounds) {
        return point.x >= bounds.min.x && 
               point.x <= bounds.max.x && 
               point.y >= bounds.min.y && 
               point.y <= bounds.max.y;
    }

    // ...rest of existing methods...
}
