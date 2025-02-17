export class CollisionSystem {
    constructor() {
        this.collisions = new Set();
        this.collisionCallbacks = new Map();
        
        // Collision categories
        this.categories = {
            DEFAULT: 0x0001,
            PLAYER: 0x0002,
            SHIP_HULL: 0x0004,
            MOUNT_SENSOR: 0x0008,
            DECK: 0x0010,
            WATER: 0x0020
        };

        // Collision masks (what each category can collide with)
        this.masks = {
            PLAYER: this.categories.SHIP_HULL | this.categories.MOUNT_SENSOR | this.categories.WATER,
            SHIP_HULL: this.categories.PLAYER | this.categories.SHIP_HULL,
            MOUNT_SENSOR: this.categories.PLAYER,
            DECK: this.categories.PLAYER,
            WATER: this.categories.PLAYER | this.categories.SHIP_HULL
        };
    }

    registerCollisionHandler(entityType, callback) {
        this.collisionCallbacks.set(entityType, callback);
    }

    handleCollision(entityA, entityB) {
        const collisionKey = `${entityA.id}-${entityB.id}`;
        
        if (this.collisions.has(collisionKey)) {
            return; // Already handling this collision
        }

        this.collisions.add(collisionKey);

        // Get entity types
        const typeA = this.getEntityType(entityA);
        const typeB = this.getEntityType(entityB);

        // Execute registered callbacks
        const callbackA = this.collisionCallbacks.get(typeA);
        const callbackB = this.collisionCallbacks.get(typeB);

        if (callbackA) callbackA(entityA, entityB);
        if (callbackB) callbackB(entityB, entityA);

        console.log('[Collision] Detected:', {
            entityA: { type: typeA, id: entityA.id },
            entityB: { type: typeB, id: entityB.id }
        });
    }

    getEntityType(entity) {
        if (entity.label?.startsWith('player')) return 'player';
        if (entity.label?.startsWith('ship_hull')) return 'ship';
        if (entity.label?.startsWith('ship_mount')) return 'mount';
        if (entity.label?.startsWith('deck')) return 'deck';
        return 'unknown';
    }

    getCollisionFilter(category) {
        return {
            category: this.categories[category],
            mask: this.masks[category],
            group: 0
        };
    }

    endCollision(entityA, entityB) {
        const collisionKey = `${entityA.id}-${entityB.id}`;
        this.collisions.delete(collisionKey);
    }

    clearCollisions() {
        this.collisions.clear();
    }
}