// Retakes the README screenshots against a running server (see
// docs/screenshots/README.md). Run by .github/workflows/analysis-report.yml.
// Fails instead of saving if a page is empty or the insights views are missing.

import { chromium } from "playwright";

const base = process.env.BASE_URL ?? "http://localhost:3000";
const width = 1440;
const searchQuery = process.env.SEARCH_QUERY ?? "india";

const browser = await chromium.launch();
try {
  let page;

  // New context per page so the Hindi one's language cookie doesn't carry over.
  async function shot(path, file, { height = 1100, needsArticles = false } = {}) {
    await page?.context().close();
    page = await browser.newPage({ viewport: { width, height } });
    const response = await page.goto(base + path, { waitUntil: "networkidle" });
    if (!response?.ok()) throw new Error(`${path} returned ${response?.status()}`);
    const flagged = page.locator("[data-insights-state]");
    if (await flagged.count()) {
      throw new Error(`${path} is in the "${await flagged.getAttribute("data-insights-state")}" state`);
    }
    if (needsArticles && !(await page.locator('a[href^="/article/"]').count())) {
      throw new Error(`${path} has no articles, not saving an empty page`);
    }
    await page.screenshot({ path: `docs/screenshots/${file}` });
    console.log(`Saved ${file}`);
  }

  // A week, not the default one day, so a quiet day doesn't give an empty feed.
  await shot("/india?range=week", "feed.png", { needsArticles: true });
  const firstArticle = await page.locator('a[href^="/article/"]').first().getAttribute("href");

  await shot("/india?range=week&lang=hi", "hindi.png", { needsArticles: true });
  await shot(`/search?q=${encodeURIComponent(searchQuery)}`, "search.png", { needsArticles: true });
  await shot(firstArticle, "reader.png", { height: 1250 });
  await shot("/insights?days=30", "insights.png");
} finally {
  await browser.close();
}
