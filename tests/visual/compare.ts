import { PNG } from "pngjs";
import * as fs from "fs";
import * as path from "path";

export interface CompareRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CompareOptions {
  threshold?: number;
  colorTolerance?: number;
  includeRegions?: CompareRegion[];
  excludeRegions?: CompareRegion[];
}

export interface CompareResult {
  passed: boolean;
  diffPixels: number;
  totalPixels: number;
  diffPercent: number;
  diffImagePath?: string;
}

function isInRegion(x: number, y: number, region: CompareRegion): boolean {
  return (
    x >= region.x &&
    x < region.x + region.width &&
    y >= region.y &&
    y < region.y + region.height
  );
}

function shouldComparePixel(
  x: number,
  y: number,
  options: CompareOptions
): boolean {
  if (options.includeRegions && options.includeRegions.length > 0) {
    return options.includeRegions.some((r) => isInRegion(x, y, r));
  }

  if (options.excludeRegions && options.excludeRegions.length > 0) {
    return !options.excludeRegions.some((r) => isInRegion(x, y, r));
  }

  return true;
}

export async function compareImages(
  actualPath: string,
  referencePath: string,
  diffOutputPath: string,
  options: CompareOptions = {}
): Promise<CompareResult> {
  const threshold = options.threshold ?? 0.1;
  const colorTolerance = options.colorTolerance ?? 0;

  const actualData = fs.readFileSync(actualPath);
  const referenceData = fs.readFileSync(referencePath);

  const actual = PNG.sync.read(actualData);
  const reference = PNG.sync.read(referenceData);

  if (actual.width !== reference.width || actual.height !== reference.height) {
    throw new Error(
      `Image dimensions mismatch: actual ${actual.width}x${actual.height} vs reference ${reference.width}x${reference.height}`
    );
  }

  const { width, height } = actual;
  const diff = new PNG({ width, height });

  let diffPixels = 0;
  let comparedPixels = 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;

      if (!shouldComparePixel(x, y, options)) {
        diff.data[idx] = actual.data[idx];
        diff.data[idx + 1] = actual.data[idx + 1];
        diff.data[idx + 2] = actual.data[idx + 2];
        diff.data[idx + 3] = 128;
        continue;
      }

      comparedPixels++;

      const rDiff = Math.abs(actual.data[idx] - reference.data[idx]);
      const gDiff = Math.abs(actual.data[idx + 1] - reference.data[idx + 1]);
      const bDiff = Math.abs(actual.data[idx + 2] - reference.data[idx + 2]);
      const aDiff = Math.abs(actual.data[idx + 3] - reference.data[idx + 3]);

      const pixelDiff =
        rDiff > colorTolerance ||
        gDiff > colorTolerance ||
        bDiff > colorTolerance ||
        aDiff > colorTolerance;

      if (pixelDiff) {
        diffPixels++;
        diff.data[idx] = 255;
        diff.data[idx + 1] = 0;
        diff.data[idx + 2] = 0;
        diff.data[idx + 3] = 255;
      } else {
        diff.data[idx] = actual.data[idx];
        diff.data[idx + 1] = actual.data[idx + 1];
        diff.data[idx + 2] = actual.data[idx + 2];
        diff.data[idx + 3] = 255;
      }
    }
  }

  const diffPercent = comparedPixels > 0 ? (diffPixels / comparedPixels) * 100 : 0;
  const passed = diffPercent <= threshold;

  fs.mkdirSync(path.dirname(diffOutputPath), { recursive: true });
  fs.writeFileSync(diffOutputPath, PNG.sync.write(diff));

  return {
    passed,
    diffPixels,
    totalPixels: comparedPixels,
    diffPercent,
    diffImagePath: diffOutputPath,
  };
}
