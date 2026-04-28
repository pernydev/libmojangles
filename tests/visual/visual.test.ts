import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { TestRunner, testCases, type TestResult } from "./runner";

const runner = new TestRunner({
  headless: true,
  renderWaitTime: 2000,
});

function formatResult(result: TestResult): string {
  const status = result.passed ? "PASS" : "FAIL";
  const lines = [`[${status}] ${result.name}`];

  if (result.diffPercent !== undefined) {
    lines.push(`  Diff: ${result.diffPercent.toFixed(4)}% (${result.diffPixels}/${result.totalPixels} pixels)`);
  }

  if (result.diffPath) {
    lines.push(`  Diff image: ${result.diffPath}`);
  }

  if (result.pixelChecks) {
    for (const check of result.pixelChecks) {
      const checkStatus = check.passed ? "OK" : "FAIL";
      lines.push(
        `  [${checkStatus}] (${check.x}, ${check.y}): expected ${JSON.stringify(check.expected)}, got ${JSON.stringify(check.actual)}`
      );
    }
  }

  if (result.bboxChecks) {
    for (const check of result.bboxChecks) {
      const checkStatus = check.passed ? "OK" : "FAIL";
      lines.push(
        `  [${checkStatus}] [${check.index}]: expected ${JSON.stringify(check.expected)}, got ${JSON.stringify(check.actual)}`
      );
    }
  }

  return lines.join("\n");
}

describe("Visual Regression Tests", () => {
  beforeAll(async () => {
    console.log("Setting up test runner...");
    await runner.setup();
    console.log("Test runner ready");
  });

  afterAll(async () => {
    await runner.teardown();
    console.log("Test runner cleaned up");
  });

  for (const testCase of testCases) {
    it(`should match ${testCase.name} reference`, async () => {
      const result = await runner.runTest(testCase);
      console.log(formatResult(result));
      expect(result.passed).toBe(true);
    });
  }
});
