import type {
  FontManager,
  Font,
  FontDefinition,
  FontProvider as FontProviderConfig,
  BitmapProvider,
  SpaceProvider,
  ReferenceProvider,
  ResourceLocation,
} from "../types";
import { FontImpl } from "./font";
import { BitmapGlyphProvider, SpaceGlyphProvider, type GlyphProvider } from "./provider";
import { ResourceManagerImpl } from "../resources/manager";
import { parseResourceLocation, resourceLocationToString } from "../resources";
import { WebGLTextureManager } from "../renderer/webgl-texture";

export class FontManagerImpl implements FontManager {
  private fonts = new Map<string, Font>();
  private loading = new Map<string, Promise<Font>>();
  private defaultFont: Font | null = null;

  constructor(
    private resources: ResourceManagerImpl,
    private textures: WebGLTextureManager
  ) {}

  async loadFont(id: ResourceLocation): Promise<Font> {
    const key = resourceLocationToString(id);

    const existing = this.fonts.get(key);
    if (existing) return existing;

    const loading = this.loading.get(key);
    if (loading) return loading;

    const promise = this.doLoadFont(id);
    this.loading.set(key, promise);

    try {
      const font = await promise;
      this.fonts.set(key, font);
      if (!this.defaultFont && key === "minecraft:default") {
        this.defaultFont = font;
      }
      return font;
    } finally {
      this.loading.delete(key);
    }
  }

  private async doLoadFont(id: ResourceLocation): Promise<Font> {
    const defLocation: ResourceLocation = {
      namespace: id.namespace,
      path: `font/${id.path}.json`,
    };

    const definition = await this.resources.getResource<FontDefinition>(defLocation);
    if (!definition) {
      throw new Error(`Font definition not found: ${resourceLocationToString(id)}`);
    }

    const providers: GlyphProvider[] = [];
    const missingTextureId = `${id.namespace}:font/missing`;

    for (const providerConfig of definition.providers) {
      const subProviders = await this.createProvider(providerConfig, id.namespace);
      providers.push(...subProviders);
    }

    return new FontImpl(id, providers, missingTextureId);
  }

  private async createProvider(
    config: FontProviderConfig,
    defaultNamespace: string
  ): Promise<GlyphProvider[]> {
    switch (config.type) {
      case "bitmap": {
        const provider = await this.createBitmapProvider(config, defaultNamespace);
        return provider ? [provider] : [];
      }
      case "space":
        return [this.createSpaceProvider(config)];
      case "reference":
        return this.createReferenceProvider(config, defaultNamespace);
      case "ttf":
      case "unihex":
        return [];
      default:
        return [];
    }
  }

  private async createReferenceProvider(
    config: ReferenceProvider,
    defaultNamespace: string
  ): Promise<GlyphProvider[]> {
    const refLoc = parseResourceLocation(config.id);
    if (refLoc.namespace === "minecraft" && !config.id.includes(":")) {
      refLoc.namespace = defaultNamespace;
    }

    const defLocation: ResourceLocation = {
      namespace: refLoc.namespace,
      path: `font/${refLoc.path}.json`,
    };

    const definition = await this.resources.getResource<FontDefinition>(defLocation);
    if (!definition) {
      console.warn(`Referenced font not found: ${config.id}`);
      return [];
    }

    const providers: GlyphProvider[] = [];
    for (const providerConfig of definition.providers) {
      const subProviders = await this.createProvider(providerConfig, refLoc.namespace);
      providers.push(...subProviders);
    }
    return providers;
  }

  private async createBitmapProvider(
    config: BitmapProvider,
    defaultNamespace: string
  ): Promise<GlyphProvider | null> {
    const textureLoc = parseResourceLocation(config.file);
    if (textureLoc.namespace === "minecraft" && !config.file.includes(":")) {
      textureLoc.namespace = defaultNamespace;
    }

    const textureId = resourceLocationToString(textureLoc);
    let texture = this.textures.getTextureWithData(textureLoc);

    if (!texture) {
      try {
        await this.textures.loadTexture(textureLoc);
        texture = this.textures.getTextureWithData(textureLoc);
      } catch {
        return null;
      }
    }

    if (!texture) return null;

    return new BitmapGlyphProvider(
      config,
      textureId,
      texture.handle.width,
      texture.handle.height,
      texture.imageData
    );
  }

  private createSpaceProvider(config: SpaceProvider): GlyphProvider {
    return new SpaceGlyphProvider(config);
  }

  getFont(id: ResourceLocation): Font | null {
    return this.fonts.get(resourceLocationToString(id)) ?? null;
  }

  getDefaultFont(): Font {
    if (!this.defaultFont) {
      throw new Error("Default font not loaded");
    }
    return this.defaultFont;
  }

  unloadFont(id: ResourceLocation): void {
    const key = resourceLocationToString(id);
    this.fonts.delete(key);
  }

  clear(): void {
    this.fonts.clear();
    this.defaultFont = null;
  }
}

export function createFontManager(
  resources: ResourceManagerImpl,
  textures: WebGLTextureManager
): FontManager {
  return new FontManagerImpl(resources, textures);
}
