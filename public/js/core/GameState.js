import { Brigantine } from '../entities/ships/Ship.js';
import { Player } from '../entities/player/Player.js';
import { PhysicsManager } from '../physics/PhysicsManager.js';
import { Body } from 'matter-js';
import { Hud } from '../ui/Hud.js';

export class GameState {
    constructor() {
        this.physicsManager = new PhysicsManager();
        this.ships = new Map();
        this.otherPlayers = new Map();
        this.lastUpdateTime = performance.now();
        this.ready = false;

        // Game loop timing
        this.fixedTimeStep = 1000/60;  // Match physics timestep
        this.accumulator = 0;

        // Add camera position
        this.camera = {
            x: 0,
            y: 0
        };

        this.hud = new Hud();
    }

    initPlayer(playerId, options = {}) {
        this.player = new Player({
            id: playerId,
            name: options.name || `Player_${playerId}`,
            x: options.x || 0,
            y: options.y || 0,
            rotation: options.rotation || 0,
            physicsManager: this.physicsManager
        });

        // Initialize world position from player
        this.worldPos = this.player.position;
        this.rotation = this.player.rotation;
        this.playerState = this.player.state;
        this.ready = true;

        console.log('[GameState] Player initialized:', {
            id: playerId,
            position: this.worldPos,
            ready: this.ready
        });

        return this.player;
    }

    cleanup() {
        if (this.player) {
            this.player.cleanup();
        }
        if (this.physicsManager) {
            this.physicsManager.cleanup();
        }
        this.ships.clear();
        this.otherPlayers.clear();
        this.ready = false;
    }

    addStaticShips() {
        // Add multiple ships for testing
        const shipConfigs = [
            { x: -500, y: 0, r: 0, id: 'static_ship_1' },
            { x: 500, y: 300, r: Math.PI / 4, id: 'static_ship_2' },
            { x: -200, y: -400, r: -Math.PI / 6, id: 'static_ship_3' }
        ];

        shipConfigs.forEach(config => {
            const ship = new Brigantine(
                config.x,
                config.y,
                config.r,
                config.id
            );
            
            this.ships.set(ship.id, ship);
            ship.createPhysicsBody(this.physicsManager);
            
            console.log('[GameState] Added static ship:', {
                id: ship.id,
                position: ship.position,
                rotation: ship.rotation,
                physics: !!ship.physicsBody
            });
        });
    }

    applyInput(input) {
        if (!this.player || !input) return;

        // Update rotation to face mouse
        if (input.mousePos) {
            const angle = Math.atan2(
                input.mousePos.y - this.player.position.y,
                input.mousePos.x - this.player.position.x
            );
            this.player.setRotation(angle);
            this.rotation = angle;
        }

        // Apply movement through player
        this.player.applyMovementForce(input);
    }

    update(deltaTime) {
        // Update physics first
        const physicsState = this.physicsManager.update(deltaTime);

        // Update game state with interpolated physics
        if (this.player && physicsState.bodies.has(this.player.id)) {
            const playerPhysics = physicsState.bodies.get(this.player.id);
            this.worldPos.x = this.camera.x = playerPhysics.position.x;
            this.worldPos.y = this.camera.y = playerPhysics.position.y;
            this.rotation = playerPhysics.angle;
        }

        // Update entities
        this.ships.forEach(ship => ship.update(deltaTime));
        this.otherPlayers.forEach(player => player.update(deltaTime));
        this.hud.update(this);

        return physicsState;
    }

    updatePlayer(position, rotation) {
        this.worldPos = position;
        this.rotation = rotation;
    }

    updateShip(shipData) {
        const { id, x, y, r } = shipData;
        const shipId = typeof id === 'bigint' ? id.toString() : id;
        
        let ship = this.ships.get(shipId);
        if (!ship) {
            ship = new Brigantine(x, y, r || 0, shipId);
            this.ships.set(shipId, ship);
        }
        
        ship.position.x = x;
        ship.position.y = y;
        ship.rotation = r || 0;
        
        return ship;
    }
}
