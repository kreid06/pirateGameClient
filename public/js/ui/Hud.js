export class Hud {
    constructor() {
        this.container = document.getElementById('hud');
        this.coordinates = document.getElementById('coordinates');
        this.playerId = null;
        this.serverTime = null;

        // HUD elements state
        this.state = {
            position: { x: 0, y: 0 },
            playerState: {
                isJumping: false,
                isMounted: false,
                lastJumpTime: 0,
                jumpCooldown: 500
            }
        };

        // Add camera position tracking
        this.camera = {
            x: 0,
            y: 0
        };
    }

    init(playerId, serverTime) {
        this.playerId = playerId;
        this.serverTime = serverTime;
        this.container.innerHTML = `
            <div id="playerId">Player ID: ${playerId}</div>
            <div id="serverTime">Server Time: ${serverTime}</div>
            <div id="coordinates"></div>
        `;
    }

    update(gameState) {
        if (!gameState) return;
        
        // Update camera position from player position
        if (gameState.player?.position) {
            this.camera.x = gameState.player.position.x;
            this.camera.y = gameState.player.position.y;
        }

        // Update state
        this.state.position = this.camera;
        this.state.playerState = gameState.playerState;
        
        this.render();
    }

    render() {
        if (!this.coordinates || !this.state.position) return;

        const status = this.getPlayerStatus();
        const jumpStatus = this.getJumpStatus();
        
        this.coordinates.textContent = 
            `X: ${Math.round(this.state.position.x)}, ` +
            `Y: ${Math.round(this.state.position.y)} | ` +
            `${status || 'GROUNDED'} | ${jumpStatus || 'READY'}`;
    }

    getPlayerStatus() {
        const state = this.state.playerState;
        // if (state.isJumping) return '🦘 JUMPING';
        // if (state.isMounted) return '⚓ ON SHIP';
        // return '🏃 GROUNDED';
    }

    getJumpStatus() {
        const state = this.state.playerState;
        const now = Date.now();
        // const timeLeft = Math.max(0, state.lastJumpTime + state.jumpCooldown - now);
        
        // if (state.isJumping) return 'JUMPING';
        // if (state.isMounted) return 'MOUNTED';
        // if (timeLeft > 0) return `${Math.ceil(timeLeft / 100) / 10}s`;
        return 'READY';
    }

    updateServerTime(serverTime) {
        this.serverTime = serverTime;
        this.render();
    }
}