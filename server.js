//server.js

const express = require('express');
const path = require('path');
const WebSocket = require('ws');
const cors = require('cors');
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

// Add CORS configuration
app.use(cors({
    origin: ['http://localhost:3000', 'http://192.168.8.3:3000'],
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

// Add JSON body parser
app.use(express.json());

// Add token verification endpoint
app.post('/api/players/verify', (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ 
                error: 'No token provided',
                status: 'error'
            });
        }

        const token = authHeader.split(' ')[1];
        
        // TODO: Add your actual token verification logic here
        // For now, sending a success response
        res.json({
            status: 'success',
            valid: true,
            playerid: 1234, // Replace with actual player ID from token
            message: 'Token verified successfully'
        });
    } catch (error) {
        console.error('Token verification error:', error);
        res.status(500).json({
            status: 'error',
            error: 'Token verification failed',
            message: error.message
        });
    }
});

// WebSocket server setup
const wss = new WebSocket.Server({ port: 8080 });

const KEEPALIVE_INTERVAL = 5000; // 5 seconds
const CLIENT_TIMEOUT = 15000; // 15 seconds

wss.on('connection', (ws) => {
    console.log('[Server] Client connected');
    ws.binaryType = 'arraybuffer';
    
    // Track authentication state
    ws.authenticated = false;

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
                
                // Allow only authentication messages if not authenticated
                if (!ws.authenticated && messageType !== 15) { // 15 = MSG_TYPE_AUTH
                    console.log('[Server] Dropping non-auth message from unauthenticated client');
                    return;
                }

                // Process message based on type
                switch(messageType) {
                    case 15: // MSG_TYPE_AUTH
                        handleAuth(ws, message);
                        break;
                    case 12: // MSG_TYPE_MOVEMENT
                        if (ws.authenticated) {
                            handleMovement(ws, message);
                        }
                        break;
                    // ... other message handlers ...
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

function handleAuth(ws, message) {
    // ... auth handling ...
    ws.authenticated = true;
    
    // Send initial game state after successful auth
    sendInitialGameState(ws);
}

function sendInitialGameState(ws) {
    // Send ship data
    const shipBuffer = new ArrayBuffer(17); // Type(1) + ID(8) + X(4) + Y(4)
    const shipView = new DataView(shipBuffer);
    shipView.setUint8(0, 2); // MSG_TYPE_SHIP
    shipView.setBigInt64(1, BigInt(1), true); // Ship ID = 1
    shipView.setFloat32(9, 0.0, true); // X = 0
    shipView.setFloat32(13, 0.0, true); // Y = 0
    ws.send(shipBuffer);
}

app.listen(port, () => {
    console.log(`Server running at http://192.168.8.1:${port}`);
});