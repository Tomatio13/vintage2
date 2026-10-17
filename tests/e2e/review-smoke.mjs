import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { _electron as electron } from "playwright-core";

const root = await mkdtemp(join(tmpdir(), "vintage-review-smoke-"));
const profile = await mkdtemp(join(tmpdir(), "vintage-review-profile-"));
const git = (...args) => execFileSync("git", args, { cwd: root });
let app;
try {
  git("init", "-q", "-b", "main");
  git("config", "user.name", "VINTAGE review smoke");
  git("config", "user.email", "review@example.invalid");
  await writeFile(join(root, "a-large.ts"), "export const baseline = 0;\n");
  git("add", ".");
  git("commit", "-qm", "baseline");
  git("checkout", "-qb", "feature");
  await writeFile(join(root, "a-large.ts"), "export const branchValue = 1;\n");
  git("add", ".");
  git("commit", "-qm", "feature");
  await writeFile(
    join(root, "a-large.ts"),
    Array.from({ length: 1200 }, (_, i) => `line_${i}`).join("\n") + "\n",
  );
  await writeFile(join(root, "a-huge.ts"), "x".repeat(600000) + "\n");
  // Keep filesystem concurrency bounded too; these are real Git changes, not bridge mocks.
  for (let start = 0; start < 5000; start += 100) {
    await Promise.all(
      Array.from({ length: 100 }, (_, i) =>
        writeFile(
          join(root, `file-${String(start + i).padStart(5, "0")}.ts`),
          "export const changed = true;\n",
        ),
      ),
    );
  }
  app = await electron.launch({
    args: [
      ...(process.platform === "linux" ? ["--no-sandbox"] : []),
      `--user-data-dir=${profile}`,
      resolve("dist/main/index.js"),
    ],
  });
  const page = await app.firstWindow();
  page.setDefaultTimeout(15000);
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await app.evaluate(({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows()[0];
    window.setSize(1600, 1000);
    window.show();
    window.focus();
    window.webContents.setBackgroundThrottling(false);
  });
  await page.locator('[data-pane-kind="terminal"] .xterm').filter({ visible: true }).waitFor();
  await app.evaluate(({ dialog }, path) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] });
  }, root);
  await page.getByRole("button", { name: "Open folder", exact: true }).click();
  await page.getByRole("button", { name: "Review", exact: true }).click();
  const review = page.getByRole("region", { name: "Git review", exact: true });
  const branchSection = review
    .locator("section")
    .filter({ has: page.getByRole("heading", { name: "Committed on branch" }) });
  await branchSection.getByRole("button", { name: /^a-large\.ts/ }).click();
  await branchSection.locator("code.whitespace-pre").filter({ hasText: "branchValue" }).waitFor();
  await review.getByRole("button", { name: "Review scope", exact: true }).click();
  await page.getByRole("menuitemradio", { name: "Local Changes", exact: true }).click();
  await review.getByRole("button", { name: /^a-large\.ts/ }).waitFor();
  assert.equal(await review.getByRole("button", { name: /^(?:a-|file-)/ }).count(), 100);
  await page.evaluate(() => {
    window.reviewSmokeData = [];
    window.reviewSmokeExits = [];
    window.desktop.onTerminalData((event) => window.reviewSmokeData.push(event));
    window.desktop.onTerminalExit((event) => window.reviewSmokeExits.push(event));
    window.reviewSmokeLast = performance.now();
    window.reviewSmokeGap = 0;
    window.reviewSmokeTimer = setInterval(() => {
      const now = performance.now();
      window.reviewSmokeGap = Math.max(window.reviewSmokeGap, now - window.reviewSmokeLast);
      window.reviewSmokeLast = now;
    }, 50);
  });
  const terminal = page
    .locator('[data-pane-kind="terminal"] .xterm-helper-textarea')
    .filter({ visible: true });
  const checkTerminal = async (suffix) => {
    await terminal.focus();
    await page.keyboard.type(`printf 'VINTAGE_REVIEW_%s\\n' ${suffix}`);
    await page.keyboard.press("Enter");
    await page.waitForFunction(
      (marker) =>
        window.reviewSmokeData
          .map((event) => event.data)
          .join("")
          .includes(marker),
      `VINTAGE_REVIEW_${suffix}`,
    );
  };
  await checkTerminal("BEFORE");
  const session = await page.evaluate(() => window.reviewSmokeData.at(-1).sessionId);
  const start = Date.now();
  await review.getByRole("button", { name: /^a-large\.ts/ }).click();
  await review.getByText("line_0", { exact: true }).waitFor();
  const openMs = Date.now() - start;
  assert.ok((await review.locator("code.whitespace-pre").count()) <= 200);
  const diffPages = review.getByRole("navigation", { name: "Diff pages" });
  await diffPages.getByRole("button", { name: "Next", exact: true }).click();
  await review.getByText("line_250", { exact: true }).waitFor();
  // Allow a real automatic refresh and verify the user's diff page is retained.
  await page.waitForTimeout(3800);
  await review.getByText("line_250", { exact: true }).waitFor();
  await review.getByRole("button", { name: /^a-huge\.ts/ }).click();
  await review.getByText("Diff exceeds the display limit.", { exact: false }).waitFor();
  await review.getByRole("button", { name: /^a-huge\.ts/ }).click();
  const filePages = review.getByRole("navigation", { name: "Unstaged file pages" });
  await filePages.getByRole("button", { name: "Next", exact: true }).click();
  await review.getByRole("button", { name: /^file-00098\.ts/ }).click();
  await review.locator("code.whitespace-pre").filter({ hasText: "changed" }).waitFor();
  assert.equal(await review.getByRole("button", { name: /^(?:a-|file-)/ }).count(), 100);
  await page.getByRole("button", { name: "Files", exact: true }).click();
  await page.getByRole("button", { name: "Review", exact: true }).click();
  await review.getByRole("button", { name: /^file-00098\.ts/ }).waitFor();
  await checkTerminal("AFTER");
  const state = await page.evaluate(() => {
    clearInterval(window.reviewSmokeTimer);
    return {
      maxGapMs: Math.round(window.reviewSmokeGap),
      exits: window.reviewSmokeExits,
      sessions: [...new Set(window.reviewSmokeData.map((event) => event.sessionId))],
    };
  });
  assert.equal(state.exits.length, 0);
  assert.deepEqual(state.sessions, [session]);
  assert.ok(state.maxGapMs < 2000, `renderer stalled for ${state.maxGapMs}ms`);
  assert.deepEqual(errors, []);
  await page.screenshot({ path: "/tmp/vintage-review-smoke.png" });
  console.log(
    JSON.stringify({
      changedFiles: 5002,
      openMs,
      ...state,
      result: "branch/local diffs, paging, auto-refresh, oversized fallback, tabs and live PTY OK",
    }),
  );
} finally {
  if (app) await app.close();
  await rm(root, { recursive: true, force: true });
  await rm(profile, { recursive: true, force: true });
}
