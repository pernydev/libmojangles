import type { ResourcePack, ResourceLocation } from "../types";
import JSZip from "jszip";

export class ResourcePackZIP implements ResourcePack {
  readonly name: string;
  private files = new Map<string, ArrayBuffer>();
  private textCache = new Map<string, string>();

  private constructor(name: string) {
    this.name = name;
  }

  static async fromZip(
    zipData: ArrayBuffer,
    name: string = "zip"
  ): Promise<ResourcePackZIP> {
    const pack = new ResourcePackZIP(name);
    const zip = await JSZip.loadAsync(zipData);

    for (const [path, file] of Object.entries(zip.files)) {
      if (file.dir) continue;
      const data = await file.async("arraybuffer");
      pack.files.set(path, data);
    }

    return pack;
  }

  private buildKey(location: ResourceLocation): string {
    return `assets/${location.namespace}/${location.path}`;
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
        if (match && match[1] && match[2]) {
          results.push({ namespace: match[1], path: match[2] });
        }
      }
    }

    return results;
  }
}
