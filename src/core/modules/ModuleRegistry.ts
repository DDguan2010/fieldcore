import type { FieldModule } from "./FieldModule";

export class ModuleRegistry {
  private modules = new Map<string, FieldModule>();

  register(module: FieldModule) {
    this.modules.set(module.id, module);
  }

  list(): FieldModule[] {
    return [...this.modules.values()];
  }

  get(id: string): FieldModule {
    const module = this.modules.get(id);
    if (!module) {
      throw new Error(`Unknown field module: ${id}`);
    }
    return module;
  }
}
