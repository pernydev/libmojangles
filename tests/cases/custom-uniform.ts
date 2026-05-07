import type { TestCase } from "./types";

const testCase: TestCase = {
  name: "custom-uniform",
  text: {
    extra: [
      { id: "red", text: "RED " },
      { id: "green", text: "GREEN " },
      { id: "blue", text: "BLUE" },
    ],
  },
  shader: {
    fragment: "custom-uniform.fsh",
  },
  uniforms: {
    red: { TintColor: [1, 0, 0] },
    green: { TintColor: [0, 1, 0] },
    blue: { TintColor: [0, 0, 1] },
  },
  expect: {
    type: "pixels",
    checks: [
      // Red text - should be pure red (white * [1,0,0] = red)
      { x: 1637, y: 12, rgba: [255, 0, 0, 255] },
      // Green text - should be pure green (white * [0,1,0] = green)
      { x: 1714, y: 9, rgba: [0, 255, 0, 255] },
      // Blue text - should be pure blue (white * [0,0,1] = blue)
      { x: 1787, y: 9, rgba: [0, 0, 255, 255] },
    ],
  },
};

export default testCase;

export const cascadingUniform: TestCase = {
  name: "custom-uniform-cascade",
  text: {
    id: "parent",
    text: "PARENT ",
    extra: [
      { text: "CHILD " },
      { id: "override", text: "OVERRIDE" },
    ],
  },
  shader: {
    fragment: "custom-uniform.fsh",
  },
  uniforms: {
    parent: { TintColor: [1, 0, 1] },     // magenta for parent and inherited children
    override: { TintColor: [1, 1, 0] },   // yellow overrides for this child
  },
  expect: {
    type: "pixels",
    checks: [
      // PARENT text - should be magenta
      { x: 1607, y: 9, rgba: [255, 0, 255, 255] },
      // CHILD text - inherits parent id, should also be magenta
      { x: 1680, y: 9, rgba: [255, 0, 255, 255] },
      // OVERRIDE text - has own id, should be yellow
      { x: 1797, y: 9, rgba: [255, 255, 0, 255] },
    ],
  },
};
