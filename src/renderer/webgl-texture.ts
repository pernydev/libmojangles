import type { TextureManager, Texture, TextureHandle, ResourceLocation } from "../types";
import { ResourceManagerImpl } from "../resources/manager";
import { resourceLocationToString } from "../resources";

export type TextureWithData = Texture & {
  readonly imageData: Uint8Array;
};

class WebGLTextureImpl implements TextureWithData {
  readonly handle: TextureHandle;
  readonly imageData: Uint8Array;
  private glTexture: WebGLTexture;
  private gl: WebGL2RenderingContext;

  constructor(
    gl: WebGL2RenderingContext,
    id: string,
    glTex: WebGLTexture,
    width: number,
    height: number,
    imageData: Uint8Array
  ) {
    this.gl = gl;
    this.glTexture = glTex;
    this.handle = { id, width, height };
    this.imageData = imageData;
  }

  bind(unit: number): void {
    this.gl.activeTexture(this.gl.TEXTURE0 + unit);
    this.gl.bindTexture(this.gl.TEXTURE_2D, this.glTexture);
  }

  dispose(): void {
    this.gl.deleteTexture(this.glTexture);
  }

  getGLTexture(): WebGLTexture {
    return this.glTexture;
  }
}

export class WebGLTextureManager implements TextureManager {
  private textures = new Map<string, WebGLTextureImpl>();
  private loading = new Map<string, Promise<Texture>>();

  constructor(
    private gl: WebGL2RenderingContext,
    private resources: ResourceManagerImpl
  ) {}

  async loadTexture(location: ResourceLocation): Promise<Texture> {
    const key = resourceLocationToString(location);

    const existing = this.textures.get(key);
    if (existing) return existing;

    const loading = this.loading.get(key);
    if (loading) return loading;

    const promise = this.doLoadTexture(location, key);
    this.loading.set(key, promise);

    try {
      const texture = await promise;
      return texture;
    } finally {
      this.loading.delete(key);
    }
  }

  private async doLoadTexture(location: ResourceLocation, key: string): Promise<Texture> {
    const pathStr = location.path.endsWith(".png") ? location.path : `${location.path}.png`;
    const path: ResourceLocation = {
      namespace: location.namespace,
      path: pathStr.startsWith("textures/") ? pathStr : `textures/${pathStr}`,
    };

    const data = await this.resources.readBinary(path);
    if (!data) {
      throw new Error(`Texture not found: ${key}`);
    }

    const blob = new Blob([data], { type: "image/png" });
    const url = URL.createObjectURL(blob);

    try {
      const image = await this.loadImage(url);
      const imageData = this.getImageData(image);
      const texture = this.createTextureFromImage(key, image, imageData);
      this.textures.set(key, texture);
      return texture;
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  private loadImage(url: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Failed to load image"));
      img.src = url;
    });
  }

  private getImageData(image: HTMLImageElement): Uint8Array {
    const canvas = document.createElement("canvas");
    canvas.width = image.width;
    canvas.height = image.height;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(image, 0, 0);
    const data = ctx.getImageData(0, 0, image.width, image.height);
    return new Uint8Array(data.data.buffer);
  }

  private createTextureFromImage(
    id: string,
    image: HTMLImageElement,
    imageData: Uint8Array
  ): WebGLTextureImpl {
    const gl = this.gl;
    const glTexture = gl.createTexture()!;

    gl.bindTexture(gl.TEXTURE_2D, glTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);

    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    return new WebGLTextureImpl(gl, id, glTexture, image.width, image.height, imageData);
  }

  getTexture(location: ResourceLocation): Texture | null {
    return this.textures.get(resourceLocationToString(location)) ?? null;
  }

  getTextureWithData(location: ResourceLocation): TextureWithData | null {
    return this.textures.get(resourceLocationToString(location)) ?? null;
  }

  createTexture(
    id: string,
    data: ImageData | ArrayBuffer,
    width: number,
    height: number
  ): Texture {
    const gl = this.gl;
    const glTexture = gl.createTexture()!;

    gl.bindTexture(gl.TEXTURE_2D, glTexture);

    let imageData: Uint8Array;
    if (data instanceof ImageData) {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, data);
      imageData = new Uint8Array(data.data.buffer);
    } else {
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        width,
        height,
        0,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        new Uint8Array(data)
      );
      imageData = new Uint8Array(data);
    }

    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    const texture = new WebGLTextureImpl(gl, id, glTexture, width, height, imageData);
    this.textures.set(id, texture);
    return texture;
  }

  unloadTexture(location: ResourceLocation): void {
    const key = resourceLocationToString(location);
    const texture = this.textures.get(key);
    if (texture) {
      texture.dispose();
      this.textures.delete(key);
    }
  }

  clear(): void {
    for (const texture of this.textures.values()) {
      texture.dispose();
    }
    this.textures.clear();
  }

  getTextureByKey(key: string): WebGLTextureImpl | null {
    return this.textures.get(key) ?? null;
  }
}

export function createTextureManager(
  gl: WebGL2RenderingContext,
  resources: ResourceManagerImpl
): TextureManager {
  return new WebGLTextureManager(gl, resources);
}
