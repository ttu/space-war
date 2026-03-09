import { Component, EntityId, World } from '../types';

export class WorldImpl implements World {
  private entities: Map<EntityId, Map<string, Component>> = new Map();
  private nextEntityId = 0;

  createEntity(): EntityId {
    const id = `e_${this.nextEntityId++}`;
    this.entities.set(id, new Map());
    return id;
  }

  removeEntity(entityId: EntityId): void {
    this.entities.delete(entityId);
  }

  addComponent<T extends Component>(entityId: EntityId, component: T): void {
    const components = this.entities.get(entityId);
    if (components) {
      components.set(component.type, component);
    }
  }

  getComponent<T extends Component>(entityId: EntityId, type: string): T | undefined {
    const components = this.entities.get(entityId);
    return components?.get(type) as T | undefined;
  }

  hasComponent(entityId: EntityId, type: string): boolean {
    const components = this.entities.get(entityId);
    return components?.has(type) ?? false;
  }

  removeComponent(entityId: EntityId, type: string): void {
    const components = this.entities.get(entityId);
    components?.delete(type);
  }

  query(...componentTypes: string[]): EntityId[] {
    const result: EntityId[] = [];
    for (const [entityId, components] of this.entities) {
      if (componentTypes.every((type) => components.has(type))) {
        result.push(entityId);
      }
    }
    return result;
  }

  getAllEntities(): EntityId[] {
    return Array.from(this.entities.keys());
  }

  clear(): void {
    this.entities.clear();
    this.nextEntityId = 0;
  }

  getEntityComponents(entityId: EntityId): Record<string, Component> {
    const components = this.entities.get(entityId);
    if (!components) return {};
    return Object.fromEntries(components);
  }
}
