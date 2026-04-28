import { describe, it, expect } from "bun:test";
import { TextParserImpl, createTextParser } from "../../src/text/parser";

describe("TextParser", () => {
  const parser = new TextParserImpl();

  describe("parseFormatCodes", () => {
    it("should parse plain text", () => {
      const result = parser.parseFormatCodes("Hello");
      expect(result).toHaveLength(5);
      expect(result[0]!.codepoint).toBe("H".codePointAt(0));
    });

    it("should parse section sign format codes", () => {
      const result = parser.parseFormatCodes("§cRed§r Normal");
      expect(result).toHaveLength(10);
      expect(result[0]!.style.color).toEqual({ r: 1, g: 85 / 255, b: 85 / 255, a: 1 });
      expect(result[3]!.style.color).toEqual({ r: 1, g: 1, b: 1, a: 1 });
    });

    it("should parse bold format", () => {
      const result = parser.parseFormatCodes("§lBold");
      expect(result[0]!.style.bold).toBe(true);
    });

    it("should parse italic format", () => {
      const result = parser.parseFormatCodes("§oItalic");
      expect(result[0]!.style.italic).toBe(true);
    });

    it("should parse underlined format", () => {
      const result = parser.parseFormatCodes("§nUnderlined");
      expect(result[0]!.style.underlined).toBe(true);
    });

    it("should parse strikethrough format", () => {
      const result = parser.parseFormatCodes("§mStrikethrough");
      expect(result[0]!.style.strikethrough).toBe(true);
    });

    it("should parse obfuscated format", () => {
      const result = parser.parseFormatCodes("§kObfuscated");
      expect(result[0]!.style.obfuscated).toBe(true);
    });

    it("should handle multiple format codes", () => {
      const result = parser.parseFormatCodes("§c§lRed Bold");
      expect(result[0]!.style.color).toEqual({ r: 1, g: 85 / 255, b: 85 / 255, a: 1 });
      expect(result[0]!.style.bold).toBe(true);
    });

    it("should preserve sourceIndex correctly", () => {
      const result = parser.parseFormatCodes("AB§cCD§rEF");
      expect(result[0]!.sourceIndex).toBe(0);
      expect(result[1]!.sourceIndex).toBe(1);
      expect(result[2]!.sourceIndex).toBe(2);
      expect(result[3]!.sourceIndex).toBe(3);
      expect(result[4]!.sourceIndex).toBe(4);
      expect(result[5]!.sourceIndex).toBe(5);
    });
  });

  describe("parseJson", () => {
    it("should parse simple string", () => {
      const result = parser.parseJson("Hello");
      expect(result).toHaveLength(5);
    });

    it("should parse string component with color", () => {
      const result = parser.parseJson({ text: "Red", color: "red" });
      expect(result[0]!.style.color).toEqual({ r: 1, g: 85 / 255, b: 85 / 255, a: 1 });
    });

    it("should parse string component with bold", () => {
      const result = parser.parseJson({ text: "Bold", bold: true });
      expect(result[0]!.style.bold).toBe(true);
    });

    it("should parse array of components", () => {
      const result = parser.parseJson([
        { text: "Red", color: "red" },
        { text: "Blue", color: "blue" },
      ]);
      expect(result).toHaveLength(7);
      expect(result[0]!.style.color).toEqual({ r: 1, g: 85 / 255, b: 85 / 255, a: 1 });
      expect(result[5]!.style.color).toEqual({ r: 85 / 255, g: 85 / 255, b: 1, a: 1 });
    });

    it("should inherit parent styles", () => {
      const result = parser.parseJson({
        text: "Root",
        color: "red",
        extra: [{ text: "Child" }],
      });
      expect(result).toHaveLength(9);
      expect(result[0]!.style.color).toEqual({ r: 1, g: 85 / 255, b: 85 / 255, a: 1 });
      expect(result[4]!.style.color).toEqual({ r: 1, g: 85 / 255, b: 85 / 255, a: 1 });
    });

    it("should handle hex color", () => {
      const result = parser.parseJson({ text: "Hex", color: "#FF5500" });
      expect(result[0]!.style.color).toEqual({
        r: 255 / 255,
        g: 85 / 255,
        b: 0 / 255,
        a: 1,
      });
    });

    it("should handle font property", () => {
      const result = parser.parseJson({ text: "Custom Font", font: "custom:font" });
      expect(result[0]!.style.font).toBe("custom:font");
    });

    it("should parse shadow_color as ARGB decimal", () => {
      const result = parser.parseJson({ text: "Shadow", shadow_color: -2130771713 });
      expect(result[0]!.style.shadowColor).toEqual({
        a: 128 / 255,
        r: 255 / 255,
        g: 0 / 255,
        b: 255 / 255,
      });
    });

    it("should inherit parent shadow_color", () => {
      const result = parser.parseJson({
        text: "A",
        shadow_color: -16776961,
        extra: [{ text: "B" }],
      });
      expect(result[0]!.style.shadowColor).toEqual({
        a: 1,
        r: 0,
        g: 0,
        b: 255 / 255,
      });
      expect(result[1]!.style.shadowColor).toEqual({
        a: 1,
        r: 0,
        g: 0,
        b: 255 / 255,
      });
    });
  });

  describe("parse (main method)", () => {
    it("should auto-detect JSON string", () => {
      const result = parser.parse('{"text":"Hello","color":"red"}');
      expect(result).toHaveLength(5);
      expect(result[0]!.style.color).toEqual({ r: 1, g: 85 / 255, b: 85 / 255, a: 1 });
    });

    it("should fall back to format codes for invalid JSON", () => {
      const result = parser.parse("§cInvalid{JSON");
      expect(result[0]!.style.color).toEqual({ r: 1, g: 85 / 255, b: 85 / 255, a: 1 });
    });

    it("should parse plain string as format codes", () => {
      const result = parser.parse("Plain text");
      expect(result).toHaveLength(10);
    });

    it("should parse TextComponent object directly", () => {
      const result = parser.parse({ text: "Direct", color: "green" });
      expect(result[0]!.style.color).toEqual({ r: 85 / 255, g: 1, b: 85 / 255, a: 1 });
    });
  });

  describe("parseComponentRanges", () => {
    it("should cascade ids through nested extras", () => {
      const result = parser.parseComponentRanges({
        id: "/hud/layout/element[0]/text[0]",
        text: "T",
        extra: [{ text: "e" }, { text: "x" }, { text: "t" }],
      });

      expect(result).toHaveLength(4);
      expect(result[0]!.id).toBe("/hud/layout/element[0]/text[0]");
      expect(result[1]!.id).toBe("/hud/layout/element[0]/text[0]/extra[0]");
      expect(result[2]!.id).toBe("/hud/layout/element[0]/text[0]/extra[1]");
      expect(result[3]!.id).toBe("/hud/layout/element[0]/text[0]/extra[2]");
    });
  });
});

describe("createTextParser", () => {
  it("should create a TextParser instance", () => {
    const parser = createTextParser();
    expect(parser.parse).toBeDefined();
    expect(parser.parseFormatCodes).toBeDefined();
    expect(parser.parseJson).toBeDefined();
  });
});
