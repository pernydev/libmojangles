import { createServer, type ViteDevServer } from "vite";
import { chromium, type Browser, type Page } from "playwright";
import * as path from "path";
import * as fs from "fs";
import { PNG } from "pngjs";

const ROOT_DIR = path.resolve(__dirname, "..");
const DEVSERVER_DIR = path.join(ROOT_DIR, "devserver");
const HEADERS_DIR = path.join(ROOT_DIR, "headers");

const SMALLCAPS: Record<string, string> = {
  a: "ᴀ", b: "ʙ", c: "ᴄ", d: "ᴅ", e: "ᴇ", f: "ғ", g: "ɢ", h: "ʜ", i: "ɪ",
  j: "ᴊ", k: "ᴋ", l: "ʟ", m: "ᴍ", n: "ɴ", o: "ᴏ", p: "ᴘ", q: "ǫ", r: "ʀ",
  s: "s", t: "ᴛ", u: "ᴜ", v: "ᴠ", w: "ᴡ", x: "x", y: "ʏ", z: "ᴢ",
  A: "ᴀ", B: "ʙ", C: "ᴄ", D: "ᴅ", E: "ᴇ", F: "ғ", G: "ɢ", H: "ʜ", I: "ɪ",
  J: "ᴊ", K: "ᴋ", L: "ʟ", M: "ᴍ", N: "ɴ", O: "ᴏ", P: "ᴘ", Q: "ǫ", R: "ʀ",
  S: "s", T: "ᴛ", U: "ᴜ", V: "ᴠ", W: "ᴡ", X: "x", Y: "ʏ", Z: "ᴢ",
};

function toSmallcaps(text: string): string {
  return text.split("").map(c => SMALLCAPS[c] ?? c).join("");
}

const HEADERS = [
  { name: "features", text: toSmallcaps("Features") },
  { name: "installation", text: toSmallcaps("Installation") },
  { name: "quick-start", text: toSmallcaps("Quick Start") },
  { name: "text-components", text: toSmallcaps("Text Components") },
  { name: "api-overview", text: toSmallcaps("API Overview") },
  { name: "development", text: toSmallcaps("Development") },
  { name: "resource-packs", text: toSmallcaps("Resource Packs") },
];

const SCALE = 3;
const PADDING_X = 0;
const PADDING_TOP = 16;
const PADDING_BOTTOM = 8;

function trimImage(inputPath: string, outputPath: string): void {
  const data = fs.readFileSync(inputPath);
  const png = PNG.sync.read(data);

  // Convert black pixels to transparent (WebGL canvas background fix)
  for (let i = 0; i < png.data.length; i += 4) {
    const r = png.data[i]!;
    const g = png.data[i + 1]!;
    const b = png.data[i + 2]!;
    // If pixel is pure black (background), make it transparent
    // Shadow pixels are ~63,63,63 so we only target very dark pixels
    if (r < 5 && g < 5 && b < 5) {
      png.data[i + 3] = 0;
    }
  }

  let minX = png.width, maxX = 0, minY = png.height, maxY = 0;
  let hasContent = false;

  for (let y = 0; y < png.height; y++) {
    for (let x = 0; x < png.width; x++) {
      const idx = (png.width * y + x) * 4;
      const alpha = png.data[idx + 3];
      if (alpha > 0) {
        hasContent = true;
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
      }
    }
  }

  if (!hasContent) {
    fs.copyFileSync(inputPath, outputPath);
    return;
  }

  const newWidth = maxX - minX + 1 + PADDING_X * 2;
  const newHeight = maxY - minY + 1 + PADDING_TOP + PADDING_BOTTOM;
  const newPng = new PNG({ width: newWidth, height: newHeight });

  for (let y = 0; y < newHeight; y++) {
    for (let x = 0; x < newWidth; x++) {
      const srcX = minX + x - PADDING_X;
      const srcY = minY + y - PADDING_TOP;
      const dstIdx = (newWidth * y + x) * 4;

      if (srcX >= 0 && srcX < png.width && srcY >= 0 && srcY < png.height) {
        const srcIdx = (png.width * srcY + srcX) * 4;
        newPng.data[dstIdx] = png.data[srcIdx];
        newPng.data[dstIdx + 1] = png.data[srcIdx + 1];
        newPng.data[dstIdx + 2] = png.data[srcIdx + 2];
        newPng.data[dstIdx + 3] = png.data[srcIdx + 3];
      } else {
        newPng.data[dstIdx] = 0;
        newPng.data[dstIdx + 1] = 0;
        newPng.data[dstIdx + 2] = 0;
        newPng.data[dstIdx + 3] = 0;
      }
    }
  }

  fs.writeFileSync(outputPath, PNG.sync.write(newPng));
}

async function main() {
  fs.mkdirSync(HEADERS_DIR, { recursive: true });

  console.log("Starting Vite dev server...");
  const server = await createServer({
    root: DEVSERVER_DIR,
    server: { port: 0 },
    logLevel: "silent",
  });

  await server.listen();
  const address = server.httpServer?.address();
  const port = typeof address === "object" && address ? address.port : 3000;
  console.log(`Server running on port ${port}`);

  console.log("Launching browser...");
  const browser = await chromium.launch({
    args: ["--use-gl=swiftshader", "--use-angle=swiftshader"],
    headless: true,
  });

  const page = await browser.newPage({
    viewport: { width: 800, height: 100 },
    deviceScaleFactor: 1,
  });

  page.on("console", (msg) => {
    if (msg.type() === "error") {
      console.error("Browser error:", msg.text());
    }
  });

  await page.goto(`http://localhost:${port}/test-harness.html`);

  await page.waitForFunction(() => window.__TEST_READY__ === true, {
    timeout: 30000,
  });

  console.log("Browser ready, generating headers...");

  for (const header of HEADERS) {
    console.log(`  Generating: ${header.name}`);

    const config = {
      text: { text: header.text, color: "gold" },
      viewport: { width: 800, height: 100, guiScale: SCALE },
      position: { x: 0, y: 0, centerX: false },
      resourcePackUrls: [],
    };

    await page.evaluate(async (cfg) => {
      await window.__runTest__(cfg);
    }, config);

    await page.waitForTimeout(300);

    const canvas = await page.locator("canvas").first();
    const box = await canvas.boundingBox();
    if (!box) throw new Error("Canvas not visible");

    const tempPath = path.join(HEADERS_DIR, `${header.name}-temp.png`);
    const finalPath = path.join(HEADERS_DIR, `${header.name}.png`);

    await page.screenshot({
      path: tempPath,
      clip: { x: box.x, y: box.y, width: box.width, height: box.height },
      omitBackground: true,
    });

    trimImage(tempPath, finalPath);
    fs.unlinkSync(tempPath);
  }

  console.log("Cleaning up...");
  await page.close();
  await browser.close();
  await server.close();

  console.log("Done! Headers saved to:", HEADERS_DIR);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
