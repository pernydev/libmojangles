import type { TextComponent, ComponentUniforms } from "libmojangles";

export interface TestCase {
  name: string;
  text: TextComponent;
  resourcePacks?: string[];  // paths to zip files or directories, relative to tests/
  viewport?: {
    width?: number;
    height?: number;
    guiScale?: number;
  };
  position?: {
    x?: number;
    y?: number;
    centerX?: boolean;
  };
  shader?: {
    vertex?: string;  // path relative to tests/
    fragment?: string;
  };
  uniforms?: Record<string, ComponentUniforms>;  // per-component custom uniforms
  expect: ImageExpectation | PixelExpectation | BboxExpectation;
}

export interface ImageExpectation {
  type: "image";
  reference: string;  // path to reference image, relative to tests/
  threshold?: number;  // percentage of pixels allowed to differ (default 0.1)
}

export interface PixelExpectation {
  type: "pixels";
  checks: PixelCheck[];
}

export interface BboxExpectation {
  type: "bbox";
  ids: Array<string | undefined>;
}

export interface BboxCheck {
  index: number;
  expected: string | undefined;
  actual: string | undefined;
  passed: boolean;
}

export interface PixelCheck {
  x: number;
  y: number;
  rgba: [number, number, number, number];
  tolerance?: number;  // per-channel tolerance (default 0)
}

export const DEFAULT_VIEWPORT = {
  width: 3441,
  height: 1440,
  guiScale: 3,
};

export const DEFAULT_POSITION = {
  x: 0,
  y: 3,
  centerX: true,
};
