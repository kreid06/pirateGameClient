export class ShipComponent {
    constructor(x, y, r, id, quality) {
        this.position = { x, y };
        this.rotation = r;
        this.targetRotation = r;
        this.id = id;
        this.quality = quality || 1;
        this.health = 100 * this.quality;
        this.ship = null;
        this.bindPosition = { x: 0, y: 0 };
        this.interpolationSpeed = 0.1;
        
        // Add world position tracking
        this.worldPosition = { x: 0, y: 0 };
        this.worldRotation = 0;
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

    update(deltaTime) {
        // Update world position based on ship and relative position
        if (this.ship) {
            const shipPos = this.ship.position;
            const shipRot = this.ship.rotation;
            
            // Calculate world position using ship's center as origin
            const cos = Math.cos(shipRot);
            const sin = Math.sin(shipRot);
            
            this.worldPosition = {
                x: shipPos.x + (cos * this.position.x - sin * this.position.y),
                y: shipPos.y + (sin * this.position.x + cos * this.position.y)
            };
            
            this.worldRotation = shipRot + this.rotation;
        }

        // Smooth rotation interpolation
        if (this.targetRotation !== this.rotation) {
            const diff = this.targetRotation - this.rotation;
            // Normalize angle
            const normalizedDiff = Math.atan2(Math.sin(diff), Math.cos(diff));
            this.rotation += normalizedDiff * this.interpolationSpeed;
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
        // No need to translate - ship handles positioning
        ctx.save();
        this.renderComponent(ctx);
        ctx.restore();
    }

    renderComponent(ctx) {
        // Base class doesn't render anything
        console.warn(`[Component ${this.id}] No render implementation`);
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
    }

    update(deltaTime) {
        super.update(deltaTime);
        
        // Handle reload
        if (!this.isLoaded && Date.now() - this.lastFireTime >= this.reloadTime) {
            this.isLoaded = true;
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
        // Draw base at ship's rotation (don't rotate it)
        ctx.fillStyle = '#8B4513';
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 2;
        ctx.fill(this.paths.base);
        ctx.stroke(this.paths.base);

        // Now rotate for the cannon's own rotation
        ctx.rotate(this.rotation);

        // Draw turret
        ctx.fillStyle = '#000000';
        ctx.fill(this.paths.turret);
    }

    drawBase(path) {
        path.moveTo(15, 10);
        path.lineTo(-15, 10);
        path.lineTo(-15, -10);
        path.lineTo(15, -10);
        path.closePath();
    }

    drawTurret(path) {
        path.moveTo(10, 15);
        path.lineTo(-10, 15);
        path.lineTo(-8, -45);
        path.lineTo(8, -45);
        path.closePath();
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
        this.bindPosition = { x: -50, y: 0 }; // Match position for binding
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
    }

    update(deltaTime) {
        super.update(deltaTime);
        if (this.ship) {
            // Calculate wind effect
            const windForce = this.openness * this.efficiency * this.windResistance;
            // Apply force to ship in sail's direction
            if (windForce > 0) {
                const forceX = Math.cos(this.rotation) * windForce;
                const forceY = Math.sin(this.rotation) * windForce;
                this.ship.applyForce(forceX, forceY);
            }
        }
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
