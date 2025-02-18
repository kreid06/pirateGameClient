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
    }

    update(deltaTime) {
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
        ctx.save();
        ctx.translate(this.bindPosition.x, this.bindPosition.y);
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
        this.paths.base = new Path2D();
        this.drawBase(this.paths.base);
        ctx.fillStyle = '#8B4513';
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 2;
        ctx.fill(this.paths.base);
        ctx.stroke(this.paths.base);

        // Now rotate for the cannon's own rotation
        ctx.rotate(this.rotation);

        // Draw turret
        this.paths.turret = new Path2D();
        this.drawTurret(this.paths.turret);
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

export class SteeringWheel extends ShipComponent {
    constructor(x, y, r, id, quality) {
        super(x, y, r, id, quality);
        this.turnSpeed = 0.01 * quality; // Radians per frame
        this.currentTurn = 0; // -1 to 1
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
        ctx.rotate(this.rotation);
        this.path = new Path2D();
        this.path.moveTo(-10, -20);
        this.path.lineTo(10, -20);
        this.path.lineTo(10, 20);
        this.path.lineTo(-10, 20);
        this.path.closePath();

        ctx.fillStyle = '#8B4513';
        ctx.fill(this.path);
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

    renderComponent(ctx) {
        // Draw mast
        ctx.beginPath();
        ctx.arc(0, 0, 15, 0, Math.PI * 2);
        ctx.fillStyle = '#D2B48C';
        ctx.strokeStyle = '#8B4513';
        ctx.lineWidth = 4;
        ctx.fill();
        ctx.stroke();

        // Draw sail
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
    }
}
