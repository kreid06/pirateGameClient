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
            isMounted: false,
            jumpVelocity: { x: 0, y: 0 },
            jumpStartPos: null,
            jumpDuration: 500,
            jumpCooldown: 500,
            lastJumpTime: 0,
            mountedShip: null,
            currentCollisionCategory: 'PLAYER'
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
        } else if (this.state.isMounted) {
            this.visualState = {
                fillStyle: '#4169E1',    // Blue when mounted
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
        if (this.state.isJumping || this.state.isMounted) {
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
            
            console.log('[Player] Collision category changed:', {
                from: oldCategory,
                to: newCategory,
                filter: {
                    category: filter.category,
                    mask: filter.mask
                },
                state: {
                    isJumping: this.state.isJumping,
                    isMounted: this.state.isMounted
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
            // this.returnToNormalState();
        }
    }

    returnToNormalState() {
        console.log('[Player] Returning to normal state');
        this.state.isJumping = false;
        this.state.isMounted = false;
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

    boardShip(shipBody) {
        console.log('[Player] Boarding ship:', {
            shipId: shipBody.label,
            previousCategory: this.state.currentCollisionCategory
        });

        this.state.isJumping = false;
        this.state.isMounted = true;
        this.setCollisionCategory('BOARDED_PLAYER');
    }
}