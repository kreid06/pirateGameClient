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
                mask: this.categories.SHIP_DETECT,  // Can only detect ship sensors
                group: this.groups.BOARDED_PLAYERS  // Mounted players don't collide
            },
            SHIP_DETECT: {
                category: this.categories.SHIP_DETECT,
                mask: this.categories.PLAYER_JUMPED | this.categories.BOARDED_PLAYER,
                group: this.groups.NONE
            },
            SHIP_SENSOR: {
                category: this.categories.SHIP_DETECT,
                mask: this.categories.BOARDED_PLAYER | this.categories.PLAYER_JUMPED,  // Detects both boarded and jumping players
                group: this.groups.NONE
            }
        };

        this.collisions = new Map();
        this.bodies = new Map();
    }

    handleCollision(bodyA, bodyB) {
        const key = this.getCollisionKey(bodyA, bodyB);
        if (this.collisions.has(key)) return;

        const collision = {
            bodyA,
            bodyB,
            startTime: Date.now(),
            type: this.getCollisionType(bodyA, bodyB)
        };

        this.collisions.set(key, collision);
        this.processCollision(collision);
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
            }
        }
    }

    getCollisionsForBody(targetBody) {
        if (!targetBody) {
            console.warn('[Collision] Cannot get collisions for null body');
            return [];
        }

        // Get all collisions involving this body
        const activeCollisions = [];
        for (const collision of this.collisions.values()) {
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
                category: b.collisionFilter?.category
            }))
        });

        return activeCollisions;
    }
}
