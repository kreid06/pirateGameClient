import { Cannon, SteeringWheel, Sail } from '../components/Component.js';
import { Bodies, Body, Vertices } from 'matter-js';

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
        
        // Draw ship at physics body position if available
        const renderPos = this.physicsBody ? this.physicsBody.position : this.position;
        const renderRot = this.physicsBody ? this.physicsBody.angle : this.rotation;
        
        ctx.translate(renderPos.x, renderPos.y);
        ctx.rotate(renderRot);
        
        this.drawHull(ctx);
        
        // Draw modules
        this.modules.forEach(module => {
            if (module.render) module.render(ctx);
        });
        
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

    createPhysicsBody(physicsManager) {
        if (!physicsManager) return;

        // Create hull vertices
        const hullVertices = Vertices.fromPath([
            "225 90",    // Bow top
            "360 25",    // Bow curve top
            "360 -25",   // Bow curve bottom
            "225 -90",   // Bow bottom
            "-225 -90",  // Stern bottom
            "-275 0",    // Stern curve
            "-225 90"    // Stern top
        ].join(' '));

        // Create ship hull with proper rotation
        this.physicsBody = Bodies.fromVertices(
            this.position.x, 
            this.position.y, 
            [hullVertices],
            {
                angle: this.rotation,  // Apply initial rotation
                label: `ship_hull_${this.id}`,
                isStatic: true,
                friction: 0.1,
                restitution: 0.2
            }
        );

        // Set initial rotation for mount sensor and deck
        const mountSensorOptions = {
            angle: this.rotation,
            label: `ship_mount_${this.id}`,
            isSensor: true,
            isStatic: true,
            plugin: { ship: this }  // Reference to ship for collision handling
        };

        this.mountSensor = Bodies.rectangle(
            this.position.x, 
            this.position.y,
            450, 200, 
            mountSensorOptions
        );

        // Rotate all bodies to match ship rotation
        Body.setAngle(this.physicsBody, this.rotation);
        Body.setAngle(this.mountSensor, this.rotation);

        // Add bodies to physics world with collision callbacks
        physicsManager.addBody(`${this.id}_hull`, this.physicsBody, {
            onCollide: (pair) => this.handleCollision(pair)
        });
        physicsManager.addBody(`${this.id}_mount`, this.mountSensor, {
            onCollide: (pair) => this.handleMountSensor(pair)
        });
    }

    handleCollision(pair) {
        const otherBody = pair.bodyA === this.physicsBody ? pair.bodyB : pair.bodyA;
        
        if (otherBody.label.startsWith('player')) {
            console.log('[Ship] Collision with player:', {
                shipId: this.id,
                bodyLabel: otherBody.label
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

        // Draw mount sensor if exists
        if (this.mountSensor?.vertices) {
            ctx.strokeStyle = '#FFFF00';  // Yellow for mount area
            ctx.fillStyle = 'rgba(255, 255, 0, 0.1)';
            ctx.setLineDash([5, 5]);

            ctx.beginPath();
            const sensorVertices = this.mountSensor.vertices;
            ctx.moveTo(sensorVertices[0].x, sensorVertices[0].y);
            for (let i = 1; i < sensorVertices.length; i++) {
                ctx.lineTo(sensorVertices[i].x, sensorVertices[i].y);
            }
            ctx.closePath();
            ctx.stroke();
            ctx.fill();
        }

        ctx.restore();
    }

    renderDeckBoundaries(ctx) {
        if (!this.deckBoundaries) return;

        ctx.save();
        ctx.strokeStyle = '#00FF00';  // Green for deck boundaries
        ctx.fillStyle = 'rgba(0, 255, 0, 0.1)';
        ctx.lineWidth = 3;
        ctx.setLineDash([5, 5]);

        this.deckBoundaries.forEach(boundary => {
            if (!boundary.vertices) return;
            
            ctx.beginPath();
            const vertices = boundary.vertices;
            ctx.moveTo(vertices[0].x, vertices[0].y);
            for (let i = 1; i < vertices.length; i++) {
                ctx.lineTo(vertices[i].x, vertices[i].y);
            }
            ctx.closePath();
            ctx.stroke();
            ctx.fill();
        });

        ctx.restore();
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
