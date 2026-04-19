import type { GlyphInfo, GlyphRenderInfo } from "../types";

export class GlyphInfoImpl implements GlyphInfo {
  constructor(
    public readonly codepoint: number,
    public readonly advance: number
  ) {}
}

export class GlyphRenderInfoImpl implements GlyphRenderInfo {
  constructor(
    public readonly codepoint: number,
    public readonly advance: number,
    public readonly left: number,
    public readonly right: number,
    public readonly up: number,
    public readonly down: number,
    public readonly u0: number,
    public readonly v0: number,
    public readonly u1: number,
    public readonly v1: number,
    public readonly textureId: string
  ) {}
}

export class SpaceGlyph implements GlyphRenderInfo {
  readonly left = 0;
  readonly right = 0;
  readonly up = 0;
  readonly down = 0;
  readonly u0 = 0;
  readonly v0 = 0;
  readonly u1 = 0;
  readonly v1 = 0;
  readonly textureId = "";

  constructor(
    public readonly codepoint: number,
    public readonly advance: number
  ) {}
}
