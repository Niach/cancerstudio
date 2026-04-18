import fs from "node:fs";
import path from "node:path";

import { expect, test } from "@playwright/test";

const repoRoot = path.resolve(__dirname, "..", "..");
const sampleDir =
  process.env.REAL_DATA_SAMPLE_DIR
    ? path.resolve(process.env.REAL_DATA_SAMPLE_DIR)
    : path.join(repoRoot, "data", "sample-data", "colo829-wgs", "smoke");

function samplePath(filename: string) {
  const filePath = path.join(sampleDir, filename);
  if (!fs.existsSync(filePath)) {
    throw new Error(
      `Missing ingestion smoke fixture: ${filePath}. Run npm run sample-data:smoke or set REAL_DATA_SAMPLE_DIR.`
    );
  }
  return filePath;
}

function selectedFile(filename: string) {
  const filePath = samplePath(filename);
  const stats = fs.statSync(filePath);
  return {
    path: filePath,
    name: path.basename(filePath),
    sizeBytes: stats.size,
    modifiedAtMs: stats.mtimeMs,
  };
}

// TODO: rewrite against the inbox flow — drop fixtures into the inbox dir and
// drive the InboxPicker UI instead of stubbing pickSequencingFiles.
test.skip("desktop ingestion smoke reaches alignment-ready state", async ({ page }) => {
  const stamp = Date.now();
  // Reference the helpers so unused-import lint doesn't fire while the test
  // body is skipped pending a rewrite against the inbox API.
  void selectedFile;

  await page.goto("/");
  await page.getByTestId("workspace-species-human").click();
  await page.getByTestId("workspace-name-input").fill(`Desktop intake ${stamp}`);

  await Promise.all([
    page.waitForURL(/\/workspaces\/[^/]+\/ingestion$/),
    page.getByTestId("workspace-create-submit").click(),
  ]);

  await expect(page.getByText("What you need")).toBeVisible();
  await expect(
    page.getByText("For each sample: a paired FASTQ set or a single BAM/CRAM file.")
  ).toBeVisible();

  await page.getByTestId("tumor-pick-files").click();
  await expect(page.getByTestId("tumor-lane-panel")).toHaveAttribute(
    "data-summary-status",
    "ready"
  );

  await page.getByTestId("normal-pick-files").click();

  await expect(page.getByTestId("normal-lane-panel")).toHaveAttribute(
    "data-summary-status",
    "ready"
  );
  await expect(page.getByTestId("alignment-status-indicator")).toHaveAttribute(
    "data-state",
    "unlocked"
  );
  await expect(page.getByTestId("ingestion-continue-link")).toBeVisible();
  await expect(page.getByTestId("tumor-preview-panel")).toHaveAttribute(
    "data-phase",
    "ready"
  );
});
