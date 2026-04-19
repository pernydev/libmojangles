import type { TestCase } from "./types";

const testCase: TestCase = {
  name: "styles-no-hud",
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
  expect: {
    type: "image",
    reference: "styles-no-hud.png",
    threshold: 0.1,
  },
};

export default testCase;
