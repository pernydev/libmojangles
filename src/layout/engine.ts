import type {
  TextLayoutEngine,
  LayoutResult,
  LayoutOptions,
  TextLine,
  PositionedGlyph,
  StyledGlyph,
  Font,
  FontResolver,
  GlyphRenderInfo,
} from "../types";

const DEFAULT_LINE_HEIGHT = 9;
const BOLD_OFFSET = 1;

function toResolver(font: Font | FontResolver): FontResolver {
  return typeof font === "function" ? font : () => font;
}

export class TextLayoutEngineImpl implements TextLayoutEngine {
  layout(
    glyphs: StyledGlyph[],
    font: Font | FontResolver,
    options?: LayoutOptions
  ): LayoutResult {
    const resolveFont = toResolver(font);
    const baseFont = resolveFont(undefined);
    const scale = options?.scale ?? 1;
    const maxWidth = options?.maxWidth ?? Infinity;
    const lineSpacing = options?.lineSpacing ?? 1;
    const wrapMode = options?.wrapMode ?? "none";
    const alignment = options?.alignment ?? "left";

    const lines: TextLine[] = [];
    let currentLine: PositionedGlyph[] = [];
    let currentX = 0;
    let currentLineWidth = 0;
    let maxLineWidth = 0;

    const lineHeight = baseFont.getLineHeight() * scale;

    const flushLine = () => {
      if (currentLine.length > 0) {
        lines.push({
          glyphs: currentLine,
          width: currentLineWidth,
          height: lineHeight,
          baseline: 7 * scale,
        });
        maxLineWidth = Math.max(maxLineWidth, currentLineWidth);
        currentLine = [];
        currentX = 0;
        currentLineWidth = 0;
      }
    };

    for (const styledGlyph of glyphs) {
      if (styledGlyph.codepoint === 10) {
        flushLine();
        continue;
      }

      const glyphFont = resolveFont(styledGlyph.style.font);
      const renderInfo = glyphFont.getGlyph(styledGlyph.codepoint);
      if (!renderInfo) continue;

      const advance = this.getAdvance(renderInfo, styledGlyph.style.bold ?? false) * scale;

      if (wrapMode !== "none" && currentX + advance > maxWidth && currentLine.length > 0) {
        if (wrapMode === "word") {
          let breakIndex = currentLine.length - 1;
          while (breakIndex > 0 && currentLine[breakIndex]?.glyph.codepoint !== 32) {
            breakIndex--;
          }
          if (breakIndex > 0) {
            const remainder = currentLine.splice(breakIndex + 1);
            currentLineWidth = currentLine.reduce(
              (sum, g) => sum + this.getAdvance(g.glyph, g.style?.bold ?? false) * scale,
              0
            );
            flushLine();
            for (const pg of remainder) {
              currentLine.push({
                ...pg,
                x: currentX,
                y: lines.length * lineHeight * lineSpacing,
              });
              const glyphAdvance = this.getAdvance(pg.glyph, pg.style.bold ?? false) * scale;
              currentX += glyphAdvance;
              currentLineWidth += glyphAdvance;
            }
          } else {
            flushLine();
          }
        } else {
          flushLine();
        }
      }

      const positioned: PositionedGlyph = {
        glyph: renderInfo,
        style: styledGlyph.style,
        x: currentX,
        y: lines.length * lineHeight * lineSpacing,
        sourceIndex: styledGlyph.sourceIndex,
      };

      currentLine.push(positioned);
      currentX += advance;
      currentLineWidth += advance;
    }

    flushLine();

    if (alignment !== "left" && maxLineWidth > 0) {
      for (const line of lines) {
        const offset =
          alignment === "center"
            ? (maxLineWidth - line.width) / 2
            : maxLineWidth - line.width;
        for (const glyph of line.glyphs) {
          (glyph as { x: number }).x += offset;
        }
      }
    }

    return {
      lines,
      width: maxLineWidth,
      height: lines.length * lineHeight * lineSpacing,
    };
  }

  measureWidth(glyphs: StyledGlyph[], font: Font | FontResolver): number {
    const resolveFont = toResolver(font);
    let width = 0;
    for (const glyph of glyphs) {
      if (glyph.codepoint === 10) continue;
      const renderInfo = resolveFont(glyph.style.font).getGlyph(glyph.codepoint);
      if (renderInfo) {
        width += this.getAdvance(renderInfo, glyph.style.bold ?? false);
      }
    }
    return width;
  }

  measureHeight(
    glyphs: StyledGlyph[],
    font: Font | FontResolver,
    maxWidth?: number
  ): number {
    const layout = this.layout(glyphs, font, { maxWidth, wrapMode: maxWidth ? "char" : "none" });
    return layout.height;
  }

  private getAdvance(glyph: GlyphRenderInfo, bold: boolean): number {
    return glyph.advance + (bold ? BOLD_OFFSET : 0);
  }
}

export function createTextLayoutEngine(): TextLayoutEngine {
  return new TextLayoutEngineImpl();
}
