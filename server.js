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

wss.on('connection', (ws) => {
    console.log('[Server] Client connected');
    ws.binaryType = 'arraybuffer';

    ws.on('message', (message) => {
        try {
            if (message instanceof ArrayBuffer) {
                const view = new DataView(message);
                console.log('[Server] Received movement:', {
                    x: view.getFloat32(0, true),
                    y: view.getFloat32(4, true),
                    z: view.getFloat32(8, true),
                    rotation: view.getFloat32(12, true),
                    playerId: view.getInt32(16, true),
                    bufferSize: message.byteLength
                });
                
                // Broadcast to other clients
                wss.clients.forEach((client) => {
                    if (client !== ws && client.readyState === WebSocket.OPEN) {
                        client.send(message);
                    }
                });
            }
        } catch (error) {
            console.error('[Server] Error processing message:', error);
        }
    });
});

app.listen(port, () => {
    console.log(`Server running at http://192.168.8.1:${port}`);
});