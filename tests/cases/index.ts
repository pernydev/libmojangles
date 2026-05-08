import stylesNoHud from "./styles-no-hud";
import simpleShader from "./simple-shader";
import hudkitPrebonk from "./hudkit-prebonk";
import bboxIdCascade from "./bbox-id-cascade";
import bboxTf from "./bbox-tf";
import customUniform, { cascadingUniform } from "./custom-uniform";

export const testCases = [
  stylesNoHud,
  simpleShader,
  hudkitPrebonk,
  bboxIdCascade,
  bboxTf,
  customUniform,
  cascadingUniform,
];

export * from "./types";
