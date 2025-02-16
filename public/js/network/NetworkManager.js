import { WebSocketFrame } from './WebSocketFrame.js';
import { MessageTypes } from './protocol/MessageTypes.js';

export class NetworkManager {
    constructor() {
        this.socket = null;
        this.messageHandlers = new Map();
        this.connected = false;
        this.pendingMessages = [];
    }

    connect(url) {
        return new Promise((resolve, reject) => {
            try {
                this.socket = new WebSocket(url);
                this.socket.binaryType = 'arraybuffer';

                this.socket.onopen = () => {
                    this.connected = true;
                    resolve();
                };

                this.socket.onmessage = this.handleMessage.bind(this);
                this.socket.onerror = reject;
                this.socket.onclose = this.handleClose.bind(this);
            } catch (error) {
                reject(error);
            }
        });
    }

    send(data) {
        if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
            this.pendingMessages.push(data);
            return false;
        }
        
        const frame = WebSocketFrame.createBinaryFrame(data);
        this.socket.send(frame);
        return true;
    }

    addMessageHandler(type, handler) {
        if (!this.messageHandlers.has(type)) {
            this.messageHandlers.set(type, new Set());
        }
        this.messageHandlers.get(type).add(handler);
    }

    removeMessageHandler(type, handler) {
        if (this.messageHandlers.has(type)) {
            this.messageHandlers.get(type).delete(handler);
        }
    }

    handleMessage(event) {
        if (!(event.data instanceof ArrayBuffer)) return;

        const view = new DataView(event.data);
        const msgType = view.getUint8(0);

        const handlers = this.messageHandlers.get(msgType);
        if (handlers) {
            handlers.forEach(handler => handler(event.data));
        }
    }

    handleClose() {
        this.connected = false;
        this.socket = null;
    }

    cleanup() {
        if (this.socket) {
            this.socket.close();
            this.socket = null;
        }
        this.messageHandlers.clear();
        this.pendingMessages = [];
    }
}
