import { GameEvents, globalEventBus } from '../../engine/EventBus.js';

export { globalEventBus, GameEvents };

export function onGameEvent(eventName, callback) {
  return globalEventBus.on(eventName, callback);
}

export function emitGameEvent(eventName, payload) {
  globalEventBus.emit(eventName, payload);
}
