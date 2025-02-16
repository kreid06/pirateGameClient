export class InputManager {
    constructor() {
        this.inputs = new Map();
        this.keyStates = new Map();
        this.sequenceNumber = 0;
        this.lastInputTime = performance.now();
        this.inputBuffer = [];
        this.maxBufferSize = 64;
        this.inputDelay = 50; // 50ms input delay for smoothing

        // Add input response tracking
        this.pendingInputs = new Map();
        this.lastAcknowledgedInput = 0;
        
        // Add input prediction
        this.predictedState = {
            x: 0,
            y: 0,
            rotation: 0,
            velocity: { x: 0, y: 0 }
        };

        this.setupKeyHandlers();
    }

    setupKeyHandlers() {
        window.addEventListener('keydown', (e) => this.handleKeyChange(e.code, true));
        window.addEventListener('keyup', (e) => this.handleKeyChange(e.code, false));
    }

    handleKeyChange(key, isDown) {
        // Only track movement and action keys
        if (this.isValidGameKey(key)) {
            this.keyStates.set(key, isDown);
            this.processInput();
        }
    }

    isValidGameKey(key) {
        return [
            'KeyW', 'KeyS', 'KeyA', 'KeyD',
            'KeyE', 'KeyQ', 'Space',
            'ShiftLeft', 'ControlLeft'
        ].includes(key);
    }

    processInput() {
        const now = performance.now();
        if (now - this.lastInputTime < this.inputDelay) return;

        const input = {
            sequence: this.sequenceNumber++,
            timestamp: now,
            keys: Object.fromEntries(this.keyStates),
            dt: now - this.lastInputTime
        };

        // Store input for prediction
        this.pendingInputs.set(input.sequence, input);
        this.inputBuffer.push(input);

        // Keep buffer size in check
        while (this.inputBuffer.length > this.maxBufferSize) {
            this.inputBuffer.shift();
        }

        this.lastInputTime = now;
        return input;
    }

    clearInputsBefore(sequence) {
        this.pendingInputs.forEach((input, seq) => {
            if (seq <= sequence) {
                this.pendingInputs.delete(seq);
            }
        });
    }

    getUnacknowledgedInputs() {
        return Array.from(this.pendingInputs.values())
            .filter(input => input.sequence > this.lastAcknowledgedInput)
            .sort((a, b) => a.sequence - b.sequence);
    }

    acknowledgeInput(sequence) {
        this.lastAcknowledgedInput = sequence;
        this.clearInputsBefore(sequence);
    }

    getPredictedState() {
        return { ...this.predictedState };
    }

    updatePredictedState(state) {
        this.predictedState = { ...state };
    }

    getCurrentKeys() {
        return Object.fromEntries(this.keyStates);
    }

    reset() {
        this.inputs.clear();
        this.keyStates.clear();
        this.pendingInputs.clear();
        this.inputBuffer = [];
        this.sequenceNumber = 0;
        this.lastInputTime = performance.now();
        this.lastAcknowledgedInput = 0;
    }

    cleanup() {
        window.removeEventListener('keydown', this.handleKeyChange);
        window.removeEventListener('keyup', this.handleKeyChange);
        this.reset();
    }

    processServerUpdate(serverTime) {
        // Clear old inputs
        this.clearInputsBefore(serverTime);
        
        // Update timing info
        this.serverTime = serverTime;
        this.serverTimeOffset = performance.now() - serverTime;
        
        // Process any queued inputs that happened after server time
        this.pendingInputs.forEach((input, sequence) => {
            if (input.timestamp > serverTime) {
                // Keep this input for next prediction
                this.predictedState = this.applyInputToState(
                    this.predictedState,
                    input
                );
            } else {
                // Input is old, we can remove it
                this.pendingInputs.delete(sequence);
            }
        });
    }

    applyInputToState(state, input) {
        const newState = { ...state };
        const speed = 0.1; // Adjust as needed
        
        if (input.keys['KeyW']) newState.y -= speed * input.dt;
        if (input.keys['KeyS']) newState.y += speed * input.dt;
        if (input.keys['KeyA']) newState.x -= speed * input.dt;
        if (input.keys['KeyD']) newState.x += speed * input.dt;
        
        return newState;
    }
}
