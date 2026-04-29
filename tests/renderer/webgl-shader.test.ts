import { describe, it, expect } from "bun:test";
import { injectPickingPassThrough } from "../../src/renderer/webgl-shader";

describe("injectPickingPassThrough", () => {
  it("injects declarations after version and precision lines", () => {
    const source = `#version 300 es
precision highp float;
precision highp int;

in vec3 Position;
out vec4 vertexColor;

void main() {
  gl_Position = vec4(Position, 1.0);
}
`;

    const patched = injectPickingPassThrough(source);

    expect(patched).toContain(`#version 300 es
precision highp float;
precision highp int;
in vec4 PickColor;
out vec4 vertexPickColor;`);
    expect(patched).toContain(`void main() {
    vertexPickColor = PickColor;`);
  });

  it("does not duplicate declarations when they already exist", () => {
    const source = `#version 300 es
precision highp float;

in vec4 PickColor;
out vec4 vertexPickColor;
in vec3 Position;

void main() {
  gl_Position = vec4(Position, 1.0);
}
`;

    const patched = injectPickingPassThrough(source);

    expect(patched.match(/\bin\s+vec4\s+PickColor\s*;/g)).toHaveLength(1);
    expect(patched.match(/\bout\s+vec4\s+vertexPickColor\s*;/g)).toHaveLength(1);
    expect(patched.match(/vertexPickColor\s*=\s*PickColor;/g)).toHaveLength(1);
  });

  it("supports shaders with unusual whitespace around main", () => {
    const source = `#version 300 es
precision highp float;

in vec3 Position;

void
main ()
{
  gl_Position = vec4(Position, 1.0);
}
`;

    const patched = injectPickingPassThrough(source);

    expect(patched).toContain(`main ()
{
    vertexPickColor = PickColor;`);
  });

  it("throws when no main function exists", () => {
    expect(() => injectPickingPassThrough("#version 300 es\nprecision highp float;\n")).toThrow(
      "Failed to create picking shader variant: could not find main() in vertex shader"
    );
  });

  it("handles shader with PickColor already declared as in", () => {
    const source = `#version 300 es
precision highp float;

in vec4 PickColor;
in vec3 Position;
out vec4 vertexColor;

void main() {
  gl_Position = vec4(Position, 1.0);
}
`;
    const patched = injectPickingPassThrough(source);
    expect(patched.match(/\bin\s+vec4\s+PickColor\s*;/g)).toHaveLength(1);
    expect(patched).toContain("out vec4 vertexPickColor;");
    expect(patched).toContain("vertexPickColor = PickColor;");
  });

  it("handles shader with vertexPickColor already declared as out", () => {
    const source = `#version 300 es
precision highp float;

in vec3 Position;
out vec4 vertexPickColor;
out vec4 vertexColor;

void main() {
  gl_Position = vec4(Position, 1.0);
}
`;
    const patched = injectPickingPassThrough(source);
    expect(patched).toContain("in vec4 PickColor;");
    expect(patched.match(/\bout\s+vec4\s+vertexPickColor\s*;/g)).toHaveLength(1);
    expect(patched).toContain("vertexPickColor = PickColor;");
  });

  it("handles shader with both PickColor and vertexPickColor already declared", () => {
    const source = `#version 300 es
precision highp float;

in vec4 PickColor;
in vec3 Position;
out vec4 vertexPickColor;
out vec4 vertexColor;

void main() {
  gl_Position = vec4(Position, 1.0);
}
`;
    const patched = injectPickingPassThrough(source);
    expect(patched.match(/\bin\s+vec4\s+PickColor\s*;/g)).toHaveLength(1);
    expect(patched.match(/\bout\s+vec4\s+vertexPickColor\s*;/g)).toHaveLength(1);
    expect(patched).toContain("vertexPickColor = PickColor;");
  });

  it("handles shader with no #version directive", () => {
    const source = `precision highp float;

in vec3 Position;
out vec4 vertexColor;

void main() {
  gl_Position = vec4(Position, 1.0);
}
`;
    const patched = injectPickingPassThrough(source);
    expect(patched).toContain("in vec4 PickColor;");
    expect(patched).toContain("out vec4 vertexPickColor;");
    expect(patched).toContain("vertexPickColor = PickColor;");
  });

  it("handles shader with comments before main", () => {
    const source = `#version 300 es
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
`;
    const patched = injectPickingPassThrough(source);
    expect(patched).toContain("in vec4 PickColor;");
    expect(patched).toContain("vertexPickColor = PickColor;");
  });

  it("handles shader with tabs for indentation", () => {
    const source = `#version 300 es
precision highp float;

in vec3 Position;
out vec4 vertexColor;

void main() {
\tgl_Position = vec4(Position, 1.0);
}
`;
    const patched = injectPickingPassThrough(source);
    expect(patched).toContain("in vec4 PickColor;");
    expect(patched).toContain("out vec4 vertexPickColor;");
  });

  it("handles shader with main signature split across lines", () => {
    const source = `#version 300 es
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
`;
    const patched = injectPickingPassThrough(source);
    expect(patched).toContain("vertexPickColor = PickColor;");
  });

  it("handles shader with multiple predeclared uniforms", () => {
    const source = `#version 300 es
precision highp float;

uniform mat4 u_projection;
uniform mat4 u_modelView;
uniform vec3 u_cameraPos;

in vec3 Position;
out vec4 vertexColor;

void main() {
  gl_Position = u_projection * u_modelView * vec4(Position, 1.0);
}
`;
    const patched = injectPickingPassThrough(source);
    expect(patched).toContain("in vec4 PickColor;");
    expect(patched).toContain("out vec4 vertexPickColor;");
    expect(patched.indexOf("in vec4 PickColor;")).toBeLessThan(patched.indexOf("uniform mat4 u_projection;"));
  });

  it("handles shader with declarations on same line", () => {
    const source = `#version 300 es
precision highp float; precision highp int;

in vec3 Position; out vec4 vertexColor;

void main() {
  gl_Position = vec4(Position, 1.0);
}
`;
    const patched = injectPickingPassThrough(source);
    expect(patched).toContain("in vec4 PickColor;");
    expect(patched).toContain("out vec4 vertexPickColor;");
  });

  it("handles shader with struct definitions before main", () => {
    const source = `#version 300 es
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
`;
    const patched = injectPickingPassThrough(source);
    expect(patched).toContain("in vec4 PickColor;");
    expect(patched).toContain("out vec4 vertexPickColor;");
    expect(patched.indexOf("in vec4 PickColor;")).toBeLessThan(patched.indexOf("struct VertexData"));
  });

  it("handles shader with ifdef preprocessor directives", () => {
    const source = `#version 300 es
precision highp float;

#ifdef GL_ES
precision highp int;
#endif

in vec3 Position;
out vec4 vertexColor;

void main() {
  gl_Position = vec4(Position, 1.0);
}
`;
    const patched = injectPickingPassThrough(source);
    expect(patched).toContain("in vec4 PickColor;");
    expect(patched).toContain("vertexPickColor = PickColor;");
  });

  it("handles shader with empty lines and mixed whitespace", () => {
    const source = `#version 300 es



precision highp float;


in vec3 Position;
out vec4 vertexColor;


void main() {
  gl_Position = vec4(Position, 1.0);
}
`;
    const patched = injectPickingPassThrough(source);
    expect(patched).toContain("in vec4 PickColor;");
    expect(patched).toContain("out vec4 vertexPickColor;");
  });

  it("handles shader with K&R-style brace placement", () => {
    const source = `#version 300 es
precision highp float;

in vec3 Position;
out vec4 vertexColor;

void main()
{
  gl_Position = vec4(Position, 1.0);
}
`;
    const patched = injectPickingPassThrough(source);
    expect(patched).toContain("vertexPickColor = PickColor;");
  });

  it("handles shader with multiple out varyings", () => {
    const source = `#version 300 es
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
`;
    const patched = injectPickingPassThrough(source);
    expect(patched).toContain("in vec4 PickColor;");
    expect(patched).toContain("out vec4 vertexPickColor;");
    expect(patched).toContain("vertexPickColor = PickColor;");
    expect(patched.indexOf("out vec4 vertexPickColor;")).toBeLessThan(patched.indexOf("out float fogDist;"));
  });

  it("handles shader with only comments as header", () => {
    const source = `// Just a comment
/* Another comment */
/*
Multi-line
*/

in vec3 Position;
out vec4 vertexColor;

void main() {
  gl_Position = vec4(Position, 1.0);
}
`;
    const patched = injectPickingPassThrough(source);
    expect(patched).toContain("in vec4 PickColor;");
    expect(patched).toContain("out vec4 vertexPickColor;");
  });
});
