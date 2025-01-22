//server.js

const express = require('express');
const path = require('path');
const WebSocket = require('ws');
const app = express();
const port = 3000;

// Serve static files from public directory
app.use(express.static(path.join(__dirname, 'public')));

// Set correct MIME type for JS modules
app.use((req, res, next) => {
    if (req.path.endsWith('.js')) {
        res.type('application/javascript');
    }
    next();
});

// WebSocket server setup
const wss = new WebSocket.Server({ port: 8080 });

const KEEPALIVE_INTERVAL = 5000; // 5 seconds
const CLIENT_TIMEOUT = 15000; // 15 seconds

wss.on('connection', (ws) => {
    console.log('[Server] Client connected');
    ws.binaryType = 'arraybuffer';

    let lastKeepaliveResponse = Date.now();
    
    // Setup keepalive interval
    const keepaliveInterval = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
            const now = Date.now();
            
            // Check if client has timed out
            if (now - lastKeepaliveResponse > CLIENT_TIMEOUT) {
                console.log('[Server] Client timed out, closing connection');
                ws.close();
                clearInterval(keepaliveInterval);
                return;
            }

            // Send keepalive
            const buffer = new ArrayBuffer(5);
            const view = new DataView(buffer);
            view.setUint8(0, 14); // MSG_TYPE_KEEPALIVE
            view.setFloat32(1, now, true);
            ws.send(buffer);
        }
    }, KEEPALIVE_INTERVAL);

    ws.on('message', (message) => {
        try {
            if (message instanceof ArrayBuffer) {
                const view = new DataView(message);
                const messageType = view.getUint8(0);
                
                if (messageType === 14) { // MSG_TYPE_KEEPALIVE
                    lastKeepaliveResponse = Date.now();
                    return;
                }

                if (messageType === 12) { // MSG_TYPE_MOVEMENT
                    const moveData = {
                        x: view.getFloat32(1, true),
                        y: view.getFloat32(5, true),
                        rotation: view.getFloat32(9, true),
                        playerId: view.getInt32(13, true),
                        timestamp: view.getInt32(17, true),
                        bufferSize: message.byteLength
                    };
                    
                    console.log('[Server] Received movement:', moveData);
                    
                    // Broadcast to other clients
                    wss.clients.forEach((client) => {
                        if (client !== ws && client.readyState === WebSocket.OPEN) {
                            client.send(message);
                        }
                    });
                }
            }
        } catch (error) {
            console.error('[Server] Error processing message:', error);
        }
    });

    ws.on('close', () => {
        clearInterval(keepaliveInterval);
        console.log('[Server] Client disconnected');
        // Broadcast disconnection to other clients
        wss.clients.forEach((client) => {
            if (client !== ws && client.readyState === WebSocket.OPEN) {
                const buffer = new ArrayBuffer(1);
                const view = new DataView(buffer);
                view.setUint8(0, 13); // MSG_TYPE_DISCONNECT
                client.send(buffer);
            }
        });
    });
});

app.listen(port, () => {
    console.log(`Server running at http://192.168.8.1:${port}`);
});