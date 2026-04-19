import type { Font, GlyphRenderInfo, ResourceLocation } from "../types";
import type { GlyphProvider } from "./provider";
import { MissingGlyphProvider } from "./provider";

export class FontImpl implements Font {
  private missingProvider: GlyphProvider;
  private lineHeight = 9;

  constructor(
    public readonly id: ResourceLocation,
    private providers: GlyphProvider[],
    missingTextureId: string
  ) {
    this.missingProvider = new MissingGlyphProvider(missingTextureId);
  }

  getGlyph(codepoint: number): GlyphRenderInfo | null {
    for (const provider of this.providers) {
      const glyph = provider.getGlyph(codepoint);
      if (glyph) return glyph;
    }
    return this.missingProvider.getGlyph(codepoint);
  }

  hasGlyph(codepoint: number): boolean {
    for (const provider of this.providers) {
      if (provider.hasGlyph(codepoint)) return true;
    }
    return false;
  }

  getLineHeight(): number {
    return this.lineHeight;
  }

  addProvider(provider: GlyphProvider): void {
    this.providers.push(provider);
  }
}
