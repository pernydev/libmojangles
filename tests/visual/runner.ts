import { createServer, type ViteDevServer } from "vite";
import { chromium, type Browser, type Page } from "playwright";
import * as path from "path";
import * as fs from "fs";
import { testCases, DEFAULT_VIEWPORT, DEFAULT_POSITION, type TestCase } from "../cases";
import { compareImages } from "./compare";

const ROOT_DIR = path.resolve(__dirname, "../..");
const DEVSERVER_DIR = path.join(ROOT_DIR, "devserver");
const TESTS_DIR = path.join(ROOT_DIR, "tests");
const OUTPUT_DIR = path.join(TESTS_DIR, "visual", "output");

export interface RunnerOptions {
  headless?: boolean;
  timeout?: number;
  renderWaitTime?: number;
}

const DEFAULT_OPTIONS: Required<RunnerOptions> = {
  headless: true,
  timeout: 30000,
  renderWaitTime: 2000,
};

export class TestRunner {
  private server: ViteDevServer | null = null;
  private browser: Browser | null = null;
  private page: Page | null = null;
  private options: Required<RunnerOptions>;
  private port: number = 0;

  constructor(options: RunnerOptions = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  async setup(): Promise<void> {
    this.server = await createServer({
      root: DEVSERVER_DIR,
      server: { port: 0 },
      logLevel: "silent",
    });

    await this.server.listen();
    const address = this.server.httpServer?.address();
    if (address && typeof address === "object") {
      this.port = address.port;
    }

    this.browser = await chromium.launch({
      args: ["--use-gl=swiftshader", "--use-angle=swiftshader"],
      headless: this.options.headless,
    });
  }

  async teardown(): Promise<void> {
    if (this.page) {
      await this.page.close();
      this.page = null;
    }
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
    if (this.server) {
      await this.server.close();
      this.server = null;
    }
  }

  async runTest(testCase: TestCase): Promise<TestResult> {
    if (!this.browser) throw new Error("Runner not set up");

    const viewport = { ...DEFAULT_VIEWPORT, ...testCase.viewport };
    const position = { ...DEFAULT_POSITION, ...testCase.position };

    this.page = await this.browser.newPage({
      viewport: { width: viewport.width, height: viewport.height },
      deviceScaleFactor: 1,
    });

    this.page.on("console", (msg) => {
      if (msg.type() === "error") {
        console.error(`[${testCase.name}] Browser error:`, msg.text());
      }
    });

    this.page.on("pageerror", (err) => {
      console.error(`[${testCase.name}] Page error:`, err.message);
    });

    await this.page.goto(`http://localhost:${this.port}/test-harness.html`);

    await this.page.waitForFunction(() => window.__TEST_READY__ === true, {
      timeout: this.options.timeout,
    });

    const resourcePackUrls = (testCase.resourcePacks || []).map(
      (pack) => `http://localhost:${this.port}/test-assets/${pack}`
    );

    const shaderUrls = testCase.shader
      ? {
          vertex: testCase.shader.vertex
            ? `http://localhost:${this.port}/test-assets/${testCase.shader.vertex}`
            : undefined,
          fragment: testCase.shader.fragment
            ? `http://localhost:${this.port}/test-assets/${testCase.shader.fragment}`
            : undefined,
        }
      : undefined;

    const config = {
      text: testCase.text,
      viewport,
      position,
      resourcePackUrls,
      shaderUrls,
    };

    await this.page.evaluate(async (cfg) => {
      await window.__runTest__(cfg);
    }, config);

    await this.page.waitForTimeout(this.options.renderWaitTime);

    const result = await this.captureAndCompare(testCase);

    await this.page.close();
    this.page = null;

    return result;
  }

  private async captureAndCompare(testCase: TestCase): Promise<TestResult> {
    if (!this.page) throw new Error("No page");

    fs.mkdirSync(OUTPUT_DIR, { recursive: true });

    const actualPath = path.join(OUTPUT_DIR, `${testCase.name}-actual.png`);

    const canvas = await this.page.locator("canvas").first();
    const box = await canvas.boundingBox();
    if (!box) throw new Error("Canvas not visible");

    await this.page.screenshot({
      path: actualPath,
      clip: { x: box.x, y: box.y, width: box.width, height: box.height },
    });

    if (testCase.expect.type === "image") {
      const referencePath = path.join(TESTS_DIR, testCase.expect.reference);
      const diffPath = path.join(OUTPUT_DIR, `${testCase.name}-diff.png`);

      const compareResult = await compareImages(
        actualPath,
        referencePath,
        diffPath,
        { threshold: testCase.expect.threshold ?? 0.1 }
      );

      return {
        name: testCase.name,
        passed: compareResult.passed,
        actualPath,
        referencePath,
        diffPath: compareResult.diffImagePath,
        diffPercent: compareResult.diffPercent,
        diffPixels: compareResult.diffPixels,
        totalPixels: compareResult.totalPixels,
      };
    } else {
      const pixelResults = await this.checkPixels(testCase.expect.checks);
      const allPassed = pixelResults.every((r) => r.passed);

      return {
        name: testCase.name,
        passed: allPassed,
        actualPath,
        pixelChecks: pixelResults,
      };
    }
  }

  private async checkPixels(
    checks: Array<{ x: number; y: number; rgba: [number, number, number, number]; tolerance?: number }>
  ): Promise<Array<{ x: number; y: number; expected: number[]; actual: number[]; passed: boolean }>> {
    if (!this.page) throw new Error("No page");

    const results = await this.page.evaluate((checks) => {
      const canvas = document.getElementById("canvas") as HTMLCanvasElement;
      const gl = canvas.getContext("webgl2");
      if (!gl) throw new Error("No WebGL2 context");

      return checks.map((check) => {
        const pixel = new Uint8Array(4);
        gl.readPixels(check.x, canvas.height - check.y - 1, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);

        const tolerance = check.tolerance ?? 0;
        const passed =
          Math.abs(pixel[0] - check.rgba[0]) <= tolerance &&
          Math.abs(pixel[1] - check.rgba[1]) <= tolerance &&
          Math.abs(pixel[2] - check.rgba[2]) <= tolerance &&
          Math.abs(pixel[3] - check.rgba[3]) <= tolerance;

        return {
          x: check.x,
          y: check.y,
          expected: check.rgba,
          actual: Array.from(pixel),
          passed,
        };
      });
    }, checks);

    return results;
  }
}

export interface TestResult {
  name: string;
  passed: boolean;
  actualPath?: string;
  referencePath?: string;
  diffPath?: string;
  diffPercent?: number;
  diffPixels?: number;
  totalPixels?: number;
  pixelChecks?: Array<{ x: number; y: number; expected: number[]; actual: number[]; passed: boolean }>;
}

export { testCases };
