export type Color = {
  r: number;
  g: number;
  b: number;
  a: number;
};

export type TextStyle = {
  color?: Color;
  shadowColor?: Color;
  bold?: boolean;
  italic?: boolean;
  underlined?: boolean;
  strikethrough?: boolean;
  obfuscated?: boolean;
  font?: string;
  shadow?: boolean;
};

export type TextComponent =
  | string
  | {
      text?: string;
      translate?: string;
      with?: TextComponent[];
      extra?: TextComponent[];
      color?: string;
      shadow_color?: number;
      bold?: boolean;
      italic?: boolean;
      underlined?: boolean;
      strikethrough?: boolean;
      obfuscated?: boolean;
      font?: string;
      id?: string;
    };

export type ComponentRange = {
  readonly id?: string;
  readonly sourceRange: [number, number];
};

export interface StyledGlyph {
  readonly codepoint: number;
  readonly style: TextStyle;
  readonly sourceIndex: number;
  readonly componentId?: string;
}

export interface TextParser {
  parse(input: string | TextComponent): StyledGlyph[];
  parseFormatCodes(input: string): StyledGlyph[];
  parseJson(input: TextComponent): StyledGlyph[];
  parseComponentRanges(input: string | TextComponent): ComponentRange[];
}
