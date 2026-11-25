import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  use: { baseURL: "http://localhost:4173", channel: process.env.PW_CHANNEL || undefined, trace: "retain-on-failure" },
  // build first with: npm run build   (no base path for local e2e)
  webServer: { command: "python3 -m http.server 4173 -d out", url: "http://localhost:4173", reuseExistingServer: true },
});
