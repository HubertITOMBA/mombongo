import { defineConfig } from "@playwright/test";
export default defineConfig({
  tsconfig: "./apps/web/tsconfig.json",
  testDir: "./tests/browser",
  globalSetup: "./tests/browser/global-setup.ts",
  workers: 1,
  timeout: 60_000,
  use: { baseURL: "http://localhost:9070", headless: true, launchOptions: { executablePath: "/usr/bin/google-chrome" } },
});
