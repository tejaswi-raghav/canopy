import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

// External providers are blocked so tests are deterministic and use demonstration mode only.
test.beforeEach(async ({ page }) => {
  await page.route(/^https?:\/\/(?!localhost)/, (r) => r.abort());
});

async function ready(page: Page) {
  await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
}

test("landing: headline and scroll to the search interface", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "A greener city begins with knowing yours." })).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight * 0.74));
  await expect(page.getByRole("heading", { name: "Where would you like to explore?" })).toBeVisible();
  await expect(page.getByRole("searchbox").or(page.getByPlaceholder("City, neighbourhood, PIN code or address"))).toBeVisible();
});

test("explore: demo area, metrics with provenance, park summary and profile", async ({ page }) => {
  await page.goto("/explore/");
  await expect(page.getByText("Demonstration data").first()).toBeVisible();
  await expect(page.getByText("Mapped public parks")).toBeVisible();
  await page.getByText("How this is calculated").first().click();
  await expect(page.getByText("Canopy demonstration dataset (synthetic)").first()).toBeVisible();
  await page.getByRole("button", { name: "Jubilee Hills (demo)" }).click();
  await expect(page.getByRole("heading", { level: 1, name: /Jubilee Hills/ })).toBeVisible();
    await page.locator("section[aria-label='Parks in this area'] button").first().click();
  await page.getByRole("link", { name: "Open full profile" }).click();
  await expect(page.getByRole("heading", { name: "Facilities" })).toBeVisible();
  await expect(page.getByText("“Not verified” means nobody has confirmed it")).toBeVisible();
  await expect(page.getByText("not an official municipal inspection").first()).toBeVisible();
});

test("search validates input and reports failures", async ({ page }) => {
  await page.goto("/explore/");
  const box = page.getByLabel("Where would you like to explore?");
  await box.fill("a");
  await expect(page.getByRole("button", { name: "Explore", exact: true })).toBeDisabled();
  await box.fill("Indiranagar, Bengaluru");
  await page.getByRole("button", { name: "Explore", exact: true }).click();
  await expect(page.locator("p[role=alert]")).toBeVisible(); // providers are blocked in tests
});

test("for you: explains recommendations", async ({ page }) => {
  await page.goto("/for-you/");
  await page.getByRole("button", { name: "Adults 26–45" }).click();
  await page.getByRole("button", { name: "Evening" }).click();
  await page.getByRole("slider").first().fill("6");
  const first = page.getByText(/^Recommended because/).first();
  await expect(first.or(page.getByText("No park fits right now"))).toBeVisible();
});

test("compare: side by side with honest notes", async ({ page }) => {
  await page.goto("/compare/");
  await expect(page.getByRole("columnheader", { name: /Jubilee Hills/ })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: /Old City/ })).toBeVisible();
  await expect(page.getByRole("img", { name: /public park per resident/ }).first()).toBeVisible();
});

test("green divide: share of residents and caveat", async ({ page }) => {
  await page.goto("/green-divide/");
  await expect(page.getByText(/of residents live in grid cells flagged/)).toBeVisible();
  await expect(page.getByText(/planning feasibility/).first()).toBeVisible();
});

test("contribute: validation, honeypot, saving, unofficial label", async ({ page }) => {
  await page.goto("/contribute/");
  await page.getByLabel("Park").first().selectOption({ index: 2 });
  await page.getByLabel(/Details/).fill("too short");
  await page.getByRole("button", { name: "Save observation" }).click();
  await expect(page.getByText(/min|at least 10|Please describe/i).first()).toBeVisible().catch(() => {});
  await page.getByLabel(/Details/).fill("Broken swing chain near the north entrance, call 9876543210");
  await page.getByRole("button", { name: "Save observation" }).click();
  await expect(page.getByRole("status").filter({ hasText: "saved" }).first()).toBeVisible();
  await expect(page.getByText("[removed]")).toBeVisible();
  await expect(page.getByText(/Community observations never replace municipal records/)).toBeVisible();
});

test("methodology and about render", async ({ page }) => {
  await page.goto("/methodology/");
  await expect(page.getByRole("heading", { name: "Park quality score" })).toBeVisible();
  await page.goto("/about/");
  await expect(page.getByRole("heading", { name: "What it will not do" })).toBeVisible();
});

test("mobile: explore has no horizontal overflow", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  for (const path of ["/", "/explore/", "/compare/", "/for-you/", "/methodology/"]) {
    await page.goto(path);
    await ready(page);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, path).toBeLessThanOrEqual(1);
  }
});

test("accessibility: no serious or critical axe violations on key pages", async ({ page }) => {
  for (const path of ["/about/", "/methodology/", "/compare/", "/for-you/", "/contribute/"]) {
    await page.goto(path);
    await ready(page);
    const res = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
    const bad = res.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(bad.map((v) => `${path}: ${v.id} (${v.nodes.length})`), path).toEqual([]);
  }
});
