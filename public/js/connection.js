//connection.js

class WebSocketFrame {
    static createBinaryFrame(data) {
        const payload = new Uint8Array(data);
        const payloadLength = payload.length;
        
        // Determine frame size based on payload length
        let frameSize = 0;
        let offset = 2; // Basic header size
        
        if (payloadLength < 126) {
            frameSize = payloadLength + 6; // Header(2) + Mask(4) + Payload
        } else if (payloadLength < 65536) {
            frameSize = payloadLength + 8; // Header(2) + Length(2) + Mask(4) + Payload
            offset = 4;
        } else {
            frameSize = payloadLength + 14; // Header(2) + Length(8) + Mask(4) + Payload
            offset = 10;
        }
        
        const frame = new Uint8Array(frameSize);
        const mask = new Uint8Array(4);
        crypto.getRandomValues(mask);
        
        // Set header
        frame[0] = 0x82; // Binary frame (0x02) with FIN bit (0x80)
        
        // Set length
        if (payloadLength < 126) {
            frame[1] = 0x80 | payloadLength;
        } else if (payloadLength < 65536) {
            frame[1] = 0x80 | 126;
            frame[2] = (payloadLength >> 8) & 0xFF;
            frame[3] = payloadLength & 0xFF;
        } else {
            frame[1] = 0x80 | 127;
            const lengthBytes = new DataView(new ArrayBuffer(8));
            lengthBytes.setBigUint64(0, BigInt(payloadLength));
            frame.set(new Uint8Array(lengthBytes.buffer), 2);
        }
        
        // Add mask
        frame.set(mask, offset);
        
        // Add masked payload
        for (let i = 0; i < payloadLength; i++) {
            frame[offset + 4 + i] = payload[i] ^ mask[i % 4];
        }
        
        return frame.buffer;
    }
}

class Island {
    constructor(x, y, radius) {
        this.x = x;
        this.y = y;
        this.radius = radius;
    }

    draw(ctx) {
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fillStyle = '#7B5B3B';  // Brown color for islands
        ctx.fill();
        ctx.strokeStyle = '#5A4229';  // Darker brown for border
        ctx.lineWidth = 2;
        ctx.stroke();
    }
}

export class MovementData {
    static GRID_SIZE = 250;
    static MAX_GRID_POS = Number.MAX_SAFE_INTEGER;
    static MIN_GRID_POS = Number.MIN_SAFE_INTEGER;
    static VIEW_CENTER = {
        x: window.innerWidth / 2,
        y: window.innerHeight / 2
    };
    static SEND_RATE = 100; // 10 messages per second (every 100ms)
    static lastSendTime = 0;
    static sentCount = 0;
    static islands = [];
    
    constructor(x, y, z, rotation, playerId) {
        // Validate world position
        this.worldX = this.validateNumber(x);
        this.worldY = this.validateNumber(y);
        this.z = this.validateNumber(z);
        this.rotation = this.validateNumber(rotation);
        this.playerId = Math.floor(this.validateNumber(playerId));

        const now = Date.now();
        if (now - MovementData.lastSendTime >= MovementData.SEND_RATE) {
            MovementData.lastSendTime = now;
            MovementData.sentCount++;
        }

        // Calculate screen transform
        this.screenX = MovementData.VIEW_CENTER.x;
        this.screenY = MovementData.VIEW_CENTER.y;
        this.worldOffsetX = -this.worldX;
        this.worldOffsetY = -this.worldY;
    }

    // Add new method to draw coordinates
    drawCoordinates(ctx) {
        if (!ctx) return;
        
        // Save current transform
        ctx.save();
        
        // Reset transform for UI elements
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        
        // Draw coordinate text
        ctx.font = '14px Arial';
        ctx.fillStyle = '#000000';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        
        const text = `X: ${Math.round(this.worldX)} Y: ${Math.round(this.worldY)}`;
        ctx.fillText(text, 10, 10);
        
        // Restore transform
        ctx.restore();
    }
    
    applyTransform(ctx) {
        ctx.save();
        // Center view on screen
        ctx.translate(MovementData.VIEW_CENTER.x, MovementData.VIEW_CENTER.y);
        // Move world opposite to player movement
        ctx.translate(this.worldOffsetX, this.worldOffsetY);
    }

    restoreTransform(ctx) {
        ctx.restore();
    }

    validateNumber(value) {
        // Check type
        if (typeof value !== 'number') {
            console.warn('[MovementData] Invalid type:', typeof value);
            return 0;
        }
        
        // Check for NaN/Infinity
        if (!Number.isFinite(value)) {
            console.warn('[MovementData] Non-finite value:', value);
            return 0;
        }
        
        // Clamp to valid range
        return Math.min(Math.max(value, MovementData.MIN_GRID_POS), MovementData.MAX_GRID_POS);
    }

    snapToGrid(value) {
        return Math.round(value / MovementData.GRID_SIZE) * MovementData.GRID_SIZE;
    }

    toBuffer() {
        const buffer = new ArrayBuffer(20);
        const view = new DataView(buffer);
        
        view.setFloat32(0, this.worldX, true);
        view.setFloat32(4, this.worldY, true);
        view.setFloat32(8, this.z, true);
        view.setFloat32(12, this.rotation, true);
        view.setInt32(16, this.playerId, true);

        return buffer;
    }

    drawGrid(ctx) {
        if (!ctx) return;

        try {
            // No need to use applyTransform here as it's called from the game render
            ctx.strokeStyle = '#000000';
            ctx.lineWidth = 0.5;
            ctx.globalAlpha = 0.3;
            
            const gridSize = MovementData.GRID_SIZE;
            const viewWidth = window.innerWidth;
            const viewHeight = window.innerHeight;
            
            // Calculate grid boundaries based on view and current position
            const leftBound = Math.floor((this.worldX - viewWidth) / gridSize) * gridSize;
            const rightBound = Math.ceil((this.worldX + viewWidth) / gridSize) * gridSize;
            const topBound = Math.floor((this.worldY - viewHeight) / gridSize) * gridSize;
            const bottomBound = Math.ceil((this.worldY + viewHeight) / gridSize) * gridSize;
            
            // Draw vertical lines
            for (let x = leftBound; x <= rightBound; x += gridSize) {
                ctx.beginPath();
                ctx.moveTo(x, topBound);
                ctx.lineTo(x, bottomBound);
                ctx.stroke();
            }
            
            // Draw horizontal lines
            for (let y = topBound; y <= bottomBound; y += gridSize) {
                ctx.beginPath();
                ctx.moveTo(leftBound, y);
                ctx.lineTo(rightBound, y);
                ctx.stroke();
            }
            
            ctx.globalAlpha = 1.0;
        } catch (error) {
            console.error('[Grid] Drawing error:', error);
        }
    }

    static parseIslandData(buffer) {
        const view = new DataView(buffer);
        const messageType = view.getUint8(0);
        const islandCount = view.getInt32(1, true);
        const islands = [];
        
        console.log('[Islands] Starting to parse', islandCount, 'islands');
        
        let offset = 5;  // Skip message type and count
        for (let i = 0; i < islandCount; i++) {
            const x = view.getFloat32(offset, true);
            const y = view.getFloat32(offset + 4, true);
            const radius = view.getFloat32(offset + 8, true);
            const island = new Island(x, y, radius);
            islands.push(island);
            
            console.log(`[Islands] Created island ${i + 1}/${islandCount}:`, {
                x: x.toFixed(2),
                y: y.toFixed(2),
                radius: radius.toFixed(2)
            });
            
            offset += 12;  // Each island is 12 bytes (3 floats)
        }
        
        MovementData.islands = islands;
        console.log('[Islands] Finished parsing all islands');
    }
    
    drawIslands(ctx) {
        if (!ctx) return;
        
        try {
            this.applyTransform(ctx);
            MovementData.islands.forEach(island => island.draw(ctx));
            this.restoreTransform(ctx);
        } catch (error) {
            console.error('[Islands] Drawing error:', error);
        }
    }
}

export class WebRTCConnection {
    constructor(playerId) {
        this.playerId = playerId;
        this.peerConnection = new RTCPeerConnection({
            iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
        });
        this.signaling = new WebSocket('ws://192.168.8.3:8080');
        this.setupSignalingHandlers();
        this.setupPeerConnection();
    }

    setupSignalingHandlers() {
        this.signaling.onopen = async () => {
            console.log('[WebRTC] Signaling connected');
            const offer = await this.peerConnection.createOffer();
            await this.peerConnection.setLocalDescription(offer);
            const offerMessage = JSON.stringify({
                type: 'offer',
                sdp: offer
            });
            console.log('[WebRTC] Sending offer');
            this.signaling.send(offerMessage);
        };

        this.signaling.onmessage = async (event) => {
            try {
                let messageData;
                if (event.data instanceof Blob) {
                    messageData = await new Response(event.data).text();
                } else {
                    messageData = event.data;
                }
                
                console.log('[WebRTC] Received message:', messageData);
                
                const message = JSON.parse(messageData);
                
                if (message.type === 'answer') {
                    await this.peerConnection.setRemoteDescription(new RTCSessionDescription(message));
                    console.log('[WebRTC] Remote description set');
                } else if (message.candidate) {
                    await this.peerConnection.addIceCandidate(new RTCIceCandidate(message));
                    console.log('[WebRTC] ICE candidate added');
                }
            } catch (error) {
                console.error('[WebRTC] Message handling error:', error);
            }
        };
    }

    async handleSignalingMessage(data) {
        try {
            const message = JSON.parse(data);
            console.log('[WebRTC] Parsed message:', message);

            if (message.type === 'answer') {
                await this.peerConnection.setRemoteDescription(new RTCSessionDescription(message));
                console.log('[WebRTC] Remote description set');
            } else if (message.candidate) {
                await this.peerConnection.addIceCandidate(new RTCIceCandidate(message));
                console.log('[WebRTC] ICE candidate added');
            }
        } catch (error) {
            console.error('[WebRTC] Message handling error:', error);
            console.log('[WebRTC] Raw message:', data);
        }
    }

    setupPeerConnection() {
        this.peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                this.signaling.send(JSON.stringify(event.candidate));
            }
        };

        this.movementChannel = this.peerConnection.createDataChannel('movement', {
            ordered: false,
            maxRetransmits: 0
        });

        this.movementChannel.onopen = () => {
            console.log('[WebRTC] Movement channel opened - Ready for data');
            this.isConnected = true;
            this.sendPendingMovements();
        };

        this.peerConnection.ondatachannel = (event) => {
            console.log('[WebRTC] Received remote data channel');
            const channel = event.channel;
            channel.onmessage = (e) => console.log('[WebRTC] Received:', e.data);
        };
    }

    sendMovementData(data) {
        if (!this.isConnected) {
            this.pendingMovements.push(data);
            console.log('[WebRTC] Movement queued, waiting for connection');
            return;
        }

        try {
            const buffer = data.toBuffer();
            this.movementChannel.send(buffer);
            console.log('[WebRTC] Movement sent:', data);
        } catch (error) {
            console.error('[WebRTC] Send failed:', error);
            this.pendingMovements.push(data);
        }
    }

    sendPendingMovements() {
        while (this.pendingMovements.length > 0) {
            const data = this.pendingMovements.shift();
            this.sendMovementData(data);
        }
    }
}

export class UDPConnection {
    static MSG_TYPE_READY = 0;
    static MSG_TYPE_ISLANDS = 1;
    static MSG_TYPE_SHIP = 2;  // Add ship message type
    static MSG_TYPE_SAILS = 3;
    static MSG_TYPE_CANNONS = 4;
    static MSG_TYPE_STEERING = 5;
    static MSG_TYPE_MOUNT_REQUEST = 6;
    static MSG_TYPE_MOUNT_RESPONSE = 7;
    static MSG_TYPE_CONTROL_INPUT = 8;
    static MSG_TYPE_FIRE_CANNON = 9;
    static MSG_TYPE_SELF_POSITION = 10;
    static MSG_TYPE_OTHER_POSITION = 11;
    static MSG_TYPE_MOVEMENT = 12;  // Add new message type for client movement
    static MSG_TYPE_DISCONNECT = 13; // Add new message type for client disconnection
    static MSG_TYPE_KEEPALIVE = 14; // Add new keepalive message type

    constructor(playerId) {
        this.playerId = playerId;
        this.connected = false;
        this.serverReady = false;
        this.lastSentTime = 0;
        this.messageCount = 0;
        this.initSocket();
        this.onIslandsReceived = null; // Callback for when islands are received
        this.onShipReceived = null; // Add callback for ship data
        this.onSailsReceived = null;
        this.onCannonsReceived = null;
        this.onSteeringReceived = null;
        this.onSelfPositionReceived = null;
        this.onOtherPositionsReceived = null;
        this.onDisconnectionReceived = null; // Add callback for disconnection

        // Add rotation smoothing properties
        this.lastRotation = 0;
        this.targetRotation = 0;
        this.rotationLerpFactor = 0.3; // Adjust this value to control smoothing (0.1 to 0.3 recommended)
        this.rotationThreshold = 0.1; // Minimum rotation change to send

        this.maxRetries = 5; // Add max retries limit
        this.retryAttempts = 0;
        this.connectionTimeout = null;

        // Add keepalive properties
        this.lastKeepaliveTime = Date.now();
        this.keepaliveInterval = 2000; // 2 seconds
        this.clientTimeout = 10000;    // 10 seconds timeout
        this.setupKeepaliveTimer();

        // Add network timing properties
        this.pingHistory = [];
        this.maxPingHistory = 10;
        this.averagePing = 0;
        this.minPing = Infinity;
        this.maxPing = 0;
        this.lastPingTime = 0;
        this.pingInterval = 1000; // Check ping every second
        this.setupPingChecks();
    }

    setupKeepaliveTimer() {
        // Clear any existing timer
        if (this.keepaliveTimer) {
            clearInterval(this.keepaliveTimer);
        }

        // Set up keepalive timer
        this.keepaliveTimer = setInterval(() => {
            const now = Date.now();
            if (now - this.lastKeepaliveTime > this.keepaliveInterval * 2) {
                console.warn('[UDP] No keepalive received, connection may be stale');
                this.retryConnection();
            }
        }, this.keepaliveInterval);
    }

    handleKeepalive(data) {
        try {
            const now = performance.now();
            this.lastKeepaliveTime = now;
            
            // Send response immediately
            const response = new ArrayBuffer(5);
            const view = new DataView(response);
            view.setUint8(0, UDPConnection.MSG_TYPE_KEEPALIVE);
            view.setFloat32(1, now, true);

            if (this.socket && this.socket.readyState === WebSocket.OPEN) {
                this.socket.send(response);
            }
        } catch (error) {
            console.error('[UDP] Keepalive error:', error);
        }
    }

    updatePingStats(ping) {
        this.pingHistory.push(ping);
        while (this.pingHistory.length > this.maxPingHistory) {
            this.pingHistory.shift();
        }

        this.averagePing = this.pingHistory.reduce((a, b) => a + b, 0) / this.pingHistory.length;
        this.minPing = Math.min(...this.pingHistory);
        this.maxPing = Math.max(...this.pingHistory);

        console.log('[UDP] Network stats:', {
            current: Math.round(ping),
            avg: Math.round(this.averagePing),
            min: Math.round(this.minPing),
            max: Math.round(this.maxPing),
            jitter: Math.round(this.maxPing - this.minPing)
        });
    }

    getRecommendedDelay() {
        if (this.pingHistory.length === 0) return 100; // Default delay

        const jitter = this.maxPing - this.minPing;
        const baseDelay = this.averagePing * 1.5; // 1.5x average ping
        const jitterBuffer = jitter * 2; // Add 2x jitter protection

        return Math.min(Math.max(baseDelay + jitterBuffer, 50), 300); // Clamp between 50-300ms
    }

    updateInterpolationDelay() {
        const recommendedDelay = this.getRecommendedDelay();
        if (this.onNetworkStatsUpdate) {
            this.onNetworkStatsUpdate({
                averagePing: this.averagePing,
                jitter: this.maxPing - this.minPing,
                recommendedDelay
            });
        }
    }

    setupPingChecks() {
        setInterval(() => {
            if (this.socket?.readyState === WebSocket.OPEN) {
                this.lastPingTime = performance.now();
                const pingBuffer = new ArrayBuffer(5);
                const view = new DataView(pingBuffer);
                view.setUint8(0, UDPConnection.MSG_TYPE_KEEPALIVE);
                view.setFloat32(1, this.lastPingTime, true);
                this.socket.send(pingBuffer);
            }
        }, this.pingInterval);
    }

    initSocket() {
        try {
            if (this.socket) {
                this.socket.onclose = null; // Remove old handler
                this.socket.onerror = null;
                if (this.socket.readyState !== WebSocket.CLOSED) {
                    this.socket.close();
                }
            }

            console.log('[UDP] Initializing socket connection...');
            this.socket = new WebSocket('ws://192.168.8.3:8080');
            this.socket.binaryType = 'arraybuffer';
            
            // Add connection timeout
            if (this.connectionTimeout) {
                clearTimeout(this.connectionTimeout);
            }
            
            this.connectionTimeout = setTimeout(() => {
                if (!this.connected) {
                    console.log('[UDP] Connection timeout, retrying...');
                    this.retryConnection();
                }
            }, 5000);
            
            // Monitor connection state
            this.socket.onopen = () => {
                console.log('[UDP] Socket opened, sending handshake');
                clearTimeout(this.connectionTimeout);
                this.retryAttempts = 0;
                this.connected = true;
                this.socket.send(JSON.stringify({
                    type: 'handshake',
                    playerId: this.playerId
                }));
            };

            this.socket.onclose = (event) => {
                console.log('[UDP] Socket closed:', event.code, event.reason);
                this.connected = false;
                this.serverReady = false;
                clearTimeout(this.connectionTimeout);
                if (this.retryAttempts < this.maxRetries) {
                    this.retryConnection();
                }
            };

            this.socket.onerror = (error) => {
                console.error('[UDP] Socket error:', error);
                if (this.socket.readyState === WebSocket.CLOSED) {
                    this.connected = false;
                    this.serverReady = false;
                    clearTimeout(this.connectionTimeout);
                    if (this.retryAttempts < this.maxRetries) {
                        this.retryConnection();
                    }
                }
            };

            this.socket.onmessage = (event) => {
                if (typeof event.data === 'string' && event.data.includes('handshake')) {
                    console.log('[UDP] Handshake received');
                    this.connected = true;
                    this.serverReady = true;
                    return;
                }

                if (event.data instanceof ArrayBuffer) {
                    const view = new DataView(event.data);
                    const messageType = view.getUint8(0);
                    // console.log(messageType);
                    
                    switch(messageType) {
                        case UDPConnection.MSG_TYPE_READY:
                            this.connected = true;
                            this.serverReady = true;
                            this.retryAttempts = 0;
                            console.log('[UDP] Connection established');
                            break;
                            
                        case UDPConnection.MSG_TYPE_ISLANDS:
                            const islands = this.parseIslandData(event.data);
                            if (this.onIslandsReceived) {
                                this.onIslandsReceived(islands);
                            }
                            break;
                            
                        case UDPConnection.MSG_TYPE_SHIP:
                            const shipData = this.parseShipData(event.data);
                            if (this.onShipReceived) {
                                this.onShipReceived(shipData);
                            }
                            break;

                        case UDPConnection.MSG_TYPE_SAILS:
                            const sailsData = this.parseSailsData(event.data);
                            if (this.onSailsReceived) {
                                this.onSailsReceived(sailsData);
                            }
                            break;

                        case UDPConnection.MSG_TYPE_CANNONS:
                            const cannonsData = this.parseCannonsData(event.data);
                            if (this.onCannonsReceived) {
                                this.onCannonsReceived(cannonsData);
                            }
                            break;

                        case UDPConnection.MSG_TYPE_STEERING:
                            const steeringData = this.parseSteeringData(event.data);
                            if (this.onSteeringReceived) {
                                this.onSteeringReceived(steeringData);
                            }
                            break;

                        case UDPConnection.MSG_TYPE_MOUNT_RESPONSE:
                            const success = view.getInt32(1, true);
                            const moduleId = view.getInt32(5, true);
                            console.log('[UDP] Mount response:', { success, moduleId });
                            if (this.onMountResponse) {
                                this.onMountResponse(success === 1, moduleId);
                            }
                            break;

                        case UDPConnection.MSG_TYPE_SELF_POSITION:
                            const selfPos = this.parseSelfPosition(event.data);
                            if (this.onSelfPositionReceived) {
                                this.onSelfPositionReceived(selfPos);
                            }
                            break;

                        case UDPConnection.MSG_TYPE_OTHER_POSITION:
                            const otherPositions = this.parseOtherPositions(event.data);
                            if (this.onOtherPositionsReceived) {
                                this.onOtherPositionsReceived(otherPositions);
                            }
                            break;

                        case UDPConnection.MSG_TYPE_DISCONNECT:
                            if (this.onDisconnectionReceived) {
                                this.onDisconnectionReceived();
                            }
                            break;

                        case UDPConnection.MSG_TYPE_KEEPALIVE:
                            this.handleKeepalive(event.data);
                            break;

                        default:
                            console.warn('[UDP] Unknown message type:', messageType);
                    }
                }
            };

        } catch (error) {
            console.error('[UDP] Connection failed:', error);
            this.retryConnection();
        }
    }

    setupSocket() {
        try {
            // Use correct WebSocket upgrade headers
            const wsUrl = 'ws://192.168.8.3:8080';
            this.socket = new WebSocket(wsUrl);
            this.socket.binaryType = 'arraybuffer';
            
            // Add custom headers through URL params
            const headers = {
                'Upgrade': 'websocket',
                'Connection': 'Upgrade',
                'Sec-WebSocket-Version': '13',
                'Sec-WebSocket-Protocol': 'binary'
            };

            this.setupSocketHandlers();
            console.log('[UDP] Attempting connection with headers:', headers);
        } catch (error) {
            console.error('[UDP] Socket creation failed:', error);
            this.retryConnection();
        }
    }

    setupSocketHandlers() {
        this.socket.onopen = () => {
            console.log('[UDP] WebSocket connected, sending handshake');
            const handshake = {
                type: 'handshake',
                playerId: this.playerId,
                protocol: 'binary'
            };
            this.socket.send(JSON.stringify(handshake));
        };

        this.socket.onmessage = (event) => {
            console.log('[UDP] Raw message received:', event.data);
            if (event.data === 'READY') {
                console.log('[UDP] Server acknowledged connection');
                this.connected = true;
                this.serverReady = true;
            }
        };

        this.socket.onerror = (error) => {
            console.error('[UDP] WebSocket error:', error);
            this.connected = false;
            this.serverReady = false;
        };

        this.socket.onclose = (event) => {
            console.log('[UDP] Connection closed:', event.code, event.reason);
            this.connected = false;
            this.serverReady = false;
            this.retryConnection();
        };
    }

    retryConnection() {
        this.cleanup();
        if (this.retryAttempts >= this.maxRetries) {
            console.error('[UDP] Max retry attempts reached');
            return;
        }

        const delay = Math.min(1000 * Math.pow(2, this.retryAttempts), 5000);
        console.log(`[UDP] Retrying connection ${this.retryAttempts + 1}/${this.maxRetries} in ${delay}ms`);
        this.retryAttempts++;
        
        setTimeout(() => this.initSocket(), delay);
    }

    cleanup() {
        if (this.keepaliveTimer) {
            clearInterval(this.keepaliveTimer);
            this.keepaliveTimer = null;
        }
        // Add any other cleanup needed
    }

    sendMovementData(x, y, rotation, timestamp) {
        if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
            console.warn('[UDP] Socket not ready, queuing movement data');
            // Optional: Store movement data to send when connection is restored
            return;
        }

        if (!this.connected || !this.serverReady) {
            console.warn('[UDP] Not connected or server not ready, state:', {
                connected: this.connected,
                serverReady: this.serverReady,
                socketState: this.socket.readyState
            });
            return;
        }

        const now = Date.now();
        if (now - this.lastSentTime >= MovementData.SEND_RATE) {
            try {
                const buffer = new ArrayBuffer(17);
                const view = new DataView(buffer);
                
                view.setUint8(0, UDPConnection.MSG_TYPE_MOVEMENT);
                view.setFloat32(1, x, true);
                view.setFloat32(5, y, true);
                view.setFloat32(9, rotation, true);
                view.setFloat32(13, timestamp || now, true);

                this.socket.send(buffer);
                this.lastSentTime = now;
            } catch (error) {
                console.error('[UDP] Send failed:', error);
            }
        }
    }

    createMovementBuffer(movement) {
        const buffer = new ArrayBuffer(20);
        const view = new DataView(buffer);
        
        view.setFloat32(0, movement.x, true);
        view.setFloat32(4, movement.y, true);
        view.setFloat32(8, movement.z, true);
        view.setFloat32(12, movement.rotation, true);
        view.setInt32(16, movement.playerId, true);
        
        return buffer;
    }

    parseIslandData(buffer) {
        const view = new DataView(buffer);
        const islandCount = view.getInt32(1, true); // Skip message type byte
        const islands = [];
        
        let offset = 5; // Skip message type and count
        for (let i = 0; i < islandCount; i++) {
            const island = {
                x: view.getFloat32(offset, true),
                y: view.getFloat32(offset + 4, true),
                radius: view.getFloat32(offset + 8, true)
            };
            islands.push(island);
            offset += 12; // Each island is 12 bytes (3 float32s)
        }
        
        return islands;
    }

    parseShipData(buffer) {
        const view = new DataView(buffer);
        const messageType = view.getUint8(0); // First byte is message type
        
        // Parse ship_data_t structure starting from byte 1
        const shipData = {
            x: view.getFloat32(1, true),          // 4 bytes
            y: view.getFloat32(5, true),          // 4 bytes
            rotation: view.getFloat32(9, true),    // 4 bytes
            sailCount: view.getInt32(13, true),    // 4 bytes
            cannonCount: view.getInt32(17, true)   // 4 bytes
        };

        console.log('[UDP] Received ship data:', {
            messageType,
            x: shipData.x.toFixed(2),
            y: shipData.y.toFixed(2),
            rotation: shipData.rotation.toFixed(2),
            sails: shipData.sailCount,
            cannons: shipData.cannonCount
        });

        return shipData;
    }

    parseSailsData(buffer) {
        const view = new DataView(buffer);
        const count = view.getInt32(1, true);
        const sails = [];
        let offset = 5; // Skip type and count

        for (let i = 0; i < count; i++) {
            const sail = {
                id: view.getInt32(offset, true),
                x: view.getFloat32(offset + 4, true),
                y: view.getFloat32(offset + 8, true),
                rotation: view.getFloat32(offset + 12, true),
                efficiency: view.getFloat32(offset + 16, true),
                attachedToShipId: view.getInt32(offset + 20, true),
                bindX: view.getFloat32(offset + 24, true),
                bindY: view.getFloat32(offset + 28, true)
            };
            sails.push(sail);
            offset += 32; // Each sail is 32 bytes
        }

        return sails;
    }

    parseCannonsData(buffer) {
        const view = new DataView(buffer);
        const count = view.getInt32(1, true);
        const cannons = [];
        let offset = 5; // Skip type and count

        console.log('[UDP] Parsing', count, 'cannons');
        for (let i = 0; i < count; i++) {
            const cannon = {
                id: view.getInt32(offset, true),
                x: view.getFloat32(offset + 4, true),
                y: view.getFloat32(offset + 8, true),
                rotation: view.getFloat32(offset + 12, true),
                efficiency: view.getFloat32(offset + 16, true),
                attachedToShipId: view.getInt32(offset + 20, true),
                bindX: view.getFloat32(offset + 24, true),
                bindY: view.getFloat32(offset + 28, true)
            };
            console.log(`[UDP] Cannon ${i + 1}/${count}:`, {
                id: cannon.id,
                rotation: cannon.rotation.toFixed(2),
                bindPos: `(${cannon.bindX.toFixed(2)}, ${cannon.bindY.toFixed(2)})`,
                raw: new Uint8Array(buffer.slice(offset + 12, offset + 16))
            });
            cannons.push(cannon);
            offset += 32;
        }

        return cannons;
    }

    parseSteeringData(buffer) {
        const view = new DataView(buffer);
        const steering = {
            id: view.getInt32(1, true),
            x: view.getFloat32(5, true),
            y: view.getFloat32(9, true),
            rotation: view.getFloat32(13, true),
            attachedToShipId: view.getInt32(17, true),
            bindX: view.getFloat32(21, true),
            bindY: view.getFloat32(25, true)
        };

        return steering;
    }

    parseSelfPosition(buffer) {
        const view = new DataView(buffer);
        const bufferSize = buffer.byteLength;
        
        // Log buffer info for debugging
        // console.log('[UDP] Parsing self position:', {
        //     bufferSize,
        //     expectedSize: 21,
        //     messageType: view.getUint8(0)
        // });
        
        // Check buffer size for minimum required bytes (21 bytes)
        if (bufferSize < 21) {
            console.error('[UDP] Buffer too small for self position:', bufferSize);
            return {
                x: 0,
                y: 0,
                z: 0,
                rotation: 0,
                mounted: 0,
                shipId: 0
            };
        }

        try {
            return {
                x: view.getFloat32(1, true),          // 4 bytes
                y: view.getFloat32(5, true),          // 4 bytes
                z: view.getFloat32(9, true),          // 4 bytes
                rotation: view.getFloat32(13, true),   // 4 bytes
                mounted: view.getInt32(17, true),      // 4 bytes
                shipId: bufferSize >= 25 ? view.getInt32(21, true) : 0  // 4 bytes, optional
            };
        } catch (error) {
            console.error('[UDP] Error parsing self position:', error);
            return {
                x: 0,
                y: 0,
                z: 0,
                rotation: 0,
                mounted: 0,
                shipId: 0
            };
        }
    }

    parseOtherPositions(buffer) {
        try {
            const view = new DataView(buffer);
            const messageType = view.getUint8(0);
            let offset = 1;

            const clientCount = view.getUint8(offset);
            offset += 1;

            // Only log when clients are actually present
            if (clientCount > 0) {
                console.log(`[UDP] Received positions for ${clientCount} clients`);
            }
            
            const positions = [];
            for (let i = 0; i < clientCount; i++) {
                try {
                    const clientData = {
                        clientId: view.getUint32(offset, true),
                        x: view.getFloat32(offset + 4, true),
                        y: view.getFloat32(offset + 8, true),
                        rotation: view.getFloat32(offset + 12, true),
                        mounted: view.getUint8(offset + 16),
                        shipId: view.getInt32(offset + 20, true)
                    };

                    // Only add valid positions
                    if (Number.isFinite(clientData.x) && 
                        Number.isFinite(clientData.y) && 
                        Number.isFinite(clientData.rotation)) {
                        positions.push(clientData);
                    }
                } catch (err) {
                    console.error(`[UDP] Error parsing client ${i}:`, err);
                }

                offset += 24;
            }

            return positions;
        } catch (error) {
            console.error('[UDP] Failed to parse other positions:', error);
            return [];
        }
    }

    // Update network byte order (big-endian)
    sendMountRequest(shipId, moduleId) {
        // Ensure IDs are valid numbers
        const validModuleId = parseInt(moduleId, 10);
        if (isNaN(validModuleId)) {
            console.error('[UDP] Invalid module ID for mount request:', moduleId);
            return;
        }

        const buffer = new ArrayBuffer(5);
        const view = new DataView(buffer);
        view.setUint8(0, UDPConnection.MSG_TYPE_MOUNT_REQUEST);
        view.setInt32(1, validModuleId, true); // Use little-endian to match server expectation
        
        console.log('[UDP] Sending mount request:', { 
            moduleId: validModuleId, 
            raw: new Uint8Array(buffer)
        });
        
        this.socket.send(buffer);
    }

    sendControlInput(moduleId, sailOpenness = 0, steeringAngle = 0) {
        const buffer = new ArrayBuffer(13);
        const view = new DataView(buffer);
        
        // Use big-endian (network byte order)
        view.setUint8(0, UDPConnection.MSG_TYPE_CONTROL_INPUT);
        view.setFloat32(1, Math.max(0, Math.min(1, sailOpenness)), false);
        view.setFloat32(5, Math.max(-1, Math.min(1, steeringAngle)), false);
        view.setInt32(9, moduleId, false);
        
        console.log('[UDP] Sending control input:', {
            moduleId,
            sailOpenness: sailOpenness.toFixed(2),
            steeringAngle: steeringAngle.toFixed(2)
        });
        this.socket.send(buffer);
    }

    fireCannon(cannonId, angle) {
        // Create 9-byte buffer for fire cannon command
        const buffer = new ArrayBuffer(9);
        const view = new DataView(buffer);
        
        // Set message type (1 byte)
        view.setUint8(0, UDPConnection.MSG_TYPE_FIRE_CANNON);
        
        // Set cannon ID (4 bytes)
        view.setInt32(1, cannonId, true);
        
        // Set firing angle (4 bytes)
        view.setFloat32(5, angle, true);
        
        console.log('[UDP] Sending fire cannon:', { cannonId, angle });
        this.socket.send(buffer);
    }
}

export class InputHandler {
    // Increase base movement speed
    static MOVEMENT_SPEED = 40;
    
    static KEYS = {
        UP: new Set(['ArrowUp', 'w', 'W']),
        DOWN: new Set(['ArrowDown', 's', 'S']),
        LEFT: new Set(['ArrowLeft', 'a', 'A']),
        RIGHT: new Set(['ArrowRight', 'd', 'D'])
    };

    constructor() {
        this.keyStates = new Map([
            ['UP', false],
            ['DOWN', false],
            ['LEFT', false],
            ['RIGHT', false]
        ]);
        this.setupListeners();
        console.log('[Input] Handler initialized');
    }

    setupListeners() {
        window.addEventListener('keydown', (e) => {
            const key = e.key.toLowerCase();
            console.log('[Input] Key pressed:', key);
            
            for (const [direction, keys] of Object.entries(InputHandler.KEYS)) {
                if (keys.has(e.key) || keys.has(key)) {
                    e.preventDefault();
                    this.keyStates.set(direction, true);
                    console.log('[Input] Direction set:', direction);
                }
            }
        });

        window.addEventListener('keyup', (e) => {
            const key = e.key.toLowerCase();
            for (const [direction, keys] of Object.entries(InputHandler.KEYS)) {
                if (keys.has(e.key) || keys.has(key)) {
                    e.preventDefault();
                    this.keyStates.set(direction, false);
                }
            }
        });
    }

    getMovementVector() {
        const vector = { x: 0, y: 0 };
        
        if (this.keyStates.get('UP')) vector.y -= InputHandler.MOVEMENT_SPEED;
        if (this.keyStates.get('DOWN')) vector.y += InputHandler.MOVEMENT_SPEED;
        if (this.keyStates.get('LEFT')) vector.x -= InputHandler.MOVEMENT_SPEED;
        if (this.keyStates.get('RIGHT')) vector.x += InputHandler.MOVEMENT_SPEED;

        if (vector.x !== 0 || vector.y !== 0) {
            console.log('[Input] Movement vector:', vector);
        }
        
        return vector;
    }
}

//