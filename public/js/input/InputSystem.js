export class InputSystem {
    constructor() {
        this.keys = new Map();  // Changed from Set to Map
        this.mousePos = { x: 0, y: 0 };
        this.worldMousePos = { x: 0, y: 0 };
        this.debugKeyPressed = false;
        this.lastJumpTime = 0;
        this.jumpCooldown = 500; // ms between jumps
        this.setupListeners();
    }

    setupListeners() {
        window.addEventListener('keydown', (e) => {
            this.keys.set(e.code, true);  // Use set instead of add
            
            // Toggle debug draw on 'T' press
            if (e.code === 'KeyT' && !this.debugKeyPressed) {
                this.debugKeyPressed = true;
                window.dispatchEvent(new CustomEvent('toggleDebugDraw'));
            }

            if (e.code === 'Space') {
                const now = Date.now();
                const cooldownLeft = this.jumpCooldown - (now - this.lastJumpTime);
                console.log('[Input] Space pressed:', {
                    time: new Date(now).toLocaleTimeString(),
                    cooldown: cooldownLeft > 0 ? `${(cooldownLeft/1000).toFixed(1)}s` : 'READY'
                });
                
                if (now - this.lastJumpTime >= this.jumpCooldown) {
                    this.lastJumpTime = now;
                    window.dispatchEvent(new CustomEvent('playerJump'));
                }
            }
        });

        window.addEventListener('keyup', (e) => {
            this.keys.set(e.code, false);  // Set false instead of delete
            if (e.code === 'KeyT') {
                this.debugKeyPressed = false;
            }
        });

        window.addEventListener('mousemove', (e) => {
            this.mousePos.x = e.clientX;
            this.mousePos.y = e.clientY;
            // worldMousePos is updated in getInput when we have the camera position
        });
    }

    getInput(playerPos, viewport) {
        // Convert mouse position to world coordinates
        const worldMousePos = this.getWorldMousePosition(playerPos, viewport);
        
        return {
            mousePos: worldMousePos,
            forward: this.keys.get('KeyW') || false,
            backward: this.keys.get('KeyS') || false,
            strafeLeft: this.keys.get('KeyA') || false,
            strafeRight: this.keys.get('KeyD') || false
        };
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
