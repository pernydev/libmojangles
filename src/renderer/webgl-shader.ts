import type {
  ShaderManager,
  ShaderProgram,
  ShaderSource,
  UniformInfo,
  AttributeInfo,
  ResourceLocation,
  ResourceManager,
} from "../types";
import { resourceLocationToString } from "../resources";

const TEXT_VERTEX_SHADER = `#version 300 es
precision highp float;

uniform mat4 u_projection;
uniform mat4 u_modelView;

in vec3 a_position;
in vec4 a_color;
in vec2 a_uv0;
in vec2 a_uv2;

out vec4 v_color;
out vec2 v_uv0;
out vec2 v_uv2;

void main() {
  gl_Position = u_projection * u_modelView * vec4(a_position, 1.0);
  v_color = a_color;
  v_uv0 = a_uv0;
  v_uv2 = a_uv2;
}
`;

const TEXT_FRAGMENT_SHADER = `#version 300 es
precision highp float;

uniform sampler2D u_texture;
uniform vec4 u_colorModulator;

in vec4 v_color;
in vec2 v_uv0;
in vec2 v_uv2;

out vec4 fragColor;

void main() {
  vec4 texColor = texture(u_texture, v_uv0);
  if (texColor.a < 0.01) {
    discard;
  }
  fragColor = texColor * v_color * u_colorModulator;
}
`;

const PICKING_FRAGMENT_SHADER = `#version 300 es
precision highp float;

in vec4 v_color;
in vec2 v_uv0;
in vec2 v_uv2;

out vec4 fragColor;

void main() {
  fragColor = v_color;
}
`;

const MINECRAFT_PICKING_FRAGMENT_SHADER = `#version 300 es
precision highp float;

in vec4 vertexPickColor;

out vec4 fragColor;

void main() {
  fragColor = vertexPickColor;
}
`;

// Minecraft attribute names mapped to our fixed VAO locations
const MINECRAFT_ATTR_BINDINGS: Record<string, number> = {
  Position: 0,
  Color: 1,
  UV0: 2,
  UV2: 3,
  PickColor: 4,
  a_position: 0,
  a_color: 1,
  a_uv0: 2,
  a_uv2: 3,
};

export function injectPickingPassThrough(vertexSource: string): string {
  const hasPickColorIn = /\bin\s+vec4\s+PickColor\s*;/m.test(vertexSource);
  const hasPickColorOut = /\bout\s+vec4\s+vertexPickColor\s*;/m.test(vertexSource);
  const mainMatch = /\bvoid\s+main\s*\(\s*\)\s*\{/m.exec(vertexSource);
  if (!mainMatch || mainMatch.index === undefined) {
    throw new Error("Failed to create picking shader variant: could not find main() in vertex shader");
  }

  let patched = vertexSource;
  const declarationBlock = `${hasPickColorIn ? "" : "in vec4 PickColor;\n"}${hasPickColorOut ? "" : "out vec4 vertexPickColor;\n"}`;
  if (declarationBlock) {
    const headerMatch = /^(\s*#version\s+[^\n]*\n(?:\s*precision\s+[^\n]*\n)*)/m.exec(patched);
    const insertDeclarationsAt = headerMatch ? headerMatch[0].length : 0;
    patched = `${patched.slice(0, insertDeclarationsAt)}${declarationBlock}${patched.slice(insertDeclarationsAt)}`;
  }

  const insertAt = mainMatch.index + (patched.length - vertexSource.length) + mainMatch[0].length;
  patched = `${patched.slice(0, insertAt)}\n    vertexPickColor = PickColor;${patched.slice(insertAt)}`;

  return patched;
}

interface CompiledProgram {
  program: WebGLProgram;
  uniforms: Map<string, WebGLUniformLocation>;
  attributes: Map<string, number>;
}

type KHRParallelShaderCompile = {
  COMPLETION_STATUS_KHR: number;
};

function getPickingProgramId(programId: string): string {
  return `${programId}:picking`;
}

export class WebGLShaderManager implements ShaderManager {
  private programs = new Map<string, ShaderProgram>();
  private compiledPrograms = new Map<string, CompiledProgram>();
  private textProgram: ShaderProgram | null = null;
  private pickingProgram: ShaderProgram | null = null;
  private parallelShaderCompile: KHRParallelShaderCompile | null;

  constructor(
    private gl: WebGL2RenderingContext,
    private resources?: ResourceManager
  ) {
    this.parallelShaderCompile = gl.getExtension("KHR_parallel_shader_compile") as KHRParallelShaderCompile | null;
    this.initBuiltinPrograms();
  }

  private initBuiltinPrograms(): void {
    this.textProgram = this.createBuiltinProgram(
      "text",
      TEXT_VERTEX_SHADER,
      TEXT_FRAGMENT_SHADER
    );
    this.programs.set("text", this.textProgram);

    this.pickingProgram = this.createBuiltinProgram(
      "picking",
      TEXT_VERTEX_SHADER,
      PICKING_FRAGMENT_SHADER
    );
    this.programs.set("picking", this.pickingProgram);
  }

  private createBuiltinProgram(
    id: string,
    vertexSource: string,
    fragmentSource: string
  ): ShaderProgram {
    const vertexShader: ShaderSource = {
      type: "vertex",
      source: vertexSource,
      location: { namespace: "libmojangles", path: `builtin/${id}.vsh` },
    };

    const fragmentShader: ShaderSource = {
      type: "fragment",
      source: fragmentSource,
      location: { namespace: "libmojangles", path: `builtin/${id}.fsh` },
    };

    const compiled = this.compileProgram(vertexSource, fragmentSource);

    const uniforms = new Map<string, UniformInfo>();
    const attributes = new Map<string, AttributeInfo>();

    const gl = this.gl;

    const numUniforms = gl.getProgramParameter(compiled.program, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < numUniforms; i++) {
      const info = gl.getActiveUniform(compiled.program, i);
      if (info) {
        uniforms.set(info.name, {
          name: info.name,
          type: this.glTypeToUniformType(info.type),
          location: i,
        });
      }
    }

    const numAttributes = gl.getProgramParameter(compiled.program, gl.ACTIVE_ATTRIBUTES);
    for (let i = 0; i < numAttributes; i++) {
      const info = gl.getActiveAttrib(compiled.program, i);
      if (info) {
        attributes.set(info.name, {
          name: info.name,
          type: this.glTypeToString(info.type),
          location: gl.getAttribLocation(compiled.program, info.name),
          size: info.size,
        });
      }
    }

    this.compiledPrograms.set(id, compiled);

    return {
      id,
      vertexShader,
      fragmentShader,
      uniforms,
      attributes,
    };
  }

  private createProgramObject(
    vertexShader: WebGLShader,
    fragmentShader: WebGLShader,
    bindMinecraftAttributes: boolean
  ): WebGLProgram {
    const gl = this.gl;
    const program = gl.createProgram()!;
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);

    if (bindMinecraftAttributes) {
      for (const [name, location] of Object.entries(MINECRAFT_ATTR_BINDINGS)) {
        gl.bindAttribLocation(program, location, name);
      }
    }

    gl.linkProgram(program);
    return program;
  }

  private async waitForProgramLink(program: WebGLProgram): Promise<void> {
    const gl = this.gl;
    const ext = this.parallelShaderCompile;

    if (ext) {
      while (!gl.getProgramParameter(program, ext.COMPLETION_STATUS_KHR)) {
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      }
    }

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const error = gl.getProgramInfoLog(program);
      gl.deleteProgram(program);
      throw new Error(`Failed to link program: ${error}`);
    }
  }

  private buildCompiledProgram(
    program: WebGLProgram,
    vertexShader: WebGLShader,
    fragmentShader: WebGLShader
  ): CompiledProgram {
    const gl = this.gl;

    gl.deleteShader(vertexShader);
    gl.deleteShader(fragmentShader);

    const uniforms = new Map<string, WebGLUniformLocation>();
    const numUniforms = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < numUniforms; i++) {
      const info = gl.getActiveUniform(program, i);
      if (info) {
        const loc = gl.getUniformLocation(program, info.name);
        if (loc) uniforms.set(info.name, loc);
      }
    }

    const attributes = new Map<string, number>();
    const numAttributes = gl.getProgramParameter(program, gl.ACTIVE_ATTRIBUTES);
    for (let i = 0; i < numAttributes; i++) {
      const info = gl.getActiveAttrib(program, i);
      if (info) {
        attributes.set(info.name, gl.getAttribLocation(program, info.name));
      }
    }

    return { program, uniforms, attributes };
  }

  private compileProgram(vertexSource: string, fragmentSource: string): CompiledProgram {
    const gl = this.gl;

    const vertexShader = this.compileShader(gl.VERTEX_SHADER, vertexSource);
    const fragmentShader = this.compileShader(gl.FRAGMENT_SHADER, fragmentSource);

    const program = gl.createProgram()!;
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const error = gl.getProgramInfoLog(program);
      gl.deleteProgram(program);
      throw new Error(`Failed to link program: ${error}`);
    }

    gl.deleteShader(vertexShader);
    gl.deleteShader(fragmentShader);

    const uniforms = new Map<string, WebGLUniformLocation>();
    const numUniforms = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < numUniforms; i++) {
      const info = gl.getActiveUniform(program, i);
      if (info) {
        const loc = gl.getUniformLocation(program, info.name);
        if (loc) uniforms.set(info.name, loc);
      }
    }

    const attributes = new Map<string, number>();
    const numAttributes = gl.getProgramParameter(program, gl.ACTIVE_ATTRIBUTES);
    for (let i = 0; i < numAttributes; i++) {
      const info = gl.getActiveAttrib(program, i);
      if (info) {
        attributes.set(info.name, gl.getAttribLocation(program, info.name));
      }
    }

    return { program, uniforms, attributes };
  }

  private async compileProgramWithBindingsAsync(
    vertexSource: string,
    fragmentSource: string
  ): Promise<CompiledProgram> {
    const gl = this.gl;

    const vs = this.compileShader(gl.VERTEX_SHADER, vertexSource);
    const fs = this.compileShader(gl.FRAGMENT_SHADER, fragmentSource);
    const program = this.createProgramObject(vs, fs, true);

    try {
      await this.waitForProgramLink(program);
      return this.buildCompiledProgram(program, vs, fs);
    } catch (error) {
      gl.deleteShader(vs);
      gl.deleteShader(fs);
      throw error;
    }
  }

  private compileProgramWithBindings(
    vertexSource: string,
    fragmentSource: string
  ): CompiledProgram {
    const gl = this.gl;

    const vs = this.compileShader(gl.VERTEX_SHADER, vertexSource);
    const fs = this.compileShader(gl.FRAGMENT_SHADER, fragmentSource);

    const program = gl.createProgram()!;
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);

    for (const [name, location] of Object.entries(MINECRAFT_ATTR_BINDINGS)) {
      gl.bindAttribLocation(program, location, name);
    }

    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const error = gl.getProgramInfoLog(program);
      gl.deleteProgram(program);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
      throw new Error(`Failed to link program: ${error}`);
    }

    gl.deleteShader(vs);
    gl.deleteShader(fs);

    const uniforms = new Map<string, WebGLUniformLocation>();
    const numUniforms = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < numUniforms; i++) {
      const info = gl.getActiveUniform(program, i);
      if (info) {
        const loc = gl.getUniformLocation(program, info.name);
        if (loc) uniforms.set(info.name, loc);
      }
    }

    const attributes = new Map<string, number>();
    const numAttributes = gl.getProgramParameter(program, gl.ACTIVE_ATTRIBUTES);
    for (let i = 0; i < numAttributes; i++) {
      const info = gl.getActiveAttrib(program, i);
      if (info) {
        attributes.set(info.name, gl.getAttribLocation(program, info.name));
      }
    }

    return { program, uniforms, attributes };
  }

  private compileShader(type: number, source: string): WebGLShader {
    const gl = this.gl;
    const shader = gl.createShader(type)!;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const error = gl.getShaderInfoLog(shader);
      gl.deleteShader(shader);
      throw new Error(`Failed to compile shader: ${error}`);
    }

    return shader;
  }

  // Resolve #moj_import directives and strip #version from included files
  private async preprocessIncludes(
    source: string,
    visited: Set<string>
  ): Promise<string> {
    const importPattern = /#moj_import\s*<([^:>]+):([^>]+)>/g;
    const matches = [...source.matchAll(importPattern)];

    // Process in reverse order to preserve string indices
    for (let i = matches.length - 1; i >= 0; i--) {
      const m = matches[i]!;
      const namespace = m[1]!;
      const fileName = m[2]!;
      const includeLoc: ResourceLocation = {
        namespace,
        path: `shaders/include/${fileName}`,
      };
      const includeKey = resourceLocationToString(includeLoc);

      let includeText = "";
      if (!visited.has(includeKey) && this.resources) {
        visited.add(includeKey);
        const raw = await this.resources.readText(includeLoc);
        if (raw) {
          // Strip version from included file, then recurse
          const stripped = raw.replace(/^\s*#version\s+\S+[^\n]*/gm, "");
          includeText = await this.preprocessIncludes(stripped, visited);
        }
      }

      source =
        source.slice(0, m.index!) +
        includeText +
        source.slice(m.index! + m[0].length);
    }

    return source;
  }

  // Convert Minecraft GLSL 330 to WebGL2 GLSL 300 ES
  private adaptToWebGL2(source: string): string {
    // Flatten layout(std140) UBOs to individual uniforms
    source = source.replace(
      /layout\s*\(\s*std140\s*\)\s*uniform\s+\w+\s*\{([^}]*)\}\s*;/g,
      (_, members: string) => {
        return members
          .split(";")
          .map((m) => m.trim())
          .filter((m) => m.length > 0 && !m.startsWith("//"))
          .map((m) => `uniform ${m};`)
          .join("\n");
      }
    );

    // Convert integer vertex attributes to float (WebGL2 float VAO compatibility)
    source = source.replace(/\bin\s+ivec(\d)\b/g, "in vec$1");

    // Fix sample_lightmap to accept vec2 instead of ivec2 (since UV2 is now vec2)
    // and remove the /256.0 division since UVs are already in [0,1] range
    source = source.replace(
      /vec4\s+sample_lightmap\s*\(\s*sampler2D\s+(\w+)\s*,\s*ivec2\s+(\w+)\s*\)\s*\{[^}]*\}/,
      (_, lightMapName: string, uvName: string) =>
        `vec4 sample_lightmap(sampler2D ${lightMapName}, vec2 ${uvName}) {\n` +
        `    return texture(${lightMapName}, clamp(${uvName} + 0.5 / 16.0, vec2(0.5 / 16.0), vec2(15.5 / 16.0)));\n` +
        `}`
    );

    // texelFetch(Sampler2, UV2 / 16, 0): UV2 is now vec2 (was ivec2). Cast to ivec2 for texelFetch.
    source = source.replace(
      /texelFetch\(\s*([A-Za-z_][A-Za-z0-9_]*)\s*,\s*UV2\s*\/\s*16\s*,\s*0\s*\)/g,
      "texelFetch($1, ivec2(UV2 / 16.0), 0)"
    );

    // Bare int literals in pos.* comparisons / compound-assigns (Minecraft codegen leaves these as ints).
    source = source.replace(
      /(pos\.[xyzw]\s*(?:<=|>=|==|!=|<|>)\s*)(-?\d+)(?!\.)/g,
      "$1$2.0"
    );
    source = source.replace(
      /(pos\.[xyzw]\s*[\+\-\*\/]=\s*)([^;]+);/g,
      (_, lhs: string, rhs: string) =>
        `${lhs}${rhs.replace(/(?<![\w.])(-?\d+)(?!\.)(?![\w])/g, "$1.0")};`
    );

    // vec2(int, int) literals like vec2(0, -1) — promote int args to floats.
    source = source.replace(/vec2\(\s*(-?\d+)\s*,\s*(-?\d+)\s*\)/g, "vec2($1.0, $2.0)");

    // Bare int literals assigned to floats (e.g., pixelation = 0; → pixelation = 0.0;)
    source = source.replace(
      /(\b\w+)\s*=\s*(-?\d+)(?!\.\d*\w)(?=\s*;)/g,
      (_, varName: string, value: string) => {
        if (varName === "gl_Position" || varName === "pos") return _;
        return `${varName} = ${value}.0`;
      }
    );

    // Prepend GLSL ES version and precision
    return "#version 300 es\nprecision highp float;\nprecision highp int;\n" + source;
  }

  async loadProgram(
    vertexPath: ResourceLocation,
    fragmentPath: ResourceLocation
  ): Promise<ShaderProgram> {
    const programId = `${resourceLocationToString(vertexPath)}+${resourceLocationToString(fragmentPath)}`;

    const existing = this.programs.get(programId);
    if (existing) return existing;

    if (!this.resources) {
      throw new Error(
        "No resource manager provided to shader manager. Pass a ResourceManager to WebGLShaderManager constructor."
      );
    }

    const [vertexRaw, fragmentRaw] = await Promise.all([
      this.resources.readText(vertexPath),
      this.resources.readText(fragmentPath),
    ]);

    if (!vertexRaw) {
      throw new Error(`Vertex shader not found: ${resourceLocationToString(vertexPath)}`);
    }
    if (!fragmentRaw) {
      throw new Error(`Fragment shader not found: ${resourceLocationToString(fragmentPath)}`);
    }

    // Strip top-level version directive, resolve imports, then adapt
    const vertexStripped = vertexRaw.replace(/^\s*#version\s+\S+[^\n]*/m, "");
    const fragmentStripped = fragmentRaw.replace(/^\s*#version\s+\S+[^\n]*/m, "");

    const vertexExpanded = await this.preprocessIncludes(vertexStripped, new Set());
    const fragmentExpanded = await this.preprocessIncludes(fragmentStripped, new Set());

    const vertexSource = this.adaptToWebGL2(vertexExpanded);
    const fragmentSource = this.adaptToWebGL2(fragmentExpanded);

    const compiled = await this.compileProgramWithBindingsAsync(vertexSource, fragmentSource);
    this.compiledPrograms.set(programId, compiled);

    const gl = this.gl;
    const uniforms = new Map<string, UniformInfo>();
    const numUniforms = gl.getProgramParameter(compiled.program, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < numUniforms; i++) {
      const info = gl.getActiveUniform(compiled.program, i);
      if (info) {
        uniforms.set(info.name, {
          name: info.name,
          type: this.glTypeToUniformType(info.type),
          location: i,
        });
      }
    }

    const attributes = new Map<string, AttributeInfo>();
    const numAttributes = gl.getProgramParameter(compiled.program, gl.ACTIVE_ATTRIBUTES);
    for (let i = 0; i < numAttributes; i++) {
      const info = gl.getActiveAttrib(compiled.program, i);
      if (info) {
        attributes.set(info.name, {
          name: info.name,
          type: this.glTypeToString(info.type),
          location: gl.getAttribLocation(compiled.program, info.name),
          size: info.size,
        });
      }
    }

    const program: ShaderProgram = {
      id: programId,
      vertexShader: {
        type: "vertex",
        source: vertexSource,
        location: vertexPath,
      },
      fragmentShader: {
        type: "fragment",
        source: fragmentSource,
        location: fragmentPath,
      },
      uniforms,
      attributes,
    };

    this.programs.set(programId, program);

    // Create picking variant with same vertex shader + Minecraft-compatible picking fragment shader
    const pickingId = getPickingProgramId(programId);
    if (!this.compiledPrograms.has(pickingId)) {
      const pickingVertexSource = injectPickingPassThrough(vertexSource);
      const pickingCompiled = await this.compileProgramWithBindingsAsync(
        pickingVertexSource,
        MINECRAFT_PICKING_FRAGMENT_SHADER
      );
      this.compiledPrograms.set(pickingId, pickingCompiled);
    }

    return program;
  }

  getProgram(id: string): ShaderProgram | null {
    return this.programs.get(id) ?? null;
  }

  getTextProgram(): ShaderProgram {
    if (!this.textProgram) {
      throw new Error("Text program not initialized");
    }
    return this.textProgram;
  }

  getPickingProgram(): ShaderProgram {
    if (!this.pickingProgram) {
      throw new Error("Picking program not initialized");
    }
    return this.pickingProgram;
  }

  getCompiledProgram(id: string): CompiledProgram | null {
    return this.compiledPrograms.get(id) ?? null;
  }

  unloadProgram(id: string): void {
    const compiled = this.compiledPrograms.get(id);
    if (compiled) {
      this.gl.deleteProgram(compiled.program);
      this.compiledPrograms.delete(id);
    }
    const pickingId = getPickingProgramId(id);
    const pickingCompiled = this.compiledPrograms.get(pickingId);
    if (pickingCompiled) {
      this.gl.deleteProgram(pickingCompiled.program);
      this.compiledPrograms.delete(pickingId);
    }
    this.programs.delete(id);
    this.programs.delete(pickingId);
  }

  clear(): void {
    for (const compiled of this.compiledPrograms.values()) {
      this.gl.deleteProgram(compiled.program);
    }
    this.compiledPrograms.clear();
    this.programs.clear();
    this.textProgram = null;
    this.pickingProgram = null;
    this.initBuiltinPrograms();
  }

  private glTypeToUniformType(type: number): "float" | "vec2" | "vec3" | "vec4" | "mat4" | "sampler2D" | "int" {
    const gl = this.gl;
    switch (type) {
      case gl.FLOAT: return "float";
      case gl.FLOAT_VEC2: return "vec2";
      case gl.FLOAT_VEC3: return "vec3";
      case gl.FLOAT_VEC4: return "vec4";
      case gl.FLOAT_MAT4: return "mat4";
      case gl.SAMPLER_2D: return "sampler2D";
      case gl.INT: return "int";
      default: return "float";
    }
  }

  private glTypeToString(type: number): string {
    const gl = this.gl;
    switch (type) {
      case gl.FLOAT: return "float";
      case gl.FLOAT_VEC2: return "vec2";
      case gl.FLOAT_VEC3: return "vec3";
      case gl.FLOAT_VEC4: return "vec4";
      default: return "unknown";
    }
  }
}

export function createShaderManager(
  gl: WebGL2RenderingContext,
  resources?: ResourceManager
): ShaderManager {
  return new WebGLShaderManager(gl, resources);
}

export { getPickingProgramId };
