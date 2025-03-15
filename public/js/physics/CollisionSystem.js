import { Player } from '../entities/player/Player.js';

export class CollisionSystem {
    constructor() {
        this.categories = {
            DEFAULT: 0x0001,
            PLAYER: 0x0002,
            SHIP_HULL: 0x0004,
            PLAYER_JUMPED: 0x0008,
            BOARDED_PLAYER: 0x0010,
            SHIP_DETECT: 0x0020,
            SHIP_MODULE: 0x0040,
            SHIP_MODULE_NON_INTERACT: 0x0080,
            PROJECTILES: 0x0100,
            MODULE_INTERACT: 0x0200,  // New category for module interaction
            PLAYER_MOUNTED: 0x0400  // Add new category for mounted state
        };

        // Add collision groups
        this.groups = {
            NONE: 0,              // Use category/mask rules
            PLAYERS: 1,           // Players collide with each other
            SHIPS: 2,            // Ships collide with each other
            BOUNDARIES: -1,        // Boundaries never collide with each other
            SHIP_MODULES: -2,      // Ship modules never collide with each other
        };

        this.masks = {
            PLAYER: {
                category: this.categories.PLAYER,
                mask: this.categories.SHIP_HULL | this.categories.SHIP_MODULE, // Add SHIP_MODULE
                group: this.groups.PLAYERS  // Group 1 - collides with each other
            },
            PLAYER_JUMPED: {
                category: this.categories.PLAYER_JUMPED,
                mask: this.categories.SHIP_HULL,
                group: this.groups.PLAYERS // Use categories/masks when jumping
            },
            SHIP_HULL: {
                category: this.categories.SHIP_HULL,
                mask: this.categories.PLAYER ,
                group: this.groups.SHIPS    // Group 3 - different from players
            },
            BOARDED_PLAYER: {
                category: this.categories.BOARDED_PLAYER,
                mask: this.categories.SHIP_DETECT | this.categories.SHIP_MODULE | this.categories.MODULE_INTERACT,  // Must detect ship sensors
                group: this.groups.PLAYERS 
            },
            SHIP_DETECT: {
                category: this.categories.SHIP_DETECT,
                mask: this.categories.PLAYER_JUMPED | this.categories.BOARDED_PLAYER,
                group: this.groups.NONE
            },
            SHIP_SENSOR: {
                category: this.categories.SHIP_DETECT,
                mask: this.categories.BOARDED_PLAYER | this.categories.PLAYER_JUMPED,  // Must detect boarded players
                group: this.groups.NONE
            },
            SHIP_MODULE: {
                category: this.categories.SHIP_MODULE,
                mask: this.categories.PLAYER | this.categories.BOARDED_PLAYER | this.categories.PROJECTILES,  // Add BOARDED_PLAYER
                group: this.groups.SHIP_MODULES
            },
            SHIP_MODULE_NON_INTERACT: {
                category: this.categories.SHIP_MODULE_NON_INTERACT,
                mask: 0, // Doesn't collide with anything
                group: this.groups.NONE
            },
            PROJECTILES: {
                category: this.categories.PROJECTILES,
                mask: this.categories.SHIP_HULL,
                group: this.groups.NONE
            },
            PLAYER_MOUNTED: {
                category: this.categories.PLAYER_MOUNTED,
                mask: this.categories.SHIP_DETECT,  // Add SHIP_MODULE
                group: this.groups.PLAYERS 
            }
        };

        this.collisions = new Map();
        this.bodies = new Map();

        // Track active collisions with timestamps
        this.activeCollisions = new Map();

        // Add collision listeners map
        this.collisionListeners = new Map();

        // Add current player tracking
        this.currentPlayerId = null;
        this.currentPlayer = null;

        // Track most recent collisions per body
        this.recentCollisions = new Map();

        // Add module interaction tracking
        this.moduleInteractions = new Map();
    }

    setCurrentPlayer(player) {
        this.currentPlayerId = player.id;
        this.currentPlayer = player;
        console.log('[Collision] Set current player:', {
            id: player.id,
            label: player.physicsBody?.label
        });
    }

    handleCollisionStart(bodyA, bodyB) {
        const key = this.getCollisionKey(bodyA, bodyB);
        if (this.collisions.has(key)) return;

        // Determine if this is a ship-player collision
        const isShipPlayerCollision = this.isShipPlayerCollision(bodyA, bodyB);
        
        if (isShipPlayerCollision) {
            const { playerBody, shipBody } = this.getPlayerShipBodies(bodyA, bodyB);
            this.handleShipPlayerImpact(playerBody, shipBody);
        }

        // Continue with normal collision processing
        const collision = {
            bodyA,
            bodyB,
            startTime: Date.now(),
            lastActiveTime: Date.now(),
            type: this.getCollisionType(bodyA, bodyB)
        };

        // Update most recent collisions for both bodies
        this.updateRecentCollisions(bodyA, bodyB);

        this.collisions.set(key, collision);
        this.activeCollisions.set(key, collision);
    }

    // New method to check if collision is between ship and player
    isShipPlayerCollision(bodyA, bodyB) {
        return (
            (bodyA.label?.startsWith('player') && bodyB.label?.startsWith('ship_hull')) ||
            (bodyB.label?.startsWith('player') && bodyA.label?.startsWith('ship_hull'))
        );
    }
    
    // New method to extract player and ship bodies
    getPlayerShipBodies(bodyA, bodyB) {
        if (bodyA.label?.startsWith('player')) {
            return { playerBody: bodyA, shipBody: bodyB };
        } else {
            return { playerBody: bodyB, shipBody: bodyA };
        }
    }
    
    // Modify the handleShipPlayerImpact method to ensure proper force ratio
    handleShipPlayerImpact(playerBody, shipBody) {
        // Only apply impact if player is not already on the ship
        if (playerBody.collisionFilter.category === this.categories.BOARDED_PLAYER) {
            return; // Player is already on the ship, don't apply impact
        }
        
        // Get the ship's velocity
        const shipVelocity = shipBody.velocity;
        const shipSpeed = Math.hypot(shipVelocity.x, shipVelocity.y);
        
        // Only apply impact for significant ship speed
        if (shipSpeed < 0.5) return;
        
        // Calculate impact direction (from ship to player)
        const impactVector = {
            x: playerBody.position.x - shipBody.position.x,
            y: playerBody.position.y - shipBody.position.y
        };
        
        // Normalize the impact vector
        const impactLength = Math.hypot(impactVector.x, impactVector.y);
        const normalizedImpact = {
            x: impactVector.x / impactLength,
            y: impactVector.y / impactLength
        };
        
        // Calculate impact force with extreme mass ratio consideration
        // This was missing in the original implementation
        const massRatio = playerBody.mass / shipBody.mass;
        
        // Player impact on ship should be negligible due to mass difference
        const impactForce = {
            x: (normalizedImpact.x * shipSpeed * shipBody.mass * 0.001) + (shipVelocity.x * 0.8),
            y: (normalizedImpact.y * shipSpeed * shipBody.mass * 0.001) + (shipVelocity.y * 0.8)
        };
        
        // Apply the force to player, but apply minimal counter-force to ship
        const playerForce = {
            x: impactForce.x,
            y: impactForce.y
        };
        
        // Apply extremely reduced counter-force to ship (based on mass ratio)
        // This prevents player from moving the ship
        const shipForce = {
            x: -impactForce.x * massRatio * 0.01, // Further reduce by factor of 100
            y: -impactForce.y * massRatio * 0.01  // Further reduce by factor of 100
        };
        
        // Get player and ship references
        const player = playerBody.plugin?.player || this.getPlayerFromBody(playerBody);
        const ship = shipBody.plugin?.ship;
        
        if (player) {
            player.applyImpactForce(playerForce);
        }
        
        // Only apply negligible counter-force to ship if the collision is significant
        if (ship && shipSpeed > 1.0) {
            console.log('[Collision] Player impact on ship is negligible due to mass ratio:', {
                playerMass: playerBody.mass,
                shipMass: shipBody.mass,
                massRatio: massRatio,
                shipForce: {
                    x: shipForce.x.toFixed(6),
                    y: shipForce.y.toFixed(6)
                }
            });
            // The force is so small it effectively does nothing to the ship
            // We could apply it if needed, but with proper mass ratio it should be negligible
        }
    }
    
    // Helper to get player instance from a body
    getPlayerFromBody(body) {
        if (body.label?.startsWith('player')) {
            // Try to find player from ID
            const playerId = body.label.split('_')[1];
            if (playerId === this.currentPlayerId && this.currentPlayer) {
                return this.currentPlayer;
            }
        }
        return null;
    }

    updateRecentCollisions(bodyA, bodyB) {
        // Keep only the most recent collision for each body
        this.recentCollisions.set(bodyA.id, {
            otherBody: bodyB,
            timestamp: Date.now()
        });
        this.recentCollisions.set(bodyB.id, {
            otherBody: bodyA,
            timestamp: Date.now()
        });
    }

    handleCollisionActive(bodyA, bodyB) {
        const key = this.getCollisionKey(bodyA, bodyB);
        const collision = this.activeCollisions.get(key);
        
        if (collision && (bodyA.isSensor || bodyB.isSensor)) {
            collision.lastActiveTime = Date.now();
            
            // console.log('[Collision] Sensor active:', {
            //     key,
            //     duration: Date.now() - collision.startTime,
            //     bodyA: bodyA.label,
            //     bodyB: bodyB.label,
            //     categoryA: bodyA.collisionFilter?.category?.toString(16),
            //     categoryB: bodyB.collisionFilter?.category?.toString(16)
            // });
        }
    }

    getShipIdFromBody(body) {
        if (!body?.label) return null;

        const parts = body.label.split('_');
        // Standardize: always return the clean ship ID without prefixes
        if (parts.length >= 3 && (parts[0] === 'ship')) {
            const rawId = parts[parts.length - 1];
            // Ensure consistent format: remove any 'static_' prefix
            return rawId.replace('static_', '');
        }
        return null;
    }

    handleCollisionEnd(bodyA, bodyB) {
        if (!bodyA.isSensor && !bodyB.isSensor) return;
        
        const key = this.getCollisionKey(bodyA, bodyB);
        const shipId = this.getShipIdFromBody(bodyA) || this.getShipIdFromBody(bodyB);
        
        // Log collision end details
        console.log('[Collision] Sensor contact lost:', {
            key,
            bodyA: bodyA.label,
            bodyB: bodyB.label,
            shipId,
            currentPlayer: this.currentPlayerId,
            activeCollisionsCount: this.activeCollisions.size,
            wasActive: this.activeCollisions.has(key)
        });

        // Remove from active collisions first
        this.activeCollisions.delete(key);
        this.collisions.delete(key);

        // Remove from recent collisions
        this.removeRecentCollision(bodyA.id, bodyB);
        this.removeRecentCollision(bodyB.id, bodyA);

        // Process player collision after cleanup
        if ((bodyA.label.includes(`player_${this.currentPlayerId}`) || 
             bodyB.label.includes(`player_${this.currentPlayerId}`)) && shipId) {
            console.log('[Collision] Current player lost ship contact:', {
                playerId: this.currentPlayerId,
                shipId,
                remainingCollisions: this.getCollisionsForBody(this.currentPlayer?.physicsBody)
            });
            this.currentPlayer?.unboardShip(shipId);
        }

        // Notify listeners last
        this.notifyCollisionEnd(bodyA, bodyB);
    }

    removeRecentCollision(bodyId, otherBody) {
        const recent = this.recentCollisions.get(bodyId);
        if (recent && recent.otherBody.id === otherBody.id) {
            this.recentCollisions.delete(bodyId);
        }
    }

    getCollisionType(bodyA, bodyB) {
        const catA = bodyA.collisionFilter?.category;
        const catB = bodyB.collisionFilter?.category;

        if (catA === this.categories.PLAYER_JUMPED && 
            catB === this.categories.SHIP_HULL) {
            return 'JUMP_LANDING';
        }

        return 'PHYSICAL';
    }

    getCollisionFilter(category) {
        const filter = this.masks[category];
        if (!filter) {
            console.warn('[Collision] No filter found for category:', category);
            // Return default filter if category not found
            return {
                category: this.categories.DEFAULT,
                mask: 0xFFFFFFFF,  // Collide with everything by default
                group: this.groups.NONE
            };
        }

        return {
            category: filter.category,
            mask: filter.mask,
            group: filter.group
        };
    }

    debugCollisionState() {
  
     
    }

    willBodiesCollide(bodyA, bodyB) {
        const filterA = bodyA.collisionFilter;
        const filterB = bodyB.collisionFilter;

        // Groups with the same non-zero value take precedence
        if (filterA.group !== 0 && filterA.group === filterB.group) {
            return filterA.group > 0; // Positive groups collide, negative don't
        }

        // Different groups or zero group - use category/mask
        return (filterA.mask & filterB.category) !== 0 && 
               (filterB.mask & filterA.category) !== 0;
    }

    // Helper methods
    getCollisionKey(bodyA, bodyB) {
        return bodyA.id < bodyB.id ? 
            `${bodyA.id}-${bodyB.id}` : 
            `${bodyB.id}-${bodyA.id}`;
    }

    processCollision(collision) {
        console.log('[Collision] Processing:', {
            type: collision.type,
            bodyA: collision.bodyA.label,
            bodyB: collision.bodyB.label
        });
    }

    // Body management
    addBody(id, body) {
        this.bodies.set(id, body);
    }

    removeBody(id) {
        this.bodies.delete(id);
        // Clean up any collisions involving this body
        for (const [key, collision] of this.collisions.entries()) {
            if (collision.bodyA.id === id || collision.bodyB.id === id) {
                this.collisions.delete(key);
                this.activeCollisions.delete(key);
            }
        }
    }

    getCollisionsForBody(targetBody) {
        if (!targetBody) return [];

        // Only return collisions that are still active
        const activeCollisions = [];
        for (const collision of this.activeCollisions.values()) {
            if (collision.bodyA.id === targetBody.id) {
                activeCollisions.push(collision.bodyB);
            } else if (collision.bodyB.id === targetBody.id) {
                activeCollisions.push(collision.bodyA);
            }
        }

        return activeCollisions;
    }

    addCollisionListener(bodyId, callbacks) {
        this.collisionListeners.set(bodyId, callbacks);
        console.log('[Collision] Added listener for:', bodyId);
    }

    removeCollisionListener(bodyId) {
        this.collisionListeners.delete(bodyId);
    }

    notifyCollisionEnd(bodyA, bodyB) {
        const listenerA = this.collisionListeners.get(bodyA.id);
        const listenerB = this.collisionListeners.get(bodyB.id);

        console.log('[Collision] End notification:', {
            bodyAId: bodyA.id,
            bodyBId: bodyB.id,
            hasListenerA: !!listenerA,
            hasListenerB: !!listenerB
        });

        if (listenerA?.onCollisionEnd) {
            listenerA.onCollisionEnd(bodyB);
        }
        if (listenerB?.onCollisionEnd) {
            listenerB.onCollisionEnd(bodyA);
        }
    }

    isPlayerNearModule(playerBody, moduleBody) {
        if (!playerBody || !moduleBody) {
            console.log('[Collision] Invalid bodies for module proximity check:', {
                hasPlayerBody: !!playerBody,
                hasModuleBody: !!moduleBody
            });
            return false;
        }

        // Get interaction radius from module type
        const moduleType = moduleBody.label.split('_')[1] || 'unknown';
        const interactionRadius = this.getModuleInteractionRadius(moduleType, moduleBody.plugin?.component);

        const isInRange = this.physicsManager.isBodyInRange(playerBody, moduleBody, interactionRadius);

        console.log('[Collision] Module proximity check:', {
            moduleType,
            playerLabel: playerBody.label,
            moduleLabel: moduleBody.label,
            interactionRadius,
            isInRange
        });

        return isInRange;
    }

    getModuleInteractionRadius(moduleType, component) {
        // Base interaction distances
        const distances = {
            cannon: 40,
            steering: 35,
            sail: 45,
            default: 35
        };

        // Check component type if available
        if (component?.getInteractionRadius) {
            return component.getInteractionRadius();
        }

        // Fallback to type-based distances
        moduleType = moduleType.toLowerCase();
        if (moduleType.includes('cannon')) return distances.cannon;
        if (moduleType.includes('steer')) return distances.steering;
        if (moduleType.includes('sail')) return distances.sail;
        
        return distances.default;
    }

    checkModuleInteraction(playerId, moduleId) {
        const interaction = this.moduleInteractions.get(playerId);
        if (!interaction) {
            console.log('[Collision] No active interaction for player:', playerId);
            return null;
        }
        
        const isValid = interaction.moduleId === moduleId;
        console.log('[Collision] Module interaction check:', {
            playerId,
            moduleId,
            currentInteraction: interaction,
            isValid
        });
        
        return isValid ? interaction : null;
    }
}
