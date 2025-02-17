export class ConnectionState {
    constructor() {
        this.current = 'DISCONNECTED';
        this.listeners = new Set();
    }

    transition(newState, reason) {
        const oldState = this.current;
        this.current = newState;
        
        this.notifyListeners({
            from: oldState,
            to: newState,
            reason
        });
    }

    addListener(callback) {
        this.listeners.add(callback);
    }

    removeListener(callback) {
        this.listeners.delete(callback);
    }

    notifyListeners(event) {
        this.listeners.forEach(callback => callback(event));
    }
}
