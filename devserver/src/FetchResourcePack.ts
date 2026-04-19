import type { ResourcePack, ResourceLocation } from "libmojangles";

export class FetchResourcePack implements ResourcePack {
  readonly name: string;
  private baseUrl: string;

  constructor(name: string, baseUrl: string) {
    this.name = name;
    this.baseUrl = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
  }

  private buildPath(location: ResourceLocation): string {
    return `${this.baseUrl}/assets/${location.namespace}/${location.path}`;
  }

  async exists(location: ResourceLocation): Promise<boolean> {
    const path = this.buildPath(location);
    try {
      const response = await fetch(path, { method: "HEAD" });
      return response.ok;
    } catch {
      return false;
    }
  }

  async readJson<T>(location: ResourceLocation): Promise<T> {
    const path = this.buildPath(location);
    const response = await fetch(path);
    if (!response.ok) {
      throw new Error(`Failed to fetch ${path}: ${response.status}`);
    }
    return response.json();
  }

  async readBinary(location: ResourceLocation): Promise<ArrayBuffer> {
    const path = this.buildPath(location);
    const response = await fetch(path);
    if (!response.ok) {
      throw new Error(`Failed to fetch ${path}: ${response.status}`);
    }
    return response.arrayBuffer();
  }

  async readText(location: ResourceLocation): Promise<string> {
    const path = this.buildPath(location);
    const response = await fetch(path);
    if (!response.ok) {
      throw new Error(`Failed to fetch ${path}: ${response.status}`);
    }
    return response.text();
  }

  async list(prefix: ResourceLocation): Promise<ResourceLocation[]> {
    return [];
  }
}
