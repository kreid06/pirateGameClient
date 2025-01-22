//gameClient.js

// Add global helper functions at the top of the file
function lerp(start, end, t) {
    // Clamp t between 0 and 1
    t = Math.max(0, Math.min(1, t));
    return start * (1 - t) + end * t;
}

function lerpAngle(start, end, t) {
    const normalizeAngle = (angle) => {
        while (angle > Math.PI) angle -= 2 * Math.PI;
        while (angle < -Math.PI) angle += 2 * Math.PI;
        return angle;
    };

    start = normalizeAngle(start);
    end = normalizeAngle(end);

    let diff = normalizeAngle(end - start);
    return normalizeAngle(start + diff * t);
}

// Add rendering layer constants at the top of the file
const RENDER_LAYERS = {
    BACKGROUND: 0,
    GRID: 1,
    ISLANDS: 2,
    SHIPS: 3,
    PLAYERS: 4,
    MODULES: 5,
    UI: 6
};

import { UDPConnection, MovementData } from './connection.js';

class GameClient {
    static FPS = 60; // Increase to 60 FPS for smoother visuals
    static FRAME_TIME = 1000 / GameClient.FPS; // ~33.33ms per frame
    static UPDATE_RATE = 1000 / 20; // 20 updates per second

    constructor() {
        try {
            this.canvas = document.getElementById('gameCanvas');
            this.ctx = this.canvas.getContext('2d');
            this.playerId = Math.floor(Math.random() * 1000);
            this.islands = [];
            
            // Initialize connection with error handling
            this.connection = new UDPConnection(this.playerId);
            if (!this.connection) {
                throw new Error('Failed to initialize UDP connection');
            }
            
            // Set up connection callbacks with null checks
            if (this.connection) {
                this.connection.onIslandsReceived = (islands) => {
                    if (!islands) return;
                    this.islands = islands;
                    console.log('[GameClient] Received islands:', islands.length);
                };

                this.connection.onShipReceived = (shipData) => {
                    if (!shipData) return;
                    // Convert numeric ID from server to numeric type for consistency
                    this.handleShipUpdate({
                        type: 'brigantine',
                        id: 1, // Use the server's numeric ID instead of 'ship1',
                        x: shipData.x,
                        y: shipData.y,
                        r: shipData.rotation,
                        sailCount: shipData.sailCount,
                        cannonCount: shipData.cannonCount
                    });
                };
            }

            this.pendingModules = new Map(); // Add pending modules storage
        
            this.connection.onSailsReceived = (sails) => {
                console.log('[GameClient] Received sail data:', sails.length, 'sails');
                sails.forEach(sail => {
                    console.log('[GameClient] Processing sail for ship:', sail.attachedToShipId, typeof sail.attachedToShipId);
                    const ship = this.ships.get(sail.attachedToShipId);
                    if (ship) {
                        ship.addModule({ ...sail, type: 'sail' });
                    } else {
                        // Queue the sail if ship not found
                        if (!this.pendingModules.has(sail.attachedToShipId)) {
                            this.pendingModules.set(sail.attachedToShipId, []);
                        }
                        console.log(`[GameClient] Queuing sail for ship ${sail.attachedToShipId}`);
                        this.pendingModules.get(sail.attachedToShipId).push({ ...sail, type: 'sail' });
                    }
                });
            };

            this.connection.onCannonsReceived = (cannons) => {
                console.log('[GameClient] Received cannon data:', cannons.length, 'cannons');
                cannons.forEach(cannon => {
                    const ship = this.ships.get(cannon.attachedToShipId);
                    if (ship) {
                        ship.addModule({ ...cannon, type: 'cannon' });
                    } else {
                        // Queue the cannon if ship not found
                        if (!this.pendingModules.has(cannon.attachedToShipId)) {
                            this.pendingModules.set(cannon.attachedToShipId, []);
                        }
                        console.log(`[GameClient] Queuing cannon for ship ${cannon.attachedToShipId}`);
                        this.pendingModules.get(cannon.attachedToShipId).push({ ...cannon, type: 'cannon' });
                    }
                });
            };

            this.connection.onSteeringReceived = (steering) => {
                console.log('[GameClient] Received steering data');
                const ship = this.ships.get(steering.attachedToShipId);
                if (ship) {
                    ship.addModule({ ...steering, type: 'steering' });
                } else {
                    // Queue the steering if ship not found
                    if (!this.pendingModules.has(steering.attachedToShipId)) {
                        this.pendingModules.set(steering.attachedToShipId, []);
                    }
                    console.log(`[GameClient] Queuing steering for ship ${steering.attachedToShipId}`);
                    this.pendingModules.get(steering.attachedToShipId).push({ ...steering, type: 'steering' });
                }
            };

            this.connection.onDisconnectionReceived = () => {
                console.log('[GameClient] A client has disconnected');
                // Handle client disconnection logic here
            };
        
            // Initialize world and player state
            this.worldPos = { x: 0, y: 0 };
            this.rotation = 0;
            this.speed = 40; // Increased base speed
        
            this.setupCanvas();
            this.setupInput();
            this.selectedModule = null; // Track which module is currently selected
        
            // Initialize movement with complete state
            this.movement = new MovementData(
                this.worldPos.x,
                this.worldPos.y,
                0,
                this.rotation,
                this.playerId
            );
        
            this.lastFrameTime = 0;
            this.lastUpdateTime = 0;
            this.mousePos = { x: 0, y: 0 };
            this.coordsDisplay = document.getElementById('coordinates');
            this.setupMouseTracking();
            this.ships = new Map();
            this.gameLoop();

            this.focusDisplay = document.createElement('div');
            this.focusDisplay.id = 'focusDisplay';
            this.focusDisplay.style.cssText = `
                position: fixed;
                top: 40px;
                left: 10px;
                background-color: rgba(0, 0, 0, 0.7);
                color: white;
                padding: 5px 10px;
                border-radius: 5px;
                font-family: monospace;
                z-index: 1000;
            `;
            document.body.appendChild(this.focusDisplay);
            this.currentFocus = null;

            this.mountedModule = null;
            this.lastPositionUpdate = 0;
            this.updateRate = 16; // ~60Hz updates
            this.interactionRange = 100; // Range for module interaction

            this.lastUpdateTime = Date.now();
            this.updateRate = 50; // 20Hz state updates
            this.interpolationAlpha = 0;
            this.previousState = {
                worldPos: { x: 0, y: 0 },
                rotation: 0
            };
            this.targetState = {
                worldPos: { x: 0, y: 0 },
                rotation: 0
            };

            // Enhance other players tracking
            this.otherPlayers = new Map();
            this.lastOtherPlayersUpdate = 0;
            this.otherPlayersUpdateRate = 50; // 20Hz update rate
            
            // Add new position interpolation for other players
            this.otherPlayersInterpolation = new Map();
            
            // Update the connection callback
            this.connection.onOtherPositionsReceived = (positions) => {
                this.handleOtherPositions(positions);
            };

            // Add client prediction states
            this.pendingInputs = [];
            this.lastProcessedInputTime = 0;
            this.inputSequenceNumber = 0;
        
            // Add server reconciliation properties
            this.serverState = {
                x: 0,
                y: 0,
                rotation: 0
            };
        
            this.lastServerUpdate = Date.now();
            this.serverUpdateRate = 50; // Expected server update rate in ms

            // Add input prediction system
            this.inputHistory = [];
            this.lastServerPosition = { x: 0, y: 0, timestamp: 0 };
            this.positionThreshold = 100; // Maximum allowed deviation before correction

            // Add interpolation settings
            this.interpolationDelay = 100; // 100ms interpolation delay
            this.positionBuffer = []; // Buffer for position history
            this.maxBufferSize = 10; // Maximum number of positions to store
            this.lastUpdateTime = performance.now();

            // Add position logging interval
            this.lastPositionLog = 0;
            this.positionLogInterval = 5000; // Log every 5 seconds

            // Add tab visibility handling
            this.isTabVisible = true;
            this.lastVisibleTime = performance.now();
            this.setupVisibilityHandler();

            // Add interpolation settings for other players
            this.clientInterpolation = {
                bufferSize: 10,     // Number of positions to keep in history
                bufferTime: 100,    // Time window for interpolation in ms
                minUpdateDelta: 50, // Minimum time between updates
                positions: new Map() // Store position history for each client
            };

            // Unify interpolation settings for all clients
            this.interpolationSettings = {
                delay: 100,           // 100ms interpolation delay
                bufferSize: 10,       // Maximum number of positions to store
                minUpdateDelta: 50,   // Minimum time between updates (20Hz)
                lerpFactor: 0.3       // Lerp smoothing factor
            };

            // Replace separate interpolation variables with unified settings
            this.positionBuffer = [];
            this.clientInterpolation = {
                positions: new Map(),
                buffer: this.interpolationSettings.bufferSize,
                delay: this.interpolationSettings.delay
            };

            // Single source of truth for interpolation settings
            this.interpolationConfig = {
                delay: 150,           // Increased delay for smoother interpolation
                bufferSize: 20,       // Larger buffer for more history
                minUpdateDelta: 16,   // ~60Hz updates (1000/60)
                lerpFactor: 0.2,      // Smoother lerp (lower = smoother)
                timeout: 5000,        // Keep same timeout
                smoothing: 0.85,      // Add smoothing factor
                maxExtrapolation: 100 // Max time to extrapolate in ms
            };

            // Replace all separate interpolation variables with unified config
            this.positionBuffer = [];
            this.clientInterpolation = {
                positions: new Map(),
                buffer: this.interpolationConfig.bufferSize,
                delay: this.interpolationConfig.delay
            };

            // Enhanced interpolation configuration for smoother movement
            this.interpolationConfig = {
                delay: 200,           // Increased delay to handle more network jitter
                bufferSize: 30,       // Larger buffer for smoother interpolation
                minUpdateDelta: 16,   // ~60Hz updates (1000/60)
                lerpFactor: 0.15,     // Slower lerp for smoother transitions
                timeout: 5000,        // Keep same timeout
                smoothing: 0.92,      // Increased smoothing factor
                maxExtrapolation: 250 // Longer extrapolation for network gaps
            };

            // Update interpolation config with adaptive delay
            this.interpolationConfig = {
                delay: 100,           // Initial delay, will be updated based on network conditions
                bufferSize: 30,       // Keep larger buffer for jitter protection
                minUpdateDelta: 16,   // ~60Hz updates
                lerpFactor: 0.15,     // Smooth transition factor
                timeout: 5000,        // Timeout for disconnection
                smoothing: 0.92,      // Position smoothing
                maxExtrapolation: 250 // Max extrapolation time
            };

            // Set up network stats callback
            if (this.connection) {
                this.connection.onNetworkStatsUpdate = (stats) => {
                    // Smoothly adjust interpolation delay
                    const currentDelay = this.interpolationConfig.delay;
                    const targetDelay = stats.recommendedDelay;
                    
                    // Gradually adjust delay to avoid sudden changes
                    this.interpolationConfig.delay = lerp(
                        currentDelay,
                        targetDelay,
                        0.1 // Smooth transition factor
                    );

                    // Log network conditions
                    console.log('[GameClient] Network stats:', {
                        ping: Math.round(stats.averagePing),
                        jitter: Math.round(stats.jitter),
                        delay: Math.round(this.interpolationConfig.delay)
                    });
                };
            }

            // Enhanced interpolation settings with better smoothing
            this.interpolationConfig = {
                delay: 250,           // Increased delay to reduce rubber banding
                bufferSize: 60,       // Larger buffer for smoother interpolation
                minUpdateDelta: 16,   // ~60Hz updates
                lerpFactor: 0.1,      // Much slower lerp for stabler movement
                timeout: 5000,        // Keep same timeout
                smoothing: 0.95,      // Increased smoothing factor
                maxExtrapolation: 500, // Longer extrapolation time
                velocityBlend: 0.85,  // Blend factor for velocity smoothing
                snapThreshold: 500,   // Distance threshold for position snapping
                maxPredictionTime: 250 // Maximum time to predict ahead
            };

            // Update the interpolation config in the constructor
            this.interpolationConfig = {
                delay: 300,           // Increased delay to handle more jitter
                bufferSize: 60,       // Double buffer size for smoother interpolation
                minUpdateDelta: 16,   // ~60Hz updates
                lerpFactor: 0.08,     // Much slower lerp for stabler movement
                timeout: 5000,        // Keep same timeout
                smoothing: 0.98,      // Increased smoothing factor
                maxExtrapolation: 500, // Longer extrapolation time
                velocityBlend: 0.92,  // Slower velocity blending
                snapThreshold: 1000,  // Higher snap threshold
                maxPredictionTime: 500 // Maximum time to predict ahead
            };

            // Update movement settings for more responsive controls
            this.interpolationConfig = {
                delay: 50,            // Reduced from 300ms to 50ms for low latency
                bufferSize: 30,       // Keep buffer size for smooth corrections
                minUpdateDelta: 8,    // Increased update rate (120Hz)
                lerpFactor: 0.4,      // Increased for faster response
                timeout: 5000,        // Keep same timeout
                smoothing: 0.6,       // Reduced smoothing for more responsive movement
                maxExtrapolation: 100,// Reduced extrapolation time
                velocityBlend: 0.4,   // Faster velocity updates
                snapThreshold: 200,   // Lower snap threshold
                maxPredictionTime: 100 // Reduced prediction time
            };

            // Add visual smoothing settings
            this.visualSmoothing = {
                enabled: true,
                factor: 0.4,    // Visual interpolation strength
                gridFactor: 0.6, // Specific smoothing for grid
                lastRenderTime: 0,
                lastGridOffset: { x: 0, y: 0 },
                currentGridOffset: { x: 0, y: 0 },
                shipPositions: new Map() // Store previous ship positions
            };

            // Update client tracking settings
            this.clientTracking = {
                timeout: 10000,       // Increase timeout to 10 seconds
                cleanupInterval: 1000, // Check for disconnections every second
                lastCleanup: 0
            };

            // Update interpolation config
            this.interpolationConfig = {
                delay: 50,            // Reduced delay for more responsive updates
                bufferSize: 30,       // Keep buffer size
                minUpdateDelta: 8,    // High update rate
                lerpFactor: 0.4,      // Faster response
                timeout: 10000,       // Increased timeout to 10 seconds
                smoothing: 0.6,       // Reduced smoothing
                maxExtrapolation: 250,// Increased extrapolation
                velocityBlend: 0.4,   // Keep velocity blend
                snapThreshold: 200,   // Keep snap threshold
                maxPredictionTime: 250 // Increased prediction time
            };

            // Add rendering queue system
            this.renderQueue = new Map();
            for (const layer of Object.values(RENDER_LAYERS)) {
                this.renderQueue.set(layer, []);
            }

            // Add interpolation state for grid
            this.gridState = {
                current: { x: 0, y: 0 },
                target: { x: 0, y: 0 },
                lastUpdate: 0
            };

            // Add interpolation state for ships
            this.shipStates = new Map();
        } catch (error) {
            console.error('[GameClient] Initialization error:', error);
            throw error; // Re-throw to prevent partial initialization
        }
    }

    // Add connection check helper
    ensureConnection() {
        if (!this.connection) {
            console.error('[GameClient] Connection not initialized');
            this.connection = new UDPConnection(this.playerId);
        }
        return this.connection;
    }

    setupVisibilityHandler() {
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                this.isTabVisible = false;
                console.log('[GameClient] Tab hidden, pausing updates');
            } else {
                const now = performance.now();
                const timeDelta = now - this.lastVisibleTime;
                this.isTabVisible = true;
                this.lastVisibleTime = now;
                this.lastFrameTime = now;
                this.lastUpdateTime = now;
                this.lastPositionUpdate = Date.now();
                this.lastPositionLog = Date.now();
                console.log(`[GameClient] Tab visible, resuming updates after ${Math.round(timeDelta)}ms`);
            }
        });
    }

    setupCanvas() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
    }

    setupInput() {
        this.keys = {};
        window.addEventListener('keydown', (e) => {
            this.keys[e.code] = true;
            if (e.code === 'KeyE') {
                this.tryMountModule();
            }
        });

        window.addEventListener('keyup', (e) => {
            this.keys[e.code] = false;
        });
    }

    tryMountModule() {
        if (!this.currentFocus) return;

        const module = this.currentFocus;
        const ship = this.ships.get(module.shipId);
        if (!ship) return;

        // Ensure moduleId is a number and properly converted
        const moduleId = parseInt(module.id, 10);
        if (isNaN(moduleId)) {
            console.error('[GameClient] Invalid module ID:', module.id);
            return;
        }

        // Calculate distance between player and module
        const dx = this.worldPos.x - (ship.position.x + module.bindPosition.x);
        const dy = this.worldPos.y - (ship.position.y + module.bindPosition.y);
        const distance = Math.sqrt(dx * dx + dy * dy);

        // Check if player is close enough (adjust radius as needed)
        const MOUNT_RADIUS = 100;
        if (distance <= MOUNT_RADIUS) {
            console.log(`[GameClient] Attempting to mount module ${moduleId} on ship ${ship.id}`);
            this.connection.sendMountRequest(ship.id, moduleId);
        } else {
            console.log(`[GameClient] Cannot mount module ${moduleId} - Too far (${Math.round(distance)} units)`);
        }
    }

    handleMountResponse(success, moduleId) {
        if (success) {
            this.mountedModule = this.currentFocus;
            console.log(`[GameClient] Mounted to module ${moduleId}`);
        } else {
            this.mountedModule = null;
            console.log(`[GameClient] Mount failed for module ${moduleId}`);
        }
    }

    updateModuleControl() {
        if (!this.mountedModule) return;

        const now = Date.now();
        if (now - this.lastControlUpdate < 50) return; // 20Hz control updates

        // Handle sail control
        if (this.mountedModule.type === 'Sail') {
            const sailOpenness = this.keys['KeyW'] ? 1.0 : (this.keys['KeyS'] ? 0.0 : 0.5);
            this.connection.sendControlInput(this.mountedModule.id, sailOpenness, 0);
        }
        // Handle steering control
        else if (this.mountedModule.type === 'SteeringWheel') {
            const steeringAngle = this.keys['KeyA'] ? -1.0 : (this.keys['KeyD'] ? 1.0 : 0.0);
            this.connection.sendControlInput(this.mountedModule.id, 0, steeringAngle);
        }

        this.lastControlUpdate = now;
    }

    setupMouseTracking() {
        window.addEventListener('mousemove', (e) => {
            this.mousePos.x = e.clientX;
            this.mousePos.y = e.clientY;
            this.updateRotation();
            this.checkModuleFocus(this.mousePos);
        });
    }

    updateRotation() {
        // Calculate angle between player center and cursor
        const dx = this.mousePos.x - MovementData.VIEW_CENTER.x;
        const dy = this.mousePos.y - MovementData.VIEW_CENTER.y;
        const newRotation = Math.atan2(dy, dx);

        // Apply rotation immediately for responsiveness
        this.rotation = newRotation;
        
        // Store for interpolation only if mounted
        if (this.mountedModule) {
            this.positionBuffer.push({
                timestamp: performance.now(),
                x: this.worldPos.x,
                y: this.worldPos.y,
                rotation: newRotation
            });
        }
    }

    updateWorldPosition() {
        const connection = this.ensureConnection();
        if (!connection) return;

        const now = performance.now();
        const deltaTime = now - this.lastUpdateTime;
        this.lastUpdateTime = now;

        // First update rotation based on mouse position
        this.updateRotation();

        const input = {
            sequenceNumber: this.inputSequenceNumber++,
            timestamp: now,
            keys: { ...this.keys },
            dt: deltaTime
        };

        // Apply input and save state
        this.applyInput(input);
        
        // Store position for interpolation
        this.positionBuffer.push({
            timestamp: now,
            x: this.worldPos.x,
            y: this.worldPos.y,
            rotation: this.rotation
        });

        // Keep buffer size in check
        while (this.positionBuffer.length > this.maxBufferSize) {
            this.positionBuffer.shift();
        }

        this.pendingInputs.push(input);
        
        // Send movement data including current rotation
        this.connection.sendMovementData(
            this.worldPos.x,
            this.worldPos.y,
            this.rotation,
            now
        );

        this.lastProcessedInputTime = now;

        // Remove artificial delay between inputs
        if (this.keys['KeyW'] || this.keys['KeyS'] || this.keys['KeyA'] || this.keys['KeyD']) {
            this.applyInput({
                sequenceNumber: this.inputSequenceNumber++,
                timestamp: now,
                keys: { ...this.keys },
                dt: deltaTime
            });
        }

        // Store position for interpolation only if needed
        if (this.mountedModule) {
            // ...existing interpolation code...
        }

        // Update grid target state
        this.gridState.current = { ...this.gridState.target };
        this.gridState.target = { x: this.worldPos.x, y: this.worldPos.y };
        this.gridState.lastUpdate = now;

        // Update ship target states
        this.ships.forEach((ship, id) => {
            if (!this.shipStates.has(id)) {
                this.shipStates.set(id, {
                    current: { x: ship.position.x, y: ship.position.y, rotation: ship.rotation },
                    target: { x: ship.position.x, y: ship.position.y, rotation: ship.rotation },
                    lastUpdate: now
                });
            }

            const state = this.shipStates.get(id);
            state.current = { ...state.target };
            state.target = { 
                x: ship.position.x, 
                y: ship.position.y, 
                rotation: ship.rotation 
            };
            state.lastUpdate = now;
        });
    }

    applyInput(input) {
        const speed = this.speed * (input.dt / 1000); // Convert to seconds

        // Calculate movement vector first
        let dx = 0;
        let dy = 0;

        if (input.keys['KeyW']) {
            dx += Math.cos(this.rotation) * speed;
            dy += Math.sin(this.rotation) * speed;
        }
        if (input.keys['KeyS']) {
            dx -= Math.cos(this.rotation) * speed;
            dy -= Math.sin(this.rotation) * speed;
        }
        if (input.keys['KeyA']) {
            dx += Math.cos(this.rotation - Math.PI/2) * speed;
            dy += Math.sin(this.rotation - Math.PI/2) * speed;
        }
        if (input.keys['KeyD']) {
            dx += Math.cos(this.rotation + Math.PI/2) * speed;
            dy += Math.sin(this.rotation + Math.PI/2) * speed;
        }

        // Apply movement immediately
        this.worldPos.x += dx;
        this.worldPos.y += dy;

        // Send update to server immediately if moving
        if (dx !== 0 || dy !== 0) {
            this.connection.sendMovementData(
                this.worldPos.x,
                this.worldPos.y,
                this.rotation,
                performance.now()
            );
        }
    }

    sendInputToServer() {
        const movement = new MovementData(
            this.worldPos.x,
            this.worldPos.y,
            0,
            this.playerPos.rotation,
            this.playerId
        );
        this.connection.sendMovementData(movement);
    }

    update() {
        // Move world opposite to desired player movement
        if (this.keys['ArrowUp'] || this.keys['KeyW']) this.worldPos.y += this.speed;
        if (this.keys['ArrowDown'] || this.keys['KeyS']) this.worldPos.y -= this.speed;
        if (this.keys['ArrowLeft'] || this.keys['KeyA']) this.worldPos.x += this.speed;
        if (this.keys['ArrowRight'] || this.keys['KeyD']) this.worldPos.x -= this.speed;

        // Update movement with world position
        this.movement = new MovementData(
            this.worldPos.x,
            this.worldPos.y,
            0,
            0,
            this.playerId
        );

        // Send world position to server
        this.connection.sendMovementData(
            this.worldPos.x,
            this.worldPos.y,
            0
        );
    }

    updateCoordinates() {
        if (this.coordsDisplay) {
            this.coordsDisplay.textContent = `Screen: (${Math.round(this.mousePos.x)}, ${Math.round(this.mousePos.y)}) World: (${Math.round(this.worldPos.x)}, ${Math.round(this.worldPos.y)})`;
        }
    }

    // Add new rendering queue methods
    queueForRendering(object, layer, zIndex = 0) {
        if (!this.renderQueue.has(layer)) {
            console.warn(`[Render] Invalid layer: ${layer}`);
            return;
        }
        this.renderQueue.get(layer).push({ object, zIndex });
    }

    clearRenderQueue() {
        this.renderQueue.forEach(layer => layer.length = 0);
    }

    processRenderQueue() {
        // Process each layer in order
        for (const layer of Object.values(RENDER_LAYERS)) {
            const queue = this.renderQueue.get(layer);
            if (!queue || queue.length === 0) continue;

            // Sort by zIndex within layer if needed
            queue.sort((a, b) => a.zIndex - b.zIndex);

            // Render all objects in this layer
            queue.forEach(({ object }) => {
                if (typeof object === 'function') {
                    object(this.ctx);
                } else if (object.render) {
                    object.render(this.ctx);
                }
            });
        }

        this.clearRenderQueue();
    }

    render() {
        const now = performance.now();
        
        // Clear the entire canvas first
        this.ctx.setTransform(1, 0, 0, 1, 0, 0); // Reset transform
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        this.clearRenderQueue();

        // Save the original context state
        this.ctx.save();
        
        // First, translate to center of screen
        this.ctx.translate(this.canvas.width / 2, this.canvas.height / 2);
        
        // Then translate based on player position (negative to move world opposite to player)
        this.ctx.translate(-this.worldPos.x, -this.worldPos.y);

        // Queue background (now fill relative to view)
        this.queueForRendering((ctx) => {
            const viewWidth = this.canvas.width;
            const viewHeight = this.canvas.height;
            ctx.fillStyle = '#87CEEB';
            ctx.fillRect(-viewWidth/2, -viewHeight/2, viewWidth, viewHeight);
        }, RENDER_LAYERS.BACKGROUND);

        // Queue grid (already uses centered coordinates)
        this.queueForRendering((ctx) => {
            this.drawSmoothGrid(ctx);
        }, RENDER_LAYERS.GRID);

        // Queue islands
        this.islands.forEach(island => {
            this.queueForRendering(island, RENDER_LAYERS.ISLANDS);
        });

        // Queue ships and their modules
        this.ships.forEach((ship, id) => {
            const smoothPos = this.getSmoothShipPosition(ship, id);
            this.queueForRendering(() => {
                this.renderShip(ship, smoothPos);
            }, RENDER_LAYERS.SHIPS);
        });

        // Add interpolation update before rendering other players
        this.interpolateOtherPlayers(now);

        // Queue other players
        this.otherPlayers.forEach((player, clientId) => {
            if (player.clientId === this.playerId) return;
            this.queueForRendering(() => {
                this.ctx.save();
                this.ctx.fillStyle = player.mounted ? '#FF4444' : '#4444FF';
                this.ctx.translate(player.x, player.y);
                this.ctx.rotate(player.rotation || 0);
                
                this.ctx.beginPath();
                this.ctx.moveTo(15, 0);
                this.ctx.lineTo(-10, -10);
                this.ctx.lineTo(-10, 10);
                this.ctx.closePath();
                this.ctx.fill();
                this.ctx.strokeStyle = '#000000';
                this.ctx.lineWidth = 2;
                this.ctx.stroke();
                
                this.ctx.restore();
            }, RENDER_LAYERS.PLAYERS);
        });

        // Queue current player at world origin
        this.queueForRendering(() => {
            this.ctx.save();
            this.ctx.fillStyle = 'red';
            this.ctx.translate(this.worldPos.x, this.worldPos.y);
            this.ctx.rotate(this.rotation);
            this.ctx.fillRect(-10, -10, 20, 20);
            this.ctx.restore();
        }, RENDER_LAYERS.PLAYERS, 1);

        // Process render queue
        this.processRenderQueue();

        // Restore the original context state
        this.ctx.restore();
        
        // Draw UI elements (which should be in screen space)
        this.updateCoordinates();
        this.updateFocusDisplay();
    }

    drawSmoothGrid(ctx) {
        if (!ctx || !this.gridState.lastUpdate) return;

        const now = performance.now();
        const alpha = Math.min((now - this.gridState.lastUpdate) / 50, 1); // 50ms = 20Hz
        const interpolatedPos = this.interpolateState(
            this.gridState.current,
            this.gridState.target,
            alpha
        );

        try {
            const gridSize = MovementData.GRID_SIZE;
            const viewWidth = this.canvas.width;
            const viewHeight = this.canvas.height;
            
            // Use interpolated position for grid offset
            const gridOffset = {
                x: Math.floor(interpolatedPos.x / gridSize) * gridSize,
                y: Math.floor(interpolatedPos.y / gridSize) * gridSize
            };

            // Calculate visible grid area with buffer
            const bufferMultiplier = 2; // Add extra grids for smooth scrolling
            const visibleGrids = {
                horizontal: Math.ceil(viewWidth / gridSize) * bufferMultiplier,
                vertical: Math.ceil(viewHeight / gridSize) * bufferMultiplier
            };

            // Calculate boundaries with buffer
            const startX = gridOffset.x - (visibleGrids.horizontal * gridSize) / 2;
            const endX = gridOffset.x + (visibleGrids.horizontal * gridSize) / 2;
            const startY = gridOffset.y - (visibleGrids.vertical * gridSize) / 2;
            const endY = gridOffset.y + (visibleGrids.vertical * gridSize) / 2;

            // Draw grid lines with alpha for better visibility
            ctx.strokeStyle = '#000000';
            ctx.lineWidth = 0.5;
            ctx.globalAlpha = 0.3;

            // Draw vertical lines
            for (let x = startX; x <= endX; x += gridSize) {
                ctx.beginPath();
                ctx.moveTo(x, startY);
                ctx.lineTo(x, endY);
                ctx.stroke();
            }

            // Draw horizontal lines
            for (let y = startY; y <= endY; y += gridSize) {
                ctx.beginPath();
                ctx.moveTo(startX, y);
                ctx.lineTo(endX, y);
                ctx.stroke();
            }

            ctx.globalAlpha = 1.0;
        } catch (error) {
            console.error('[Grid] Drawing error:', error);
        }
    }

    getSmoothShipPosition(ship, id) {
        // Initialize ship position tracking if needed
        if (!this.visualSmoothing.shipPositions.has(id)) {
            this.visualSmoothing.shipPositions.set(id, {
                position: { x: ship.position.x, y: ship.position.y },
                rotation: ship.rotation,
                lastUpdate: performance.now()
            });
        }

        const smoothData = this.visualSmoothing.shipPositions.get(id);
        const now = performance.now();
        const dt = now - smoothData.lastUpdate;

        // Smoothly interpolate position and rotation
        const smoothPos = {
            x: lerp(smoothData.position.x, ship.position.x, this.visualSmoothing.factor),
            y: lerp(smoothData.position.y, ship.position.y, this.visualSmoothing.factor),
            rotation: lerpAngle(smoothData.rotation, ship.rotation, this.visualSmoothing.factor)
        };

        // Update stored position
        smoothData.position = { ...smoothPos };
        smoothData.rotation = smoothPos.rotation;
        smoothData.lastUpdate = now;

        return smoothPos;
    }

    gameLoop(timestamp) {
        // Skip updates if tab is hidden
        if (!this.isTabVisible) {
            requestAnimationFrame((ts) => this.gameLoop(ts));
            return;
        }

        const delta = timestamp - this.lastFrameTime;
        
        if (delta >= GameClient.FRAME_TIME) {
            this.lastFrameTime = timestamp - (delta % GameClient.FRAME_TIME);
            
            // Regular position updates (20Hz)
            const now = Date.now();
            if (now - this.lastPositionUpdate >= this.updateRate) {
                this.updateWorldPosition();
                this.lastPositionUpdate = now;
            }

            // Periodic position logging
            if (now - this.lastPositionLog >= this.positionLogInterval) {
                this.logOtherPlayersPositions();
                this.lastPositionLog = now;
            }

            // Module control updates
            this.updateModuleControl();
            
            // Render with interpolation every frame
            this.render();
        }

        // Add client cleanup check
        const now = Date.now();
        if (now - this.clientTracking.lastCleanup >= this.clientTracking.cleanupInterval) {
            this.clientTracking.lastCleanup = now;
            
            // Log active clients
            console.log('[GameClient] Active clients:', 
                Array.from(this.otherPlayers.keys()).join(', ') || 'None');
        }
        
        requestAnimationFrame((ts) => this.gameLoop(ts));
    }

    handleShipUpdate(shipData) {
        const { id, type, x, y, r } = shipData;
        console.log('[GameClient] Handling ship update:', { id, type, x, y, r });
        
        let ship = this.ships.get(id);
        
        if (!ship) {
            switch (type) {
                case 'brigantine':
                    ship = new Brigantine(x, y, r, id);
                    this.ships.set(id, ship);
                    console.log(`[GameClient] Created new ship ${id}, checking for ${this.pendingModules.has(id) ? 'pending' : 'no'} modules`);
                    
                    // Process any pending modules for this ship
                    if (this.pendingModules.has(id)) {
                        const pendingCount = this.pendingModules.get(id).length;
                        console.log(`[GameClient] Processing ${pendingCount} pending modules for ship ${id}`);
                        this.pendingModules.get(id).forEach(module => {
                            ship.addModule(module);
                        });
                        this.pendingModules.delete(id);
                    }
                    break;
            }
        }
        
        if (ship) {
            ship.serverUpdate(shipData);
        }
    }

    checkModuleFocus(mousePos) {
        this.currentFocus = null; // Reset focus

        this.ships.forEach(ship => {
            // Convert mouse position to ship's local space
            const localX = mousePos.x - (MovementData.VIEW_CENTER.x - this.worldPos.x + ship.position.x);
            const localY = mousePos.y - (MovementData.VIEW_CENTER.y - this.worldPos.y + ship.position.y);

            // Check each module
            ship.modules.forEach(module => {
                if (this.isPointInModule(localX, localY, module, ship.rotation)) {
                    this.currentFocus = {
                        type: module.constructor.name,
                        id: module.id,
                        health: module.health,
                        bindPosition: module.bindPosition,
                        shipId: ship.id
                    };
                }
            });
        });
    }

    logOtherPlayersPositions() {
        if (this.otherPlayers.size === 0) return;

        const now = Date.now();
        console.log('[GameClient] Current player positions:');
        this.otherPlayers.forEach((player, id) => {
            // Ensure lastUpdate is valid before converting to ISO string
            const lastUpdateStr = player.lastUpdate && isFinite(player.lastUpdate) 
                ? new Date(player.lastUpdate).toISOString() 
                : 'Invalid timestamp';

            console.log(`Player ${id}:`, {
                position: `(${player.x.toFixed(2)}, ${player.y.toFixed(2)})`,
                rotation: `${(player.rotation * 180 / Math.PI).toFixed(2)}°`,
                mounted: player.mounted ? `Ship ${player.shipId}` : 'No',
                lastUpdate: lastUpdateStr
            });
        });
    }

    handleOtherPositions(positions) {
        const now = performance.now();
        
        positions.forEach(data => {
            if (data.clientId === this.playerId) return;
            
            if (!this.validatePlayerData(data)) return;

            // Initialize or get player's interpolation data
            if (!this.otherPlayersInterpolation.has(data.clientId)) {
                this.otherPlayersInterpolation.set(data.clientId, {
                    previous: { x: data.x, y: data.y, rotation: data.rotation },
                    target: { x: data.x, y: data.y, rotation: data.rotation },
                    lastUpdate: now,
                    mounted: data.mounted,
                    shipId: data.shipId
                });
            }

            // Update interpolation targets
            const interpolation = this.otherPlayersInterpolation.get(data.clientId);
            interpolation.previous = {
                x: interpolation.target.x,
                y: interpolation.target.y,
                rotation: interpolation.target.rotation
            };
            interpolation.target = {
                x: data.x,
                y: data.y,
                rotation: data.rotation
            };
            interpolation.lastUpdate = now;
            interpolation.mounted = data.mounted;
            interpolation.shipId = data.shipId;

            // Update other players map with interpolated position
            this.otherPlayers.set(data.clientId, {
                clientId: data.clientId,
                x: data.x,
                y: data.y,
                rotation: data.rotation,
                mounted: data.mounted,
                shipId: data.shipId,
                lastUpdate: now
            });
        });

        // Only log cleanup when players are actually removed
        const timeoutThreshold = now - this.clientTracking.timeout;
        for (const [id, player] of this.otherPlayers.entries()) {
            if (player.lastUpdate < timeoutThreshold) {
                console.log(`[GameClient] Removing inactive player ${id}`);
                this.otherPlayers.delete(id);
            }
        }

        // Log current player count only if there are players
        if (this.otherPlayers.size > 0) {
            console.log(`[GameClient] Active players: ${this.otherPlayers.size}`);
        }
    }

    interpolateOtherPlayers(now) {
        this.otherPlayersInterpolation.forEach((data, clientId) => {
            const player = this.otherPlayers.get(clientId);
            if (!player) return;

            const timeSinceUpdate = now - data.lastUpdate;
            const interpolationTime = 50; // 50ms interpolation window
            const t = Math.min(timeSinceUpdate / interpolationTime, 1);

            // Smoothly interpolate position and rotation
            player.x = lerp(data.previous.x, data.target.x, t);
            player.y = lerp(data.previous.y, data.target.y, t);
            player.rotation = lerpAngle(data.previous.rotation, data.target.rotation, t);
        });
    }

    updateFocusDisplay() {
        if (this.focusDisplay) {
            if (this.currentFocus) {
                const { type, id, health } = this.currentFocus;
                const ship = this.ships.get(this.currentFocus.shipId);
                if (!ship) return;
                
                const dx = this.worldPos.x - (ship.position.x + this.currentFocus.bindPosition.x);
                const dy = this.worldPos.y - (ship.position.y + this.currentFocus.bindPosition.y);
                const distance = Math.round(Math.sqrt(dx * dx + dy * dy));
                
                this.focusDisplay.textContent = `Focus: ${type} (ID: ${id}, Health: ${Math.round(health)}, Distance: ${distance})`;
                this.focusDisplay.style.display = 'block';
            } else {
                this.focusDisplay.style.display = 'none';
            }
        }
    }

    validatePlayerData(data) {
        return (
            data &&
            typeof data.clientId === 'number' &&
            typeof data.x === 'number' &&
            typeof data.y === 'number' &&
            typeof data.rotation === 'number' &&
            !isNaN(data.x) &&
            !isNaN(data.y) &&
            !isNaN(data.rotation)
        );
    }

    renderShip(ship, smoothPos) {
        if (!ship) return;

        const now = performance.now();
        const state = this.shipStates.get(ship.id);
        
        if (!state) return;

        const alpha = Math.min((now - state.lastUpdate) / 50, 1); // 50ms = 20Hz
        const interpolatedPos = this.interpolateState(
            state.current,
            state.target,
            alpha
        );

        this.ctx.save();
        
        // Use interpolated position and rotation
        this.ctx.translate(interpolatedPos.x, interpolatedPos.y);
        this.ctx.rotate(interpolatedPos.rotation);
        
        // Draw ship components in correct order
        ship.drawHull(this.ctx);
        
        ship.modules.forEach(module => {
            if (module instanceof Cannon) {
                module.render(this.ctx);
            }
        });
        
        ship.modules.forEach(module => {
            if (module instanceof SteeringWheel) {
                module.render(this.ctx);
            }
        });
        
        ship.modules.forEach(module => {
            if (module instanceof Sail) {
                ship.drawSailFibers(this.ctx, module);
                ship.drawSailMast(this.ctx, module);
            }
        });
        
        this.ctx.restore();
    }

    isPointInModule(x, y, module, shipRotation) {
        // Rotate the point to match ship's rotation
        const cos = Math.cos(-shipRotation);
        const sin = Math.sin(-shipRotation);
        const rotatedX = x * cos - y * sin;
        const rotatedY = x * sin + y * cos;

        // Adjust point position relative to module's bind position
        const moduleX = rotatedX - module.bindPosition.x;
        const moduleY = rotatedY - module.bindPosition.y;

        // Define hitbox size based on module type
        let hitboxSize = 30; // Default size
        if (module instanceof Cannon) {
            hitboxSize = 40;
        } else if (module instanceof SteeringWheel) {
            hitboxSize = 25;
        } else if (module instanceof Sail) {
            hitboxSize = 35;
        }

        // Check if point is within module's hitbox
        return Math.abs(moduleX) < hitboxSize && Math.abs(moduleY) < hitboxSize;
    }

    // Add interpolation helper function
    interpolateState(current, target, alpha) {
        return {
            x: lerp(current.x, target.x, alpha),
            y: lerp(current.y, target.y, alpha),
            rotation: lerpAngle(current.rotation || 0, target.rotation || 0, alpha)
        };
    }
}

// Ship base class
class Ship {
    constructor(x, y, r, id) {
        this.position = { x, y };
        this.rotation = r;
        this.id = id;
        this.modules = new Map();  // Unified module management
        this.path = null;
    }

    serverUpdate(data) {
        this.position.x = data.x;
        this.position.y = data.y;
        this.rotation = data.r;
    }

    addModule(moduleData) {
        const { id, type, x = 0, y = 0, r = 0, quality = 1, efficiency = 1, bindX = 0, bindY = 0, rotation = r } = moduleData || {};
        
        if (!id || !type) {
            console.warn(`[Ship ${this.id}] Invalid module data:`, moduleData);
            return;
        }

        let module;
        const finalRotation = typeof rotation === 'number' ? rotation : r;
        
        // Create the appropriate module type
        switch (type) {
            case 'sail':
                console.log(`[Ship ${this.id}] Adding sail ${id} at (${bindX}, ${bindY}), rotation: ${finalRotation}`);
                module = new Sail(x, y, finalRotation, id, quality, efficiency);
                break;
            case 'cannon':
                console.log(`[Ship ${this.id}] Adding cannon ${id} at (${bindX}, ${bindY}), rotation: ${finalRotation}`);
                module = new Cannon(x, y, finalRotation, id, quality, efficiency);
                break;
            case 'steering':
                console.log(`[Ship ${this.id}] Adding steering ${id} at (${bindX}, ${bindY}), rotation: ${finalRotation}`);
                module = new SteeringWheel(x, y, finalRotation, id, quality);
                break;
            default:
                console.warn(`[Ship ${this.id}] Unknown module type:`, type);
                return;
        }

        // Set up the module
        module.ship = this;
        module.bindPosition = { x: bindX, y: bindY };
        
        // Remove any existing module with same ID
        if (this.modules.has(id)) {
            console.log(`[Ship ${this.id}] Replacing existing module ${id}`);
            this.modules.delete(id);
        }
        
        this.modules.set(id, module);
        console.log(`[Ship ${this.id}] Module count:`, this.modules.size);
    }

    removeModule(moduleId) {
        const module = this.modules.get(moduleId);
        if (module) {
            module.ship = null;
            this.modules.delete(moduleId);
        }
    }
}

class Brigantine extends Ship {
    constructor(x, y, r, id) {
        super(x, y, r, id);
        console.log(`[Ship ${id}] Creating new Brigantine ship at (${x.toFixed(2)}, ${y.toFixed(2)}), rotation: ${r.toFixed(2)}`);
    }

    render(ctx) {
        ctx.save();
        
        // Position the ship in world space
        ctx.translate(this.position.x, this.position.y);
        ctx.rotate(this.rotation);
        
        // Render order from bottom to top:
        // 1. Hull (bottom)
        this.drawHull(ctx);
        
        // 2. Player square (above hull, below components)
        
        // 3. Cannons
        this.modules.forEach(module => {
            if (module instanceof Cannon) {
                module.render(ctx);
            }
        });
        
        // 4. Steering wheel
        this.modules.forEach(module => {
            if (module instanceof SteeringWheel) {
                module.render(ctx);
            }
        });
        
        // 5. Sail fibers
        this.modules.forEach(module => {
            if (module instanceof Sail) {
                this.drawSailFibers(ctx, module);
            }
        });
        
        // 6. Sail masts (top)
        this.modules.forEach(module => {
            if (module instanceof Sail) {
                this.drawSailMast(ctx, module);
            }
        });

        ctx.restore();
    }

    renderWithPosition(ctx, smoothPos) {
        // Use existing render logic but without the position transform
        this.drawHull(ctx);
        
        this.modules.forEach(module => {
            if (module instanceof Cannon) module.render(ctx);
        });
        
        this.modules.forEach(module => {
            if (module instanceof SteeringWheel) module.render(ctx);
        });
        
        this.modules.forEach(module => {
            if (module instanceof Sail) this.drawSailFibers(ctx, module);
        });
        
        this.modules.forEach(module => {
            if (module instanceof Sail) this.drawSailMast(ctx, module);
        });
    }

    drawHull(ctx) {
        this.path = new Path2D();
        this.path.moveTo(225, 90);
        this.path.quadraticCurveTo(500, 0, 225, -90);
        this.path.lineTo(-225, -90);
        this.path.quadraticCurveTo(-325, 0, -225, 90);
        this.path.closePath();

        ctx.fillStyle = '#D2B48C';
        ctx.strokeStyle = '#8B4513';
        ctx.lineWidth = 10;
        ctx.fill(this.path);
        ctx.stroke(this.path);
    }

    drawSailMast(ctx, sail) {
        ctx.save();
        ctx.translate(sail.bindPosition.x, sail.bindPosition.y);
        
        ctx.beginPath();
        ctx.arc(0, 0, 15, 0, Math.PI * 2);
        ctx.fillStyle = '#D2B48C';
        ctx.strokeStyle = '#8B4513';
        ctx.lineWidth = 4;
        ctx.fill();
        ctx.stroke();
        
        ctx.restore();
    }

    drawSailFibers(ctx, sail) {
        ctx.save();
        ctx.translate(sail.bindPosition.x, sail.bindPosition.y);
        ctx.rotate(sail.rotation);
        
        ctx.beginPath();
        ctx.moveTo(0, 130);
        ctx.quadraticCurveTo(50 + (sail.efficiency || 1) * 50, 0, 0, -130);
        ctx.closePath();
        
        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 2;
        ctx.fill();
        ctx.stroke();
        
        ctx.restore();
    }
}

class ShipComponent {
    constructor(x, y, r, id, quality) {
        console.log(`[Component ${id}] Initializing with rotation: ${r.toFixed(2)}`);
        this.position = { x, y };
        this.rotation = r;
        this.targetRotation = r;  // Initialize target rotation to match initial rotation
        this.id = id;
        this.quality = quality;
        this.health = 100 * quality;
        this.ship = null;
    }

    serverUpdate(data) {
        if (data.health !== undefined) this.health = data.health;
        if (data.r !== undefined) this.targetRotation = data.r;
    }

    interpolate() {
        if (this.targetRotation !== undefined) {
            this.rotation = lerp(this.rotation, this.targetRotation, 0.1);
        }
    }
}

class Cannon extends ShipComponent {
    constructor(x, y, r, id, quality, efficiency) {
        super(x, y, r, id, quality);
        console.log(`[Cannon ${id}] Created with rotation:`, r.toFixed(2), 
                    r === 0 ? '(WARNING: Zero rotation)' : '');
        this.weaponDamage = 100 * efficiency;
        this.paths = { base: null, turret: null };
    }

    render(ctx) {
        ctx.save();
        // First translate to the module's bind position
        ctx.translate(this.bindPosition.x, this.bindPosition.y);

        // Draw base at ship's rotation (don't rotate it)
        this.paths.base = new Path2D();
        this.drawBase(this.paths.base);
        ctx.fillStyle = '#8B4513';
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 2;
        ctx.fill(this.paths.base);
        ctx.stroke(this.paths.base);

        // Now rotate for the cannon's own rotation (this is the turret rotation)
        ctx.rotate(this.rotation);

        // Draw turret
        this.paths.turret = new Path2D();
        this.drawTurret(this.paths.turret);
        ctx.fillStyle = '#000000';
        ctx.fill(this.paths.turret);

        // Log rotation values for debugging
        // console.log(`[Cannon ${this.id}] Rendering at:`, {
        //     bindPos: `(${this.bindPosition.x}, ${this.bindPosition.y})`,
        //     rotation: this.rotation.toFixed(2),
        //     shipRotation: this.ship?.rotation.toFixed(2)
        // });

        ctx.restore();
    }

    drawBase(path) {
        path.moveTo(15, 10);
        path.lineTo(-15, 10);
        path.lineTo(-15, -10);
        path.lineTo(15, -10);
        path.closePath();
    }

    drawTurret(path) {
        path.moveTo(10, 15);
        path.lineTo(-10, 15);
        path.lineTo(-8, -45);
        path.lineTo(8, -45);
        path.closePath();
    }

    serverUpdate(data) {
        super.serverUpdate(data);
        if (this.targetRotation !== undefined) {
            console.log(`[Cannon ${this.id}] Rotation update:`, {
                current: this.rotation.toFixed(2),
                target: this.targetRotation.toFixed(2)
            });
        }
    }
}

class SteeringWheel extends ShipComponent {
    constructor(x, y, r, id, quality) {
        super(x, y, r, id, quality);
        this.path = null;
    }

    render(ctx) {
        ctx.save();
        ctx.translate(this.position.x, this.position.y);
        ctx.rotate(this.rotation);

        this.path = new Path2D();
        this.path.moveTo(-10, -20);
        this.path.lineTo(10, -20);
        this.path.lineTo(10, 20);
        this.path.lineTo(-10, 20);
        this.path.closePath();

        ctx.fillStyle = '#8B4513';
        ctx.fill(this.path);

        ctx.restore();
    }
}

class Sail extends ShipComponent {
    constructor(x, y, r, id, quality, efficiency) {
        super(x, y, r, id, quality);
        this.efficiency = efficiency;
    }

    render(ctx) {
        // Sail rendering is now handled by the ship's drawSailMast and drawSailFibers methods
    }
}

window.onload = () => new GameClient();
