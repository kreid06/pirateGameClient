export class InputSystem {
    constructor() {
        this.keys = new Map();  // Changed from Set to Map
        this.mousePos = { x: 0, y: 0 };
        this.worldMousePos = { x: 0, y: 0 };
        this.debugKeyPressed = false;
        this.lastJumpTime = 0;
        this.jumpCooldown = 500; // ms between jumps

        // Add key state tracking
        this.keyStates = {
            forward: false,
            backward: false,
            strafeLeft: false,
            strafeRight: false,
            interact: false,
            jump: false
        };

        this.lastInteractTime = 0;
        this.interactCooldown = 1000; // 1 second cooldown

        // Add cooldown tracking
        this.keyCooldowns = {
            interact: { cooldown: 1000, lastUsed: 0 },
            jump: { cooldown: 1000, lastUsed: 0 },
            debug: { cooldown: 500, lastUsed: 0 }
        };

        // Movement keys don't need cooldowns
        this.movementKeys = ['KeyW', 'KeyA', 'KeyS', 'KeyD'];

        this.setupListeners();
    }

    handleKeyCooldown(action) {
        const cooldownInfo = this.keyCooldowns[action];
        if (!cooldownInfo) return true; // No cooldown defined

        const now = Date.now();
        const timeSinceLastUse = now - cooldownInfo.lastUsed;

        if (timeSinceLastUse < cooldownInfo.cooldown) {
            console.log(`[Input] ${action} on cooldown:`, {
                timeLeft: ((cooldownInfo.cooldown - timeSinceLastUse) / 1000).toFixed(1) + 's'
            });
            return false;
        }

        cooldownInfo.lastUsed = now;
        return true;
    }

    setupListeners() {
        window.addEventListener('keydown', (e) => {
            if (e.repeat) return;

            // Movement keys have no cooldown
            if (this.movementKeys.includes(e.code)) {
                switch (e.code) {
                    case 'KeyW': this.keyStates.forward = true; break;
                    case 'KeyS': this.keyStates.backward = true; break;
                    case 'KeyA': this.keyStates.strafeLeft = true; break;
                    case 'KeyD': this.keyStates.strafeRight = true; break;
                }
                return;
            }

            switch (e.code) {
                case 'KeyE':
                    if (this.handleKeyCooldown('interact')) {
                        this.keyStates.interact = true;
                        window.dispatchEvent(new Event('moduleInteract'));
                        // Immediately reset interact state
                        setTimeout(() => {
                            this.keyStates.interact = false;
                        }, 50);
                    }
                    break;

                case 'Space':
                    if (this.handleKeyCooldown('jump')) {
                        this.keyStates.jump = true;
                        window.dispatchEvent(new Event('playerJump'));
                    }
                    break;

                case 'KeyT':
                    if (this.handleKeyCooldown('debug')) {
                        this.debugKeyPressed = true;
                        window.dispatchEvent(new CustomEvent('toggleDebugDraw'));
                    }
                    break;
            }

            this.keys.set(e.code, true);
        });

        window.addEventListener('keyup', (e) => {
            // Only handle movement keys on keyup
            switch (e.code) {
                case 'KeyW': this.keyStates.forward = false; break;
                case 'KeyS': this.keyStates.backward = false; break;
                case 'KeyA': this.keyStates.strafeLeft = false; break;
                case 'KeyD': this.keyStates.strafeRight = false; break;
                case 'Space': this.keyStates.jump = false; break;
                case 'KeyT': this.debugKeyPressed = false; break;
            }

            this.keys.set(e.code, false);
        });

        window.addEventListener('mousemove', (e) => {
            this.mousePos.x = e.clientX;
            this.mousePos.y = e.clientY;
            // worldMousePos is updated in getInput when we have the camera position
        });

        window.addEventListener('keydown', (e) => {
            if (e.code === 'Space') {
                const now = Date.now();
                if (now - this.lastJumpTime >= this.jumpCooldown) {
                    this.lastJumpTime = now;
                    window.dispatchEvent(new CustomEvent('playerJump'));
                }
            }
        });

        // Add mouse move for hover detection
        window.addEventListener('mousemove', (e) => {
            this.mousePos = { x: e.clientX, y: e.clientY };
        });

        // Handle module interaction (mounting/unmounting)
        window.addEventListener('keydown', (e) => {
            if (e.key === 'e' || e.key === 'E') {
                console.log('[Input] Module interaction key pressed');
                const event = new CustomEvent('moduleInteract', {
                    detail: {
                        type: 'toggle',  // Will handle both mount and unmount
                        timestamp: Date.now()
                    }
                });
                window.dispatchEvent(event);
            }
        });
    }

    getInput(playerPos, viewport) {
        // Check if player is mounted - if so, only return mouse position
        if (this.state?.playerState?.mountedModule) {
            return {
                forward: false,
                backward: false,
                strafeLeft: false,
                strafeRight: false,
                mousePos: this.getWorldMousePosition(playerPos, viewport)
            };
        }

        // Otherwise return normal movement input
        return {
            forward: this.keyStates.forward,
            backward: this.keyStates.backward,
            strafeLeft: this.keyStates.strafeLeft,
            strafeRight: this.keyStates.strafeRight,
            mousePos: this.getWorldMousePosition(playerPos, viewport)
        };
    }

    setState(state) {
        this.state = state;
    }

    getWorldMousePosition(playerPos, viewport) {
        if (!this.mousePos) return null;

        // Convert screen coordinates to world coordinates
        return {
            x: this.mousePos.x - viewport.center.x + playerPos.x,
            y: this.mousePos.y - viewport.center.y + playerPos.y
        };
    }

    cleanup() {
        this.keys.clear();
        this.mousePos = { x: 0, y: 0 };
    }
}
