import type { ResourceLocation } from "./resources";
import type { TextMeshGroup } from "./vertex";
import type { Color } from "./text";

export type ShaderType = "vertex" | "fragment";

export type ShaderSource = {
  readonly type: ShaderType;
  readonly source: string;
  readonly location: ResourceLocation;
};

export type ShaderProgram = {
  readonly id: string;
  readonly vertexShader: ShaderSource;
  readonly fragmentShader: ShaderSource;
  readonly uniforms: Map<string, UniformInfo>;
  readonly attributes: Map<string, AttributeInfo>;
};

export type UniformType =
  | "float"
  | "vec2"
  | "vec3"
  | "vec4"
  | "mat2"
  | "mat3"
  | "mat4"
  | "sampler2D"
  | "int"
  | "ivec2";

export type UniformInfo = {
  readonly name: string;
  readonly type: UniformType;
  readonly location: number;
};

export type AttributeInfo = {
  readonly name: string;
  readonly type: string;
  readonly location: number;
  readonly size: number;
};

export interface ShaderPreprocessor {
  preprocess(source: string, location: ResourceLocation): Promise<string>;
  resolveImport(importPath: string, fromLocation: ResourceLocation): ResourceLocation;
}

export interface ShaderManager {
  loadProgram(vertexPath: ResourceLocation, fragmentPath: ResourceLocation): Promise<ShaderProgram>;
  getProgram(id: string): ShaderProgram | null;
  getTextProgram(): ShaderProgram;
  unloadProgram(id: string): void;
  clear(): void;
}

export type BoundingBox = {
  readonly min: [number, number];
  readonly max: [number, number];
};

export type DrawnComponent = {
  readonly id?: string;
  readonly bbox: BoundingBox;
  readonly sourceRange: [number, number];
};

export type DrawTextResult = {
  readonly components: DrawnComponent[];
};

export type Mat4 = Float32Array;

export type TextureHandle = {
  readonly id: string;
  readonly width: number;
  readonly height: number;
};

export type RenderState = {
  projectionMatrix: Mat4;
  modelViewMatrix: Mat4;
  colorModulator: Color;
  fogStart: number;
  fogEnd: number;
  fogColor: Color;
  programId: string;
  cachePicking?: boolean;
};

export type DrawCall = {
  mesh: TextMeshGroup;
  state: Partial<RenderState>;
};

export interface Texture {
  readonly handle: TextureHandle;
  bind(unit: number): void;
  dispose(): void;
}

export interface TextureManager {
  loadTexture(location: ResourceLocation): Promise<Texture>;
  getTexture(location: ResourceLocation): Texture | null;
  createTexture(id: string, data: ImageData | ArrayBuffer, width: number, height: number): Texture;
  unloadTexture(location: ResourceLocation): void;
  clear(): void;
}

export interface RenderContext {
  readonly width: number;
  readonly height: number;
  setProgram(program: ShaderProgram): void;
  setTexture(slot: number, texture: Texture): void;
  setUniform(name: string, value: unknown): void;
  draw(mesh: TextMeshGroup): void;
  flush(): void;
}

export interface Renderer {
  readonly context: RenderContext;
  beginFrame(): void;
  endFrame(): void;
  drawText(mesh: TextMeshGroup, state: Partial<RenderState>): void;
  drawTextWithPicking(mesh: TextMeshGroup, state: Partial<RenderState>): void;
  readPickingBuffer(x: number, y: number): Uint8Array;
  getPickingCache(): Uint8Array | null;
  getPickingSize(): { width: number; height: number };
  resize(width: number, height: number): void;
  dispose(): void;
}

export interface RendererFactory {
  createWebGLRenderer(canvas: HTMLCanvasElement): Renderer;
  createWebGPURenderer(canvas: HTMLCanvasElement): Promise<Renderer>;
}
