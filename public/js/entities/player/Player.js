import { Bodies, Body } from 'matter-js';

export class Player {
    constructor({ id, name, x = 0, y = 0, rotation = 0, physicsManager = null }) {
        // Core properties
        this.id = id;
        this.name = name;
        this.position = { x, y };
        this.rotation = rotation;
        this.physicsManager = physicsManager;
        
        // Double the player forces from their current reduced level
        this.physics = {
            radius: 10,              // Keep same radius
            friction: 0.01,          // Keep same friction
            frictionAir: 0.1,        // Keep same air friction
            mass: 0.3,               // Keep same mass
            density: 0.0003,         // Keep same density
            restitution: 0.2,        // Keep same bounce
            maxForce: 0.00075,       // Double from current (0.000375)
            maxSpeed: 0.5,           // Double from current (0.25)
            acceleration: 0.075,     // Double from current (0.0375)
            deceleration: 0.075,     // Double from current (0.0375)
            turnSpeed: 0.07,         // Keep same turn speed
            movement: {
                forward: 0.035,      // Double from current (0.0175)
                backward: 0.025,     // Double from current (0.0125)
                strafe: 0.03         // Double from current (0.015)
            }
        };

        // Collision categories
        this.categories = {
            PLAYER: 0x0002,
            SHIP_HULL: 0x0004,
            MOUNT_SENSOR: 0x0008
        };

        // Movement state
        this.velocity = { x: 0, y: 0 };
        this.acceleration = { x: 0, y: 0 };
        this.force = { x: 0, y: 0 };

        // Player state
        this.state = {
            isJumping: false,
            isBoarded: false,  // renamed from isMounted
            jumpVelocity: { x: 0, y: 0 },
            jumpStartPos: null,
            jumpDuration: 500,
            jumpCooldown: 500,
            lastJumpTime: 0,
            boardedShipId: null,    // Add this to track ship ID
            currentCollisionCategory: 'PLAYER',
            lastShipDetection: 0,  // Add timestamp for ship detection
            shipDetectionTimeout: 1000,  // 1 second timeout
            mountedModule: null,
            canInteractWithModule: true
        };

        // Add sail control state
        this.controls = {
            lastSailToggle: 0,
            sailToggleCooldown: 500  // 500ms cooldown
        };

        this.init();
    }

    init() {
        if (!this.physicsManager) {
            console.warn('[Player] No physics manager provided');
            return;
        }

        const body = Bodies.circle(this.position.x, this.position.y, this.physics.radius, {
            friction: this.physics.friction,
            frictionAir: this.physics.frictionAir,
            mass: this.physics.mass,
            density: this.physics.density,
            restitution: this.physics.restitution,
            inertia: Infinity,     // Keep infinite inertia for better control
            label: `player_${this.id}`,
            collisionFilter: this.physicsManager.collisionSystem.getCollisionFilter('PLAYER'),
            plugin: {
                player: this,      // Add this reference for collision system
                isPlayer: true
            }
        });

        this.physicsBody = body;
        this.physicsManager.addBody(this.id, body);
        
        // Register as current player with collision system
        this.physicsManager.collisionSystem.setCurrentPlayer(this);

        // Subscribe to collision events with enhanced logging
        this.physicsManager.collisionSystem.addCollisionListener(this.id, {
            onCollisionEnd: (otherBody) => {
                if (this.state.isBoarded && otherBody.label?.startsWith('ship_sensor')) {
                    console.log('[Player] Lost contact event triggered:', {
                        triggerType: 'collision_end',
                        bodyId: otherBody.id,
                        shipId: this.state.boardedShipId,
                        sensorId: otherBody.label,
                        playerState: {
                            isBoarded: this.state.isBoarded,
                            category: this.state.currentCollisionCategory
                        }
                    });
                    
                    const sensorShipId = otherBody.label?.split('_').pop();
                    if (sensorShipId === this.state.boardedShipId) {
                        console.log('[Player] Initiating unboard from collision end');
                        this.unboardShip('collision_end');
                    }
                }
            }
        });

        console.log('[Player] Initialized:', {
            id: this.id,
            position: this.position,
            physics: !!this.physicsBody
        });
    }

    applyMovementForce(input) {
        // Allow movement even when boarded, but don't move if specifically mounted to a module
        if (this.state.mountedModule) {
            console.log('[Player] Movement blocked - player is using a module');
            return;
        }

        if (!this.physicsBody) return;

        const force = { x: 0, y: 0 };
        const { forward, backward, strafe } = this.physics.movement;

        // Remove the movement multiplier reduction when boarded
        // const movementMultiplier = this.state.isBoarded ? 0.5 : 1.0;
        const movementMultiplier = 1.0; // Always use full movement force

        if (input.forward) {
            force.x += Math.cos(this.rotation) * this.physics.maxForce * forward * movementMultiplier;
            force.y += Math.sin(this.rotation) * this.physics.maxForce * forward * movementMultiplier;
        }
        if (input.backward) {
            force.x -= Math.cos(this.rotation) * this.physics.maxForce * backward * movementMultiplier;
            force.y -= Math.sin(this.rotation) * this.physics.maxForce * backward * movementMultiplier;
        }
        if (input.strafeLeft) {
            force.x -= Math.cos(this.rotation + Math.PI/2) * this.physics.maxForce * strafe * movementMultiplier;
            force.y -= Math.sin(this.rotation + Math.PI/2) * this.physics.maxForce * strafe * movementMultiplier;
        }
        if (input.strafeRight) {
            force.x += Math.cos(this.rotation + Math.PI/2) * this.physics.maxForce * strafe * movementMultiplier;
            force.y += Math.sin(this.rotation + Math.PI/2) * this.physics.maxForce * strafe * movementMultiplier;
        }

        this.applyForce(force);
    }

    applyForce(force) {
        if (!this.physicsBody || !this.physicsManager) return;

        // Apply force multiplier consistently, whether on ship or not
        const scaledForce = {
            x: force.x * 1.0,
            y: force.y * 1.0
        };

        const currentSpeed = Math.sqrt(
            this.physicsBody.velocity.x ** 2 + 
            this.physicsBody.velocity.y ** 2
        );

        // Use consistent speed capping whether on ship or not
        if (currentSpeed > this.physics.maxSpeed * 0.7) {
            const scale = this.physics.maxSpeed / currentSpeed;
            scaledForce.x *= scale;
            scaledForce.y *= scale;
        }

        this.physicsManager.applyForce(this.physicsBody, scaledForce);
    }

    update(deltaTime) {
        if (!this.physicsBody) return;

        // Add debug logging for collision categories and groups
        if (this.stats?.frameCount % 60 === 0) { // Log every second
            console.log('[Player] Collision state:', {
                category: this.physicsBody.collisionFilter?.category?.toString(16),
                group: this.physicsBody.collisionFilter?.group,
                mask: this.physicsBody.collisionFilter?.mask?.toString(16),
                state: {
                    isJumping: this.state.isJumping,
                    isBoarded: this.state.isBoarded,
                    currentCategory: this.state.currentCollisionCategory
                }
            });
        }

        // Verify physics body is still in world
        const isInWorld = this.physicsManager.world.bodies.includes(this.physicsBody);
        if (!isInWorld) {
            console.warn('[Player] Physics body not in world:', {
                id: this.id,
                bodyId: this.physicsBody.id,
                label: this.physicsBody.label
            });
        }

        // Update physics state
        this.position = this.physicsBody.position;
        this.rotation = this.physicsBody.angle;

        // Update collision category if needed
        if (this.state.currentCollisionCategory && this.physicsManager?.collisionSystem) {
            this.physicsBody.collisionFilter = 
                this.physicsManager.collisionSystem.getCollisionFilter(this.state.currentCollisionCategory);
        }

        // Check if we've lost contact with the ship
        if (this.state.isBoarded) {
            const now = Date.now();
            const shipSensor = this.findShipSensor();
            if (shipSensor) {
                this.state.lastShipDetection = now;
                console.log('[Player] Ship contact maintained:', {
                    shipId: this.state.boardedShipId,
                    sensorId: shipSensor.label,
                    timeSinceLastCheck: now - this.state.lastShipDetection
                });
            } else {
                const timeSinceLastDetection = now - this.state.lastShipDetection;
                console.log('[Player] Ship contact check failed:', {
                    triggerType: 'sensor_timeout',
                    boardedShipId: this.state.boardedShipId,
                    timeSinceLastDetection,
                    timeout: this.state.shipDetectionTimeout,
                    willFall: timeSinceLastDetection > this.state.shipDetectionTimeout,
                    playerState: {
                        position: this.position,
                        category: this.physicsBody.collisionFilter?.category?.toString(16)
                    }
                });
                if (timeSinceLastDetection > this.state.shipDetectionTimeout) {
                    console.log('[Player] Initiating unboard from sensor timeout');
                    this.unboardShip('sensor_timeout');
                }
            }

            // Check for nearby modules when boarded
            const nearbyModule = this.checkNearbyModules();
            this.state.canInteractWithModule = !!nearbyModule;
            if (nearbyModule) {
                window.dispatchEvent(new CustomEvent('moduleNearby', {
                    detail: {
                        module: nearbyModule,
                        canMount: true
                    }
                }));
            }
        }

        // Debug: Remove auto jump end check
        // const now = Date.now();
        // if (this.state.isJumping && now >= this.state.jumpEndTime) {
        //     this.handleJumpEnd();
        // }

        // Update visual state
        this.updateVisualState();
    }

    updateVisualState() {
        const now = Date.now();
        const jumpTimeLeft = this.state.jumpEndTime - now;

        // Gradually fade color as jump ends
        if (this.state.isJumping) {
            const progress = Math.max(0, jumpTimeLeft / this.state.jumpDuration);
            this.visualState = {
                fillStyle: `rgba(50, 205, 50, ${progress})`,  // Green with fading alpha
                strokeStyle: `rgba(34, 139, 34, ${progress})`  // Darker green with fading alpha
            };
        } else if (this.state.isBoarded) {  // Update condition name
            this.visualState = {
                fillStyle: '#4169E1',    // Blue when boarded
                strokeStyle: '#0000CD'
            };
        } else {
            this.visualState = {
                fillStyle: '#e74c3c',    // Red when normal
                strokeStyle: '#c0392b'
            };
        }
    }

    setPosition(x, y) {
        if (this.physicsBody) {
            Body.setPosition(this.physicsBody, { x, y });
        }
        this.position = { x, y };
    }

    setRotation(angle) {
        if (this.physicsBody) {
            Body.setAngle(this.physicsBody, angle);
        }
        this.rotation = angle;
    }

    cleanup() {
        this.clearJumpTimers();
        if (this.jumpTimer) {
            clearTimeout(this.jumpTimer);
            this.jumpTimer = null;
        }
        if (this.physicsManager && this.physicsBody) {
            this.physicsManager.removeBody(this.id);
            this.physicsBody = null;
        }
        if (this.physicsManager) {
            this.physicsManager.collisionSystem.removeCollisionListener(this.id);
        }
    }

    render(ctx) {
        if (!this.position) return;

        ctx.save();
        ctx.beginPath();

        // Use visual state for colors
        ctx.fillStyle = this.visualState?.fillStyle || '#e74c3c';
        ctx.strokeStyle = this.visualState?.strokeStyle || '#c0392b';

        // Draw player circle
        ctx.lineWidth = 2;
        ctx.arc(this.position.x, this.position.y, this.physics.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // Draw direction indicator
        this.drawDirectionIndicator(ctx);
        ctx.restore();
    }

    drawDirectionIndicator(ctx) {
        const directionLength = 25;
        ctx.beginPath();
        ctx.moveTo(this.position.x, this.position.y);
        const pointX = this.position.x + Math.cos(this.rotation) * directionLength;
        const pointY = this.position.y + Math.sin(this.rotation) * directionLength;
        // Draw direction line
        ctx.lineTo(pointX, pointY);
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 3;
        ctx.stroke();
        // Draw direction point
        ctx.beginPath();
        ctx.arc(pointX, pointY, 3, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
    }

    renderPhysicsBody(ctx) {
        if (!this.physicsBody?.vertices) return;

        ctx.save();
        ctx.strokeStyle = '#FF00FF';  // Magenta for player physics
        ctx.fillStyle = 'rgba(255, 0, 255, 0.1)';
        ctx.lineWidth = 2;

        ctx.beginPath();
        const vertices = this.physicsBody.vertices;
        ctx.moveTo(vertices[0].x, vertices[0].y);
        for (let i = 1; i < vertices.length; i++) {
            ctx.lineTo(vertices[i].x, vertices[i].y);
        }
        ctx.closePath();
        ctx.stroke();
        ctx.fill();

        // Debug: Draw boarding check point
        if (this.state.isJumping || this.state.isBoarded) {
            const checkPoint = {
                x: this.position.x,
                y: this.position.y + this.physics.radius + 1
            };
            
            ctx.beginPath();
            ctx.arc(checkPoint.x, checkPoint.y, 3, 0, Math.PI * 2);
            ctx.fillStyle = '#00FF00';
            ctx.fill();
        }

        ctx.restore();
    }

    setCollisionCategory(newCategory) {
        const oldCategory = this.state.currentCollisionCategory;
        if (oldCategory === newCategory) return;

        const filter = this.physicsManager?.collisionSystem.getCollisionFilter(newCategory);
        if (!filter) {
            console.warn('[Player] Invalid collision category:', newCategory);
            return;
        }

        this.state.currentCollisionCategory = newCategory;
        if (this.physicsBody) {
            Body.set(this.physicsBody, 'collisionFilter', filter);
            // Enhanced logging with group information
            console.log('[Player] Collision category changed:', {
                from: oldCategory,
                to: newCategory,
                filter: {
                    category: filter.category?.toString(16),
                    mask: filter.mask?.toString(16),
                    group: filter.group
                },
                state: {
                    isJumping: this.state.isJumping,
                    isBoarded: this.state.isBoarded
                }
            });
        }
    }

    startJump() {
        const now = Date.now();
        if (this.state.isJumping || now - this.state.lastJumpTime < this.state.jumpCooldown) {
            console.log('[Player] Jump rejected:', this.state);
            return;
        }

        this.clearJumpTimers();

        // Set jump state
        this.state.isJumping = true;
        this.state.lastJumpTime = now;
        this.state.jumpEndTime = now + this.state.jumpDuration;

        // Only change collision category, never use sensor
        if (this.physicsBody) {
            console.log('[Player] Jump - Changing collision category:', {
                before: this.state.currentCollisionCategory
            });
            this.setCollisionCategory('PLAYER_JUMPED');
            console.log('[Player] Jump - Changed collision category:', {
                after: this.state.currentCollisionCategory
            });
        }
            
        // Set up timers
        this.jumpTimer = setTimeout(() => this.handleJumpEnd(), this.state.jumpDuration);
        this.jumpCheckPoints = [
            setTimeout(() => this.checkForShipLanding(), this.state.jumpDuration * 0.75)
        ];
    }

    handleJumpEnd(shipCollision = null) {
        console.log('[Player] Ending jump:', {
            category: this.state.currentCollisionCategory
        });

        this.clearJumpTimers();

        // Check for ship collision
        if (!shipCollision) {
            // First check for sensor hull collision
            const nearbySensor = this.findNearbySensor();
            if (nearbySensor) {
                const isOnShip = this.physicsManager.isBodyOnShip(this.physicsBody, nearbySensor);
                if (isOnShip) {
                    shipCollision = nearbySensor;
                }
            }

            // Fallback to physical hull check
            if (!shipCollision) {
                shipCollision = this.findNearbyShip();
                if (shipCollision) {
                    const isOnShip = this.physicsManager.isBodyOnShip(this.physicsBody, shipCollision);
                    if (!isOnShip) shipCollision = null;
                }
            }
        }

        // Reset jump state
        this.state.isJumping = false;

        // Update final state based on landing
        if (shipCollision) {
            this.boardShip(shipCollision);
        } else {
            this.returnToNormalState();
        }
    }

    returnToNormalState() {
        console.log('[Player] Returning to normal state');
        this.state.isJumping = false;
        this.state.isBoarded = false;
        this.setCollisionCategory('PLAYER');
    }

    clearJumpTimers() {
        if (this.jumpCheckPoints) {
            this.jumpCheckPoints.forEach(timer => clearTimeout(timer));
            this.jumpCheckPoints = [];
        }
    }

    checkForShipLanding() {
        if (!this.state.isJumping) return;

        console.log('[Player] Checking for ship landing');
        const nearbyShip = this.findNearbyShip();
        
        if (nearbyShip) {
            // Verify player is actually on the ship
            const isOnShip = this.physicsManager.isBodyOnShip(this.physicsBody, nearbyShip);
            console.log('[Player] Mid-jump ship check:', {
                shipId: nearbyShip.label,
                isOnShip,
                position: this.position
            });
            if (isOnShip) {
                console.log('[Player] Successfully landed on ship');
                this.clearJumpTimers();
                this.handleJumpEnd(nearbyShip);
            }
        }
    }

    findNearbyShip() {
        const collisions = this.physicsManager.collisionSystem.getCollisionsForBody(this.physicsBody);
        // Log all collisions first
        console.log('[Player] All current collisions:', {
            playerPos: this.position,
            playerState: {
                isJumping: this.state.isJumping,
                isBoarded: this.state.isBoarded
            },
            totalCollisions: collisions.length,
            collisionsList: collisions.map(body => ({
                label: body.label,
                id: body.id,
                category: body.collisionFilter?.category?.toString(16),
                isSensor: body.isSensor,
                position: body.position,
                timestamp: body.lastActiveTime || 'N/A',
                distance: Math.hypot(
                    body.position.x - this.position.x,
                    body.position.y - this.position.y
                )
            }))
        });

        // Filter ship hulls and sort by distance
        const shipCollisions = collisions
            .filter(body => body?.label?.startsWith('ship_hull'))
            .map(body => ({
                body,
                distance: Math.hypot(
                    body.position.x - this.position.x,
                    body.position.y - this.position.y
                )
            }))
            .sort((a, b) => a.distance - b.distance);

        if (shipCollisions.length > 0) {
            const nearestShip = shipCollisions[0].body;
            console.log('[Player] Selected nearest ship:', {
                shipLabel: nearestShip.label,
                shipId: nearestShip.id,
                position: nearestShip.position,
                distance: shipCollisions[0].distance,
                otherOptions: shipCollisions.length - 1
            });
            return nearestShip;
        }

        return null;
    }

    findNearbySensor() {
        const collisions = this.physicsManager.collisionSystem.getCollisionsForBody(this.physicsBody);
        return collisions.find(body => body?.label?.startsWith('ship_sensor'));
    }

    findShipSensor() {
        const collisions = this.physicsManager.collisionSystem.getCollisionsForBody(this.physicsBody);
        const sensor = collisions.find(body => {
            const sensorShipId = body?.label?.split('_').pop();
            const isMatch = body?.label?.startsWith('ship_sensor') && 
                          (!this.state.boardedShipId || sensorShipId === this.state.boardedShipId);
            
            console.log('[Player] Checking sensor collision:', {
                bodyLabel: body?.label,
                sensorShipId,
                boardedShipId: this.state.boardedShipId,
                isMatch,
                category: body?.collisionFilter?.category?.toString(16),
                group: body?.collisionFilter?.group
            });

            return isMatch;
        });

        console.log('[Player] Ship sensor check result:', {
            foundSensor: !!sensor,
            sensorId: sensor?.label,
            boardedShipId: this.state.boardedShipId,
            totalCollisions: collisions.length,
            isBoarded: this.state.isBoarded,
            currentCategory: this.state.currentCollisionCategory
        });

        return sensor;
    }

    boardShip(shipBody) {
        const shipId = this.physicsManager.collisionSystem.getShipIdFromBody(shipBody);
        if (!shipId) {
            console.warn('[Player] Could not get ship ID from body:', shipBody.label);
            return;
        }

        console.log('[Player] Boarding ship:', {
            shipId,
            shipLabel: shipBody.label,
            previousShipId: this.state.boardedShipId,
            previousCategory: this.state.currentCollisionCategory
        });

        // Reset state before boarding new ship
        if (this.state.isBoarded) {
            this.unboardShip(this.state.boardedShipId);
        }

        this.state.isJumping = false;
        this.state.isBoarded = true;
        this.state.boardedShipId = shipId;
        this.state.lastShipDetection = Date.now();
        this.setCollisionCategory('BOARDED_PLAYER');

        // Add player to ship's boarded players list
        const ship = this.getShipById(shipId);
        if (ship) {
            ship.addBoardedPlayer(this);
        }
    }

    unboardShip(reason) {
        console.log('[Player] Unboarding ship:', {
            requestedShipId: reason,
            currentShipId: this.state.boardedShipId,
            playerPos: this.position,
            currentCategory: this.state.currentCollisionCategory,
            timestamp: Date.now()
        });

        // Only unboard if this is our current ship or we're forcing unboard
        if (this.state.mountedModule) {
            this.unmountModule();
        }

        this.state.isBoarded = false;
        this.state.boardedShipId = null;
        this.state.lastShipDetection = 0;
        this.returnToNormalState();
    }

    checkNearbyModules() {
        if (!this.physicsBody || !this.state.boardedShipId) {
            console.log('[Player] Cannot check modules:', {
                hasPhysicsBody: !!this.physicsBody,
                boardedShipId: this.state.boardedShipId
            });
            return null;
        }

        const ship = this.getShipById(this.state.boardedShipId);
        if (!ship) {
            console.log('[Player] Cannot find boarded ship:', this.state.boardedShipId);
            return null;
        }

        // Find nearest module within interaction range
        let nearestModule = null;
        let shortestDistance = Infinity;

        for (const module of ship.modules.values()) {
            if (!module.physicsBody) continue;

            // Use physics manager's range check
            const isNear = this.physicsManager.isBodyInRange(
                this.physicsBody,
                module.physicsBody,
                module.getInteractionRadius?.() || 40 // Default radius if not specified
            );

            if (isNear) {
                const distance = Math.hypot(
                    this.position.x - module.worldPosition.x,
                    this.position.y - module.worldPosition.y
                );
                if (distance < shortestDistance) {
                    shortestDistance = distance;
                    nearestModule = module;
                }
            }
        }

        if (nearestModule) {
            console.log('[Player] Found interactable module:', {
                moduleId: nearestModule.id,
                moduleType: nearestModule.constructor.name,
                distance: shortestDistance.toFixed(2)
            });
        }

        return nearestModule;
    }

    mountModule(module) {
        // Simplified mount - only state changes, no physics
        if (!this.state.isBoarded || !module) {
            console.warn('[Player] Mount failed: Not boarded or invalid module');
            return false;
        }
        
        this.setCollisionCategory('PLAYER_MOUNTED');
        this.state.mountedModule = module;

        console.log('[Player] DEBUG: Simple mount completed:', {
            moduleId: module.id,
            moduleType: module.constructor.name,
            newCategory: this.state.currentCollisionCategory
        });

        return true;
    }

    unmountModule() {
        if (!this.state.mountedModule) return;

        // Simple unmount - just reset state
        this.setCollisionCategory('BOARDED_PLAYER');
        this.state.mountedModule = null;

        console.log('[Player] DEBUG: Simple unmount complete');
    }

    getShipById(shipId) {
        if (!this.physicsManager) return null;

        // Assuming GameState's ships Map is accessible through physicsManager
        const ships = Array.from(this.physicsManager.world.bodies)
            .filter(body => body.label.startsWith('ship_hull'))
            .map(body => body.plugin?.ship)
            .filter(ship => ship?.id === shipId);

        return ships[0] || null;
    }

    handleInput(input) {
        // Allow movement when boarded, but not when mounted to a module
        if (!this.state.mountedModule || 
            this.state.mountedModule.constructor.name !== 'SteeringWheel') {
            this.applyMovementForce(input);
        }

        // Handle sail controls when mounted to steering wheel
        if (this.state.mountedModule?.constructor.name === 'SteeringWheel') {
            const now = Date.now();
            const timeSinceLastToggle = now - this.controls.lastSailToggle;
            if (timeSinceLastToggle > this.controls.sailToggleCooldown) {
                if (input.forward || input.backward) {
                    const ship = this.getShipById(this.state.boardedShipId);
                    if (ship) {
                        const newSailState = input.forward;
                        console.log('[Player] Executing sail control:', {
                            type: 'sails',
                            action: newSailState ? 'OPEN' : 'CLOSE',
                            mountedTo: 'SteeringWheel',
                            movementBlocked: true,
                            ship: {
                                id: ship.id,
                                currentState: ship.sailState
                            }
                        });
                        ship.setSailState(newSailState);
                        this.controls.lastSailToggle = now;
                    } else {
                        console.warn('[Player] Could not find ship for sail control:', this.state.boardedShipId);
                    }
                }
            }
        }
    }

    // New method to handle impact forces from ships
    applyImpactForce(force) {
        if (!this.physicsBody || !this.physicsManager) return;
        
        // If player is boarded, ignore impacts
        if (this.state.isBoarded) return;
        
        // Apply the impact force with a velocity change instead of just a force
        // This gives a more immediate effect appropriate for a collision
        const currentVel = this.physicsBody.velocity;
        
        // Apply 1/2 of the original force (double the current 1/4)
        const newVelocity = {
            x: currentVel.x + (force.x * 0.5), // Double from current (0.25)
            y: currentVel.y + (force.y * 0.5)  // Double from current (0.25)
        };
        
        // Cap maximum velocity to prevent extreme knockback (adjust for lower max speed)
        const newSpeed = Math.hypot(newVelocity.x, newVelocity.y);
        const maxImpactSpeed = this.physics.maxSpeed * 2.5; // Allow higher relative impact speed
        
        if (newSpeed > maxImpactSpeed) {
            const scale = maxImpactSpeed / newSpeed;
            newVelocity.x *= scale;
            newVelocity.y *= scale;
        }
        
        // Set the new velocity directly
        Body.setVelocity(this.physicsBody, newVelocity);
        
        // Add a small visual feedback effect
        this.flashImpactEffect();
        
        console.log('[Player] Received ship impact:', {
            force: {
                x: force.x.toFixed(2),
                y: force.y.toFixed(2)
            },
            newVelocity: {
                x: newVelocity.x.toFixed(2),
                y: newVelocity.y.toFixed(2)
            },
            wasCapped: newSpeed > maxImpactSpeed
        });
    }
    
    // Add visual feedback for impacts
    flashImpactEffect() {
        // Store current visual state
        const originalVisualState = { ...this.visualState };
        
        // Flash red for impact
        this.visualState = {
            fillStyle: '#FF0000',
            strokeStyle: '#AA0000'
        };
        
        // Restore original visual state after a short delay
        setTimeout(() => {
            this.visualState = originalVisualState;
        }, 150);
    }
}