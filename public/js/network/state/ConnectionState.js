export class ConnectionState {
    constructor() {
        this.stateLog = [];
        this.currentState = 'DISCONNECTED';
        this.listeners = new Set();
    }

    transition(newState, reason) {
        if (this.currentState === newState) return;

        const timestamp = new Date().toISOString();
        const transition = {
            timestamp,
            from: this.currentState,
            to: newState,
            reason
        };

        this.stateLog.push(transition);
        this.currentState = newState;

        console.log(`[ConnectionState] ${this.currentState} -> ${newState}: ${reason}`);
        this.notifyListeners(transition);
    }

    addListener(listener) {
        this.listeners.add(listener);
    }

    removeListener(listener) {
        this.listeners.delete(listener);
    }

    notifyListeners(transition) {
        this.listeners.forEach(listener => {
            try {
                listener(transition);
            } catch (error) {
                console.error('[ConnectionState] Listener error:', error);
            }
        });
    }

    getState() {
        return this.currentState;
    }

    getStateLog() {
        return [...this.stateLog];
    }
}
