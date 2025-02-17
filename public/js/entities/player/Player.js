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
            jumpVelocity: -12,
            jumpDuration: 500,
            jumpCooldown: 500,
            lastJumpTime: 0,
            mountedShip: null,
            gravity: 0.5
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
            collisionFilter: {
                category: this.categories.PLAYER,
                mask: this.categories.SHIP_HULL | this.categories.MOUNT_SENSOR
            }
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

    update(state) {
        if (!this.physicsBody) return;

        // Update position and rotation from physics body
        this.position = this.physicsBody.position;
        this.rotation = this.physicsBody.angle;

        // Update any additional state
        if (state) {
            Object.assign(this, state);
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
        if (this.physicsManager && this.physicsBody) {
            this.physicsManager.removeBody(this.id);
            this.physicsBody = null;
        }
    }

    render(ctx) {
        if (!this.position) return;

        ctx.save();
        ctx.beginPath();

        // Set player color based on state
        if (this.state.isJumping) {
            ctx.fillStyle = '#32CD32';    // Green when jumping
            ctx.strokeStyle = '#228B22';
        } else if (this.state.isMounted) {
            ctx.fillStyle = '#4169E1';    // Blue when mounted
            ctx.strokeStyle = '#0000CD';
        } else {
            ctx.fillStyle = '#e74c3c';    // Red when normal
            ctx.strokeStyle = '#c0392b';
        }

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

        ctx.restore();
    }
}