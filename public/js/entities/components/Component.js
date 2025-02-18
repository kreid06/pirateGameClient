import { Bodies, Constraint, Body } from 'matter-js';

export class ShipComponent {
    constructor(x, y, r, id, quality) {
        this.position = { x, y };
        this.rotation = 0;  // Base rotation should be 0
        this.targetRotation = 0;  // Remove rotation interpolation
        this.id = id;
        this.quality = quality || 1;
        this.health = 100 * this.quality;
        this.ship = null;
        this.bindPosition = { x: 0, y: 0 };
        this.interpolationSpeed = 0.1;
        
        // Add world position tracking
        this.worldPosition = { x: 0, y: 0 };
        this.worldRotation = 0;

        // Add physics properties
        this.physicsBody = null;
        this.physicsShape = {
            type: 'rectangle',  // default shape type
            width: 30,
            height: 30
        };

        // Store original local position
        this.localPosition = { x, y };
        this.bindPosition = { x, y };

        // Standardize interaction distances
        this.interactionRadius = {
            CANNON: 55,
            STEERING: 45,
            SAIL: 65,
            DEFAULT: 50
        };

        // Add mount points with interaction radius
        this.mountPosition = { 
            x: 0, 
            y: -30,
            radius: this.getInteractionRadius() 
        };
    }

    getInteractionRadius() {
        switch(this.constructor.name) {
            case 'Cannon':
            case 'ShipCannon':
                return this.interactionRadius.CANNON;
            case 'SteeringWheel':
                return this.interactionRadius.STEERING;
            case 'Sail':
            case 'SpeedSail':
                return this.interactionRadius.SAIL;
            default:
                return this.interactionRadius.DEFAULT;
        }
    }

    // Add base bindToShip method that all components will inherit
    bindToShip(shipRef) {
        this.ship = shipRef;
        if (this.ship?.position) {
            this.worldPosition = {
                x: this.ship.position.x + this.bindPosition.x,
                y: this.ship.position.y + this.bindPosition.y
            };
        }
    }

    createPhysicsBody(physicsManager, parentBody, initialAngle) {
        if (!physicsManager || !this.ship || !parentBody) return;

        const angle = initialAngle || parentBody.angle;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        
        const worldPos = {
            x: parentBody.position.x + (cos * this.bindPosition.x - sin * this.bindPosition.y),
            y: parentBody.position.y + (sin * this.bindPosition.x + cos * this.bindPosition.y)
        };

        const bodyOptions = {
            isStatic: true,  // Make static since we'll manually update position
            angle: angle,
            label: `module_${this.constructor.name}_${this.id}`,
            collisionFilter: physicsManager.collisionSystem.getCollisionFilter(
                this instanceof Sail ? 'SHIP_MODULE_NON_INTERACT' : 'SHIP_MODULE'
            ),
            plugin: { component: this }
        };

        this.physicsBody = this.physicsShape.type === 'circle' 
            ? Bodies.circle(worldPos.x, worldPos.y, this.physicsShape.radius, bodyOptions)
            : Bodies.rectangle(worldPos.x, worldPos.y, this.physicsShape.width, this.physicsShape.height, bodyOptions);

        physicsManager.addBody(this.id, this.physicsBody);
    }

    renderPhysicsBody(ctx) {
        if (!this.physicsBody?.vertices) {
            console.warn(`[Component ${this.id}] No physics body to render`);
            return;
        }

        ctx.save();
        ctx.strokeStyle = '#00FF00';  // Green for module bodies
        ctx.fillStyle = 'rgba(0, 255, 0, 0.1)';
        ctx.lineWidth = 1;

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

    update(deltaTime) {
        if (this.ship && this.physicsBody) {
            // Get ship's current transform
            const shipPos = this.ship.physicsBody?.position || this.ship.position;
            const shipRot = this.ship.physicsBody?.angle || this.ship.rotation;

            // Calculate new world position
            const cos = Math.cos(shipRot);
            const sin = Math.sin(shipRot);
            
            const newPos = {
                x: shipPos.x + (cos * this.bindPosition.x - sin * this.bindPosition.y),
                y: shipPos.y + (sin * this.bindPosition.x + cos * this.bindPosition.y)
            };

            // Update physics body position and rotation
            Body.setPosition(this.physicsBody, newPos);

            this.worldPosition = newPos;
            this.worldRotation = this.physicsBody.angle;
        }
    }

    damage(amount) {
        this.health = Math.max(0, this.health - amount);
        return this.health <= 0;
    }

    repair(amount) {
        const maxHealth = 100 * this.quality;
        this.health = Math.min(maxHealth, this.health + amount);
    }

    getState() {
        return {
            id: this.id,
            type: this.constructor.name,
            position: this.position,
            rotation: this.rotation,
            health: this.health
        };
    }

    render(ctx) {
        ctx.save();
        // Remove default rotation, let components handle their own rotation
        this.renderComponent(ctx);
        ctx.restore();
    }

    renderPhysicsDebug(ctx) {
        if (!this.physicsBody?.vertices) return;

        // Draw module physics shape
        ctx.save();
        ctx.strokeStyle = '#00FF00';
        ctx.fillStyle = 'rgba(0, 255, 0, 0.1)';

        // Draw world position
        ctx.beginPath();
        this.physicsBody.vertices.forEach((v, i) => {
            if (i === 0) ctx.moveTo(v.x , v.y);
            else ctx.lineTo(v.x, v.y);
        });
        ctx.stroke();
        ctx.fill();

        // Draw local space indicator
        ctx.beginPath();
        ctx.arc(this.position.x +this.worldPosition.x, this.position.y+this.worldPosition.y, 3, 0, Math.PI * 2);
        ctx.fillStyle = '#FFFF00';
        ctx.fill();

        // Draw coordinate info
        ctx.fillStyle = '#FFFFFF';
        ctx.fillText(`World: (${this.physicsBody.position.x.toFixed(0)}, ${this.physicsBody.position.y.toFixed(0)})`, 
                    this.physicsBody.position.x + 10, this.physicsBody.position.y);
        ctx.fillText(`Local: (${this.position.x.toFixed(0)}, ${this.position.y.toFixed(0)})`, 
                    this.position.x + 10 +this.worldPosition.x, this.position.y+this.worldPosition.y);

        ctx.restore();
    }

    renderComponent(ctx) {
        // Base class doesn't render anything
        console.warn(`[Component ${this.id}] No render implementation`);
    }

    cleanup() {
        if (this.physicsManager && this.physicsBody) {
            this.physicsManager.removeBody(this.id);
            this.physicsBody = null;
        }
    }

    getMountPosition() {
        // Get the total rotation (ship rotation + cannon's base rotation)
        const totalRotation = this.worldRotation;
        
        // Define the desired offset relative to cannon
        
        // Rotate the offset point based on the total rotation
        const rotatedOffset = {
            x: this.mountPosition.x * Math.cos(totalRotation) - this.mountPosition.y * Math.sin(totalRotation),
            y: this.mountPosition.x * Math.sin(totalRotation) + this.mountPosition.y * Math.cos(totalRotation)
        };

        // Return position relative to the cannon's world position
        return {
            x: rotatedOffset.x,
            y: rotatedOffset.y
        };
    }  // <-- Added missing closing brace here

    getInteractionInfo() {
        return {
            name: this.constructor.name,
            type: 'module',
            health: this.health,
            quality: this.quality,
            // Add more component-specific info
        };
    }
}

export class Cannon extends ShipComponent {
    constructor(x, y, r, id, quality, efficiency) {
        super(x, y, r, id, quality);
        this.efficiency = efficiency || 1;
        this.weaponDamage = 100 * this.efficiency;
        this.reloadTime = 3000; // 3 seconds base reload time
        this.isLoaded = true;
        this.lastFireTime = 0;
        
        // Add paths container
        this.paths = {
            base: new Path2D(),
            turret: new Path2D()
        };
        
        // Initialize paths
        this.drawBase(this.paths.base);
        this.drawTurret(this.paths.turret);
        
        // Firing properties
        this.range = 500;
        this.projectileSpeed = 10;
        this.spread = 0.1; // Radians

        // Custom physics shape for cannon
        this.physicsShape = {
            type: 'rectangle',
            width: 30,
            height: 60
        };

        // Base orientation relative to ship (used for mount position)
        this.baseRotation = r;  // Store the initial mounting angle
        this.rotation = 0;      // This will be for turret rotation

        this.mountPosition = { x: 0, y: 37 };  // Mount position behind cannon
        // Mount position is 10 units behind the cannon based on its orientation
       
    }

    update(deltaTime) {
        super.update(deltaTime);
        
        // Handle reload
        if (!this.isLoaded && Date.now() - this.lastFireTime >= this.reloadTime) {
            this.isLoaded = true;
        }

        if (this.ship && this.physicsBody) {
            // Get ship's current transform
            const shipPos = this.ship.physicsBody?.position || this.ship.position;
            const shipRot = this.ship.physicsBody?.angle || this.ship.rotation;

            // Calculate new world position
            const cos = Math.cos(shipRot);
            const sin = Math.sin(shipRot);
            
            const newPos = {
                x: shipPos.x + (cos * this.bindPosition.x - sin * this.bindPosition.y),
                y: shipPos.y + (sin * this.bindPosition.x + cos * this.bindPosition.y)
            };

            // Update physics body position and rotation
            Body.setPosition(this.physicsBody, newPos);
            Body.setAngle(this.physicsBody, shipRot + this.baseRotation);

            this.worldPosition = newPos;
            this.worldRotation = shipRot + this.baseRotation;
        }
    }

    canFire() {
        return this.isLoaded && this.health > 0;
    }

    fire() {
        if (!this.canFire()) return null;

        this.isLoaded = false;
        this.lastFireTime = Date.now();

        // Calculate spread
        const actualSpread = (Math.random() - 0.5) * this.spread;
        const fireAngle = this.rotation + actualSpread;

        return {
            damage: this.weaponDamage,
            angle: fireAngle,
            speed: this.projectileSpeed,
            range: this.range
        };
    }

    renderComponent(ctx) {
        ctx.save();
        
        // Missing: Need to apply base rotation first
        ctx.rotate(this.baseRotation);  // <-- Add this line to properly orient the cannon base
        
        // Draw base
        ctx.fillStyle = '#8B4513';
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 2;
        ctx.fill(this.paths.base);
        ctx.stroke(this.paths.base);

        // Draw turret with additional rotation
        ctx.rotate(this.rotation);  // Turret rotation on top of base rotation
        ctx.fillStyle = '#000000';
        ctx.fill(this.paths.turret);
        
        ctx.restore();
    }

    drawBase(path) {
        path.moveTo(15, 20);
        path.lineTo(-15, 20);
        path.lineTo(-15, 0);
        path.lineTo(15, 0);
        path.closePath();
    }

    drawTurret(path) {
        path.moveTo(10, 25);
        path.lineTo(-10, 25);
        path.lineTo(-8, -35);
        path.lineTo(8, -35);
        path.lineTo(8, -35);
        path.closePath();
    }

    createPhysicsBody(physicsManager, parentBody, initialAngle) {
        if (!physicsManager || !this.ship || !parentBody) return;

        // Include base rotation in initial angle calculation
        const totalAngle = (initialAngle || parentBody.angle) + this.baseRotation;
        
        const cos = Math.cos(totalAngle);
        const sin = Math.sin(totalAngle);
        
        const worldPos = {
            x: parentBody.position.x + (cos * this.bindPosition.x - sin * this.bindPosition.y),
            y: parentBody.position.y + (sin * this.bindPosition.x + cos * this.bindPosition.y)
        };

        const bodyOptions = {
            isStatic: true,  // Make static since we'll manually update position
            angle: totalAngle,  // Use combined angle for physics body
            label: `module_${this.constructor.name}_${this.id}`,
            collisionFilter: physicsManager.collisionSystem.getCollisionFilter(
                this instanceof Sail ? 'SHIP_MODULE_NON_INTERACT' : 'SHIP_MODULE'
            ),
            plugin: { component: this }
        };

        this.physicsBody = this.physicsShape.type === 'circle' 
            ? Bodies.circle(worldPos.x, worldPos.y, this.physicsShape.radius, bodyOptions)
            : Bodies.rectangle(worldPos.x, worldPos.y, this.physicsShape.width, this.physicsShape.height, bodyOptions);

        physicsManager.addBody(this.id, this.physicsBody);
    }

    serverUpdate(data) {
        super.serverUpdate(data);
        if (this.targetRotation !== undefined) {
            console.log(`[Cannon ${this.id}] Rotation update:`, {
                current: this.rotation.toFixed(2),
                target: this.targetRotation.toFixed(2)
            });
        }
    }

    
    
}

// Update SteeringWheel to store bind position
export class SteeringWheel extends ShipComponent {
    constructor(x, y, r, id, quality) {
        super(x, y, r, id, quality);
        this.turnSpeed = 0.01 * quality; // Radians per frame
        this.currentTurn = 0; // -1 to 1
        this.position = { x: -50, y: 0 }; // Fixed position relative to ship
        this.rotation = 0; // Fixed rotation
        this.mountPosition = {x:-25, y:0} // Match position for binding

        // Custom physics shape for steering wheel
        this.physicsShape = {
            type: 'rectangle',
            width: 20,   // Width of steering wheel collision
            height: 40   // Height of steering wheel collision
        };

        // Mount position is 10 units to the left of the wheel
    }

    update(deltaTime) {
        super.update(deltaTime);
        if (this.ship && this.currentTurn !== 0) {
            const turnAmount = this.turnSpeed * this.currentTurn * deltaTime;
            this.ship.rotation += turnAmount;
        }
    }

    setTurn(amount) {
        // Clamp between -1 and 1
        this.currentTurn = Math.max(-1, Math.min(1, amount));
    }

    renderComponent(ctx) {
        // Save context for wheel drawing
        ctx.save();
        
        // Draw wheel at fixed position
        this.path = new Path2D();
        this.path.moveTo(-10, -20);
        this.path.lineTo(10, -20);
        this.path.lineTo(10, 20);
        this.path.lineTo(-10, 20);
        this.path.closePath();

        ctx.fillStyle = '#8B4513';
        ctx.fill(this.path);
        
        ctx.restore();
    }

    
}

export class Sail extends ShipComponent {
    constructor(x, y, r, id, quality, efficiency) {
        super(x, y, r, id, quality);
        this.efficiency = efficiency || 1;
        this.openness = 0; // 0 to 1
        this.windResistance = 0.8;
        this.maxSpeed = 5 * this.efficiency;

        // Separate physics shapes for mast and fibers
        this.physicsShapes = {
            mast: {
                type: 'circle',
                radius: 15,  // Match the mast visual radius
                collisionMask: 'SHIP_MODULE'  // Mast can be collided with
            },
            fiber: {
                type: 'rectangle',
                width: 40,
                height: 260,
                collisionMask: 'SHIP_MODULE_NON_INTERACT'  // Fibers are non-interactive
            }
        };

        // Mount position is 10 units to the left of the mast
        this.getMountPosition = () => {
            const angle = this.worldRotation;
            return {
                x: Math.cos(angle + Math.PI/2) * -10,  // 10 units to the left relative to orientation
                y: Math.sin(angle + Math.PI/2) * -10
            };
        };
    }

    createPhysicsBody(physicsManager, parentBody) {
        // Similar to base class but for both mast and fiber
        if (!physicsManager || !this.ship || !parentBody) return;

        const angle = parentBody.angle;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        const worldPos = {
            x: parentBody.position.x + (cos * this.bindPosition.x - sin * this.bindPosition.y),
            y: parentBody.position.y + (sin * this.bindPosition.x + cos * this.bindPosition.y)
        };

        const mastId = `${this.id}_mast`;
        const fiberId = `${this.id}_fiber`;

        // Create static bodies that we'll manually update
        this.physicsBody = Bodies.circle(
            worldPos.x,
            worldPos.y,
            this.physicsShapes.mast.radius,
            {
                isStatic: true,
                angle: angle,
                label: `module_mast_${this.id}`,
                collisionFilter: physicsManager.collisionSystem.getCollisionFilter(this.physicsShapes.mast.collisionMask)
            }
        );

        this.fiberBody = Bodies.rectangle(
            worldPos.x,
            worldPos.y,
            this.physicsShapes.fiber.width,
            this.physicsShapes.fiber.height,
            {
                isStatic: true,
                isSensor: true,
                angle: angle,
                label: `module_fiber_${this.id}`,
                collisionFilter: physicsManager.collisionSystem.getCollisionFilter(this.physicsShapes.fiber.collisionMask)
            }
        );

        physicsManager.addBody(mastId, this.physicsBody);
        physicsManager.addBody(fiberId, this.fiberBody);

        this.bodyIds = { mast: mastId, fiber: fiberId };
    }

    update(deltaTime) {
        if (!this.ship) return;

        const shipPos = this.ship.physicsBody?.position || this.ship.position;
        const shipRot = this.ship.physicsBody?.angle || this.ship.rotation;

        const cos = Math.cos(shipRot);
        const sin = Math.sin(shipRot);
        
        const newPos = {
            x: shipPos.x + (cos * this.bindPosition.x - sin * this.bindPosition.y),
            y: shipPos.y + (sin * this.bindPosition.x + cos * this.bindPosition.y)
        };

        // Update both bodies
        if (this.physicsBody) {
            Body.setPosition(this.physicsBody, newPos);
            Body.setAngle(this.physicsBody, shipRot);
        }
        if (this.fiberBody) {
            Body.setPosition(this.fiberBody, newPos);
            Body.setAngle(this.fiberBody, shipRot);
        }

        this.worldPosition = newPos;
        this.worldRotation = shipRot;
    }

    setOpenness(amount) {
        this.openness = Math.max(0, Math.min(1, amount));
    }

    renderFiber(ctx) {
        // Draw sail fiber
        ctx.save();
        ctx.rotate(this.rotation);
        ctx.beginPath();
        ctx.moveTo(0, 130);
        ctx.quadraticCurveTo(50 + (this.efficiency || 1) * 50, 0, 0, -130);
        ctx.closePath();
        
        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 2;
        ctx.fill();
        ctx.stroke();
        ctx.restore();
    }

    renderMast(ctx) {
        // Draw mast
        ctx.save();
        ctx.beginPath();
        ctx.arc(0, 0, 15, 0, Math.PI * 2);
        ctx.fillStyle = '#D2B48C';
        ctx.strokeStyle = '#8B4513';
        ctx.lineWidth = 4;
        ctx.fill();
        ctx.stroke();
        ctx.restore();
    }

    // Replace original render with new layered approach
    renderComponent(ctx) {
        // Render nothing here - rendering is now handled by specific methods
    }

    renderPhysicsDebug(ctx) {
   

        ctx.save();
        
        // Draw mast physics shape (solid)
        ctx.strokeStyle = '#00FF00';  // Green for solid mast
        ctx.fillStyle = 'rgba(0, 255, 0, 0.1)';
        ctx.lineWidth = 1;
        ctx.setLineDash([]);

        // Draw mast body vertices
        ctx.beginPath();
        this.physicsBody.vertices.forEach((v, i) => {
            if (i === 0) ctx.moveTo(v.x , v.y);
            else ctx.lineTo(v.x, v.y);
        });
        ctx.closePath();
        ctx.stroke();
        ctx.fill();

        // Draw fiber sensor shape (dashed)
        if (this.fiberBody?.vertices) {
            ctx.strokeStyle = '#FF00FF';  // Pink for fiber sensor
            ctx.fillStyle = 'rgba(255, 0, 255, 0.05)';
            ctx.setLineDash([5, 5]);

            ctx.beginPath();
            this.fiberBody.vertices.forEach((v, i) => {
                if (i === 0) ctx.moveTo(v.x, v.y);
                else ctx.lineTo(v.x, v.y);
            });
            ctx.closePath();
            ctx.stroke();
            ctx.fill();
        }

        // Draw coordinate info
        ctx.fillStyle = '#FFFFFF';
        ctx.setLineDash([]);
        ctx.fillText(
            `World: (${this.physicsBody.position.x.toFixed(0)}, ${this.physicsBody.position.y.toFixed(0)})`,
            this.physicsBody.position.x  + 10,
            this.physicsBody.position.y 
        );
        ctx.fillText(
            `Local: (${this.position.x.toFixed(0)}, ${this.position.y.toFixed(0)})`,
            this.position.x + 10 +this.worldPosition.x,
            this.position.y +this.worldPosition.y
        );

        ctx.restore();
    }

    cleanup() {
        if (this.physicsManager) {
            // Clean up both bodies and constraints using stored IDs
            const { mast, fiber } = this.bodyIds || {};
            if (mast) {
                this.physicsManager.removeConstraint(`${mast}_constraint`);
                // Remove stabilizer constraints
                this.stabilizers?.forEach((_, index) => {
                    this.physicsManager.removeConstraint(`${mast}_stabilizer_${index}`);
                });
                this.physicsManager.removeBody(mast);
            }
            if (fiber) {
                this.physicsManager.removeConstraint(`${fiber}_constraint`);
                this.physicsManager.removeBody(fiber);
            }
        }
    }

    renderPhysicsBody(ctx) {
        if (!this.physicsBody || !this.ship?.position) return;

        ctx.save();
        // Calculate positions relative to ship's world position
        const shipPos = this.ship.physicsBody ? this.ship.physicsBody.position : this.ship.position;
        const mastPos = this.physicsBody.position;

        // Draw mast body (circle)
        ctx.strokeStyle = '#00FF00';
        ctx.fillStyle = 'rgba(0, 255, 0, 0.1)';
        ctx.lineWidth = 1;

        ctx.beginPath();
        ctx.arc(
            mastPos.x - shipPos.x,
            mastPos.y - shipPos.y,
            this.physicsShapes.mast.radius,
            0,
            Math.PI * 2
        );
        ctx.fill();
        ctx.stroke();

        ctx.restore();
    }

    renderFiberPhysicsBody(ctx) {
        if (!this.fiberBody || !this.ship?.position) return;

        ctx.save();
        // Calculate positions relative to ship's world position
        const shipPos = this.ship.physicsBody ? this.ship.physicsBody.position : this.ship.position;
        const shipRot = this.ship.physicsBody ? this.ship.physicsBody.angle : this.ship.rotation;
        const fiberPos = this.fiberBody.position;

        // Transform to local space
        ctx.translate(fiberPos.x - shipPos.x, fiberPos.y - shipPos.y);
        ctx.rotate(this.fiberBody.angle - shipRot);

        // Draw fiber body (rectangle)
        ctx.strokeStyle = '#FF00FF';
        ctx.fillStyle = 'rgba(255, 0, 255, 0.1)';
        ctx.setLineDash([5, 5]);
        
        ctx.strokeRect(
            -this.physicsShapes.fiber.width/2,
            -this.physicsShapes.fiber.height/2,
            this.physicsShapes.fiber.width,
            this.physicsShapes.fiber.height
        );

        ctx.restore();
    }

    getMountPosition() {
        return {
            x: -10,      // 10 units to the left
            y: 0         // Same vertical position
        };
    }
}

// SpeedSail and ShipCannon can now use the base bindToShip method
export class SpeedSail extends Sail {
    constructor(shipId, quality, x, y, efficiency, id) {
        super(x, y, 0, id, quality, efficiency);
        this.bindPosition = { x, y };
    }
}

export class ShipCannon extends Cannon {
    constructor(shipId, quality, x, y, rotation, efficiency, id) {
        super(x, y, rotation, id, quality, efficiency);
        this.bindPosition = { x, y };
    }
}