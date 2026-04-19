import type { ResourceManager, ResourcePack, ResourceLocation } from "../types";

export class ResourceManagerImpl implements ResourceManager {
  private packs: ResourcePack[] = [];

  addPack(pack: ResourcePack): void {
    this.packs.unshift(pack);
  }

  removePack(pack: ResourcePack): void {
    const index = this.packs.indexOf(pack);
    if (index !== -1) {
      this.packs.splice(index, 1);
    }
  }

  getPacks(): readonly ResourcePack[] {
    return this.packs;
  }

  async getResource<T>(location: ResourceLocation): Promise<T | null> {
    for (const pack of this.packs) {
      if (await pack.exists(location)) {
        return pack.readJson<T>(location);
      }
    }
    return null;
  }

  async getResourceOrThrow<T>(location: ResourceLocation): Promise<T> {
    const resource = await this.getResource<T>(location);
    if (resource === null) {
      throw new Error(`Resource not found: ${location.namespace}:${location.path}`);
    }
    return resource;
  }

  async readBinary(location: ResourceLocation): Promise<ArrayBuffer | null> {
    for (const pack of this.packs) {
      if (await pack.exists(location)) {
        return pack.readBinary(location);
      }
    }
    return null;
  }

  async readText(location: ResourceLocation): Promise<string | null> {
    for (const pack of this.packs) {
      if (await pack.exists(location)) {
        return pack.readText(location);
      }
    }
    return null;
  }
}

export function createResourceManager(): ResourceManager {
  return new ResourceManagerImpl();
}

export function parseResourceLocation(str: string): ResourceLocation {
  const colonIndex = str.indexOf(":");
  if (colonIndex === -1) {
    return { namespace: "minecraft", path: str };
  }
  return {
    namespace: str.slice(0, colonIndex),
    path: str.slice(colonIndex + 1),
  };
}

export function resourceLocationToString(loc: ResourceLocation): string {
  return `${loc.namespace}:${loc.path}`;
}
