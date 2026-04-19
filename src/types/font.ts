import type { ResourceLocation } from "./resources";

export type GlyphFilter = {
  uniform?: boolean;
};

export type BitmapProvider = {
  type: "bitmap";
  file: string;
  ascent: number;
  height?: number;
  chars: string[];
};

export type SpaceProvider = {
  type: "space";
  advances: Record<string, number>;
};

export type ReferenceProvider = {
  type: "reference";
  id: string;
  filter?: GlyphFilter;
};

export type TtfProvider = {
  type: "ttf";
  file: string;
  size: number;
  oversample: number;
  shift?: [number, number];
  skip?: string;
};

export type UnihexProvider = {
  type: "unihex";
  hex_file: string;
  size_overrides?: Array<{
    from: string;
    to: string;
    left: number;
    right: number;
  }>;
};

export type FontProvider =
  | BitmapProvider
  | SpaceProvider
  | ReferenceProvider
  | TtfProvider
  | UnihexProvider;

export type FontDefinition = {
  providers: FontProvider[];
};

export interface GlyphInfo {
  readonly codepoint: number;
  readonly advance: number;
}

export interface GlyphRenderInfo extends GlyphInfo {
  readonly left: number;
  readonly right: number;
  readonly up: number;
  readonly down: number;
  readonly u0: number;
  readonly v0: number;
  readonly u1: number;
  readonly v1: number;
  readonly textureId: string;
}

export interface Font {
  readonly id: ResourceLocation;
  getGlyph(codepoint: number): GlyphRenderInfo | null;
  hasGlyph(codepoint: number): boolean;
  getLineHeight(): number;
}

export interface FontManager {
  loadFont(id: ResourceLocation): Promise<Font>;
  getFont(id: ResourceLocation): Font | null;
  getDefaultFont(): Font;
  unloadFont(id: ResourceLocation): void;
  clear(): void;
}
