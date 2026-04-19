import type {
  ResourceManager,
  ResourcePack,
  FontManager,
  Font,
  FontResolver,
  TextParser,
  TextLayoutEngine,
  VertexGenerator,
  ColorPicker,
  ShaderManager,
  TextureManager,
  Renderer,
  ResourceLocation,
  TextComponent,
  LayoutOptions,
  VertexGeneratorOptions,
  TextMeshGroup,
  PickResult,
  RenderState,
  ComponentRange,
  DrawTextResult,
  DrawnComponent,
} from "./types";
import { WebGLRenderer, WebGLTextureManager, WebGLShaderManager } from "./renderer";
import { ResourceManagerImpl, createResourceManager, parseResourceLocation } from "./resources";
import { FontManagerImpl, createFontManager } from "./font";
import { TextParserImpl, createTextParser } from "./text";
import { TextLayoutEngineImpl, createTextLayoutEngine } from "./layout";
import { VertexGeneratorImpl, createVertexGenerator, ColorPickerImpl, createColorPicker } from "./vertex";

export type LibmojanglesOptions = {
  canvas: HTMLCanvasElement;
  rendererType?: "webgl" | "webgpu";
  defaultFont?: ResourceLocation;
};

export interface Libmojangles {
  readonly resources: ResourceManager;
  readonly fonts: FontManager;
  readonly textures: TextureManager;
  readonly shaders: ShaderManager;
  readonly renderer: Renderer;
  readonly parser: TextParser;
  readonly layout: TextLayoutEngine;
  readonly vertices: VertexGenerator;
  readonly picker: ColorPicker;

  addResourcePack(pack: ResourcePack): void;
  removeResourcePack(pack: ResourcePack): void;

  loadFont(id: ResourceLocation): Promise<Font>;
  getFont(id: ResourceLocation): Font | null;

  createTextMesh(
    text: string | TextComponent,
    options?: LayoutOptions & VertexGeneratorOptions
  ): TextMeshGroup;

  drawText(
    text: string | TextComponent,
    x: number,
    y: number,
    options?: LayoutOptions & VertexGeneratorOptions & Partial<RenderState>
  ): DrawTextResult | void;

  pick(x: number, y: number): PickResult | null;

  resize(width: number, height: number): void;
  dispose(): void;
}

class LibmojanglesImpl implements Libmojangles {
  readonly renderer: WebGLRenderer;
  readonly resources: ResourceManagerImpl;
  readonly textures: WebGLTextureManager;
  readonly shaders: WebGLShaderManager;
  readonly fonts: FontManagerImpl;
  readonly parser: TextParserImpl;
  readonly layout: TextLayoutEngineImpl;
  readonly vertices: VertexGeneratorImpl;
  readonly picker: ColorPickerImpl;

  private defaultFontId: ResourceLocation;
  private lastPickingMesh: TextMeshGroup | null = null;

  constructor(options: LibmojanglesOptions) {
    this.renderer = new WebGLRenderer(options.canvas);
    this.resources = createResourceManager() as ResourceManagerImpl;

    const gl = (this.renderer as unknown as { gl: WebGL2RenderingContext }).gl ??
      options.canvas.getContext("webgl2")!;

    this.textures = new WebGLTextureManager(gl, this.resources);
    this.shaders = new WebGLShaderManager(gl, this.resources);
    this.renderer.setManagers(this.shaders, this.textures);

    const whitePixel = new Uint8Array([255, 255, 255, 255]);
    this.textures.createTexture("__white__", whitePixel.buffer, 1, 1);

    this.fonts = createFontManager(this.resources, this.textures) as FontManagerImpl;
    this.parser = createTextParser() as TextParserImpl;
    this.layout = createTextLayoutEngine() as TextLayoutEngineImpl;
    this.vertices = createVertexGenerator() as VertexGeneratorImpl;
    this.picker = createColorPicker() as ColorPickerImpl;

    this.defaultFontId = options.defaultFont ?? { namespace: "minecraft", path: "default" };

    this.resize(options.canvas.width, options.canvas.height);
  }

  addResourcePack(pack: ResourcePack): void {
    this.resources.addPack(pack);
  }

  removeResourcePack(pack: ResourcePack): void {
    this.resources.removePack(pack);
  }

  loadFont(id: ResourceLocation): Promise<Font> {
    return this.fonts.loadFont(id);
  }

  getFont(id: ResourceLocation): Font | null {
    return this.fonts.getFont(id);
  }

  createTextMesh(
    text: string | TextComponent,
    options?: LayoutOptions & VertexGeneratorOptions
  ): TextMeshGroup {
    const glyphs = this.parser.parse(text);
    const layoutResult = this.layout.layout(glyphs, this.fontResolver, options);
    return this.vertices.generate(layoutResult, options);
  }

  private fontResolver: FontResolver = (name) => {
    if (name) {
      const id = parseResourceLocation(name);
      const font = this.fonts.getFont(id);
      if (font) return font;
    }
    return this.fonts.getDefaultFont();
  };

  drawText(
    text: string | TextComponent,
    x: number,
    y: number,
    options?: LayoutOptions & VertexGeneratorOptions & Partial<RenderState>
  ): DrawTextResult | void {
    const scale = options?.scale ?? 1;
    const mesh = this.createTextMesh(text, {
      generatePicking: true,
    });

    const modelView = new Float32Array(16);
    modelView[0] = scale;
    modelView[5] = scale;
    modelView[10] = 1;
    modelView[15] = 1;
    modelView[12] = x;
    modelView[13] = y;

    const cachePicking = options?.cachePicking ?? false;

    const state: Partial<RenderState> = {
      ...options,
      projectionMatrix: this.renderer.getProjectionMatrix(),
      modelViewMatrix: modelView,
      cachePicking,
    };

    this.renderer.drawTextWithPicking(mesh, state);
    this.lastPickingMesh = mesh;

    if (cachePicking) {
      return this.computeDrawTextResult(text, mesh, scale, x, y);
    }
  }

  private computeDrawTextResult(
    text: string | TextComponent,
    mesh: TextMeshGroup,
    scale: number,
    offsetX: number,
    offsetY: number
  ): DrawTextResult {
    const ranges = this.parser.parseComponentRanges(text);
    const drawnComponents: DrawnComponent[] = [];

    const cache = this.renderer.getPickingCache();
    const size = this.renderer.getPickingSize();
    if (!cache || size.width === 0 || size.height === 0) {
      return { components: drawnComponents };
    }

    const glyphBounds = new Map<number, { minX: number; minY: number; maxX: number; maxY: number }>();

    let pixelCount = 0;
    for (let y = 0; y < size.height; y++) {
      for (let x = 0; x < size.width; x++) {
        const idx = (y * size.width + x) * 4;
        const pixel = cache[idx] ?? 0;
        if (pixel === 0 && cache[idx + 1] === 0 && cache[idx + 2] === 0) {
          continue;
        }
        if (cache[idx + 3] === 0) continue;

        pixelCount++;
        const encoded = (cache[idx]! << 16) | (cache[idx + 1]! << 8) | cache[idx + 2]!;
        const sourceIndex = encoded - 1;

        let bounds = glyphBounds.get(sourceIndex);
        if (!bounds) {
          bounds = { minX: x, minY: y, maxX: x, maxY: y };
          glyphBounds.set(sourceIndex, bounds);
        }
        bounds.minX = Math.min(bounds.minX, x);
        bounds.minY = Math.min(bounds.minY, y);
        bounds.maxX = Math.max(bounds.maxX, x);
        bounds.maxY = Math.max(bounds.maxY, y);
      }
    }
    for (const range of ranges) {
      const [start, end] = range.sourceRange;
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      let hasBounds = false;

      for (let si = start; si < end; si++) {
        const bounds = glyphBounds.get(si);
        if (bounds) {
          minX = Math.min(minX, bounds.minX);
          minY = Math.min(minY, bounds.minY);
          maxX = Math.max(maxX, bounds.maxX);
          maxY = Math.max(maxY, bounds.maxY);
          hasBounds = true;
        }
      }

      if (hasBounds) {
        drawnComponents.push({
          id: range.id,
          bbox: { min: [minX, minY], max: [maxX, maxY] },
          sourceRange: range.sourceRange,
        });
      }
    }

    return { components: drawnComponents };
  }

  pick(x: number, y: number): PickResult | null {
    const pixel = this.renderer.readPickingBuffer(x, y);
    const r = pixel[0] ?? 0;
    const g = pixel[1] ?? 0;
    const b = pixel[2] ?? 0;
    const a = pixel[3] ?? 0;
    const color = {
      r: r / 255,
      g: g / 255,
      b: b / 255,
      a: a / 255,
    };

    if (a === 0) {
      return null;
    }

    const index = this.picker.decodeId(color);
    return {
      sourceIndex: index,
      glyphIndex: index,
      x,
      y,
    };
  }

  resize(width: number, height: number): void {
    this.renderer.resize(width, height);
  }

  dispose(): void {
    this.textures.clear();
    this.shaders.clear();
    this.fonts.clear();
    this.renderer.dispose();
  }
}

export function createLibmojangles(options: LibmojanglesOptions): Libmojangles {
  return new LibmojanglesImpl(options);
}