import type { TestCase } from "./types";

const testCase: TestCase = {
  name: "screensize-uniform",
  text: {
    extra: [
      { text: "ScreenSize Test" },
      { text: "\nThis uses the ScreenSize global uniform from Minecraft shaders", color: "gray" },
    ],
  },
  shader: {
    vertex: "screensize-shader.vsh",
  },
  expect: {
    type: "image",
    reference: "screensize-uniform.png",
    threshold: 0.005,
  },
};

export default testCase;
