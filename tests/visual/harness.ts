import { chromium, type Browser, type Page } from "playwright";
import { spawn, type ChildProcess } from "child_process";
import * as path from "path";
import * as fs from "fs";
import { compareImages, type CompareOptions, type CompareResult } from "./compare";

const ROOT_DIR = path.resolve(__dirname, "../..");
const DEVSERVER_DIR = path.join(ROOT_DIR, "devserver");
const TESTS_DIR = path.join(ROOT_DIR, "tests");
const OUTPUT_DIR = path.join(TESTS_DIR, "visual", "output");

export interface TestConfig {
  serverPort?: number;
  serverStartupTimeout?: number;
  renderWaitTime?: number;
  threshold?: number;
  viewportWidth?: number;
  viewportHeight?: number;
}

const DEFAULT_CONFIG: Required<TestConfig> = {
  serverPort: 3000,
  serverStartupTimeout: 30000,
  renderWaitTime: 2000,
  threshold: 0.1,
  viewportWidth: 3441,
  viewportHeight: 1440,
};

export class VisualTestHarness {
  private browser: Browser | null = null;
  private page: Page | null = null;
  private serverProcess: ChildProcess | null = null;
  private config: Required<TestConfig>;
  private actualPort: number = 0;

  constructor(config: TestConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  async startServer(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.serverProcess = spawn("bun", ["run", "dev"], {
        cwd: DEVSERVER_DIR,
        stdio: ["ignore", "pipe", "pipe"],
        env: { ...process.env, BROWSER: "none" },
      });

      const timeout = setTimeout(() => {
        reject(new Error("Server startup timeout"));
      }, this.config.serverStartupTimeout);

      this.serverProcess.stdout?.on("data", (data: Buffer) => {
        const output = data.toString();
        const portMatch = output.match(/localhost:(\d+)/);
        if (portMatch) {
          this.actualPort = parseInt(portMatch[1], 10);
          clearTimeout(timeout);
          setTimeout(resolve, 500);
        }
      });

      this.serverProcess.stderr?.on("data", (data: Buffer) => {
        console.error("Server stderr:", data.toString());
      });

      this.serverProcess.on("error", (err) => {
        clearTimeout(timeout);
        reject(err);
      });

      this.serverProcess.on("exit", (code) => {
        if (code !== 0 && code !== null) {
          clearTimeout(timeout);
          reject(new Error(`Server exited with code ${code}`));
        }
      });
    });
  }

  async launchBrowser(): Promise<void> {
    this.browser = await chromium.launch({
      args: ["--use-gl=swiftshader", "--use-angle=swiftshader"],
      headless: true,
    });
    this.page = await this.browser.newPage({
      viewport: {
        width: this.config.viewportWidth,
        height: this.config.viewportHeight,
      },
      deviceScaleFactor: 1,
    });
  }

  async navigateToApp(testMode?: string, extraParams?: Record<string, string>): Promise<void> {
    if (!this.page) throw new Error("Browser not launched");

    this.page.on("console", (msg) => {
      console.log(`Browser [${msg.type()}]:`, msg.text());
    });

    this.page.on("pageerror", (err) => {
      console.error("Page error:", err.message);
    });

    const port = this.actualPort || this.config.serverPort;
    const params = new URLSearchParams();
    if (testMode) params.set("test", testMode);
    if (extraParams) {
      for (const [key, value] of Object.entries(extraParams)) {
        params.set(key, value);
      }
    }
    const url = `http://localhost:${port}?${params.toString()}`;
    await this.page.goto(url);

    await this.page.waitForFunction(
      ([expectedWidth, expectedHeight]) => {
        const canvas = document.querySelector("canvas");
        return canvas && canvas.width === expectedWidth && canvas.height === expectedHeight;
      },
      [this.config.viewportWidth, this.config.viewportHeight] as const,
      { timeout: 10000 }
    );

    await this.page.waitForTimeout(this.config.renderWaitTime);
  }

  async captureCanvas(outputPath: string): Promise<string> {
    if (!this.page) throw new Error("Browser not launched");

    fs.mkdirSync(path.dirname(outputPath), { recursive: true });

    const canvas = await this.page.locator("canvas").first();
    const box = await canvas.boundingBox();
    if (!box) throw new Error("Canvas not visible");

    await this.page.screenshot({
      path: outputPath,
      clip: { x: box.x, y: box.y, width: box.width, height: box.height },
    });

    return outputPath;
  }

  async compareWithReference(
    actualPath: string,
    referenceName: string,
    options: CompareOptions = {}
  ): Promise<CompareResult> {
    const referencePath = path.join(TESTS_DIR, `${referenceName}.png`);
    const diffPath = path.join(OUTPUT_DIR, `${referenceName}-diff.png`);

    const compareOpts = {
      ...options,
      threshold: options.threshold ?? this.config.threshold,
    };

    return compareImages(actualPath, referencePath, diffPath, compareOpts);
  }

  async cleanup(): Promise<void> {
    if (this.page) {
      await this.page.close();
      this.page = null;
    }
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
    if (this.serverProcess) {
      this.serverProcess.kill("SIGTERM");
      this.serverProcess = null;
    }
  }

  getPage(): Page {
    if (!this.page) throw new Error("Browser not launched");
    return this.page;
  }

  static getOutputDir(): string {
    return OUTPUT_DIR;
  }

  static getTestsDir(): string {
    return TESTS_DIR;
  }
}

export function formatResult(result: CompareResult, testName: string): string {
  const status = result.passed ? "PASS" : "FAIL";
  return [
    `[${status}] ${testName}`,
    `  Diff pixels: ${result.diffPixels} / ${result.totalPixels}`,
    `  Diff percent: ${result.diffPercent.toFixed(4)}%`,
    result.diffImagePath ? `  Diff image: ${result.diffImagePath}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}
