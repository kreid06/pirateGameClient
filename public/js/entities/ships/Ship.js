import { Cannon, SteeringWheel, Sail, SpeedSail, ShipCannon } from '../components/Component.js';
import { Bodies, Body, Vertices } from 'matter-js';

export class Ship {
    constructor(x, y, r, id) {
        this.position = { x, y };
        this.rotation = r;
        this.id = id;
        this.modules = new Map();
        this.path = null;

        // Add physics properties
        this.physics = {
            mass: 1000,              // Base mass
            friction: 0.01,          // Low friction for smooth movement
            frictionAir: 0.001,      // Very low air resistance
            restitution: 0.1,        // Low bounce (10%)
            density: 0.001,          // Low density for better floating
            angularDamping: 0.05     // Rotation resistance
        };
    }
    
    // ...existing ship methods...

    addModule(moduleData) {
        const { id, type, x = 0, y = 0, r = 0, quality = 1, efficiency = 1, bindX = 0, bindY = 0 } = moduleData;
        
        if (!id || !type) {
            console.warn(`[Ship ${this.id}] Invalid module data:`, moduleData);
            return;
        }

        let module;
        switch (type.toLowerCase()) {
            case 'sail':
                module = new Sail(x, y, r, id, quality, efficiency);
                break;
            case 'cannon':
                module = new Cannon(x, y, r, id, quality, efficiency);
                break;
            case 'steering':
                module = new SteeringWheel(x, y, r, id, quality);
                break;
            default:
                console.warn(`[Ship ${this.id}] Unknown module type:`, type);
                return;
        }

        module.ship = this;
        module.bindPosition = { x: bindX, y: bindY };
        this.modules.set(id, module);
    }


    applyForce(forceX, forceY) {
        if (!this.physicsBody || !this.physicsManager) return;
        
        // Convert force to world space
        const worldForce = {
            x: forceX * Math.cos(this.rotation) - forceY * Math.sin(this.rotation),
            y: forceX * Math.sin(this.rotation) + forceY * Math.cos(this.rotation)
        };
        
        this.physicsManager.applyForce(this.physicsBody, worldForce);
    }

    update(deltaTime) {
        // Update all components
        this.modules.forEach(module => {
            if (typeof module.update === 'function') {
                module.update(deltaTime);
            }
        });
    }

    render(ctx) {
        ctx.save();
        
        // 1. Transform to ship's position
        const pos = this.physicsBody ? this.physicsBody.position : this.position;
        const rot = this.physicsBody ? this.physicsBody.angle : this.rotation;
        
        ctx.translate(pos.x, pos.y);
        ctx.rotate(rot);
        
        // 2. Draw ship hull in local space
        this.drawHull(ctx);
        
        // 3. Draw modules in local space
        this.renderModules(ctx);
        
        // 4. Debug draw physics if enabled
        if (this.physicsManager?.debugDraw) {
            this.renderPhysicsDebug(ctx);
        }
        
        ctx.restore();
    }

    renderModules(ctx) {
        // Important: Ship's transform is already applied at this point
        const renderLayers = [
            { type: SteeringWheel, name: 'steering' },
            { type: Cannon, name: 'cannons' },
            { type: Sail, name: 'sailFiber', renderMethod: 'renderFiber' },
            { type: Sail, name: 'sailMast', renderMethod: 'renderMast' }
        ];

        renderLayers.forEach(layer => {
            this.modules.forEach(module => {
                if (module instanceof layer.type) {
                    ctx.save();
                    // Translate to module's bind position
                    ctx.translate(module.bindPosition.x, module.bindPosition.y);
                    // Don't rotate here - module handles its own rotation relative to ship
                    
                    if (layer.renderMethod) {
                        module[layer.renderMethod]?.(ctx);
                    } else {
                        module.render(ctx);
                    }
                    
                    ctx.restore();
                }
            });
        });
    }

    drawHull(ctx) {
        // Base hull drawing - can be overridden by child classes
        if (!this.path) {
            this.path = new Path2D();
            this.path.moveTo(190, 90);
            this.path.quadraticCurveTo(465, 0, 190, -90);
            this.path.lineTo(-260, -90);
            this.path.quadraticCurveTo(-360, 0, -260, 90);
            this.path.closePath();
        }

        ctx.fillStyle = '#D2B48C';    // Tan color for wood
        ctx.strokeStyle = '#8B4513';   // Saddle brown for outline
        ctx.lineWidth = 10;
        ctx.fill(this.path);
        ctx.stroke(this.path);
    }

    createPhysicsBody(physicsManager) {
        if (!physicsManager) return;

        // Create hull vertices (same as before)
        const hullVertices = Vertices.fromPath([
            "225 90", "360 25", "360 -25", "225 -90",
            "-225 -90", "-275 0", "-225 90"
        ].join(' '));

        // Update physics properties for dynamic body
        this.physicsBody = Bodies.fromVertices(
            this.position.x, 
            this.position.y, 
            [hullVertices],
            {
                angle: this.rotation,
                label: `ship_hull_${this.id}`,
                isStatic: false,  // Make dynamic
                mass: this.physics.mass,
                friction: this.physics.friction,
                frictionAir: this.physics.frictionAir,
                restitution: this.physics.restitution,   // Add explicit restitution
                density: this.physics.density,           // Add explicit density
                angularDamping: this.physics.angularDamping,
                collisionFilter: physicsManager.collisionSystem.getCollisionFilter('SHIP_HULL'),
                plugin: {
                    ship: this,
                    isShipHull: true
                }
            }
        );

        // Make sensor follow main body
        this.sensorHull = Bodies.fromVertices(
            this.position.x, 
            this.position.y, 
            [hullVertices],
            {
                angle: this.rotation,
                label: `ship_sensor_${this.id}`,
                isStatic: false,  // Make dynamic
                isSensor: true,
                collisionFilter: physicsManager.collisionSystem.getCollisionFilter('SHIP_SENSOR'),
                plugin: {
                    ship: this,
                    isShipSensor: true
                }
            }
        );

        // Add bodies to world
        physicsManager.addBody(`${this.id}_hull`, this.physicsBody);
        physicsManager.addBody(`${this.id}_sensor`, this.sensorHull);

        // Create constraint to make sensor follow hull
        physicsManager.constrainBodies(this.physicsBody, this.sensorHull);

        // Store physics manager reference for force application
        this.physicsManager = physicsManager;

        // Create physics bodies for all modules with proper initial angle
        const initialShipAngle = this.physicsBody.angle;
        this.modules.forEach(module => {
            // Pass the initial angle to createPhysicsBody
            module.createPhysicsBody(physicsManager, this.physicsBody, initialShipAngle);
        });
    }

    handleCollision(pair) {
        const otherBody = pair.bodyA === this.physicsBody ? pair.bodyB : pair.bodyA;
        const isSensor = this.physicsManager.collisionSystem.isSensorCollision(this.physicsBody, otherBody);
        
        console.log('[Ship] Collision detected:', {
            shipId: this.id,
            otherId: otherBody.label,
            isSensor,
            category: otherBody.collisionFilter?.category
        });

        if (isSensor && otherBody.label.startsWith('player')) {
            this.handleJumpingPlayerDetection(otherBody);
        }
    }

    handleJumpingPlayerDetection(playerBody) {
        if (playerBody.collisionFilter.category === this.physicsManager.collisionSystem.categories.PLAYER_JUMPED) {
            console.log('[Ship] Detected jumping player:', {
                shipId: this.id,
                playerId: playerBody.label,
                playerPos: playerBody.position,
                shipPos: this.position
            });
        }
    }

    handleMountSensor(pair) {
        const otherBody = pair.bodyA === this.mountSensor ? pair.bodyB : pair.bodyA;
        
        if (otherBody.label.startsWith('player')) {
            console.log('[Ship] Player in mount range:', {
                shipId: this.id,
                bodyLabel: otherBody.label
            });
            // Emit event for mounting possibility
            window.dispatchEvent(new CustomEvent('mountAvailable', {
                detail: { shipId: this.id }
            }));
        }
    }

    init (){

    }

    renderPhysicsBody(ctx) {
        if (!this.physicsBody?.vertices) return;

        ctx.save();
        ctx.strokeStyle = '#FF0000';  // Red for ship hull
        ctx.fillStyle = 'transparent';
        ctx.lineWidth = 2;
        ctx.setLineDash([]);

        // Draw hull shape
        ctx.beginPath();
        const vertices = this.physicsBody.vertices;
        ctx.moveTo(vertices[0].x, vertices[0].y);
        for (let i = 1; i < vertices.length; i++) {
            ctx.lineTo(vertices[i].x, vertices[i].y);
        }
        ctx.closePath();
        ctx.stroke();

 
            this.modules.forEach(module => {
                if(module instanceof Sail){
                    console.log(`sail detected`);
                    module.renderPhysicsDebug(ctx);
                }else{
                    module.renderPhysicsDebug(ctx);
                }
            });
        

        ctx.restore();
    }

    // Update both bodies' positions when ship moves
    setPosition(x, y) {
        if (this.physicsBody) {
            Body.setPosition(this.physicsBody, { x, y });
        }
        if (this.sensorHull) {
            Body.setPosition(this.sensorHull, { x, y });
        }
        this.position = { x, y };
        
        // Update all module positions
        this.updateModulePositions();
    }

    // Update both bodies' angles when ship rotates
    setRotation(angle) {
        if (this.physicsBody) {
            Body.setAngle(this.physicsBody, angle);
        }
        if (this.sensorHull) {
            Body.setAngle(this.sensorHull, angle);
        }
        this.rotation = angle;
        
        // Update all module positions
        this.updateModulePositions();
    }

    updateModulePositions() {
        this.modules.forEach(module => {
            if (module.update) {
                module.update(0); // Force position update
            }
        });
    }

    // Clean up both bodies
    cleanup() {
        if (this.physicsManager) {
            if (this.physicsBody) {
                this.physicsManager.removeBody(`${this.id}_hull`);
            }
            if (this.sensorHull) {
                this.physicsManager.removeBody(`${this.id}_sensor`);
            }
        }
        
        // Cleanup module physics bodies
        this.modules.forEach(module => {
            if (module.physicsBody && this.physicsManager) {
                this.physicsManager.removeBody(module.id);
            }
        });
    }

    renderPhysicsDebug(ctx) {
        if (!this.physicsBody?.vertices) return;

        this.modules.forEach(module => {
            if (module instanceof Sail) {
                ctx.save();
                // Transform relative to ship for physics debug
                const shipPos = this.physicsBody ? this.physicsBody.position : this.position;
                const shipRot = this.physicsBody ? this.physicsBody.angle : this.rotation;
                
                // Move to ship position and rotation for correct module rendering
                ctx.translate(shipPos.x, shipPos.y);
                ctx.rotate(shipRot);
                
                module.renderPhysicsDebug(ctx);
                ctx.restore();
            } else {
                module.renderPhysicsDebug(ctx);
            }
        });
    }
}

export class Brigantine extends Ship {
    constructor(x, y, rotation = 0, id = null) {
        super(x, y, rotation, id);
        this.width = 1000;  // Total width including curves
        this.height = 180;  // Total height (90 * 2)
        this.physicsBody =  [
            { x: 225, y: 95 },
            { x: 360, y: 25 },
            { x: 360, y: -25 },
            { x: 225, y: -95 },
            { x: -225, y: -95 },
            { x: -275, y: 0 },
            { x: -225, y: 95 }
        ];
        this.initModules();
    }

    generateModuleId() {
        return Math.random().toString(36).substr(2, 9);
    }

    initModules() {
        // Add three speed sails along the centerline
        [200, 0, -200].forEach(xPos => {
            const sailId = this.generateModuleId();
            const sail = new SpeedSail(
                this.id,      // shipId
                1,           // quality
                xPos,        // x position
                0,          // y position
                1,          // efficiency
                sailId      // component id
            );
            this.modules.set(sailId, sail);
            sail.bindToShip(this); // Pass ship reference after creation
        });

        // Add steering wheel with fixed position
        const steeringId = this.generateModuleId();
        const steering = new SteeringWheel(
            -50,    // Fixed x position
            0,      // Fixed y position
            0,      // Fixed rotation
            steeringId,
            1       // quality
        );
        this.modules.set(steeringId, steering);
        steering.bindToShip(this);

        // Add cannons with proper positioning
        const cannonConfigs = [
            { x: 0, y: 75, r: Math.PI },
            { x: 100, y: 75, r: Math.PI },
            { x: -100, y: 75, r: Math.PI },
            { x: 0, y: -75, r: 0 },
            { x: 100, y: -75, r: 0 },
            { x: -100, y: -75, r: 0 }
        ];

        cannonConfigs.forEach(config => {
            const cannonId = this.generateModuleId();
            const cannon = new ShipCannon(
                this.id,
                1,
                config.x,
                config.y,
                config.r,
                1,
                cannonId
            );
            this.modules.set(cannonId, cannon);
            cannon.bindToShip(this); // Pass ship reference
        });

        console.log('[Ship] Initialized modules:', {
            shipId: this.id,
            moduleCount: this.modules.size,
            types: Array.from(this.modules.values()).map(m => m.constructor.name)
        });
    }

    render(ctx) {
        ctx.save();
        const renderPos = this.physicsBody ? this.physicsBody.position : this.position;
        const renderRot = this.physicsBody ? this.physicsBody.angle : this.rotation;
        
        // Remove the offset and center properly
        ctx.translate(renderPos.x, renderPos.y);
        ctx.rotate(renderRot);
        
        this.drawHull(ctx);
        this.renderModules(ctx);
        
        ctx.restore();
    }

    renderWithPosition(ctx, smoothPos) {
        // Use existing render logic but without the position transform
        this.drawHull(ctx);
        
        this.modules.forEach(module => {
            if (module instanceof Cannon) module.render(ctx);
        });
        
        this.modules.forEach(module => {
            if (module instanceof SteeringWheel) module.render(ctx);
        });
        
        this.modules.forEach(module => {
            if (module instanceof Sail) this.drawSailFibers(ctx, module);
        });
        
        this.modules.forEach(module => {
            if (module instanceof Sail) this.drawSailMast(ctx, module);
        });
    }

    getModuleAtPoint(x, y) {
        for (const [id, module] of this.modules) {
            const dx = x - (this.position.x + module.bindPosition.x);
            const dy = y - (this.position.y + module.bindPosition.y);
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            // Different hit areas for different module types
            const hitArea = module instanceof Cannon ? 40 :
                           module instanceof SteeringWheel ? 25 :
                           module instanceof Sail ? 35 : 30;
                           
            if (distance <= hitArea) {
                return module;
            }
        }
        return null;
    }

    update(deltaTime) {
        // Update modules
        this.modules.forEach(module => {
            if (typeof module.update === 'function') {
                module.update(deltaTime);
            }
        });
    }
}
