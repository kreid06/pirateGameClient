import { Engine, World, Bodies, Body } from 'matter-js';

export class PhysicsManager {
    constructor() {
        this.engine = Engine.create({
            enableSleeping: false,
            constraintIterations: 2
        });
        
        this.world = this.engine.world;
        this.world.gravity.y = 0;
        this.playerBody = null;
        this.lastUpdateTime = performance.now();
        this.updateRate = 1000 / 60;
        this.pendingInputs = [];
        this.serverLatency = 0;
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
        this.playerBody = body;
        return body;
    }

    update() {
        const now = performance.now();
        const dt = now - this.lastUpdateTime;
        
        if (dt >= this.updateRate) {
            Engine.update(this.engine, this.updateRate);
            this.lastUpdateTime = now;
            return this.getState();
        }
        return null;
    }

    applyInput(input) {
        if (!this.playerBody) return;
        const force = 0.005;
        const impulse = { x: 0, y: 0 };

        if (input.keys['KeyW']) impulse.y -= force;
        if (input.keys['KeyS']) impulse.y += force;
        if (input.keys['KeyA']) impulse.x -= force;
        if (input.keys['KeyD']) impulse.x += force;

        Body.applyForce(this.playerBody, this.playerBody.position, impulse);
        return { impulse, position: { ...this.playerBody.position } };
    }

    getState() {
        if (!this.playerBody) return null;
        return {
            x: this.playerBody.position.x,
            y: this.playerBody.position.y,
            angle: this.playerBody.angle,
            velocity: { ...this.playerBody.velocity }
        };
    }

    reconcileState(serverState) {
        if (!this.playerBody) return;
        
        const threshold = 50;
        const currentPos = this.playerBody.position;
        const deviation = Math.hypot(
            currentPos.x - serverState.x,
            currentPos.y - serverState.y
        );

        if (deviation > threshold) {
            Body.setPosition(this.playerBody, {
                x: serverState.x,
                y: serverState.y
            });
            Body.setAngle(this.playerBody, serverState.angle);
            this.pendingInputs = [];
            return true;
        }
        return false;
    }

    cleanup() {
        if (this.engine) {
            World.clear(this.world);
            Engine.clear(this.engine);
        }
    }
}
