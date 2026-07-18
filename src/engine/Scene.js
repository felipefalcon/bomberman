import { globalEventBus, GameEvents } from './EventBus.js';

/**
 * Scene - Base scene class for game scenes
 * Handles lifecycle methods and system orchestration
 */
export class Scene {
  constructor(name, eventBus = globalEventBus) {
    this.name = name;
    this.eventBus = eventBus;
    this.active = false;
    this.systems = [];
    this.entities = [];
  }

  /**
   * Called when scene is created
   */
  create() {
    console.log(`Scene "${this.name}" created`);
    this.eventBus.emit('scene:created', { scene: this.name });
  }

  /**
   * Called when scene becomes active
   */
  activate() {
    this.active = true;
    console.log(`Scene "${this.name}" activated`);
    this.eventBus.emit('scene:activated', { scene: this.name });
  }

  /**
   * Called when scene becomes inactive
   */
  deactivate() {
    this.active = false;
    console.log(`Scene "${this.name}" deactivated`);
    this.eventBus.emit('scene:deactivated', { scene: this.name });
  }

  /**
   * Called when scene is destroyed
   */
  destroy() {
    this.active = false;
    this.systems.forEach(system => {
      if (system.destroy) system.destroy();
    });
    this.systems = [];
    this.entities = [];
    console.log(`Scene "${this.name}" destroyed`);
    this.eventBus.emit('scene:destroyed', { scene: this.name });
  }

  /**
   * Update scene - called every frame
   * @param {number} delta - Time delta
   */
  update(delta) {
    if (!this.active) return;
    
    // Update all systems
    for (const system of this.systems) {
      if (system.update) {
        system.update(delta);
      }
    }
  }

  /**
   * Add a system to the scene
   * @param {Object} system - System to add
   */
  addSystem(system) {
    this.systems.push(system);
    
    if (system.setScene) {
      system.setScene(this);
    }
    
    if (system.create) {
      system.create();
    }
    
    console.log(`Scene "${this.name}": Added system ${system.constructor.name}`);
  }

  /**
   * Remove a system from the scene
   * @param {Object} system - System to remove
   */
  removeSystem(system) {
    const index = this.systems.indexOf(system);
    if (index !== -1) {
      this.systems.splice(index, 1);
      
      if (system.destroy) {
        system.destroy();
      }
      
      console.log(`Scene "${this.name}": Removed system ${system.constructor.name}`);
    }
  }

  /**
   * Add an entity to the scene
   * @param {Object} entity - Entity to add
   */
  addEntity(entity) {
    this.entities.push(entity);
    
    if (entity.setScene) {
      entity.setScene(this);
    }
    
    console.log(`Scene "${this.name}": Added entity ${entity.constructor.name}`);
  }

  /**
   * Remove an entity from the scene
   * @param {Object} entity - Entity to remove
   */
  removeEntity(entity) {
    const index = this.entities.indexOf(entity);
    if (index !== -1) {
      this.entities.splice(index, 1);
      
      if (entity.destroy) {
        entity.destroy();
      }
      
      console.log(`Scene "${this.name}": Removed entity ${entity.constructor.name}`);
    }
  }

  /**
   * Get a system by type
   * @param {Function} SystemClass - System class to find
   * @returns {Object|null} System instance or null
   */
  getSystem(SystemClass) {
    return this.systems.find(system => system instanceof SystemClass) || null;
  }

  /**
   * Get all entities of a specific type
   * @param {Function} EntityClass - Entity class to filter by
   * @returns {Array} Array of entities
   */
  getEntities(EntityClass) {
    return this.entities.filter(entity => entity instanceof EntityClass);
  }

  /**
   * Check if scene is active
   * @returns {boolean}
   */
  isActive() {
    return this.active;
  }
}

/**
 * GameScene - Main game scene
 * Extends Scene with game-specific functionality
 */
export class GameScene extends Scene {
  constructor(eventBus = globalEventBus) {
    super('GameScene', eventBus);
    this.gameContainer = null;
    this.stage = null;
  }

  /**
   * Initialize game scene with PIXI stage
   * @param {PIXI.Stage} stage - PIXI stage
   * @param {Object} config - Scene configuration
   */
  init(stage, config = {}) {
    this.stage = stage;
    this.config = config;
    
    // Create game container
    this.gameContainer = new PIXI.Container();
    this.gameContainer.x = config.sidebarWidth || 0;
    this.gameContainer.y = config.tileSize || 0;
    this.stage.addChild(this.gameContainer);
    
    console.log(`GameScene initialized with config:`, config);
  }

  /**
   * Get the game container
   * @returns {PIXI.Container}
   */
  getContainer() {
    return this.gameContainer;
  }

  /**
   * Get the stage
   * @returns {PIXI.Stage}
   */
  getStage() {
    return this.stage;
  }

  /**
   * Override destroy to clean up PIXI objects
   */
  destroy() {
    if (this.gameContainer && this.gameContainer.parent) {
      this.gameContainer.parent.removeChild(this.gameContainer);
    }
    
    super.destroy();
  }
}
