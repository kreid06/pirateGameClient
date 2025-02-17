import { Engine, World, Bodies, Body, Vector, Vertices, Composite, Events, Runner } from 'matter-js';
import { CollisionSystem } from './CollisionSystem.js';
import { GAME_CONSTANTS } from '../core/constants.js';

export class PhysicsManager {
    constructor() {
        // Initialize engine with proper configuration
        this.engine = Engine.create({
            enableSleeping: true,
            gravity: { x: 0, y: 0 },
            timing: {
                timeScale: 1,
                timestamp: 0,
                lastDelta: 16.667,  // 60 FPS
                correction: 1
            },
            positionIterations: 6,
            velocityIterations: 4,
            constraintIterations: 2
        });

        this.world = this.engine.world;
        this.bodies = new Map();
        
        // Fixed timestep configuration
        this.fixedTimeStep = 1000/60;  // Physics steps at 60 FPS
        this.accumulator = 0;
        this.maxSteps = 5;  // Prevent spiral of death

        // Debug stats
        this.stats = {
            lastFrameTime: 0,
            physicsSteps: 0,
            frameCount: 0
        };

        // Create physics runner with fixed timestep
        this.runner = Runner.create({
            isFixed: true,
            delta: this.fixedTimeStep,
            enabled: false  // Don't auto-start
        });

        this.collisionSystem = new CollisionSystem();

        // Set up collision detection
        Events.on(this.engine, 'collisionStart', (event) => {
            event.pairs.forEach(pair => {
                this.collisionSystem.handleCollision(pair.bodyA, pair.bodyB);
            });
        });

        Events.on(this.engine, 'collisionEnd', (event) => {
            event.pairs.forEach(pair => {
                this.collisionSystem.endCollision(pair.bodyA, pair.bodyB);
            });
        });

        // Register collision handlers
        this.collisionSystem.registerCollisionHandler('player', (player, other) => {
            if (other.label.startsWith('ship_mount')) {
                this.handleMountableArea(player, other);
            }
        });

        this.collisionCallbacks = new Map();

        console.log('[Physics] Initialized with:', {
            timeStep: this.fixedTimeStep,
            maxSubSteps: this.maxSteps
        });
    }

    update(deltaTime) {
        this.stats.frameCount++;
        
        // Cap maximum delta time to prevent spiral of death
        const maxDelta = this.fixedTimeStep * this.maxSteps;
        deltaTime = Math.min(deltaTime, maxDelta);

        // Accumulate time for physics updates
        this.accumulator += deltaTime;
        this.stats.physicsSteps = 0;

        // Run fixed timestep updates
        let steps = 0;
        while (this.accumulator >= this.fixedTimeStep && steps < this.maxSteps) {
            Engine.update(this.engine, this.fixedTimeStep);
            this.accumulator -= this.fixedTimeStep;
            steps++;
        }

        // Log performance stats periodically
        if (this.stats.frameCount % 600 === 0) {  // Every 10 seconds at 60fps
            console.log('[Physics] Performance:', {
                averageSteps: this.stats.physicsSteps,
                timeStep: this.fixedTimeStep,
                accumulator: this.accumulator
            });
        }

        // Get interpolated state for rendering
        const alpha = this.accumulator / this.fixedTimeStep;
        return this.getInterpolatedState(alpha);
    }

    getInterpolatedState(alpha) {
        // Get current physics state with interpolation
        const state = {
            bodies: new Map(),
            time: this.engine.timing.timestamp,
            alpha
        };

        this.bodies.forEach((body, id) => {
            state.bodies.set(id, {
                position: { ...body.position },
                angle: body.angle,
                velocity: { ...body.velocity },
                angularVelocity: body.angularVelocity
            });
        });

        return state;
    }

    addBody(id, body, options = {}) {
        // Add collision filtering
        if (body.label?.startsWith('player')) {
            body.collisionFilter = this.collisionSystem.getCollisionFilter('PLAYER');
        } else if (body.label?.startsWith('ship_hull')) {
            body.collisionFilter = this.collisionSystem.getCollisionFilter('SHIP_HULL');
        } else if (body.label?.startsWith('ship_mount')) {
            body.collisionFilter = this.collisionSystem.getCollisionFilter('MOUNT_SENSOR');
        }

        World.add(this.world, body);
        this.bodies.set(id, body);

        // Store collision callbacks if provided
        if (options.onCollide) {
            this.collisionCallbacks.set(body.id, options.onCollide);
        }

        console.log('[Physics] Added body:', { 
            id, 
            type: body.label,
            angle: body.angle 
        });
    }

    removeBody(id) {
        const body = this.bodies.get(id);
        if (body) {
            World.remove(this.world, body);
            this.bodies.delete(id);
            console.log('[Physics] Removed body:', { id, type: body.label });
        }
    }

    applyForce(body, force) {
        if (!body) {
            console.warn('[Physics] Cannot apply force: body is null');
            return;
        }

        // Apply force directly without position offset
        Body.applyForce(body, 
            body.position,
            {
                x: force.x,
                y: force.y
            }
        );

        // Debug force application
        if (this.stats.frameCount % 60 === 0) {
            console.log('[Physics] Force applied:', {
                force,
                velocity: body.velocity,
                position: body.position
            });
        }
    }

    getCollisionCallbacks(pair) {
        const callbacks = [];
        
        // Get callbacks for both bodies in collision
        const callbackA = this.collisionCallbacks.get(pair.bodyA.id);
        const callbackB = this.collisionCallbacks.get(pair.bodyB.id);
        
        if (callbackA) callbacks.push(callbackA);
        if (callbackB) callbacks.push(callbackB);
        
        return callbacks;
    }

    handleMountableArea(playerBody, mountSensor) {
        const ship = mountSensor.plugin?.ship;
        if (ship) {
            window.dispatchEvent(new CustomEvent('mountAvailable', {
                detail: { shipId: ship.id }
            }));
        }
    }

    cleanup() {
        // Stop runner first
        Runner.stop(this.runner);
        
        // Clear all bodies
        World.clear(this.world);
        this.bodies.clear();
        
        // Clean up engine
        Engine.clear(this.engine);

        console.log('[Physics] Cleaned up physics system');
    }

    // ... rest of your existing methods ...
}