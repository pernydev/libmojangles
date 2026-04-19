import type { ColorPicker, Color, PickResult } from "../types";

export function encodePickingId(index: number): Color {
  const encoded = index + 1;
  return {
    r: ((encoded >> 16) & 0xff) / 255,
    g: ((encoded >> 8) & 0xff) / 255,
    b: (encoded & 0xff) / 255,
    a: 1,
  };
}

export class ColorPickerImpl implements ColorPicker {
  encodeId(index: number): Color {
    return encodePickingId(index);
  }

  decodeId(color: Color): number {
    const r = Math.round(color.r * 255);
    const g = Math.round(color.g * 255);
    const b = Math.round(color.b * 255);
    return ((r << 16) | (g << 8) | b) - 1;
  }

  pick(x: number, y: number, framebuffer: Uint8Array, width: number): PickResult | null {
    const index = (y * width + x) * 4;
    if (index < 0 || index + 3 >= framebuffer.length) {
      return null;
    }

    const r = framebuffer[index] ?? 0;
    const g = framebuffer[index + 1] ?? 0;
    const b = framebuffer[index + 2] ?? 0;
    const a = framebuffer[index + 3] ?? 0;

    if (a === 0) {
      return null;
    }

    const encoded = (r << 16) | (g << 8) | b;
    if (encoded === 0) {
      return null;
    }
    const glyphIndex = encoded - 1;

    return {
      sourceIndex: glyphIndex,
      glyphIndex,
      x,
      y,
    };
  }
}

export function createColorPicker(): ColorPicker {
  return new ColorPickerImpl();
}
