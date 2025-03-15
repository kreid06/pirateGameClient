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
            mass: 50000,            // Increase mass to 50,000 (from 15,000)
            friction: 0.01,         // Keep low friction
            frictionAir: 0.1,       // Match player's air friction
            restitution: 0.1,       // Low bounce
            density: 0.01,          // Keep same density
            angularDamping: 0.05    // Keep same rotation resistance
        };

        // Add sail state
        this.sailState = {
            isOpen: false,
            transitionSpeed: 0.2,   // Doubled transition speed
            targetOpenness: 1,      // Keep same target
            currentOpenness: 0      // Keep same start state
        };

        // Adjust wind force values for better movement with new friction
        this.windForce = {
            base: 0.0005,          // 5x increase for stronger wind forces
            maxSpeed: 4,           // Keep same max speed
            sailMultiplier: 1.5    // 50% increase to sail effectiveness
        };

        // Add player tracking
        this.boardedPlayers = new Map();
        this.previousPosition = { x, y };
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

    // Add a new method to ensure player forces don't affect the ship
    applyPlayerForce(force) {
        // Intentionally do nothing - player forces are too small to affect ship
        // This is a placeholder in case we want to implement minimal effects later
        console.log('[Ship] Ignoring negligible player force');
    }

    // Modify to handle forces properly based on source
    applyForce(forceX, forceY, source = 'ship') {
        if (!this.physicsBody || !this.physicsManager) return;
        
        // Only apply significant forces (from wind, etc.) - ignore player forces
        if (source === 'player') {
            // Player forces are too small to affect ship
            return;
        }
        
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

        // Update sail state
        if (this.sailState.currentOpenness !== this.sailState.targetOpenness) {
            const direction = this.sailState.targetOpenness > this.sailState.currentOpenness ? 1 : -1;
            this.sailState.currentOpenness += direction * this.sailState.transitionSpeed * (deltaTime / 1000);
            
            // Clamp value
            this.sailState.currentOpenness = Math.max(0, Math.min(1, this.sailState.currentOpenness));
            
            // Update sail visuals
            this.modules.forEach(module => {
                if (module instanceof Sail) {
                    module.updateOpenness(this.sailState.currentOpenness);
                }
            });
        }

        // SINGLE UNIFIED PLAYER MOVEMENT LOGIC
        if (this.physicsBody) {
            const currentPos = this.physicsBody.position;
            
            // Calculate ship movement delta from previous position
            const deltaX = currentPos.x - this.previousPosition.x;
            const deltaY = currentPos.y - this.previousPosition.y;
            
            // Only process if there was meaningful movement (using smaller threshold)
            if (Math.abs(deltaX) > 0.0001 || Math.abs(deltaY) > 0.0001) {
                // Move all boarded players with the ship
                this.boardedPlayers.forEach((player, id) => {
                    if (player && player.physicsBody) {
                        // Get current player position - which includes their own movements
                        const currentPlayerPos = player.physicsBody.position;
                        
                        // Apply exact ship movement delta, preserving player's relative position
                        const newPos = {
                            x: currentPlayerPos.x + deltaX,
                            y: currentPlayerPos.y + deltaY
                        };
                        
                        Body.setPosition(player.physicsBody, newPos);
                        player.position = { ...newPos };
                        
                        console.log('[Ship] Synchronized player position:', {
                            playerId: id,
                            shipDelta: { x: deltaX.toFixed(5), y: deltaY.toFixed(5) },
                            newPos: { x: newPos.x.toFixed(1), y: newPos.y.toFixed(1) }
                        });
                    }
                });
            }
            
            // Update ship position properties
            this.position.x = currentPos.x;
            this.position.y = currentPos.y;
            this.rotation = this.physicsBody.angle;
            this.previousPosition = { x: currentPos.x, y: currentPos.y };
        }
    }

    calculateWindForce() {
        let totalForce = 0;
        
        // Sum up force contribution from each sail
        this.modules.forEach(module => {
            if (module instanceof Sail) {
                const sailForce = module.getWindForceContribution(this.windForce);
                totalForce += sailForce;
            }
        });

        console.log('[Ship] Wind force:', {
            shipId: this.id,
            totalForce,
            sailState: this.sailState,
            speed: this.physicsBody?.velocity
        });

        return totalForce;
    }

    render(ctx) {
        ctx.save();
        const pos = this.physicsBody ? this.physicsBody.position : this.position;
        const rot = this.physicsBody ? this.physicsBody.angle : this.rotation;
        
        ctx.translate(pos.x, pos.y);
        ctx.rotate(rot);
        
        this.drawHull(ctx);
        this.renderModules(ctx);  // Key method for module rendering
        
        ctx.restore();
    }

    renderModules(ctx) {
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
                    ctx.translate(module.bindPosition.x, module.bindPosition.y);
                    
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
                label: `ship_hull_${this.id}`,  // Clean ID format
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
                label: `ship_sensor_${this.id}`,  // Clean ID format
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
                    // console.log(`sail detected`);
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

    generateModuleId() {
        // Use consistent format for module IDs
        return `${this.id}_module_${Math.random().toString(36).substr(2, 6)}`;
    }

    setSailState(isOpen) {
        console.log('[Ship] Sail state change requested:', {
            shipId: this.id,
            fromState: this.sailState.isOpen,
            toState: isOpen,
            currentOpenness: this.sailState.currentOpenness,
            targetOpenness: isOpen ? 1 : 0,
            modules: {
                total: this.modules.size,
                sails: Array.from(this.modules.values())
                    .filter(m => m instanceof Sail)
                    .map(sail => ({
                        id: sail.id,
                        currentOpenness: sail.openness,
                        position: sail.position
                    }))
            }
        });

        this.sailState.isOpen = isOpen;
        this.sailState.targetOpenness = isOpen ? 1 : 0;

        let sailsUpdated = 0;
        this.modules.forEach(module => {
            if (module instanceof Sail) {
                module.setOpenState(isOpen);
                sailsUpdated++;
                console.log('[Ship] Sail module updated:', {
                    moduleId: module.id,
                    isOpen: isOpen,
                    openness: module.openness,
                    targetOpenness: module.targetOpenness
                });
            }
        });

        console.log('[Ship] Sail update complete:', {
            shipId: this.id,
            sailsUpdated,
            finalState: {
                isOpen: this.sailState.isOpen,
                target: this.sailState.targetOpenness,
                current: this.sailState.currentOpenness
            }
        });
    }

    // Enhanced player management with logging
    addBoardedPlayer(player) {
        const isNewPlayer = !this.boardedPlayers.has(player.id);
        
        if (isNewPlayer) {
            console.log('[Ship] PLAYER BOARDING EVENT:', {
                event: 'PLAYER_BOARDED',
                shipId: this.id,
                playerId: player.id,
                playerPosition: {
                    x: player.position.x.toFixed(1),
                    y: player.position.y.toFixed(1)
                },
                shipPosition: {
                    x: this.position.x.toFixed(1),
                    y: this.position.y.toFixed(1)
                },
                shipVelocity: this.physicsBody ? {
                    x: this.physicsBody.velocity.x.toFixed(3),
                    y: this.physicsBody.velocity.y.toFixed(3),
                    speed: Math.hypot(
                        this.physicsBody.velocity.x,
                        this.physicsBody.velocity.y
                    ).toFixed(3)
                } : 'no physics body',
                totalPlayers: this.boardedPlayers.size + 1,
                timestamp: Date.now()
            });
        }
        
        this.boardedPlayers.set(player.id, player);
    }

    removeBoardedPlayer(playerId) {
        const wasPresent = this.boardedPlayers.has(playerId);
        this.boardedPlayers.delete(playerId);
        
        if (wasPresent) {
            console.log('[Ship] Removed boarded player:', {
                shipId: this.id,
                playerId: playerId,
                remainingPlayers: this.boardedPlayers.size,
                timestamp: Date.now()
            });
        }
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

        // Add cannons with proper mounting angles
        const cannonConfigs = [
            { x: 0, y: 85, r: Math.PI },    // Port side cannons (facing left)
            { x: 100, y: 85, r: Math.PI },
            { x: -100, y: 85, r: Math.PI },
            { x: 0, y: -85, r: 0 },         // Starboard cannons (facing right)
            { x: 100, y: -85, r: 0 },
            { x: -100, y: -85, r: 0 }
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

        // Call parent update to handle player movement
        super.update(deltaTime);
        
        // Additional Brigantine-specific updates can go here
    }
}
