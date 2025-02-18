import { Bodies, Body } from 'matter-js';

export class Player {
    constructor({ id, name, x = 0, y = 0, rotation = 0, physicsManager = null }) {
        // Core properties
        this.id = id;
        this.name = name;
        this.position = { x, y };
        this.rotation = rotation;
        this.physicsManager = physicsManager;
        
        // Adjust physics properties for better movement
        this.physics = {
            radius: 20,
            friction: 0.01,
            frictionAir: 0.1,     // Reduced air friction
            mass: 80,              // Reduced mass
            density: 0.001,
            restitution: 0.2,
            maxForce: 0.025,       // Increased force
            maxSpeed: 5,           // Increased speed
            acceleration: 0.1,
            deceleration: 0.98,
            turnSpeed: 0.05,
            movement: {
                forward: 1.0,
                backward: 0.5,
                strafe: 0.7
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
            shipDetectionTimeout: 1000  // 1 second timeout
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
            label: `player_${this.id}`,
            collisionFilter: this.physicsManager.collisionSystem.getCollisionFilter('PLAYER')
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
        if (!this.physicsBody) return;

        const force = { x: 0, y: 0 };
        const { forward, backward, strafe } = this.physics.movement;

        if (input.forward || input.backward || input.strafeLeft || input.strafeRight) {
            if (input.forward) {
                force.x += Math.cos(this.rotation) * this.physics.maxForce * forward;
                force.y += Math.sin(this.rotation) * this.physics.maxForce * forward;
            }
            if (input.backward) {
                force.x -= Math.cos(this.rotation) * this.physics.maxForce * backward;
                force.y -= Math.sin(this.rotation) * this.physics.maxForce * backward;
            }
            if (input.strafeLeft) {
                force.x -= Math.cos(this.rotation + Math.PI/2) * this.physics.maxForce * strafe;
                force.y -= Math.sin(this.rotation + Math.PI/2) * this.physics.maxForce * strafe;
            }
            if (input.strafeRight) {
                force.x += Math.cos(this.rotation + Math.PI/2) * this.physics.maxForce * strafe;
                force.y += Math.sin(this.rotation + Math.PI/2) * this.physics.maxForce * strafe;
            }

            this.applyForce(force);
        }
    }

    applyForce(force) {
        if (!this.physicsBody || !this.physicsManager) return;

        // Apply raw force without additional scaling
        const scaledForce = {
            x: force.x,
            y: force.y
        };

        const currentSpeed = Math.sqrt(
            this.physicsBody.velocity.x ** 2 + 
            this.physicsBody.velocity.y ** 2
        );

        // Only scale down if exceeding max speed
        if (currentSpeed > this.physics.maxSpeed) {
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
            setTimeout(() => this.checkForShipLanding(), this.state.jumpDuration * 0.5),
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
        console.log(collisions)
        return collisions.find(body => body?.label?.startsWith('ship_hull'));
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
        const shipId = shipBody.label.split('_').pop(); // Extract ID from label
        console.log('[Player] Boarding ship:', {
            shipId: shipId,
            shipLabel: shipBody.label,
            previousCategory: this.state.currentCollisionCategory
        });

        this.state.isJumping = false;
        this.state.isBoarded = true;
        this.state.boardedShipId = shipId;  // Store ship ID
        this.state.lastShipDetection = Date.now();
        this.setCollisionCategory('BOARDED_PLAYER');
    }

    unboardShip(key = 'unknown') {
        if(key.substring(2)==this.state.boardedShipId){
            console.log('[Player] Unboarding ship:', {
                key,
                shipId: this.state.boardedShipId,
                playerPos: this.position,
                currentCategory: this.state.currentCollisionCategory,
                timestamp: Date.now()
            });

            this.state.isBoarded = false;
            this.state.boardedShipId = null;
            this.state.lastShipDetection = 0;
            this.returnToNormalState();
        }else{
            console.log(`[Player] failed to unboard ship: ${key.substring(2)} != ${this.state.boardedShipId}`);
        }
    }
}