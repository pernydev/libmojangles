import type { TextParser, TextComponent, TextStyle, StyledGlyph, Color, ComponentRange } from "../types";

const MINECRAFT_COLORS: Record<string, Color> = {
  black: { r: 0, g: 0, b: 0, a: 1 },
  dark_blue: { r: 0, g: 0, b: 170 / 255, a: 1 },
  dark_green: { r: 0, g: 170 / 255, b: 0, a: 1 },
  dark_aqua: { r: 0, g: 170 / 255, b: 170 / 255, a: 1 },
  dark_red: { r: 170 / 255, g: 0, b: 0, a: 1 },
  dark_purple: { r: 170 / 255, g: 0, b: 170 / 255, a: 1 },
  gold: { r: 1, g: 170 / 255, b: 0, a: 1 },
  gray: { r: 170 / 255, g: 170 / 255, b: 170 / 255, a: 1 },
  dark_gray: { r: 85 / 255, g: 85 / 255, b: 85 / 255, a: 1 },
  blue: { r: 85 / 255, g: 85 / 255, b: 1, a: 1 },
  green: { r: 85 / 255, g: 1, b: 85 / 255, a: 1 },
  aqua: { r: 85 / 255, g: 1, b: 1, a: 1 },
  red: { r: 1, g: 85 / 255, b: 85 / 255, a: 1 },
  light_purple: { r: 1, g: 85 / 255, b: 1, a: 1 },
  yellow: { r: 1, g: 1, b: 85 / 255, a: 1 },
  white: { r: 1, g: 1, b: 1, a: 1 },
};

const FORMAT_CODE_MAP: Record<string, keyof TextStyle | "reset"> = {
  "0": "color",
  "1": "color",
  "2": "color",
  "3": "color",
  "4": "color",
  "5": "color",
  "6": "color",
  "7": "color",
  "8": "color",
  "9": "color",
  a: "color",
  b: "color",
  c: "color",
  d: "color",
  e: "color",
  f: "color",
  k: "obfuscated",
  l: "bold",
  m: "strikethrough",
  n: "underlined",
  o: "italic",
  r: "reset",
};

const FORMAT_CODE_COLORS: Record<string, Color> = {
  "0": MINECRAFT_COLORS.black!,
  "1": MINECRAFT_COLORS.dark_blue!,
  "2": MINECRAFT_COLORS.dark_green!,
  "3": MINECRAFT_COLORS.dark_aqua!,
  "4": MINECRAFT_COLORS.dark_red!,
  "5": MINECRAFT_COLORS.dark_purple!,
  "6": MINECRAFT_COLORS.gold!,
  "7": MINECRAFT_COLORS.gray!,
  "8": MINECRAFT_COLORS.dark_gray!,
  "9": MINECRAFT_COLORS.blue!,
  a: MINECRAFT_COLORS.green!,
  b: MINECRAFT_COLORS.aqua!,
  c: MINECRAFT_COLORS.red!,
  d: MINECRAFT_COLORS.light_purple!,
  e: MINECRAFT_COLORS.yellow!,
  f: MINECRAFT_COLORS.white!,
};

function parseHexColor(hex: string): Color | null {
  const match = hex.match(/^#?([0-9a-fA-F]{6})$/);
  if (!match || !match[1]) return null;
  const val = parseInt(match[1], 16);
  return {
    r: ((val >> 16) & 0xff) / 255,
    g: ((val >> 8) & 0xff) / 255,
    b: (val & 0xff) / 255,
    a: 1,
  };
}

function parseColorName(name: string | undefined): Color | null {
  if (!name) return null;
  return MINECRAFT_COLORS[name] ?? parseHexColor(name);
}

function parseARGBColor(value: number | undefined): Color | undefined {
  if (value === undefined || !Number.isInteger(value)) return undefined;
  const argb = value >>> 0;
  return {
    a: ((argb >>> 24) & 0xff) / 255,
    r: ((argb >>> 16) & 0xff) / 255,
    g: ((argb >>> 8) & 0xff) / 255,
    b: (argb & 0xff) / 255,
  };
}

function mergeStyles(parent: TextStyle, child: Partial<TextStyle>): TextStyle {
  return {
    color: child.color ?? parent.color,
    shadowColor: child.shadowColor ?? parent.shadowColor,
    bold: child.bold ?? parent.bold,
    italic: child.italic ?? parent.italic,
    underlined: child.underlined ?? parent.underlined,
    strikethrough: child.strikethrough ?? parent.strikethrough,
    obfuscated: child.obfuscated ?? parent.obfuscated,
    font: child.font ?? parent.font,
    shadow: child.shadow ?? parent.shadow,
  };
}

function resetStyle(): TextStyle {
    return {
      color: MINECRAFT_COLORS.white,
      shadowColor: undefined,
      bold: false,
      italic: false,
      underlined: false,
    strikethrough: false,
    obfuscated: false,
    font: "minecraft:default",
    shadow: true,
  };
}

export class TextParserImpl implements TextParser {
  parse(input: string | TextComponent): StyledGlyph[] {
    if (typeof input === "string") {
      if (input.startsWith("{") || input.startsWith("[")) {
        try {
          return this.parseJson(JSON.parse(input));
        } catch {
          return this.parseFormatCodes(input);
        }
      }
      return this.parseFormatCodes(input);
    }
    return this.parseJson(input);
  }

  parseFormatCodes(input: string): StyledGlyph[] {
    const glyphs: StyledGlyph[] = [];
    let style = resetStyle();
    let sourceIndex = 0;

    for (let i = 0; i < input.length; i++) {
      const char = input[i]!;
      if (char === "§" && i + 1 < input.length) {
        const code = input[i + 1]!.toLowerCase();
        const type = FORMAT_CODE_MAP[code];
        if (type === "reset") {
          style = resetStyle();
        } else if (type === "color") {
          style = { ...resetStyle(), color: FORMAT_CODE_COLORS[code] };
        } else if (type) {
          style = { ...style, [type]: true };
        }
        i++;
        continue;
      }

      const codepoint = char.codePointAt(0);
      if (codepoint !== undefined) {
        glyphs.push({
          codepoint,
          style: { ...style },
          sourceIndex: sourceIndex++,
        });
      }
    }

    return glyphs;
  }

  parseJson(input: TextComponent): StyledGlyph[] {
    if (Array.isArray(input)) {
      const glyphs: StyledGlyph[] = [];
      let sourceIndex = 0;
      for (const component of input) {
        const parsed = this.parseJsonComponent(component, resetStyle(), sourceIndex);
        glyphs.push(...parsed);
        sourceIndex += parsed.length;
      }
      return glyphs;
    }
    return this.parseJsonComponent(input, resetStyle(), 0);
  }

  parseComponentRanges(input: string | TextComponent): ComponentRange[] {
    if (typeof input === "string") {
      return [{ sourceRange: [0, input.length] }];
    }
    if (Array.isArray(input)) {
      const ranges: ComponentRange[] = [];
      let sourceIndex = 0;
      for (const component of input) {
        const parsed = this.collectComponentRanges(component, sourceIndex);
        for (const range of parsed) {
          if (range.sourceRange[1] > range.sourceRange[0]) {
            ranges.push(range);
          }
        }
        if (parsed.length > 0) {
          sourceIndex = parsed[parsed.length - 1]!.sourceRange[1];
        }
      }
      return ranges;
    }
    const ranges = this.collectComponentRanges(input, 0);
    return ranges.filter((r) => r.sourceRange[1] > r.sourceRange[0]);
  }

  private collectComponentRanges(
    component: TextComponent,
    startIndex: number
  ): ComponentRange[] {
    const ranges: ComponentRange[] = [];
    if (typeof component === "string") {
      return [{ sourceRange: [startIndex, startIndex + component.length] }];
    }

    let currentIndex = startIndex;

    if (component.text && component.text.length > 0) {
      const endIndex = currentIndex + component.text.length;
      if (endIndex > currentIndex) {
        ranges.push({
          id: component.id,
          sourceRange: [currentIndex, endIndex],
        });
      }
      currentIndex = endIndex;
    }

    if (component.extra) {
      for (const extra of component.extra) {
        const childRanges = this.collectComponentRanges(extra, currentIndex);
        ranges.push(...childRanges);
        if (childRanges.length > 0) {
          currentIndex = childRanges[childRanges.length - 1]!.sourceRange[1];
        }
      }
    }

    return ranges;
  }

  private parseJsonComponent(
    component: TextComponent,
    parentStyle: TextStyle,
    startIndex: number
  ): StyledGlyph[] {
    if (typeof component === "string") {
      return this.stringToGlyphs(component, parentStyle, startIndex);
    }

    const style = mergeStyles(parentStyle, {
      color: component.color ? parseColorName(component.color) ?? undefined : undefined,
      shadowColor: parseARGBColor(component.shadow_color),
      bold: component.bold,
      italic: component.italic,
      underlined: component.underlined,
      strikethrough: component.strikethrough,
      obfuscated: component.obfuscated,
      font: component.font,
    });

    const glyphs: StyledGlyph[] = [];
    let sourceIndex = startIndex;

    if (component.text) {
      const parsed = this.stringToGlyphs(component.text, style, sourceIndex);
      glyphs.push(...parsed);
      sourceIndex += parsed.length;
    }

    if (component.extra) {
      for (const extra of component.extra) {
        const parsed = this.parseJsonComponent(extra, style, sourceIndex);
        glyphs.push(...parsed);
        sourceIndex += parsed.length;
      }
    }

    return glyphs;
  }

  private stringToGlyphs(text: string, style: TextStyle, startIndex: number): StyledGlyph[] {
    const glyphs: StyledGlyph[] = [];
    let index = startIndex;
    for (const char of text) {
      const codepoint = char.codePointAt(0);
      if (codepoint !== undefined) {
        glyphs.push({
          codepoint,
          style: { ...style },
          sourceIndex: index++,
        });
      }
    }
    return glyphs;
  }
}

export function createTextParser(): TextParser {
  return new TextParserImpl();
}
