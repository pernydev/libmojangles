import {
  createLibmojangles,
  parseResourceLocation,
  type Libmojangles,
  type Font,
  type FontResolver,
  type TextComponent,
  type ResourceLocation,
} from "libmojangles";
import { FetchResourcePack } from "./FetchResourcePack";
import { MemoryResourcePack } from "./MemoryResourcePack";

interface TestConfig {
  text: TextComponent;
  viewport: { width: number; height: number; guiScale: number };
  position: { x: number; y: number; centerX: boolean };
  resourcePackUrls: string[];
  shaderUrls?: { vertex?: string; fragment?: string };
}

declare global {
  interface Window {
    __TEST_CONFIG__?: TestConfig;
    __TEST_READY__?: boolean;
    __TEST_ERROR__?: string;
    __LAST_DRAW_RESULT__?: { components: Array<{ id?: string; bbox: { min: [number, number]; max: [number, number] } }> };
    __runTest__: (config: TestConfig) => Promise<void>;
    __TEST_LIB__?: Libmojangles;
    __TEST_MEMORY_PACK__?: typeof MemoryResourcePack;
  }
}

const canvas = document.getElementById("canvas") as HTMLCanvasElement;
let lib: Libmojangles;
let fontResolver: FontResolver;

async function init() {
  lib = createLibmojangles({ canvas });

  const defaultPack = new FetchResourcePack("vanilla", "/");
  lib.addResourcePack(defaultPack);

  await lib.loadFont({ namespace: "minecraft", path: "default" });

  fontResolver = (name) => {
    if (name) {
      const found = lib.fonts.getFont(parseResourceLocation(name));
      if (found) return found as Font;
    }
    return lib.fonts.getDefaultFont();
  };

  window.__runTest__ = runTest;
  window.__TEST_LIB__ = lib;
  window.__TEST_MEMORY_PACK__ = MemoryResourcePack;
  window.__TEST_READY__ = true;
}

async function runTest(config: TestConfig): Promise<void> {
  const { text, viewport, position, resourcePackUrls, shaderUrls } = config;

  canvas.width = viewport.width;
  canvas.height = viewport.height;
  lib.resize(viewport.width, viewport.height);

  for (const url of resourcePackUrls) {
    const response = await fetch(url);
    const zipData = await response.arrayBuffer();
    const pack = new MemoryResourcePack(url);
    await pack.loadFromZip(zipData);
    lib.addResourcePack(pack);

    const fonts = pack.getFonts();
    for (const font of fonts) {
      try {
        await lib.loadFont(font);
      } catch (e) {
        console.warn(`Failed to load font ${font.namespace}:${font.path}:`, e);
      }
    }
  }

  let programId: string | undefined;
  if (shaderUrls?.vertex || shaderUrls?.fragment) {
    const customPack = new MemoryResourcePack("__test_shader__");

    if (shaderUrls.vertex) {
      const vsResponse = await fetch(shaderUrls.vertex);
      const vsSource = await vsResponse.text();
      customPack.setTextFile(
        { namespace: "test", path: "shaders/custom.vsh" },
        vsSource
      );
    }

    if (shaderUrls.fragment) {
      const fsResponse = await fetch(shaderUrls.fragment);
      const fsSource = await fsResponse.text();
      customPack.setTextFile(
        { namespace: "test", path: "shaders/custom.fsh" },
        fsSource
      );
    }

    lib.addResourcePack(customPack);

    const vsLoc: ResourceLocation = shaderUrls.vertex
      ? { namespace: "test", path: "shaders/custom.vsh" }
      : { namespace: "minecraft", path: "shaders/core/rendertype_text.vsh" };

    const fsLoc: ResourceLocation = shaderUrls.fragment
      ? { namespace: "test", path: "shaders/custom.fsh" }
      : { namespace: "minecraft", path: "shaders/core/rendertype_text.fsh" };

    const program = await lib.shaders.loadProgram(vsLoc, fsLoc);
    programId = program.id;
  }

  lib.renderer.beginFrame();

  const guiWidth = Math.floor(viewport.width / viewport.guiScale);
  let screenX: number;
  let screenY = position.y * viewport.guiScale;

  if (position.centerX) {
    const glyphs = lib.parser.parse(text);
    const rawWidth = lib.layout.measureWidth(glyphs, fontResolver);
    const textWidthGui = Math.ceil(rawWidth);
    const guiX = Math.floor(guiWidth / 2) - Math.floor(textWidthGui / 2);
    screenX = guiX * viewport.guiScale;
  } else {
    screenX = position.x * viewport.guiScale;
  }

  window.__LAST_DRAW_RESULT__ = lib.drawText(text, screenX, screenY, {
    scale: viewport.guiScale,
    cachePicking: true,
    ...(programId ? { programId } : {}),
  });

  lib.renderer.endFrame();
}

init().catch((err) => {
  console.error(err);
  window.__TEST_ERROR__ = err.message;
});
