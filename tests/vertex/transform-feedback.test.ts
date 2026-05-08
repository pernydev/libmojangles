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

describe("Transform Feedback mesh generation", () => {
  const parser = new TextParserImpl();
  const layout = new TextLayoutEngineImpl();
  const vertices = new VertexGeneratorImpl();
  const mockFont = createMockFont();
  const fontResolver = () => mockFont;

  it("generates picking meshes when transformFeedback is true and generatePicking is false", () => {
    const glyphs = parser.parse({ text: "Hello" });
    const layoutResult = layout.layout(glyphs, fontResolver);
    const mesh = vertices.generate(layoutResult, {
      generatePicking: false,
      transformFeedback: true,
    });

    expect(mesh.pickingMeshes).toBeDefined();
    expect(mesh.pickingMeshes!.length).toBeGreaterThan(0);
    expect(mesh.pickingMeshes![0]!.indexCount).toBeGreaterThan(0);
  });

  it("generates picking meshes when only transformFeedback is true", () => {
    const glyphs = parser.parse({ text: "Test" });
    const layoutResult = layout.layout(glyphs, fontResolver);
    const mesh = vertices.generate(layoutResult, {
      transformFeedback: true,
    });

    expect(mesh.pickingMeshes).toBeDefined();
    expect(mesh.pickingMeshes!.length).toBeGreaterThan(0);
  });

  it("does not generate picking meshes when both are false", () => {
    const glyphs = parser.parse({ text: "Test" });
    const layoutResult = layout.layout(glyphs, fontResolver);
    const mesh = vertices.generate(layoutResult, {
      generatePicking: false,
      transformFeedback: false,
    });

    expect(mesh.pickingMeshes).toBeUndefined();
  });

  it("generates picking meshes with correct floatsPerVertex for TF consumption", () => {
    const glyphs = parser.parse({
      extra: [
        { id: "a", text: "Hi" },
        { id: "b", text: "Lo" },
      ],
    });
    const layoutResult = layout.layout(glyphs, fontResolver);
    const mesh = vertices.generate(layoutResult, {
      transformFeedback: true,
    });

    expect(mesh.pickingMeshes).toBeDefined();
    for (const pm of mesh.pickingMeshes!) {
      expect(pm.floatsPerVertex).toBe(16);
      expect(pm.vertices.length).toBe(pm.vertexCount * 16);
      // 6 indices per quad (2 triangles)
      expect(pm.indexCount % 6).toBe(0);
    }
  });

  it("produces separate picking meshes per component ID", () => {
    const glyphs = parser.parse({
      extra: [
        { id: "comp-a", text: "AA" },
        { id: "comp-b", text: "BB" },
      ],
    });
    const layoutResult = layout.layout(glyphs, fontResolver);
    const mesh = vertices.generate(layoutResult, {
      transformFeedback: true,
    });

    expect(mesh.pickingMeshes).toBeDefined();
    expect(mesh.pickingMeshes!.length).toBe(2);

    const ids = mesh.pickingMeshes!.map((m) => m.componentId);
    expect(ids).toContain("comp-a");
    expect(ids).toContain("comp-b");
  });
});
