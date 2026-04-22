import type { TestCase } from "./types";

const testCase: TestCase = {
  name: "simple-shader",
  text: {
    extra: [
      { text: "Normal" },
      { text: " | " },
      { text: "Bold", bold: true },
      { text: " | ", bold: false },
      { text: "Italic", italic: true },
      { text: " | " },
      { text: "Underlined", underlined: true },
      { text: " | " },
      { text: "Strikethrough", strikethrough: true },
      { text: " | ", strikethrough: false },
      { text: "★ ⚔ ❤ ◆ ● ▶", color: "aqua" },
    ],
  },
  shader: {
    vertex: "simple-shader.vsh",
  },
  expect: {
    type: "image",
    reference: "simple-shader.png",
    threshold: 0.005,
  },
};

export default testCase;
