export class InputManager {
    constructor() {
        this.pendingInputs = new Set();
        this.lastInputTime = 0;
        this.sequenceNumber = 0;
        this.inputs = new Map();
        this.keyStates = new Map();
        this.inputBuffer = [];
        this.maxBufferSize = 64;
        this.inputDelay = 50; // 50ms input delay for smoothing

        // Add input response tracking
        this.lastAcknowledgedInput = 0;
        
        // Add input prediction
        this.predictedState = {
            x: 0,
            y: 0,
            rotation: 0,
            velocity: { x: 0, y: 0 }
        };

        this.lastProcessedInput = 0;
        this.predictionState = null;

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
        this.pendingInputs.add(input);
        this.inputBuffer.push(input);

        // Keep buffer size in check
        while (this.inputBuffer.length > this.maxBufferSize) {
            this.inputBuffer.shift();
        }

        this.lastInputTime = now;
        return input;
    }

    clearInputsBefore(sequence) {
        this.pendingInputs.forEach((input) => {
            if (input.sequence <= sequence) {
                this.pendingInputs.delete(input);
            }
        });
    }

    getUnacknowledgedInputs() {
        return Array.from(this.pendingInputs)
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
        this.pendingInputs.clear();
        this.lastInputTime = 0;
        this.inputs.clear();
        this.keyStates.clear();
        this.inputBuffer = [];
        this.sequenceNumber = 0;
        this.lastAcknowledgedInput = 0;
    }

    cleanup() {
        window.removeEventListener('keydown', this.handleKeyChange);
        window.removeEventListener('keyup', this.handleKeyChange);
        this.reset();
        this.predictionState = null;
    }

    processServerUpdate(serverTime) {
        // Clear old inputs
        this.clearInputsBefore(serverTime);
        
        // Update timing info
        this.serverTime = serverTime;
        this.serverTimeOffset = performance.now() - serverTime;
        
        // Process any queued inputs that happened after server time
        this.pendingInputs.forEach((input) => {
            if (input.timestamp > serverTime) {
                // Keep this input for next prediction
                this.predictedState = this.applyInputToState(
                    this.predictedState,
                    input
                );
            } else {
                // Input is old, we can remove it
                this.pendingInputs.delete(input);
            }
        });

        // Process server reconciliation
        // ... existing code ...
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

    addInput(input) {
        input.sequence = this.sequenceNumber++;
        input.timestamp = Date.now();
        this.pendingInputs.add(input);
        this.lastInputTime = input.timestamp;
    }

    getPendingInputs() {
        return Array.from(this.pendingInputs);
    }
}
