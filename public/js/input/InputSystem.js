export class InputSystem {
    constructor() {
        this.keys = new Set();
        this.mousePos = { x: 0, y: 0 };
        this.worldMousePos = { x: 0, y: 0 };
        this.setupListeners();
    }

    setupListeners() {
        window.addEventListener('keydown', (e) => {
            this.keys.add(e.code);
        });

        window.addEventListener('keyup', (e) => {
            this.keys.delete(e.code);
        });

        window.addEventListener('mousemove', (e) => {
            this.mousePos.x = e.clientX;
            this.mousePos.y = e.clientY;
            // worldMousePos is updated in getInput when we have the camera position
        });
    }

    getInput(cameraPos, viewport) {
        // Convert screen mouse position to world coordinates
        if (viewport && cameraPos) {
            this.worldMousePos.x = this.mousePos.x - viewport.width/2 + cameraPos.x;
            this.worldMousePos.y = this.mousePos.y - viewport.height/2 + cameraPos.y;
        }

        return {
            forward: this.keys.has('KeyW'),
            backward: this.keys.has('KeyS'),
            strafeLeft: this.keys.has('KeyA'),
            strafeRight: this.keys.has('KeyD'),
            mousePos: { ...this.worldMousePos },
            timestamp: Date.now()
        };
    }

    cleanup() {
        this.keys.clear();
    }
}
