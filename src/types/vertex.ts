import type { PositionedGlyph, LayoutResult } from "./layout";
import type { Color } from "./text";

export type Vertex = {
  position: [number, number, number];
  color: [number, number, number, number];
  uv0: [number, number];
  uv2: [number, number];
};

export type TextMesh = {
  readonly vertices: Float32Array;
  readonly indices: Uint16Array;
  readonly textureId: string;
  readonly vertexCount: number;
  readonly indexCount: number;
  readonly floatsPerVertex?: number;
};

export type TextMeshGroup = {
  readonly meshes: TextMesh[];
  readonly pickingMesh?: TextMesh;
};

export type VertexGeneratorOptions = {
  z?: number;
  lightmapUV?: [number, number];
  generateShadow?: boolean;
  shadowOffset?: [number, number];
  shadowColor?: Color;
  generatePicking?: boolean;
  cachePicking?: boolean;
  scale?: number;
};

export interface VertexGenerator {
  generate(layout: LayoutResult, options?: VertexGeneratorOptions): TextMeshGroup;
  generateForGlyph(glyph: PositionedGlyph, options?: VertexGeneratorOptions): Vertex[];
}

export type PickResult = {
  readonly sourceIndex: number;
  readonly glyphIndex: number;
  readonly x: number;
  readonly y: number;
};

export interface ColorPicker {
  encodeId(index: number): Color;
  decodeId(color: Color): number;
  pick(x: number, y: number, framebuffer: Uint8Array, width: number): PickResult | null;
}
