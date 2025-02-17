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

        // Create main physical hull
        this.physicsBody = Bodies.fromVertices(
            this.position.x, 
            this.position.y, 
            [hullVertices],
            {
                angle: this.rotation,
                label: `ship_hull_${this.id}`,
                isStatic: true,
                isSensor: false,
                friction: 0.1,
                restitution: 0.2,
                collisionFilter: physicsManager.collisionSystem.getCollisionFilter('SHIP_HULL'),
                plugin: {
                    ship: this,
                    isShipHull: true
                }
            }
        );

        // Create sensor duplicate with same shape
        this.sensorHull = Bodies.fromVertices(
            this.position.x, 
            this.position.y, 
            [hullVertices],
            {
                angle: this.rotation,
                label: `ship_sensor_${this.id}`,
                isStatic: true,
                isSensor: false,  // This one is always a sensor
                collisionFilter: physicsManager.collisionSystem.getCollisionFilter('SHIP_SENSOR'),
                plugin: {
                    ship: this,
                    isShipSensor: false
                }
            }
        );

        // Add both bodies to physics world
        physicsManager.addBody(`${this.id}_hull`, this.physicsBody);
        physicsManager.addBody(`${this.id}_sensor`, this.sensorHull);

        // Rotate both bodies
        Body.setAngle(this.physicsBody, this.rotation);
        Body.setAngle(this.sensorHull, this.rotation);

        // Log ship hull creation
        console.log('[Ship] Created hull:', {
            id: this.id,
            isSensor: this.physicsBody.isSensor,
            category: this.physicsBody.collisionFilter.category,
            mask: this.physicsBody.collisionFilter.mask
        });

        // Remove jump detector code and just use the main hull
        physicsManager.addBody(`${this.id}_hull`, this.physicsBody);


        // Rotate all bodies to match ship rotation
        Body.setAngle(this.physicsBody, this.rotation);

        // Add bodies to physics world with collision callbacks
        physicsManager.addBody(`${this.id}_hull`, this.physicsBody, {
            onCollide: (pair) => this.handleCollision(pair)
        });
     
        // Create boarding boundary (hollow square)
        // const boundaryWidth = 400;
        // const boundaryHeight = 300;
        // const wallThickness = 10;

        // // Create four walls for the boundary
        // const walls = [
        //     // Top wall
        //     Bodies.rectangle(0, -boundaryHeight/2, boundaryWidth, wallThickness),
        //     // Bottom wall
        //     Bodies.rectangle(0, boundaryHeight/2, boundaryWidth, wallThickness),
        //     // Left wall
        //     Bodies.rectangle(-boundaryWidth/2, 0, wallThickness, boundaryHeight),
        //     // Right wall
        //     Bodies.rectangle(boundaryWidth/2, 0, wallThickness, boundaryHeight)
        // ];

        // // Create compound body for boundary
        // this.boardingBoundary = Body.create({
        //     parts: walls,
        //     position: this.position,
        //     angle: this.rotation,
        //     isStatic: true,
        //     label: `boarding_boundary_${this.id}`,
        //     collisionFilter: physicsManager.collisionSystem.getCollisionFilter('BOARDED_BOUNDARY')
        // });

        // // Add bodies to physics world
        // physicsManager.addBody(`${this.id}_boundary`, this.boardingBoundary);
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

        // Render boarding boundary if it exists
        if (this.boardingBoundary?.parts) {
            ctx.strokeStyle = '#0000FF';  // Blue for boarding boundary
            ctx.fillStyle = 'rgba(0, 0, 255, 0.1)';
            ctx.lineWidth = 2;
            ctx.setLineDash([5, 5]);

            this.boardingBoundary.parts.forEach(part => {
                if (!part.vertices) return;
                
                ctx.beginPath();
                const vertices = part.vertices;
                ctx.moveTo(vertices[0].x, vertices[0].y);
                for (let i = 1; i < vertices.length; i++) {
                    ctx.lineTo(vertices[i].x, vertices[i].y);
                }
                ctx.closePath();
                ctx.stroke();
            });
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

    // Update both bodies' positions when ship moves
    setPosition(x, y) {
        if (this.physicsBody) {
            Body.setPosition(this.physicsBody, { x, y });
        }
        if (this.sensorHull) {
            Body.setPosition(this.sensorHull, { x, y });
        }
        this.position = { x, y };
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
