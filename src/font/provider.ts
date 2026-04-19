import type {
  BitmapProvider,
  SpaceProvider,
  GlyphRenderInfo,
} from "../types";
import { GlyphRenderInfoImpl, SpaceGlyph } from "./glyph";

export interface GlyphProvider {
  getGlyph(codepoint: number): GlyphRenderInfo | null;
  hasGlyph(codepoint: number): boolean;
  getCodepoints(): number[];
}

export class BitmapGlyphProvider implements GlyphProvider {
  private glyphs = new Map<number, GlyphRenderInfo>();
  private codepoints: number[] = [];

  constructor(
    private config: BitmapProvider,
    private textureId: string,
    private textureWidth: number,
    private textureHeight: number,
    private imageData: Uint8Array | null = null
  ) {
    this.buildGlyphMap();
  }

  private buildGlyphMap(): void {
    const configuredHeight = this.config.height ?? 8;
    const ascent = this.config.ascent;
    const chars = this.config.chars;

    const gridWidth = chars[0]?.length ?? 0;
    const gridHeight = chars.length;
    if (gridWidth === 0 || gridHeight === 0) return;

    const cellWidth = this.textureWidth / gridWidth;
    const cellHeight = this.textureHeight / gridHeight;
    const pixelScale = configuredHeight / cellHeight;
    const oversample = 1 / pixelScale;

    for (let row = 0; row < chars.length; row++) {
      const charRow = chars[row] ?? "";
      let col = 0;
      for (const char of charRow) {
        const codepoint = char.codePointAt(0);
        if (codepoint !== undefined && codepoint !== 0) {
          const actualWidth = this.getActualGlyphWidth(col, row, cellWidth, cellHeight);
          const advance = Math.round(actualWidth * pixelScale) + 1;

          const left = 0;
          const right = actualWidth / oversample;
          const up = 7.0 - ascent;
          const down = up + cellHeight / oversample;

          const u0 = (col * cellWidth) / this.textureWidth;
          const v0 = (row * cellHeight) / this.textureHeight;
          const u1 = (col * cellWidth + actualWidth) / this.textureWidth;
          const v1 = ((row + 1) * cellHeight) / this.textureHeight;

          const glyph = new GlyphRenderInfoImpl(
            codepoint,
            advance,
            left,
            right,
            up,
            down,
            u0,
            v0,
            u1,
            v1,
            this.textureId
          );
          this.glyphs.set(codepoint, glyph);
          this.codepoints.push(codepoint);
        }
        col++;
      }
    }

    if (!this.glyphs.has(32)) {
      this.glyphs.set(32, new SpaceGlyph(32, 4));
      this.codepoints.push(32);
    }
  }

  private getActualGlyphWidth(
    gridX: number,
    gridY: number,
    cellWidth: number,
    cellHeight: number
  ): number {
    if (!this.imageData) {
      return cellWidth;
    }

    const startX = Math.floor(gridX * cellWidth);
    const startY = Math.floor(gridY * cellHeight);
    const endX = Math.floor(startX + cellWidth);
    const endY = Math.floor(startY + cellHeight);

    for (let x = endX - 1; x >= startX; x--) {
      for (let y = startY; y < endY; y++) {
        const idx = (y * this.textureWidth + x) * 4;
        const alpha = this.imageData[idx + 3] ?? 0;
        if (alpha > 0) {
          return x - startX + 1;
        }
      }
    }

    return 0;
  }

  getGlyph(codepoint: number): GlyphRenderInfo | null {
    return this.glyphs.get(codepoint) ?? null;
  }

  hasGlyph(codepoint: number): boolean {
    return this.glyphs.has(codepoint);
  }

  getCodepoints(): number[] {
    return this.codepoints;
  }
}

export class SpaceGlyphProvider implements GlyphProvider {
  private advances = new Map<number, number>();

  constructor(config: SpaceProvider) {
    for (const [char, advance] of Object.entries(config.advances)) {
      const codepoint = char.codePointAt(0);
      if (codepoint !== undefined) {
        this.advances.set(codepoint, advance);
      }
    }
  }

  getGlyph(codepoint: number): GlyphRenderInfo | null {
    const advance = this.advances.get(codepoint);
    if (advance === undefined) return null;
    return new SpaceGlyph(codepoint, advance);
  }

  hasGlyph(codepoint: number): boolean {
    return this.advances.has(codepoint);
  }

  getCodepoints(): number[] {
    return Array.from(this.advances.keys());
  }
}

export class MissingGlyphProvider implements GlyphProvider {
  private readonly missingGlyph: GlyphRenderInfo;

  constructor(textureId: string) {
    this.missingGlyph = new GlyphRenderInfoImpl(
      0xfffd,
      6,
      0,
      5,
      0,
      7,
      0,
      0,
      1,
      1,
      textureId
    );
  }

  getGlyph(_codepoint: number): GlyphRenderInfo {
    return this.missingGlyph;
  }

  hasGlyph(_codepoint: number): boolean {
    return true;
  }

  getCodepoints(): number[] {
    return [0xfffd];
  }
}
