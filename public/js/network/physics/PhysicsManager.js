import { Engine, World, Bodies, Body } from 'matter-js';

export class PhysicsManager {
    constructor() {
        this.engine = Engine.create({
            enableSleeping: false,
            constraintIterations: 2
        });
        
        this.world = this.engine.world;
        this.world.gravity.y = 0;
        
        this.playerBody = this.createPlayerBody();
        this.lastUpdateTime = performance.now();
        this.updateRate = 1000 / 60;
    }

    createPlayerBody() {
        const body = Bodies.circle(0, 0, 20, {
            friction: 0.1,
            restitution: 0.6,
            density: 0.1,
            mass: 80,
            inertia: Infinity,
            label: 'player'
        });
        
        World.add(this.world, body);
        return body;
    }

    update() {
        const now = performance.now();
        const dt = now - this.lastUpdateTime;
        
        if (dt >= this.updateRate) {
            Engine.update(this.engine, this.updateRate);
            this.lastUpdateTime = now;
            return this.getPlayerState();
        }
        return null;
    }

    getPlayerState() {
        if (!this.playerBody) return null;
        return {
            x: this.playerBody.position.x,
            y: this.playerBody.position.y,
            rotation: this.playerBody.angle
        };
    }

    applyForce(force) {
        if (!this.playerBody) return;
        Body.applyForce(this.playerBody, this.playerBody.position, force);
    }

    cleanup() {
        World.clear(this.world);
        Engine.clear(this.engine);
    }
}
