import { describe, it, expect } from "bun:test";
import { TextParserImpl } from "../../src/text/parser";
import { TextLayoutEngineImpl } from "../../src/layout/engine";
import { VertexGeneratorImpl } from "../../src/vertex/generator";
import type { Font, GlyphRenderInfo } from "../../src/types";

const createMockFont = (): Font => ({
  getGlyph: (codepoint: number): GlyphRenderInfo => ({
    codepoint,
    textureId: "test-texture",
    u0: 0,
    v0: 0,
    u1: 1,
    v1: 1,
    left: 0,
    right: 8,
    up: 0,
    down: 8,
    advance: 8,
  }),
  getLineHeight: () => 9,
  getBaseline: () => 7,
});

describe("Component ID propagation", () => {
  const parser = new TextParserImpl();
  const layout = new TextLayoutEngineImpl();
  const vertices = new VertexGeneratorImpl();
  const mockFont = createMockFont();

  describe("Parser", () => {
    it("should attach componentId to glyphs from component with id", () => {
      const result = parser.parseJson({ id: "test-id", text: "Hello" });
      expect(result).toHaveLength(5);
      expect(result[0]!.componentId).toBe("test-id");
      expect(result[4]!.componentId).toBe("test-id");
    });

    it("should inherit componentId in nested components", () => {
      const result = parser.parseJson({
        id: "parent",
        text: "A",
        extra: [{ text: "B" }],
      });
      expect(result).toHaveLength(2);
      expect(result[0]!.componentId).toBe("parent");
      expect(result[1]!.componentId).toBe("parent");
    });

    it("should override componentId in nested components with their own id", () => {
      const result = parser.parseJson({
        id: "parent",
        text: "A",
        extra: [{ id: "child", text: "B" }],
      });
      expect(result).toHaveLength(2);
      expect(result[0]!.componentId).toBe("parent");
      expect(result[1]!.componentId).toBe("child");
    });

    it("should have undefined componentId when no id is specified", () => {
      const result = parser.parseJson({ text: "Hello" });
      expect(result[0]!.componentId).toBeUndefined();
    });

    it("should handle array of components with different ids", () => {
      const result = parser.parseJson([
        { id: "first", text: "A" },
        { id: "second", text: "B" },
      ]);
      expect(result).toHaveLength(2);
      expect(result[0]!.componentId).toBe("first");
      expect(result[1]!.componentId).toBe("second");
    });
  });

  describe("Layout", () => {
    it("should preserve componentId through layout", () => {
      const glyphs = parser.parseJson({ id: "test-id", text: "Hi" });
      const result = layout.layout(glyphs, mockFont);

      expect(result.lines).toHaveLength(1);
      expect(result.lines[0]!.glyphs[0]!.componentId).toBe("test-id");
      expect(result.lines[0]!.glyphs[1]!.componentId).toBe("test-id");
    });

    it("should preserve different componentIds for different glyphs", () => {
      const glyphs = parser.parseJson([
        { id: "a", text: "A" },
        { id: "b", text: "B" },
      ]);
      const result = layout.layout(glyphs, mockFont);

      expect(result.lines[0]!.glyphs[0]!.componentId).toBe("a");
      expect(result.lines[0]!.glyphs[1]!.componentId).toBe("b");
    });
  });

  describe("Vertex Generator", () => {
    it("should create separate meshes for different componentIds", () => {
      const glyphs = parser.parseJson([
        { id: "first", text: "A" },
        { id: "second", text: "B" },
      ]);
      const layoutResult = layout.layout(glyphs, mockFont);
      const meshGroup = vertices.generate(layoutResult);

      const componentIds = meshGroup.meshes.map((m) => m.componentId);
      expect(componentIds).toContain("first");
      expect(componentIds).toContain("second");
    });

    it("should group glyphs with same componentId in same mesh", () => {
      const glyphs = parser.parseJson({ id: "same", text: "ABC" });
      const layoutResult = layout.layout(glyphs, mockFont);
      const meshGroup = vertices.generate(layoutResult);

      const sameMeshes = meshGroup.meshes.filter((m) => m.componentId === "same");
      expect(sameMeshes).toHaveLength(1);
    });

    it("should create mesh without componentId for glyphs without id", () => {
      const glyphs = parser.parseJson({ text: "Hello" });
      const layoutResult = layout.layout(glyphs, mockFont);
      const meshGroup = vertices.generate(layoutResult);

      expect(meshGroup.meshes.some((m) => m.componentId === undefined)).toBe(true);
    });

    it("should handle mixed componentIds and no ids", () => {
      const glyphs = parser.parseJson([
        { id: "with-id", text: "A" },
        { text: "B" },
      ]);
      const layoutResult = layout.layout(glyphs, mockFont);
      const meshGroup = vertices.generate(layoutResult);

      expect(meshGroup.meshes.some((m) => m.componentId === "with-id")).toBe(true);
      expect(meshGroup.meshes.some((m) => m.componentId === undefined)).toBe(true);
    });
  });
});
