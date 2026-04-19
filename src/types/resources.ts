export type ResourceLocation = {
  namespace: string;
  path: string;
};

export interface ResourcePack {
  readonly name: string;
  exists(location: ResourceLocation): Promise<boolean>;
  readJson<T>(location: ResourceLocation): Promise<T>;
  readBinary(location: ResourceLocation): Promise<ArrayBuffer>;
  readText(location: ResourceLocation): Promise<string>;
  list(prefix: ResourceLocation): Promise<ResourceLocation[]>;
}

export interface ResourceManager {
  addPack(pack: ResourcePack): void;
  removePack(pack: ResourcePack): void;
  getPacks(): readonly ResourcePack[];
  getResource<T>(location: ResourceLocation): Promise<T | null>;
  getResourceOrThrow<T>(location: ResourceLocation): Promise<T>;
  readText(location: ResourceLocation): Promise<string | null>;
  readBinary(location: ResourceLocation): Promise<ArrayBuffer | null>;
}
