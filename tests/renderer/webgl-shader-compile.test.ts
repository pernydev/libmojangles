import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { createServer, type ViteDevServer } from "vite";
import { chromium, type Browser, type Page } from "playwright";
import * as path from "path";

const ROOT_DIR = path.resolve(__dirname, "../..");
const DEVSERVER_DIR = path.join(ROOT_DIR, "devserver");

describe("WebGL shader picking variant compilation", () => {
  let server: ViteDevServer | null = null;
  let browser: Browser | null = null;
  let page: Page | null = null;
  let port = 0;

  beforeAll(async () => {
    server = await createServer({
      root: DEVSERVER_DIR,
      server: { port: 0 },
      logLevel: "silent",
    });

    await server.listen();
    const address = server.httpServer?.address();
    if (address && typeof address === "object") {
      port = address.port;
    }

    browser = await chromium.launch({
      args: ["--use-gl=swiftshader", "--use-angle=swiftshader"],
      headless: true,
    });

    page = await browser.newPage({
      viewport: { width: 800, height: 600 },
      deviceScaleFactor: 1,
    });

    await page.goto(`http://localhost:${port}/test-harness.html`);
    await page.waitForFunction(() => window.__TEST_READY__ === true, { timeout: 30000 });
  });

  afterAll(async () => {
    if (page) {
      await page.close();
      page = null;
    }
    if (browser) {
      await browser.close();
      browser = null;
    }
    if (server) {
      await server.close();
      server = null;
    }
  });

  async function compileTest(name: string, vertexSource: string): Promise<void> {
    if (!page) throw new Error("No browser page");

    const result = await page.evaluate(
      async (vertex) => {
        const lib = window.__TEST_LIB__;
        const MemoryResourcePack = window.__TEST_MEMORY_PACK__;
        if (!lib || !MemoryResourcePack) {
          return { ok: false, error: "Test lib not initialized" };
        }

        try {
          const customPack = new MemoryResourcePack("__compile_edge_case__");
          customPack.setTextFile(
            { namespace: "test", path: "shaders/edge.vsh" },
            vertex
          );
          customPack.setTextFile(
            { namespace: "test", path: "shaders/edge.fsh" },
            `#version 300 es
precision highp float;

in vec4 vertexColor;
out vec4 fragColor;

void main() {
  fragColor = vertexColor;
}
`
          );
          lib.addResourcePack(customPack);

          const program = await lib.shaders.loadProgram(
            { namespace: "test", path: "shaders/edge.vsh" },
            { namespace: "test", path: "shaders/edge.fsh" }
          );

          const shaderManager = lib.renderer.getShaderManager();
          const pickingProgram = shaderManager?.getCompiledProgram(`${program.id}:picking`);

          return {
            ok: !!pickingProgram,
            error: pickingProgram ? undefined : "Picking program was not created",
          };
        } catch (error) {
          return {
            ok: false,
            error: error instanceof Error ? error.message : String(error),
          };
        }
      },
      vertexSource
    );

    if (!result.ok) {
      throw new Error(`${name}: ${result.error}`);
    }
    expect(result.ok).toBe(true);
  }

  it("compiles a patched picking variant for the sample custom vertex shader", async () => {
    if (!page) throw new Error("No browser page");

    const result = await page.evaluate(async () => {
      const lib = window.__TEST_LIB__;
      const MemoryResourcePack = window.__TEST_MEMORY_PACK__;
      if (!lib) {
        return { ok: false, error: "Test lib not initialized" };
      }
      if (!MemoryResourcePack) {
        return { ok: false, error: "MemoryResourcePack not initialized" };
      }

      try {
        const response = await fetch(`${window.location.origin}/test-assets/simple-shader.vsh`);
        if (!response.ok) {
          return { ok: false, error: "Failed to fetch sample shader" };
        }

        const vertexSource = await response.text();
        const customPack = new MemoryResourcePack("__compile_test_shader__");
        customPack.setTextFile(
          { namespace: "test", path: "shaders/custom.vsh" },
          vertexSource
        );
        customPack.setTextFile(
          { namespace: "test", path: "shaders/custom.fsh" },
          `#version 300 es
precision highp float;

in vec4 vertexColor;
out vec4 fragColor;

void main() {
  fragColor = vertexColor;
}
`
        );
        lib.addResourcePack(customPack);

        const program = await lib.shaders.loadProgram(
          { namespace: "test", path: "shaders/custom.vsh" },
          { namespace: "test", path: "shaders/custom.fsh" }
        );

        const shaderManager = lib.renderer.getShaderManager();
        const pickingProgram = shaderManager?.getCompiledProgram(`${program.id}:picking`);
        if (!pickingProgram) {
          return { ok: false, error: "Picking program was not created" };
        }

        const pickColorAttribute = pickingProgram.attributes.get("PickColor");
        const vertexPickColorVarying = pickingProgram.attributes.has("Position") && pickingProgram.attributes.has("PickColor");

        return {
          ok: pickColorAttribute === 4 && vertexPickColorVarying === true,
          pickColorAttribute,
          vertexPickColorVarying,
          error: pickColorAttribute === 4 && vertexPickColorVarying === true ? undefined : "Patched picking shader missing expected wiring",
        };
      } catch (error) {
        return {
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    });

    if (!result.ok) {
      throw new Error(result.error);
    }
    expect(result.ok).toBe(true);
  });

  it("compiles patched shader with PickColor already declared as in", async () => {
    await compileTest("PickColor already declared as in", `#version 300 es
precision highp float;

in vec4 PickColor;
in vec3 Position;
out vec4 vertexColor;

void main() {
  gl_Position = vec4(Position, 1.0);
}
`);
  });

  it("compiles patched shader with vertexPickColor already declared as out", async () => {
    await compileTest("vertexPickColor already declared as out", `#version 300 es
precision highp float;

in vec3 Position;
out vec4 vertexPickColor;
out vec4 vertexColor;

void main() {
  gl_Position = vec4(Position, 1.0);
}
`);
  });

  it("compiles patched shader with both PickColor and vertexPickColor already declared", async () => {
    await compileTest("both PickColor and vertexPickColor already declared", `#version 300 es
precision highp float;

in vec4 PickColor;
in vec3 Position;
out vec4 vertexPickColor;
out vec4 vertexColor;

void main() {
  gl_Position = vec4(Position, 1.0);
}
`);
  });

  it("compiles patched shader with no #version directive", async () => {
    await compileTest("no #version directive", `precision highp float;

in vec3 Position;
out vec4 vertexColor;

void main() {
  gl_Position = vec4(Position, 1.0);
}
`);
  });

  it("compiles patched shader with comments before main", async () => {
    await compileTest("comments before main", `#version 300 es
precision highp float;

// This is a comment
/* Multi-line
   comment */
in vec3 Position;
out vec4 vertexColor;

// Another comment
void main() {
  gl_Position = vec4(Position, 1.0);
}
`);
  });

  it("compiles patched shader with main signature split across lines", async () => {
    await compileTest("main signature split across lines", `#version 300 es
precision highp float;

in vec3 Position;
out vec4 vertexColor;

void
main
(
)
{
  gl_Position = vec4(Position, 1.0);
}
`);
  });

  it("compiles patched shader with multiple predeclared uniforms", async () => {
    await compileTest("multiple predeclared uniforms", `#version 300 es
precision highp float;

uniform mat4 u_projection;
uniform mat4 u_modelView;
uniform vec3 u_cameraPos;

in vec3 Position;
out vec4 vertexColor;

void main() {
  gl_Position = u_projection * u_modelView * vec4(Position, 1.0);
}
`);
  });

  it("compiles patched shader with struct definitions before main", async () => {
    await compileTest("struct definitions before main", `#version 300 es
precision highp float;

struct VertexData {
  vec3 position;
  vec4 color;
};

in vec3 Position;
out vec4 vertexColor;

void main() {
  gl_Position = vec4(Position, 1.0);
}
`);
  });

  it("compiles patched shader with ifdef preprocessor directives", async () => {
    await compileTest("ifdef preprocessor directives", `#version 300 es
precision highp float;

#ifdef GL_ES
precision highp int;
#endif

in vec3 Position;
out vec4 vertexColor;

void main() {
  gl_Position = vec4(Position, 1.0);
}
`);
  });

  it("compiles patched shader with multiple out varyings", async () => {
    await compileTest("multiple out varyings", `#version 300 es
precision highp float;

in vec3 Position;
out vec4 vertexColor;
out vec2 texCoord;
out float fogDist;

void main() {
  gl_Position = vec4(Position, 1.0);
  vertexColor = vec4(1.0);
  texCoord = vec2(0.0);
  fogDist = 100.0;
}
`);
  });
});