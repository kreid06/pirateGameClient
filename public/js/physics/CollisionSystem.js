import { Player } from '../entities/player/Player.js';

export class CollisionSystem {
    constructor() {
        this.categories = {
            DEFAULT: 0x0001,
            PLAYER: 0x0002,
            SHIP_HULL: 0x0004,
            PLAYER_JUMPED: 0x0008,
            BOARDED_PLAYER: 0x0010,
            SHIP_DETECT: 0x0020
        };

        // Add collision groups
        this.groups = {
            NONE: 0,              // Use category/mask rules
            PLAYERS: 1,           // Players collide with each other
            BOARDED_PLAYERS: 2,           // Mounted players collide with each other
            SHIPS: 3,            // Ships collide with each other
            BOUNDARIES: -1        // Boundaries never collide with each other
        };

        this.masks = {
            PLAYER: {
                category: this.categories.PLAYER,
                mask: this.categories.SHIP_HULL ,
                group: this.groups.PLAYERS  // Group 1 - collides with each other
            },
            PLAYER_JUMPED: {
                category: this.categories.PLAYER_JUMPED,
                mask: this.categories.SHIP_HULL,
                group: this.groups.NONE  // Use categories/masks when jumping
            },
            SHIP_HULL: {
                category: this.categories.SHIP_HULL,
                mask: this.categories.PLAYER ,
                group: this.groups.SHIPS    // Group 3 - different from players
            },
            BOARDED_PLAYER: {
                category: this.categories.BOARDED_PLAYER,
                mask: this.categories.SHIP_DETECT,  // Must detect ship sensors
                group: this.groups.BOARDED_PLAYERS  // Mounted players don't collide
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
        // Handle both ship_hull_123 and ship_sensor_123 formats
        if (parts.length >= 3 && (parts[0] === 'ship')) {
            return parts[parts.length - 1]; // Always get last part as ID
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

        console.log('[Collision] Active collisions for body:', {
            bodyId: targetBody.id,
            bodyLabel: targetBody.label,
            collisionCount: activeCollisions.length,
            collisions: activeCollisions.map(b => ({
                id: b.id,
                label: b.label,
                category: b.collisionFilter?.category?.toString(16)
            }))
        });

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
}
