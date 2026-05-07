import type {
  VertexGenerator,
  VertexGeneratorOptions,
  LayoutResult,
  PositionedGlyph,
  TextMeshGroup,
  TextMesh,
  Vertex,
  Color,
} from "../types";
import { encodePickingId } from "./picker";

const SHADOW_OFFSET = 1.0;
const SHADOW_DEPTH = 0.03;
const EFFECT_DEPTH = 0.01;
const BOLD_OFFSET = 1.0;
const EXTRA_BOLD_THICKNESS = 0.1;
const DEFAULT_LIGHTMAP: [number, number] = [240 / 256, 240 / 256];

const FLOATS_PER_VERTEX = 12;
const PICKING_FLOATS_PER_VERTEX = 16;

function colorToArray(color: Color): [number, number, number, number] {
  return [color.r, color.g, color.b, color.a];
}

function darkenColor(color: Color, factor: number): Color {
  // Minecraft uses integer math: (int)((float)color * factor)
  // This truncates rather than rounds, so 255 * 0.25 = 63 (0x3F), not 64 (0x40)
  return {
    r: Math.floor(color.r * 255 * factor) / 255,
    g: Math.floor(color.g * 255 * factor) / 255,
    b: Math.floor(color.b * 255 * factor) / 255,
    a: color.a,
  };
}

function isColorZero(color: Color): boolean {
  return color.r === 0 && color.g === 0 && color.b === 0 && color.a === 0;
}

export class VertexGeneratorImpl implements VertexGenerator {
  generate(layout: LayoutResult, options?: VertexGeneratorOptions): TextMeshGroup {
    const z = options?.z ?? 0;
    const lightmapUV = options?.lightmapUV ?? DEFAULT_LIGHTMAP;
    const generateShadow = options?.generateShadow ?? true;
    const shadowOffsetBase = options?.shadowOffset ?? [SHADOW_OFFSET, SHADOW_OFFSET];
    const generatePicking = options?.generatePicking ?? false;
    const scale = options?.scale ?? 1;

    const shadowOffset: [number, number] = [
      shadowOffsetBase[0] * scale,
      shadowOffsetBase[1] * scale,
    ];

    const meshesByKey = new Map<string, { vertices: number[]; indices: number[]; textureId: string; componentId?: string }>();

    const getMeshKey = (textureId: string, componentId?: string) => {
      return componentId ? `${textureId}:${componentId}` : textureId;
    };

    const getMeshData = (textureId: string, componentId?: string) => {
      const key = getMeshKey(textureId, componentId);
      if (!meshesByKey.has(key)) {
        meshesByKey.set(key, { vertices: [], indices: [], textureId, componentId });
      }
      return meshesByKey.get(key)!;
    };
    const pickingData: { vertices: number[]; indices: number[] } = { vertices: [], indices: [] };

    for (const line of layout.lines) {
      for (const glyph of line.glyphs) {
        this.generateGlyphQuads(
          glyph,
          z,
          lightmapUV,
          generateShadow,
          shadowOffset,
          options?.shadowColor,
          getMeshData,
          scale
        );

        if (generatePicking) {
          this.generatePickingQuad(glyph, z, pickingData, scale);
        }

        if (glyph.style.underlined) {
          this.generateEffectQuad(
            glyph,
            8 * scale,
            9 * scale,
            z + EFFECT_DEPTH,
            lightmapUV,
            generateShadow,
            shadowOffset,
            options?.shadowColor,
            getMeshData,
            scale
          );
        }

        if (glyph.style.strikethrough) {
          this.generateEffectQuad(
            glyph,
            3.5 * scale,
            4.5 * scale,
            z + EFFECT_DEPTH,
            lightmapUV,
            generateShadow,
            shadowOffset,
            options?.shadowColor,
            getMeshData,
            scale
          );
        }
      }
    }

    const meshes: TextMesh[] = [];
    for (const [_key, data] of meshesByKey) {
      meshes.push({
        vertices: new Float32Array(data.vertices),
        indices: new Uint16Array(data.indices),
        textureId: data.textureId,
        vertexCount: data.vertices.length / FLOATS_PER_VERTEX,
        indexCount: data.indices.length,
        componentId: data.componentId,
      });
    }

    let pickingMesh: TextMesh | undefined;

    if (generatePicking && pickingData.vertices.length > 0) {
      pickingMesh = {
        vertices: new Float32Array(pickingData.vertices),
        indices: new Uint16Array(pickingData.indices),
        textureId: "picking",
        vertexCount: pickingData.vertices.length / PICKING_FLOATS_PER_VERTEX,
        indexCount: pickingData.indices.length,
        floatsPerVertex: PICKING_FLOATS_PER_VERTEX,
      };
    }

    return { meshes, pickingMesh };
  }

  generateForGlyph(glyph: PositionedGlyph, options?: VertexGeneratorOptions): Vertex[] {
    const z = options?.z ?? 0;
    const lightmapUV = options?.lightmapUV ?? DEFAULT_LIGHTMAP;
    const color = glyph.style.color ?? { r: 1, g: 1, b: 1, a: 1 };
    const scale = options?.scale ?? 1;

    const x0 = glyph.x + glyph.glyph.left * scale;
    const x1 = glyph.x + glyph.glyph.right * scale;
    const y0 = glyph.y + glyph.glyph.up * scale;
    const y1 = glyph.y + glyph.glyph.down * scale;

    return this.createQuadVertices(
      x0, y0, x1, y1, z,
      glyph.glyph.u0,
      glyph.glyph.v0,
      glyph.glyph.u1,
      glyph.glyph.v1,
      color,
      lightmapUV,
      glyph.style.italic ?? false,
      glyph.style.bold ?? false,
      glyph.glyph.up * scale,
      glyph.glyph.down * scale,
      scale
    );
  }

  private generateGlyphQuads(
    glyph: PositionedGlyph,
    baseZ: number,
    lightmapUV: [number, number],
    generateShadow: boolean,
    shadowOffset: [number, number],
    shadowColorOverride: Color | undefined,
    getMeshData: (textureId: string, componentId?: string) => { vertices: number[]; indices: number[] },
    scale: number
  ): void {
    const textureId = glyph.glyph.textureId;
    if (!textureId) return;

    const meshData = getMeshData(textureId, glyph.componentId);

    const color = glyph.style.color ?? { r: 1, g: 1, b: 1, a: 1 };
    const italic = glyph.style.italic ?? false;
    const bold = glyph.style.bold ?? false;
    const shadowColor = glyph.style.shadowColor ?? shadowColorOverride ?? darkenColor(color, 0.25);
    const hasShadow = generateShadow && (glyph.style.shadow ?? true) && !isColorZero(shadowColor);

    const left = glyph.glyph.left * scale;
    const right = glyph.glyph.right * scale;
    const up = glyph.glyph.up * scale;
    const down = glyph.glyph.down * scale;

    const x0 = glyph.x + left;
    const x1 = glyph.x + right;
    const y0 = glyph.y + up;
    const y1 = glyph.y + down;

    if (hasShadow) {
      this.addQuad(
        meshData,
        x0 + shadowOffset[0],
        y0 + shadowOffset[1],
        x1 + shadowOffset[0],
        y1 + shadowOffset[1],
        baseZ,
        glyph.glyph.u0,
        glyph.glyph.v0,
        glyph.glyph.u1,
        glyph.glyph.v1,
        shadowColor,
        lightmapUV,
        italic,
        bold,
        up,
        down,
        scale
      );

      if (bold) {
        this.addQuad(
          meshData,
          x0 + shadowOffset[0] + BOLD_OFFSET * scale,
          y0 + shadowOffset[1],
          x1 + shadowOffset[0] + BOLD_OFFSET * scale,
          y1 + shadowOffset[1],
          baseZ + 0.001,
          glyph.glyph.u0,
          glyph.glyph.v0,
          glyph.glyph.u1,
          glyph.glyph.v1,
          shadowColor,
          lightmapUV,
          italic,
          true,
          up,
          down,
          scale
        );
      }
    }

    const glyphZ = hasShadow ? baseZ + SHADOW_DEPTH : baseZ;
    this.addQuad(
      meshData,
      x0,
      y0,
      x1,
      y1,
      glyphZ,
      glyph.glyph.u0,
      glyph.glyph.v0,
      glyph.glyph.u1,
      glyph.glyph.v1,
      color,
      lightmapUV,
      italic,
      bold,
      up,
      down,
      scale
    );

    if (bold) {
      this.addQuad(
        meshData,
        x0 + BOLD_OFFSET * scale,
        y0,
        x1 + BOLD_OFFSET * scale,
        y1,
        glyphZ + 0.001,
        glyph.glyph.u0,
        glyph.glyph.v0,
        glyph.glyph.u1,
        glyph.glyph.v1,
        color,
        lightmapUV,
        italic,
        true,
        up,
        down,
        scale
      );
    }
  }

  private generateEffectQuad(
    glyph: PositionedGlyph,
    effectY0: number,
    effectY1: number,
    z: number,
    lightmapUV: [number, number],
    generateShadow: boolean,
    shadowOffset: [number, number],
    shadowColorOverride: Color | undefined,
    getMeshData: (textureId: string, componentId?: string) => { vertices: number[]; indices: number[] },
    scale: number
  ): void {
    // Use dedicated white texture for solid color effects (like Minecraft's SpecialGlyphs.WHITE)
    const textureId = "__white__";
    const meshData = getMeshData(textureId, glyph.componentId);
    const color = glyph.style.color ?? { r: 1, g: 1, b: 1, a: 1 };
    const shadowColor = glyph.style.shadowColor ?? shadowColorOverride ?? darkenColor(color, 0.25);
    const hasShadow = generateShadow && (glyph.style.shadow ?? true) && !isColorZero(shadowColor);

    const bold = glyph.style.bold ?? false;
    const advance = (glyph.glyph.advance + (bold ? BOLD_OFFSET : 0)) * scale;

    const x0 = glyph.x - (glyph.sourceIndex === 0 ? scale : 0);
    const x1 = glyph.x + advance;
    const y0 = glyph.y + effectY0;
    const y1 = glyph.y + effectY1;

    if (hasShadow) {
      this.addRectQuad(
        meshData,
        x0 + shadowOffset[0],
        y0 + shadowOffset[1],
        x1 + shadowOffset[0],
        y1 + shadowOffset[1],
        z,
        shadowColor,
        lightmapUV
      );
    }

    const effectZ = hasShadow ? z + SHADOW_DEPTH : z;
    this.addRectQuad(meshData, x0, y0, x1, y1, effectZ, color, lightmapUV);
  }

  private generatePickingQuad(
    glyph: PositionedGlyph,
    z: number,
    pickingData: { vertices: number[]; indices: number[] },
    scale: number
  ): void {
    const pickColor = encodePickingId(glyph.sourceIndex);
    const lightmapUV: [number, number] = [1, 1];

    const bold = glyph.style.bold ?? false;
    const advance = (glyph.glyph.advance + (bold ? BOLD_OFFSET : 0)) * scale;

    const x0 = glyph.x;
    const x1 = glyph.x + advance;
    const y0 = glyph.y + glyph.glyph.up * scale;
    const y1 = glyph.y + glyph.glyph.down * scale;

    const color = glyph.style.color ?? { r: 1, g: 1, b: 1, a: 1 };
    this.addPickingRectQuad(pickingData, x0, y0, x1, y1, z, color, lightmapUV, pickColor);
  }

  private addPickingRectQuad(
    meshData: { vertices: number[]; indices: number[] },
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    z: number,
    color: Color,
    lightmapUV: [number, number],
    pickColor: Color
  ): void {
    const baseVertex = meshData.vertices.length / PICKING_FLOATS_PER_VERTEX;
    const rgba = colorToArray(color);
    const pickRgba = colorToArray(pickColor);

    meshData.vertices.push(
      x0, y0, z, rgba[0], rgba[1], rgba[2], rgba[3], 0, 0, lightmapUV[0], lightmapUV[1], 0, pickRgba[0], pickRgba[1], pickRgba[2], pickRgba[3],
      x0, y1, z, rgba[0], rgba[1], rgba[2], rgba[3], 0, 1, lightmapUV[0], lightmapUV[1], 0, pickRgba[0], pickRgba[1], pickRgba[2], pickRgba[3],
      x1, y1, z, rgba[0], rgba[1], rgba[2], rgba[3], 1, 1, lightmapUV[0], lightmapUV[1], 0, pickRgba[0], pickRgba[1], pickRgba[2], pickRgba[3],
      x1, y0, z, rgba[0], rgba[1], rgba[2], rgba[3], 1, 0, lightmapUV[0], lightmapUV[1], 0, pickRgba[0], pickRgba[1], pickRgba[2], pickRgba[3]
    );

    meshData.indices.push(
      baseVertex,
      baseVertex + 1,
      baseVertex + 2,
      baseVertex,
      baseVertex + 2,
      baseVertex + 3
    );
  }

  private addQuad(
    meshData: { vertices: number[]; indices: number[] },
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    z: number,
    u0: number,
    v0: number,
    u1: number,
    v1: number,
    color: Color,
    lightmapUV: [number, number],
    italic: boolean,
    bold: boolean,
    up: number,
    down: number,
    scale: number
  ): void {
    const extraThickness = bold ? EXTRA_BOLD_THICKNESS * scale : 0;

    const shearTop = italic ? (1.0 - 0.25 * (up / scale)) * scale : 0;
    const shearBottom = italic ? (1.0 - 0.25 * (down / scale)) * scale : 0;

    const finalX0 = x0 - extraThickness;
    const finalX1 = x1 + extraThickness;
    const finalY0 = y0 - extraThickness;
    const finalY1 = y1 + extraThickness;

    const baseVertex = meshData.vertices.length / FLOATS_PER_VERTEX;
    const rgba = colorToArray(color);

    meshData.vertices.push(
      finalX0 + shearTop, finalY0, z, rgba[0], rgba[1], rgba[2], rgba[3], u0, v0, lightmapUV[0], lightmapUV[1], 0,
      finalX0 + shearBottom, finalY1, z, rgba[0], rgba[1], rgba[2], rgba[3], u0, v1, lightmapUV[0], lightmapUV[1], 0,
      finalX1 + shearBottom, finalY1, z, rgba[0], rgba[1], rgba[2], rgba[3], u1, v1, lightmapUV[0], lightmapUV[1], 0,
      finalX1 + shearTop, finalY0, z, rgba[0], rgba[1], rgba[2], rgba[3], u1, v0, lightmapUV[0], lightmapUV[1], 0
    );

    meshData.indices.push(
      baseVertex,
      baseVertex + 1,
      baseVertex + 2,
      baseVertex,
      baseVertex + 2,
      baseVertex + 3
    );
  }

  private addRectQuad(
    meshData: { vertices: number[]; indices: number[] },
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    z: number,
    color: Color,
    lightmapUV: [number, number]
  ): void {
    const baseVertex = meshData.vertices.length / FLOATS_PER_VERTEX;
    const rgba = colorToArray(color);

    meshData.vertices.push(
      x0, y0, z, rgba[0], rgba[1], rgba[2], rgba[3], 0, 0, lightmapUV[0], lightmapUV[1], 0,
      x0, y1, z, rgba[0], rgba[1], rgba[2], rgba[3], 0, 1, lightmapUV[0], lightmapUV[1], 0,
      x1, y1, z, rgba[0], rgba[1], rgba[2], rgba[3], 1, 1, lightmapUV[0], lightmapUV[1], 0,
      x1, y0, z, rgba[0], rgba[1], rgba[2], rgba[3], 1, 0, lightmapUV[0], lightmapUV[1], 0
    );

    meshData.indices.push(
      baseVertex,
      baseVertex + 1,
      baseVertex + 2,
      baseVertex,
      baseVertex + 2,
      baseVertex + 3
    );
  }

  private createQuadVertices(
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    z: number,
    u0: number,
    v0: number,
    u1: number,
    v1: number,
    color: Color,
    lightmapUV: [number, number],
    italic: boolean,
    bold: boolean,
    up: number,
    down: number,
    scale: number
  ): Vertex[] {
    const extraThickness = bold ? EXTRA_BOLD_THICKNESS * scale : 0;
    const shearTop = italic ? (1.0 - 0.25 * (up / scale)) * scale : 0;
    const shearBottom = italic ? (1.0 - 0.25 * (down / scale)) * scale : 0;

    const finalX0 = x0 - extraThickness;
    const finalX1 = x1 + extraThickness;
    const finalY0 = y0 - extraThickness;
    const finalY1 = y1 + extraThickness;
    const rgba = colorToArray(color);

    return [
      { position: [finalX0 + shearTop, finalY0, z], color: rgba, uv0: [u0, v0], uv2: lightmapUV },
      { position: [finalX0 + shearBottom, finalY1, z], color: rgba, uv0: [u0, v1], uv2: lightmapUV },
      { position: [finalX1 + shearBottom, finalY1, z], color: rgba, uv0: [u1, v1], uv2: lightmapUV },
      { position: [finalX1 + shearTop, finalY0, z], color: rgba, uv0: [u1, v0], uv2: lightmapUV },
    ];
  }
}

export function createVertexGenerator(): VertexGenerator {
  return new VertexGeneratorImpl();
}
