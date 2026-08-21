import type { GlyphRenderInfo, Font } from "./font";
import type { TextStyle, StyledGlyph } from "./text";

export type PositionedGlyph = {
  readonly glyph: GlyphRenderInfo;
  readonly style: TextStyle;
  readonly x: number;
  readonly y: number;
  readonly sourceIndex: number;
  readonly componentId?: string;
};

export type TextLine = {
  readonly glyphs: PositionedGlyph[];
  readonly width: number;
  readonly height: number;
  readonly baseline: number;
};

export type LayoutResult = {
  readonly lines: TextLine[];
  readonly width: number;
  readonly height: number;
};

export type LayoutOptions = {
  maxWidth?: number;
  lineSpacing?: number;
  alignment?: "left" | "center" | "right";
  wrapMode?: "none" | "word" | "char";
  scale?: number;
};

export type FontResolver = (fontName: string | undefined) => Font;

export interface TextLayoutEngine {
  layout(
    glyphs: StyledGlyph[],
    font: Font | FontResolver,
    options?: LayoutOptions
  ): LayoutResult;
  measureWidth(glyphs: StyledGlyph[], font: Font | FontResolver): number;
  measureWidthExact(glyphs: StyledGlyph[], font: Font | FontResolver): number;
  measureHeight(
    glyphs: StyledGlyph[],
    font: Font | FontResolver,
    maxWidth?: number
  ): number;
}
