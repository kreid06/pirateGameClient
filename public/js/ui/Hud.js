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
        if (state.isJumping) return '🦘 JUMPING';
        if (state.isBoarded) return '⚓ BOARDED';  // Updated text
        return '🏃 GROUNDED';
    }

    getJumpStatus() {
        const state = this.state.playerState;
        const now = Date.now();
        const timeLeft = Math.max(0, state.lastJumpTime + state.jumpCooldown - now);
        
        if (state.isJumping) {
            // Calculate remaining jump time
            const jumpTimeLeft = Math.max(0, 
                (state.lastJumpTime + state.jumpDuration) - now);
            return `JUMP: ${(jumpTimeLeft / 1000).toFixed(1)}s`;
        }
        
        if (state.isMounted) return 'MOUNTED';
        if (timeLeft > 0) return `COOLDOWN: ${(timeLeft / 1000).toFixed(1)}s`;
        return 'JUMP READY';
    }

    updateServerTime(serverTime) {
        this.serverTime = serverTime;
        this.render();
    }

    showModuleInfo(module, canInteract) {
        this.clearModuleInfo();

        const info = module.getInteractionInfo();
        const tooltip = document.createElement('div');
        tooltip.className = 'module-tooltip';

        const healthPercent = (module.health / (100 * module.quality)) * 100;
        const healthColor = healthPercent > 66 ? 'green' : 
                          healthPercent > 33 ? 'yellow' : 'red';

        tooltip.innerHTML = `
            <h3>${info.name}</h3>
            <div class="module-info">
                <p class="module-id">Module ID: ${module.id}</p>
                <p class="ship-id">Ship ID: ${module.ship?.id || 'N/A'}</p>
            </div>
            <div class="module-stats">
                <div class="health-bar" style="background-color: ${healthColor}; width: ${healthPercent}%"></div>
                <p>Health: ${module.health.toFixed(0)}/${(100 * module.quality).toFixed(0)}</p>
                <p>Quality: ${module.quality.toFixed(1)}x</p>
                ${module.efficiency ? `<p>Efficiency: ${module.efficiency.toFixed(1)}x</p>` : ''}
            </div>
            ${canInteract ? '<span class="interact-prompt">Press E to mount</span>' : ''}
        `;

        // Position tooltip in lower right corner with padding
        tooltip.style.position = 'fixed';
        tooltip.style.bottom = '20px';
        tooltip.style.right = '20px';
        tooltip.style.transform = 'none'; // Remove any transforms

        document.body.appendChild(tooltip);
        this.currentTooltip = tooltip;
    }

    clearModuleInfo() {
        if (this.currentTooltip) {
            this.currentTooltip.remove();
            this.currentTooltip = null;
        }
    }
}