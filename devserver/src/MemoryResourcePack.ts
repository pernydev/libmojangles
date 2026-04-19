import type { ResourcePack, ResourceLocation } from "libmojangles";
import JSZip from "jszip";

export class MemoryResourcePack implements ResourcePack {
  readonly name: string;
  private files = new Map<string, ArrayBuffer>();
  private textCache = new Map<string, string>();

  constructor(name: string) {
    this.name = name;
  }

  private buildKey(location: ResourceLocation): string {
    return `assets/${location.namespace}/${location.path}`;
  }

  setFile(location: ResourceLocation, data: ArrayBuffer): void {
    const key = this.buildKey(location);
    this.files.set(key, data);
    this.textCache.delete(key);
  }

  setTextFile(location: ResourceLocation, text: string): void {
    const key = this.buildKey(location);
    const encoder = new TextEncoder();
    this.files.set(key, encoder.encode(text).buffer);
    this.textCache.set(key, text);
  }

  async loadFromZip(zipData: ArrayBuffer): Promise<string[]> {
    const zip = await JSZip.loadAsync(zipData);
    const loadedPaths: string[] = [];

    for (const [path, file] of Object.entries(zip.files)) {
      if (file.dir) continue;

      const data = await file.async("arraybuffer");
      this.files.set(path, data);
      loadedPaths.push(path);
    }

    return loadedPaths;
  }

  getLoadedPaths(): string[] {
    return Array.from(this.files.keys());
  }

  getFonts(): ResourceLocation[] {
    const fonts: ResourceLocation[] = [];
    for (const path of this.files.keys()) {
      const match = path.match(/^assets\/([^/]+)\/font\/([^/]+)\.json$/);
      if (match) {
        fonts.push({ namespace: match[1], path: match[2] });
      }
    }
    return fonts;
  }

  getShaders(): { vertex: ResourceLocation[]; fragment: ResourceLocation[] } {
    const vertex: ResourceLocation[] = [];
    const fragment: ResourceLocation[] = [];

    for (const path of this.files.keys()) {
      const match = path.match(/^assets\/([^/]+)\/(.+\.(vsh|fsh))$/);
      if (match) {
        const loc = { namespace: match[1], path: match[2] };
        if (match[3] === "vsh") {
          vertex.push(loc);
        } else {
          fragment.push(loc);
        }
      }
    }

    return { vertex, fragment };
  }

  clear(): void {
    this.files.clear();
    this.textCache.clear();
  }

  async exists(location: ResourceLocation): Promise<boolean> {
    return this.files.has(this.buildKey(location));
  }

  async readJson<T>(location: ResourceLocation): Promise<T> {
    const text = await this.readText(location);
    return JSON.parse(text);
  }

  async readBinary(location: ResourceLocation): Promise<ArrayBuffer> {
    const key = this.buildKey(location);
    const data = this.files.get(key);
    if (!data) {
      throw new Error(`File not found: ${key}`);
    }
    return data;
  }

  async readText(location: ResourceLocation): Promise<string> {
    const key = this.buildKey(location);

    const cached = this.textCache.get(key);
    if (cached !== undefined) return cached;

    const data = this.files.get(key);
    if (!data) {
      throw new Error(`File not found: ${key}`);
    }

    const decoder = new TextDecoder();
    const text = decoder.decode(data);
    this.textCache.set(key, text);
    return text;
  }

  async list(prefix: ResourceLocation): Promise<ResourceLocation[]> {
    const prefixKey = this.buildKey(prefix);
    const results: ResourceLocation[] = [];

    for (const path of this.files.keys()) {
      if (path.startsWith(prefixKey)) {
        const match = path.match(/^assets\/([^/]+)\/(.+)$/);
        if (match) {
          results.push({ namespace: match[1], path: match[2] });
        }
      }
    }

    return results;
  }
}
