/**
 * DependencyInjection - Simple DI Container
 * Manages dependencies and provides them to systems
 */
export class DIContainer {
  constructor() {
    this.services = new Map();
    this.factories = new Map();
  }

  /**
   * Register a service instance
   * @param {string} name - Service name
   * @param {*} instance - Service instance
   */
  register(name, instance) {
    this.services.set(name, instance);
  }

  /**
   * Register a factory function for lazy initialization
   * @param {string} name - Service name
   * @param {Function} factory - Factory function
   */
  registerFactory(name, factory) {
    this.factories.set(name, factory);
  }

  /**
   * Get a service by name
   * @param {string} name - Service name
   * @returns {*} Service instance
   */
  get(name) {
    // Check if instance exists
    if (this.services.has(name)) {
      return this.services.get(name);
    }

    // Check if factory exists
    if (this.factories.has(name)) {
      const factory = this.factories.get(name);
      const instance = factory();
      this.services.set(name, instance);
      return instance;
    }

    throw new Error(`Service '${name}' not found in DI container`);
  }

  /**
   * Check if a service is registered
   * @param {string} name - Service name
   * @returns {boolean}
   */
  has(name) {
    return this.services.has(name) || this.factories.has(name);
  }

  /**
   * Clear all services
   */
  clear() {
    this.services.clear();
    this.factories.clear();
  }
}

// Global DI container instance
export const diContainer = new DIContainer();
