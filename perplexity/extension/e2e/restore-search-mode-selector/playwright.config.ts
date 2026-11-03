import { defineConfig } from "@playwright/test";

// No account, extension storage, paid queries or Perplexity network requests.
export default defineConfig({
  testDir: ".",
  testMatch: "*.spec.ts",
  outputDir: "../results/restore-search-mode-selector",
  reporter: "list",
  workers: 1,
  use: { browserName: "chromium", channel: "chrome", headless: true },
});
