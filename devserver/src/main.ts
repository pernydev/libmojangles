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

interface PlaygroundState {
  guiScale: number;
  textComponent: TextComponent;
  textX: number;
  textY: number;
  centerX: boolean;
  showDebug: boolean;
  bgColor: string;
  customProgramId: string | null;
}

const state: PlaygroundState = {
  guiScale: 3,
  textComponent: {
    extra: [
      { text: "Hello " },
      { text: "World!", color: "gold", bold: true },
    ],
  },
  textX: 10,
  textY: 10,
  centerX: true,
  showDebug: false,
  bgColor: "#000000",
  customProgramId: null,
};

const canvas = document.getElementById("canvas") as HTMLCanvasElement;
const debugCanvas = document.getElementById("debug-canvas") as HTMLCanvasElement;
const canvasContainer = document.getElementById("canvas-container") as HTMLDivElement;

let lib: Libmojangles;
let fontResolver: FontResolver;

const uploadedPacks: MemoryResourcePack[] = [];
const loadedFonts = new Set<string>();

const MINECRAFT_TEXT_VSH: ResourceLocation = { namespace: "minecraft", path: "shaders/core/rendertype_text.vsh" };
const MINECRAFT_TEXT_FSH: ResourceLocation = { namespace: "minecraft", path: "shaders/core/rendertype_text.fsh" };

let defaultVertexSource = "";
let defaultFragmentSource = "";
let currentVertexSource = "";
let currentFragmentSource = "";

async function init() {
  lib = createLibmojangles({ canvas });

  const defaultPack = new FetchResourcePack("vanilla", "/");
  lib.addResourcePack(defaultPack);

  await lib.loadFont({ namespace: "minecraft", path: "default" });
  loadedFonts.add("minecraft:default");
  setStatus("Loading shaders...");

  try {
    defaultVertexSource = await lib.resources.readText(MINECRAFT_TEXT_VSH) || "";
    defaultFragmentSource = await lib.resources.readText(MINECRAFT_TEXT_FSH) || "";
    currentVertexSource = defaultVertexSource;
    currentFragmentSource = defaultFragmentSource;
  } catch (e) {
    console.warn("Could not load default Minecraft shaders:", e);
  }

  fontResolver = (name) => {
    if (name) {
      const found = lib.fonts.getFont(parseResourceLocation(name));
      if (found) return found as Font;
    }
    return lib.fonts.getDefaultFont();
  };

  setupResizeObserver();
  setupControls();
  setupCollapsibleSections();
  setupResourcePackUpload();
  setupShaderEditor();
  handleResize();
  startRenderLoop();

  setStatus("Ready");
}

function setupResizeObserver() {
  const observer = new ResizeObserver(() => handleResize());
  observer.observe(canvasContainer);
}

function handleResize() {
  const width = canvasContainer.clientWidth;
  const height = canvasContainer.clientHeight;

  canvas.width = width;
  canvas.height = height;
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;

  debugCanvas.width = width;
  debugCanvas.height = height;
  debugCanvas.style.width = `${width}px`;
  debugCanvas.style.height = `${height}px`;

  lib.resize(width, height);
  updateBackground();
}

function updateBackground() {
  if (state.bgColor === "checker") {
    canvasContainer.style.background =
      "repeating-conic-gradient(#404040 0% 25%, #606060 0% 50%) 50% / 20px 20px";
  } else {
    canvasContainer.style.background = state.bgColor;
  }
}

function setupControls() {
  const sidebar = document.getElementById("sidebar")!;
  const toggleBtn = document.getElementById("toggle-sidebar")!;
  toggleBtn.addEventListener("click", () => {
    sidebar.classList.toggle("collapsed");
    setTimeout(handleResize, 10);
  });

  const guiScaleInput = document.getElementById("gui-scale") as HTMLInputElement;
  guiScaleInput.addEventListener("input", () => {
    state.guiScale = Math.max(1, parseInt(guiScaleInput.value) || 1);
  });

  const bgColorSelect = document.getElementById("bg-color") as HTMLSelectElement;
  bgColorSelect.addEventListener("change", () => {
    state.bgColor = bgColorSelect.value;
    updateBackground();
  });

  const showDebugCheckbox = document.getElementById("show-debug") as HTMLInputElement;
  showDebugCheckbox.addEventListener("change", () => {
    state.showDebug = showDebugCheckbox.checked;
    if (!state.showDebug) clearDebugCanvas();
  });

  const textInput = document.getElementById("text-input") as HTMLTextAreaElement;
  const textError = document.getElementById("text-error")!;
  textInput.addEventListener("input", () => {
    try {
      state.textComponent = JSON.parse(textInput.value);
      textError.textContent = "";
    } catch (e) {
      textError.textContent = (e as Error).message;
    }
  });

  const textXInput = document.getElementById("text-x") as HTMLInputElement;
  textXInput.addEventListener("input", () => {
    state.textX = parseInt(textXInput.value) || 0;
  });

  const textYInput = document.getElementById("text-y") as HTMLInputElement;
  textYInput.addEventListener("input", () => {
    state.textY = parseInt(textYInput.value) || 0;
  });

  const centerXCheckbox = document.getElementById("center-x") as HTMLInputElement;
  centerXCheckbox.addEventListener("change", () => {
    state.centerX = centerXCheckbox.checked;
  });
}

function setupCollapsibleSections() {
  document.querySelectorAll(".section.collapsible .section-title").forEach((title) => {
    title.addEventListener("click", () => {
      title.closest(".section")?.classList.toggle("collapsed");
    });
  });
}

function setupResourcePackUpload() {
  const packUpload = document.getElementById("pack-upload") as HTMLInputElement;
  const packStatus = document.getElementById("pack-status")!;

  packUpload.addEventListener("change", async () => {
    const file = packUpload.files?.[0];
    if (!file) return;

    packStatus.innerHTML = '<span class="info-text">Loading...</span>';

    try {
      const arrayBuffer = await file.arrayBuffer();
      const pack = new MemoryResourcePack(file.name.replace(/\.zip$/i, ""));
      const paths = await pack.loadFromZip(arrayBuffer);

      lib.addResourcePack(pack);
      uploadedPacks.push(pack);

      const fonts = pack.getFonts();
      for (const font of fonts) {
        const fontKey = `${font.namespace}:${font.path}`;
        if (!loadedFonts.has(fontKey)) {
          try {
            await lib.loadFont(font);
            loadedFonts.add(fontKey);
          } catch (e) {
            console.warn(`Failed to load font ${fontKey}:`, e);
          }
        }
      }

      updatePackList();
      await reloadShaderEditor();

      packStatus.innerHTML = `<span class="success">Loaded ${paths.length} files, ${fonts.length} fonts</span>`;
    } catch (e) {
      packStatus.innerHTML = `<span class="error">${(e as Error).message}</span>`;
    }

    packUpload.value = "";
  });
}

function updatePackList() {
  const packList = document.getElementById("pack-list")!;
  packList.innerHTML = "";

  for (const pack of uploadedPacks) {
    const item = document.createElement("div");
    item.className = "pack-item";
    item.innerHTML = `
      <span class="pack-name">${pack.name}</span>
      <button data-pack="${pack.name}">Remove</button>
    `;
    item.querySelector("button")?.addEventListener("click", () => {
      lib.removeResourcePack(pack);
      const idx = uploadedPacks.indexOf(pack);
      if (idx !== -1) uploadedPacks.splice(idx, 1);
      updatePackList();
    });
    packList.appendChild(item);
  }
}

async function reloadShaderEditor() {
  try {
    const vsSource = await lib.resources.readText(MINECRAFT_TEXT_VSH);
    const fsSource = await lib.resources.readText(MINECRAFT_TEXT_FSH);

    if (vsSource) {
      defaultVertexSource = vsSource;
      currentVertexSource = vsSource;
    }
    if (fsSource) {
      defaultFragmentSource = fsSource;
      currentFragmentSource = fsSource;
    }

    const vertexTextarea = document.getElementById("vertex-shader") as HTMLTextAreaElement;
    const fragmentTextarea = document.getElementById("fragment-shader") as HTMLTextAreaElement;

    if (vertexTextarea && fragmentTextarea) {
      vertexTextarea.value = currentVertexSource;
      fragmentTextarea.value = currentFragmentSource;
    }

    state.customProgramId = null;
    setStatus("Shader reloaded from pack");
  } catch (e) {
    console.warn("Could not reload shaders:", e);
  }
}

function setupShaderEditor() {
  const shaderTabs = document.querySelectorAll(".shader-tab");
  const vertexTextarea = document.getElementById("vertex-shader") as HTMLTextAreaElement;
  const fragmentTextarea = document.getElementById("fragment-shader") as HTMLTextAreaElement;
  const shaderError = document.getElementById("shader-error")!;
  const compileBtn = document.getElementById("compile-shader")!;
  const resetBtn = document.getElementById("reset-shader")!;

  vertexTextarea.value = currentVertexSource || "(loading...)";
  fragmentTextarea.value = currentFragmentSource || "(loading...)";

  if (currentVertexSource) {
    vertexTextarea.value = currentVertexSource;
    fragmentTextarea.value = currentFragmentSource;
  } else {
    const checkLoaded = setInterval(() => {
      if (defaultVertexSource) {
        vertexTextarea.value = defaultVertexSource;
        fragmentTextarea.value = defaultFragmentSource;
        currentVertexSource = defaultVertexSource;
        currentFragmentSource = defaultFragmentSource;
        clearInterval(checkLoaded);
      }
    }, 100);
  }

  shaderTabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      shaderTabs.forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");

      const which = (tab as HTMLElement).dataset.tab;
      vertexTextarea.style.display = which === "vertex" ? "block" : "none";
      fragmentTextarea.style.display = which === "fragment" ? "block" : "none";
    });
  });

  compileBtn.addEventListener("click", async () => {
    currentVertexSource = vertexTextarea.value;
    currentFragmentSource = fragmentTextarea.value;

    compileBtn.setAttribute("disabled", "true");
    compileBtn.textContent = "Compiling...";

    try {
      const programId = await compileCustomShader(currentVertexSource, currentFragmentSource);
      state.customProgramId = programId;
      shaderError.textContent = "";
      setStatus("Shader compiled");
    } catch (e) {
      shaderError.textContent = (e as Error).message;
      setStatus("Shader error");
    } finally {
      compileBtn.removeAttribute("disabled");
      compileBtn.textContent = "Compile";
    }
  });

  resetBtn.addEventListener("click", async () => {
    await reloadShaderEditor();
    vertexTextarea.value = currentVertexSource;
    fragmentTextarea.value = currentFragmentSource;
    shaderError.textContent = "";
    setStatus("Shader reset to pack default");
  });
}

let customShaderCounter = 0;
let customShaderPack: MemoryResourcePack | null = null;

async function compileCustomShader(vertexSource: string, fragmentSource: string): Promise<string> {
  const id = `custom-${++customShaderCounter}`;

  if (!customShaderPack) {
    customShaderPack = new MemoryResourcePack("__playground_shaders__");
    lib.addResourcePack(customShaderPack);
  }

  const vshLoc: ResourceLocation = { namespace: "playground", path: `shaders/${id}.vsh` };
  const fshLoc: ResourceLocation = { namespace: "playground", path: `shaders/${id}.fsh` };

  customShaderPack.setTextFile(vshLoc, vertexSource);
  customShaderPack.setTextFile(fshLoc, fragmentSource);

  const program = await lib.shaders.loadProgram(vshLoc, fshLoc);
  return program.id;
}

function startRenderLoop() {
  function render() {
    lib.renderer.beginFrame();

    const screenWidth = canvas.width;
    const guiWidth = Math.floor(screenWidth / state.guiScale);

    let screenX: number;
    let screenY = state.textY * state.guiScale;

    if (state.centerX) {
      try {
        const glyphs = lib.parser.parse(state.textComponent);
        const rawWidth = lib.layout.measureWidth(glyphs, fontResolver);
        const textWidthGui = Math.ceil(rawWidth);
        const guiX = Math.floor(guiWidth / 2) - Math.floor(textWidthGui / 2);
        screenX = guiX * state.guiScale;
      } catch {
        screenX = state.textX * state.guiScale;
      }
    } else {
      screenX = state.textX * state.guiScale;
    }

    try {
      const drawResult = lib.drawText(state.textComponent, screenX, screenY, {
        scale: state.guiScale,
        ...(state.customProgramId ? { programId: state.customProgramId } : {}),
        generatePicking: state.showDebug,
        cachePicking: state.showDebug,
      });

      if (state.showDebug && drawResult) {
        drawDebugOverlay(drawResult, canvas.height);
      }
    } catch (e) {
      // Silently ignore parse errors during typing
    }

    lib.renderer.endFrame();
    requestAnimationFrame(render);
  }

  render();
}

function drawDebugOverlay(
  drawResult: { components: Array<{ id?: string; bbox: { min: [number, number]; max: [number, number] } }> },
  canvasHeight: number
) {
  const ctx = debugCanvas.getContext("2d");
  if (!ctx) return;

  ctx.clearRect(0, 0, debugCanvas.width, debugCanvas.height);

  for (const comp of drawResult.components) {
    const { min, max } = comp.bbox;
    const minY = canvasHeight - max[1];
    const maxY = canvasHeight - min[1];
    const w = max[0] - min[0];
    const h = maxY - minY;

    ctx.fillStyle = "rgba(255, 0, 0, 0.3)";
    ctx.fillRect(min[0], minY, w, h);
    ctx.strokeStyle = "rgba(255, 255, 0, 0.8)";
    ctx.lineWidth = 1;
    ctx.strokeRect(min[0], minY, w, h);
  }
}

function clearDebugCanvas() {
  const ctx = debugCanvas.getContext("2d");
  if (ctx) ctx.clearRect(0, 0, debugCanvas.width, debugCanvas.height);
}

function setStatus(message: string) {
  const status = document.getElementById("status");
  if (status) status.textContent = message;
}

init().catch((err) => {
  console.error(err);
  setStatus(`Error: ${err.message}`);
});
