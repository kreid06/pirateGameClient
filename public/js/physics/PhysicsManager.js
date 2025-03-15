import { Engine, World, Bodies, Body, Events, Runner, Constraint } from 'matter-js';
import { CollisionSystem } from './CollisionSystem.js';
import { Sail } from '../entities/components/Component.js'; // Add this import

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
        this.constraints = new Map();

        // Add friction air to ship bodies
        this.shipPhysicsConfig = {
            frictionAir: 0.1,       // Increased air friction
            angularDamping: 0.9,    // High angular damping to prevent spinning
            torque: 0,              // No initial torque
        };

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

        // Add debug interval for constraints
        this.lastConstraintLog = 0;
        this.constraintLogInterval = 1000; // Log every second

        // Log constraint events
        Events.on(this.engine, 'afterUpdate', () => {
            const now = Date.now();
            if (now - this.lastConstraintLog >= this.constraintLogInterval) {
                this.logConstraints();
                this.lastConstraintLog = now;
            }
        });

        // Add tracking for initial world constraints (ship sensor constraints)
        Events.on(this.engine, 'afterAdd', (event) => {
            if (event.object.type === 'constraint') {
                const constraint = event.object;
                const id = this.generateConstraintId(constraint);
                if (!this.constraints.has(id)) {
                    this.constraints.set(id, constraint);
                    console.log('[Physics] Auto-tracked new constraint:', {
                        id,
                        bodyA: constraint.bodyA?.label,
                        bodyB: constraint.bodyB?.label
                    });
                }
            }
        });

        // Add wind system
        this.wind = {
            direction: 0,  // Radians, 0 is east, increases clockwise
            force: 0.0005,  // Increased base force magnitude
            maxSpeed: 5,     // Maximum speed any ship can achieve from wind
            update: (deltaTime) => {
                // Could add wind changes over time here
                return {
                    direction: this.wind.direction,
                    force: this.wind.force
                };
            },
            getForceForShip: (ship) => {
                // Calculate total force from all sails
                let totalForce = 0;
                ship.modules.forEach(module => {
                    if (module instanceof Sail && module.openness > 0) {
                        // Scale force by sail efficiency and openness
                        totalForce += this.wind.force * 
                                    module.windEfficiency * 
                                    module.openness;
                    }
                });

                // Scale by ship's current speed
                const shipSpeed = Math.hypot(
                    ship.physicsBody.velocity.x,
                    ship.physicsBody.velocity.y
                );
                const speedScale = Math.max(0, 1 - (shipSpeed / this.wind.maxSpeed));

                return totalForce * speedScale;
            }
        };
    }

    generateConstraintId(constraint) {
        // Generate unique ID based on connected bodies
        const bodyALabel = constraint.bodyA?.label || 'none';
        const bodyBLabel = constraint.bodyB?.label || 'none';
        const timestamp = Date.now();
        return `constraint_${bodyALabel}_${bodyBLabel}_${timestamp}`;
    }

    isSensorCollision(bodyA, bodyB) {
        // Check if either body is a sensor or has sensor-related categories
        return bodyA.isSensor || bodyB.isSensor || 
               bodyA.collisionFilter?.category === this.collisionSystem.categories.SHIP_DETECT ||
               bodyB.collisionFilter?.category === this.collisionSystem.categories.SHIP_DETECT;
    }

    addBody(id, body, type = 'default') {
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

        // Apply ship-specific physics properties
        if (body.label?.includes('ship_hull')) {
            Body.set(body, {
                frictionAir: this.shipPhysicsConfig.frictionAir,
                angularDamping: this.shipPhysicsConfig.angularDamping,
            });
        }

        World.add(this.world, body);
        this.bodies.set(id, body);
        this.collisionSystem.addBody(id, body);

        console.log('[Physics] Added body:', { 
            id, label: body.label,
            category: body.collisionFilter?.category
        });
    }

    addConstraint(id, constraint) {
        console.log('[Physics] Adding constraint:', {
            id,
            bodyA: constraint.bodyA?.label,
            bodyB: constraint.bodyB?.label,
            stiffness: constraint.stiffness
        });

        World.add(this.world, constraint);
        this.constraints.set(id, constraint);
        
        // Verify addition
        console.log('[Physics] Constraint added:', {
            id,
            isInWorld: this.world.constraints.includes(constraint),
            isTracked: this.constraints.has(id),
            totalConstraints: this.constraints.size,
            worldTotal: this.world.constraints.length
        });
    }

    removeConstraint(id) {
        const constraint = this.constraints.get(id);
        if (constraint) {
            console.log('[Physics] Removing constraint:', {
                id,
                bodyA: constraint.bodyA?.label,
                bodyB: constraint.bodyB?.label,
                wasActive: this.world.constraints.includes(constraint)
            });

            World.remove(this.world, constraint);
            this.constraints.delete(id);

            console.log('[Physics] Remaining constraints:', {
                total: this.constraints.size,
                ids: Array.from(this.constraints.keys())
            });
        }
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

        // Update wind and apply forces to ships
        const windState = this.wind.update(deltaTime);
        this.world.bodies.forEach(body => {
            if (body.plugin?.ship) {
                const ship = body.plugin.ship;
                const windForce = this.wind.getForceForShip(ship);
                
                if (windForce > 0) {
                    // Apply force in ship's forward direction using Matter.js Body.applyForce
                    const shipAngle = body.angle;
                    const force = {
                        x: Math.cos(shipAngle) * windForce,
                        y: Math.sin(shipAngle) * windForce
                    };
                    
                    // Apply force at ship's center of mass
                    Body.applyForce(
                        body,
                        { x: body.position.x, y: body.position.y },
                        force
                    );

                    // console.log('[Physics] Applied wind force:', {
                    //     shipId: ship.id,
                    //     force: {
                    //         magnitude: windForce,
                    //         x: force.x,
                    //         y: force.y
                    //     },
                    //     speed: Math.hypot(body.velocity.x, body.velocity.y)
                    // });
                }
            }
        });

        return {
            bodies: this.getBodiesState(),
            time: this.engine.timing.timestamp
        };
    }

    applyForce(body, force) {
        if (!body) return;
        
        Body.applyForce(body, 
            body.position,
            {
                x: force.x,
                y: force.y
            }
        );
    }

    constrainBodies(bodyA, bodyB) {
        // bodyA should be the more "stable" or parent object
        // bodyB is the one being constrained to bodyA
        const constraint = Constraint.create({
            bodyA: bodyA,          // Parent/stable body
            bodyB: bodyB,          // Child/constrained body
            pointA: { x: 0, y: 0 },
            pointB: { x: 0, y: 0 },
            stiffness: 1,
            length: 0
        });
        
        const constraintId = this.generateConstraintId(constraint);
        this.constraints.set(constraintId, constraint);
        World.add(this.world, constraint);
        
        this.logConstraintDetails(constraint, constraintId);
        return constraint;
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

    isBodyInRange(bodyA, bodyB, range) {
        if (!bodyA || !bodyB) return false;

        const dx = bodyA.position.x - bodyB.position.x;
        const dy = bodyA.position.y - bodyB.position.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        console.log('[Physics] Range check:', {
            bodyALabel: bodyA.label,
            bodyBLabel: bodyB.label,
            distance: distance.toFixed(2),
            range,
            inRange: distance <= range
        });

        return distance <= range;
    }

    cleanup() {
        // ...existing cleanup code...
        this.constraints.forEach((constraint, id) => {
            this.removeConstraint(id);
        });
    }

    createMountConstraint(playerId, shipId, mountPoint) {
        // Temporarily disabled for debugging
        console.log('[Physics] Mount constraints disabled for debugging');
        return null;
    }

    logConstraints() {
        // First sync with world constraints
        this.syncConstraints();

        const constraintDetails = Array.from(this.constraints.entries()).map(([id, constraint]) => ({
            id,
            bodyA: constraint.bodyA?.label || 'none',
            bodyB: constraint.bodyB?.label || 'none',
            type: constraint.type,
            stiffness: constraint.stiffness,
            pointA: constraint.pointA,
            pointB: constraint.pointB,
            isActive: this.world.constraints.includes(constraint)
        }));

        // console.log('[Physics] Active constraints:', {
        //     total: this.constraints.size,
        //     worldTotal: this.world.constraints.length,
        //     constraints: constraintDetails,
        //     worldConstraints: this.world.constraints.map(c => ({
        //         bodyA: c.bodyA?.label,
        //         bodyB: c.bodyB?.label
        //     }))
        // });
    }

    syncConstraints() {
        // Add any world constraints not in our map
        this.world.constraints.forEach(constraint => {
            let found = false;
            for (const [id, tracked] of this.constraints) {
                if (tracked === constraint) {
                    found = true;
                    break;
                }
            }
            if (!found) {
                const id = this.generateConstraintId(constraint);
                this.constraints.set(id, constraint);
                console.log('[Physics] Synced untracked constraint:', {
                    id,
                    bodyA: constraint.bodyA?.label,
                    bodyB: constraint.bodyB?.label
                });
            }
        });

        // Remove any tracked constraints not in world
        for (const [id, constraint] of this.constraints) {
            if (!this.world.constraints.includes(constraint)) {
                this.constraints.delete(id);
                console.log('[Physics] Removed stale constraint:', id);
            }
        }

        // Log all constraints periodically
        // console.log('[Physics] All active constraints:', 
        //     this.world.constraints.map(c => ({
        //         id: Array.from(this.constraints.entries())
        //             .find(([id, cons]) => cons === c)?.[0] || 'unknown',
        //         bodyA: c.bodyA?.label,
        //         bodyB: c.bodyB?.label,
        //         pointA: c.pointA,
        //         pointB: c.pointB,
        //         stiffness: c.stiffness,
        //         isActive: this.world.constraints.includes(c)
        //     }))
        // );
    }

    logConstraintDetails(constraint, id = 'unknown') {
        console.log('[Physics] Constraint details:', {
            id,
            bodies: {
                bodyA: {
                    label: constraint.bodyA?.label || 'none',
                    position: constraint.bodyA?.position || 'none',
                    id: constraint.bodyA?.id || 'none'
                },
                bodyB: {
                    label: constraint.bodyB?.label || 'none',
                    position: constraint.bodyB?.position || 'none',
                    id: constraint.bodyB?.id || 'none'
                }
            },
            points: {
                pointA: constraint.pointA,
                pointB: constraint.pointB,
                anchorA: {
                    x: constraint.bodyA?.position.x + (constraint.pointA?.x || 0),
                    y: constraint.bodyA?.position.y + (constraint.pointA?.y || 0)
                },
                anchorB: {
                    x: constraint.bodyB?.position.x + (constraint.pointB?.x || 0),
                    y: constraint.bodyB?.position.y + (constraint.pointB?.y || 0)
                }
            },
            properties: {
                stiffness: 0,
                damping: constraint.damping,
                length: constraint.length,
                angularStiffness: constraint.angularStiffness
            }
        });
    }

    // ...rest of existing methods...
}
