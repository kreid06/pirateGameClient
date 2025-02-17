import { Cannon, SteeringWheel, Sail } from '../components/Component.js';

export class Ship {
    constructor(x, y, r, id) {
        this.position = { x, y };
        this.rotation = r;
        this.id = id;
        this.modules = new Map();
        this.path = null;
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

    createPhysicsBody(physicsManager) {
        this.physicsBody = physicsManager.createShipBody(this);
        return this.physicsBody;
    }

    applyForce(forceX, forceY) {
        if (!this.physics) return;
        
        // Convert component force to world space
        const worldForceX = forceX * Math.cos(this.rotation) - forceY * Math.sin(this.rotation);
        const worldForceY = forceX * Math.sin(this.rotation) + forceY * Math.cos(this.rotation);
        
        // Apply force to ship's physics body
        this.physics.applyForce({ x: worldForceX, y: worldForceY });
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
        // Apply visual offset to match physics body (-25px total offset)
        ctx.translate(this.position.x - 25, this.position.y);
        ctx.rotate(this.rotation);
        this.drawHull(ctx);
        ctx.restore();
    }

    drawHull(ctx) {
        // Base hull drawing - can be overridden by child classes
        if (!this.path) {
            this.path = new Path2D();
            this.path.moveTo(225, 90);
            this.path.quadraticCurveTo(500, 0, 225, -90);
            this.path.lineTo(-225, -90);
            this.path.quadraticCurveTo(-325, 0, -225, 90);
            this.path.closePath();
        }

        ctx.fillStyle = '#D2B48C';    // Tan color for wood
        ctx.strokeStyle = '#8B4513';   // Saddle brown for outline
        ctx.lineWidth = 10;
        ctx.fill(this.path);
        ctx.stroke(this.path);
    }
}

export class Brigantine extends Ship {
    constructor(x, y, rotation = 0, id = null) {
        super(x, y, rotation, id);
        // Update dimensions to match new hull path
        this.width = 1000;  // Total width including curves
        this.height = 180;  // Total height (90 * 2)
    }

    render(ctx) {
        ctx.save();
        // Apply visual offset to match physics body (-25px total offset)
        ctx.translate(this.position.x - 25, this.position.y);
        ctx.rotate(this.rotation);
        
        // Render in layers
        this.drawHull(ctx);
        
        // Render modules in order
        const renderOrder = [Cannon, SteeringWheel, Sail];
        renderOrder.forEach(ComponentType => {
            this.modules.forEach(module => {
                if (module instanceof ComponentType) {
                    module.render(ctx);
                }
            });
        });

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
