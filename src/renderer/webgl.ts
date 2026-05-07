import type {
  Renderer,
  RenderContext,
  TextMeshGroup,
  TextMesh,
  RenderState,
  ShaderProgram,
  Texture,
  Mat4,
  ComponentUniforms,
} from "../types";
import { WebGLShaderManager, getPickingProgramId } from "./webgl-shader";
import { WebGLTextureManager } from "./webgl-texture";

const FLOATS_PER_VERTEX = 12;
const PICKING_FLOATS_PER_VERTEX = 16;

function createOrthographicMatrix(
  left: number,
  right: number,
  bottom: number,
  top: number,
  near: number,
  far: number
): Mat4 {
  const out = new Float32Array(16);
  const lr = 1 / (left - right);
  const bt = 1 / (bottom - top);
  const nf = 1 / (near - far);

  out[0] = -2 * lr;
  out[1] = 0;
  out[2] = 0;
  out[3] = 0;
  out[4] = 0;
  out[5] = -2 * bt;
  out[6] = 0;
  out[7] = 0;
  out[8] = 0;
  out[9] = 0;
  out[10] = 2 * nf;
  out[11] = 0;
  out[12] = (left + right) * lr;
  out[13] = (top + bottom) * bt;
  out[14] = (far + near) * nf;
  out[15] = 1;

  return out;
}

function createIdentityMatrix(): Mat4 {
  const out = new Float32Array(16);
  out[0] = 1;
  out[5] = 1;
  out[10] = 1;
  out[15] = 1;
  return out;
}

class WebGLRenderContext implements RenderContext {
  private currentProgramId: string | null = null;
  private currentProgram: WebGLProgram | null = null;
  private currentUniforms: Map<string, WebGLUniformLocation> | null = null;

  constructor(
    private gl: WebGL2RenderingContext,
    private renderer: WebGLRenderer,
    private vao: WebGLVertexArrayObject,
    private vbo: WebGLBuffer,
    private ebo: WebGLBuffer
  ) {}

  private get shaders(): WebGLShaderManager | null {
    return this.renderer.shaders ?? null;
  }

  private get textures(): WebGLTextureManager | null {
    return this.renderer.textures ?? null;
  }

  get width(): number {
    return this.gl.drawingBufferWidth;
  }

  get height(): number {
    return this.gl.drawingBufferHeight;
  }

  setProgram(program: ShaderProgram): void {
    const compiled = this.shaders?.getCompiledProgram(program.id);
    if (!compiled) return;

    this.gl.useProgram(compiled.program);
    this.currentProgramId = program.id;
    this.currentProgram = compiled.program;
    this.currentUniforms = compiled.uniforms;
  }

  setTexture(slot: number, texture: Texture): void {
    this.gl.activeTexture(this.gl.TEXTURE0 + slot);
    const glTexture = (texture as unknown as { getGLTexture(): WebGLTexture }).getGLTexture();
    this.gl.bindTexture(this.gl.TEXTURE_2D, glTexture);
  }

  setUniform(name: string, value: unknown): void {
    if (!this.currentUniforms) return;

    const aliases: string[] = [name];
    if (name.startsWith("u_")) aliases.push(name.slice(2));
    if (name === "u_projection") aliases.push("ProjMat");
    if (name === "u_modelView") aliases.push("ModelViewMat");
    if (name === "u_colorModulator") aliases.push("ColorModulator");
    if (name === "u_texture") aliases.push("Sampler0");

    let loc: WebGLUniformLocation | undefined;
    for (const alias of aliases) {
      loc = this.currentUniforms.get(alias);
      if (loc) break;
    }
    if (!loc) return;

    if (typeof value === "number") {
      this.gl.uniform1f(loc, value);
    } else if (Array.isArray(value)) {
      switch (value.length) {
        case 2:
          this.gl.uniform2f(loc, value[0] ?? 0, value[1] ?? 0);
          break;
        case 3:
          this.gl.uniform3f(loc, value[0] ?? 0, value[1] ?? 0, value[2] ?? 0);
          break;
        case 4:
          this.gl.uniform4f(loc, value[0] ?? 0, value[1] ?? 0, value[2] ?? 0, value[3] ?? 0);
          break;
      }
    } else if (value instanceof Float32Array) {
      if (value.length === 2) {
        this.gl.uniform2f(loc, value[0] ?? 0, value[1] ?? 0);
      } else if (value.length === 3) {
        this.gl.uniform3f(loc, value[0] ?? 0, value[1] ?? 0, value[2] ?? 0);
      } else if (value.length === 4) {
        this.gl.uniform4f(loc, value[0] ?? 0, value[1] ?? 0, value[2] ?? 0, value[3] ?? 0);
      } else if (value.length === 16) {
        this.gl.uniformMatrix4fv(loc, false, value);
      }
    }
  }

  draw(mesh: TextMeshGroup, componentUniforms?: Record<string, ComponentUniforms>): void {
    this.gl.bindVertexArray(this.vao);

    for (const submesh of mesh.meshes) {
      if (componentUniforms && submesh.componentId) {
        const uniforms = componentUniforms[submesh.componentId];
        if (uniforms) {
          for (const [name, value] of Object.entries(uniforms)) {
            this.setUniform(name, value);
          }
        }
      }

      if (this.textures) {
        const texture = this.textures.getTextureByKey(submesh.textureId);
        if (texture) {
          this.gl.activeTexture(this.gl.TEXTURE0);
          this.gl.bindTexture(
            this.gl.TEXTURE_2D,
            (texture as unknown as { getGLTexture(): WebGLTexture }).getGLTexture()
          );
          const texLoc = this.currentUniforms?.get("Sampler0");
          if (texLoc) this.gl.uniform1i(texLoc, 0);
        }
      }

      const sampler2Loc = this.currentUniforms?.get("Sampler2");
      if (sampler2Loc && this.textures) {
        const whiteTexture = this.textures.getTextureByKey("__white__");
        if (whiteTexture) {
          this.gl.activeTexture(this.gl.TEXTURE2);
          this.gl.bindTexture(
            this.gl.TEXTURE_2D,
            (whiteTexture as unknown as { getGLTexture(): WebGLTexture }).getGLTexture()
          );
          this.gl.uniform1i(sampler2Loc, 2);
        }
      }

      this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.vbo);
      this.gl.bufferData(this.gl.ARRAY_BUFFER, submesh.vertices, this.gl.DYNAMIC_DRAW);

      this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, this.ebo);
      this.gl.bufferData(this.gl.ELEMENT_ARRAY_BUFFER, submesh.indices, this.gl.DYNAMIC_DRAW);

      this.gl.drawElements(this.gl.TRIANGLES, submesh.indexCount, this.gl.UNSIGNED_SHORT, 0);
    }

    this.gl.bindVertexArray(null);
  }

  flush(): void {
    this.currentProgramId = null;
    this.currentProgram = null;
    this.currentUniforms = null;
  }
}

export class WebGLRenderer implements Renderer {
  readonly context: RenderContext;
  private gl: WebGL2RenderingContext;
  shaders: WebGLShaderManager | null = null;
  textures: WebGLTextureManager | null = null;

  private vao: WebGLVertexArrayObject | null = null;
  private pickingVao: WebGLVertexArrayObject | null = null;
  private vbo: WebGLBuffer | null = null;
  private ebo: WebGLBuffer | null = null;

  private pickingFramebuffer: WebGLFramebuffer | null = null;
  private pickingTexture: WebGLTexture | null = null;
  private pickingRenderbuffer: WebGLRenderbuffer | null = null;
  private pickingWidth = 0;
  private pickingHeight = 0;

  private pickingCache: Uint8Array | null = null;
  private enablePickingCache = false;

  private projectionMatrix: Mat4 = createIdentityMatrix();
  private modelViewMatrix: Mat4 = createIdentityMatrix();

  constructor(canvas: HTMLCanvasElement) {
    const gl = canvas.getContext("webgl2", {
      alpha: true,
      premultipliedAlpha: false,
      antialias: false,
      depth: true,
      stencil: false,
      preserveDrawingBuffer: true,
    });
    if (!gl) {
      throw new Error("WebGL2 not supported");
    }
    this.gl = gl;

    this.initBuffers();
    this.shaders = new WebGLShaderManager(gl);
    this.textures = new WebGLTextureManager(gl, null!);

    this.context = new WebGLRenderContext(
      gl,
      this,
      this.vao!,
      this.vbo!,
      this.ebo!
    );
  }

  setManagers(shaders: WebGLShaderManager, textures: WebGLTextureManager): void {
    this.shaders = shaders;
    this.textures = textures;
  }

  getShaderManager(): WebGLShaderManager | null {
    return this.shaders;
  }

  getTextureManager(): WebGLTextureManager | null {
    return this.textures;
  }

  private initBuffers(): void {
    const gl = this.gl;

    this.vao = gl.createVertexArray();
    this.pickingVao = gl.createVertexArray();
    this.vbo = gl.createBuffer();
    this.ebo = gl.createBuffer();

    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.ebo);

    const stride = FLOATS_PER_VERTEX * 4;

    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, stride, 0);

    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 4, gl.FLOAT, false, stride, 12);

    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 2, gl.FLOAT, false, stride, 28);

    gl.enableVertexAttribArray(3);
    gl.vertexAttribPointer(3, 2, gl.FLOAT, false, stride, 36);

    gl.bindVertexArray(this.pickingVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.ebo);

    const pickingStride = PICKING_FLOATS_PER_VERTEX * 4;

    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, pickingStride, 0);

    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 4, gl.FLOAT, false, pickingStride, 12);

    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 2, gl.FLOAT, false, pickingStride, 28);

    gl.enableVertexAttribArray(3);
    gl.vertexAttribPointer(3, 2, gl.FLOAT, false, pickingStride, 36);

    gl.enableVertexAttribArray(4);
    gl.vertexAttribPointer(4, 4, gl.FLOAT, false, pickingStride, 48);

    gl.bindVertexArray(null);
  }

  private initPickingFramebuffer(width: number, height: number): void {
    if (this.pickingWidth === width && this.pickingHeight === height) {
      return;
    }

    const gl = this.gl;

    if (this.pickingFramebuffer) {
      gl.deleteFramebuffer(this.pickingFramebuffer);
      gl.deleteTexture(this.pickingTexture);
      gl.deleteRenderbuffer(this.pickingRenderbuffer);
    }

    this.pickingFramebuffer = gl.createFramebuffer();
    this.pickingTexture = gl.createTexture();
    this.pickingRenderbuffer = gl.createRenderbuffer();

    gl.bindTexture(gl.TEXTURE_2D, this.pickingTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

    gl.bindRenderbuffer(gl.RENDERBUFFER, this.pickingRenderbuffer);
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, width, height);

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.pickingFramebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.pickingTexture, 0);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, this.pickingRenderbuffer);

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    this.pickingWidth = width;
    this.pickingHeight = height;
  }

  beginFrame(): void {
    const gl = this.gl;
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
  }

  endFrame(): void {}

  drawText(mesh: TextMeshGroup, state: Partial<RenderState>): void {
    const ctx = this.context as WebGLRenderContext;
    ctx.flush();

    const programId = state.programId ?? "text";
    ctx.setProgram({ id: programId } as ShaderProgram);

    const projection = state.projectionMatrix ?? this.projectionMatrix;
    const modelView = state.modelViewMatrix ?? this.modelViewMatrix;
    const colorMod = state.colorModulator ?? { r: 1, g: 1, b: 1, a: 1 };

    ctx.setUniform("u_projection", projection);
    ctx.setUniform("u_modelView", modelView);
    ctx.setUniform("u_colorModulator", new Float32Array([colorMod.r, colorMod.g, colorMod.b, colorMod.a]));

    this.setFogUniforms(ctx, state);

    ctx.draw(mesh, state.componentUniforms);
  }

  private setFogUniforms(ctx: RenderContext, state: Partial<RenderState>): void {
    const fogStart = state.fogStart ?? 1e9;
    const fogEnd = state.fogEnd ?? 2e9;
    const fogColor = state.fogColor ?? { r: 0, g: 0, b: 0, a: 0 };

    ctx.setUniform("FogEnvironmentalStart", fogStart);
    ctx.setUniform("FogEnvironmentalEnd", fogEnd);
    ctx.setUniform("FogRenderDistanceStart", fogStart);
    ctx.setUniform("FogRenderDistanceEnd", fogEnd);
    ctx.setUniform("FogSkyEnd", fogEnd);
    ctx.setUniform("FogCloudsEnd", fogEnd);
    ctx.setUniform("FogColor", new Float32Array([fogColor.r, fogColor.g, fogColor.b, fogColor.a]));
  }

  drawTextWithPicking(mesh: TextMeshGroup, state: Partial<RenderState>): void {
    this.drawText(mesh, state);

    if (!mesh.pickingMesh || !this.shaders) return;

    const gl = this.gl;

    // Use program-specific picking shader if available, otherwise fall back to default
    const programId = state.programId ?? "text";
    const pickingProgramId = getPickingProgramId(programId);
    let compiled = this.shaders.getCompiledProgram(pickingProgramId);
    if (!compiled) {
      compiled = this.shaders.getCompiledProgram("picking");
    }
    if (!compiled) return;

    const shouldCache = state.cachePicking ?? false;
    if (shouldCache) {
      this.enablePickingCache = true;
      this.pickingCache = new Uint8Array(this.context.width * this.context.height * 4);
    } else {
      this.enablePickingCache = false;
      this.pickingCache = null;
    }

    this.initPickingFramebuffer(this.context.width, this.context.height);

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.pickingFramebuffer);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    gl.useProgram(compiled.program);

    const projection = state.projectionMatrix ?? this.projectionMatrix;
    const modelView = state.modelViewMatrix ?? this.modelViewMatrix;

    const projLoc = compiled.uniforms.get("u_projection") ?? compiled.uniforms.get("ProjMat");
    const mvLoc = compiled.uniforms.get("u_modelView") ?? compiled.uniforms.get("ModelViewMat");
    if (projLoc) gl.uniformMatrix4fv(projLoc, false, projection);
    if (mvLoc) gl.uniformMatrix4fv(mvLoc, false, modelView);

    gl.bindVertexArray(this.pickingVao);
    this.drawPickingMesh(mesh.pickingMesh, compiled);
    gl.bindVertexArray(null);

    if (this.enablePickingCache && this.pickingCache) {
      gl.readPixels(
        0,
        0,
        this.context.width,
        this.context.height,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        this.pickingCache
      );
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  private drawPickingMesh(mesh: TextMesh, compiled: { program: WebGLProgram; uniforms: Map<string, WebGLUniformLocation> }): void {
    const gl = this.gl;
    const isCustomPickingMesh = (mesh.floatsPerVertex ?? FLOATS_PER_VERTEX) === PICKING_FLOATS_PER_VERTEX;

    // Bind white texture to Sampler2 for lightmap — required by Minecraft vertex shader
    const sampler2Loc = compiled.uniforms.get("Sampler2");
    if (sampler2Loc) {
      const whiteTexture = this.textures?.getTextureByKey("__white__");
      if (whiteTexture) {
        gl.activeTexture(gl.TEXTURE2);
        gl.bindTexture(gl.TEXTURE_2D, (whiteTexture as unknown as { getGLTexture(): WebGLTexture }).getGLTexture());
        gl.uniform1i(sampler2Loc, 2);
      }
    }

    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.bufferData(gl.ARRAY_BUFFER, mesh.vertices, gl.DYNAMIC_DRAW);

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.ebo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.indices, gl.DYNAMIC_DRAW);

    if (!isCustomPickingMesh) {
      gl.disableVertexAttribArray(4);
      gl.vertexAttrib4f(4, 0, 0, 0, 0);
    }

    gl.drawElements(gl.TRIANGLES, mesh.indexCount, gl.UNSIGNED_SHORT, 0);

    if (!isCustomPickingMesh) {
      gl.enableVertexAttribArray(4);
    }
  }

  readPickingBuffer(x: number, y: number): Uint8Array {
    const gl = this.gl;
    const pixel = new Uint8Array(4);

    if (this.enablePickingCache && this.pickingCache) {
      const cache = this.pickingCache;
      const flippedY = this.pickingHeight - y - 1;
      const index = (flippedY * this.context.width + x) * 4;
      if (index >= 0 && index + 3 < cache.length) {
        pixel[0] = cache[index] ?? 0;
        pixel[1] = cache[index + 1] ?? 0;
        pixel[2] = cache[index + 2] ?? 0;
        pixel[3] = cache[index + 3] ?? 0;
      }
      return pixel;
    }

    if (!this.pickingFramebuffer) {
      return pixel;
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.pickingFramebuffer);
    gl.readPixels(x, this.pickingHeight - y - 1, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    return pixel;
  }

  resize(width: number, height: number): void {
    this.gl.viewport(0, 0, width, height);
    this.projectionMatrix = createOrthographicMatrix(0, width, height, 0, -1000, 1000);
  }

  getProjectionMatrix(): Mat4 {
    return this.projectionMatrix;
  }

  getModelViewMatrix(): Mat4 {
    return this.modelViewMatrix;
  }

  getPickingCache(): Uint8Array | null {
    return this.enablePickingCache && this.pickingCache ? this.pickingCache : null;
  }

  getPickingSize(): { width: number; height: number } {
    return { width: this.pickingWidth, height: this.pickingHeight };
  }

  dispose(): void {
    const gl = this.gl;

    if (this.vao) gl.deleteVertexArray(this.vao);
    if (this.pickingVao) gl.deleteVertexArray(this.pickingVao);
    if (this.vbo) gl.deleteBuffer(this.vbo);
    if (this.ebo) gl.deleteBuffer(this.ebo);
    if (this.pickingFramebuffer) gl.deleteFramebuffer(this.pickingFramebuffer);
    if (this.pickingTexture) gl.deleteTexture(this.pickingTexture);
    if (this.pickingRenderbuffer) gl.deleteRenderbuffer(this.pickingRenderbuffer);
  }
}
