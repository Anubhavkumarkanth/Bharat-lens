import { classifyCategory, classifyContentType, classifyScope } from "@/lib/scope-category/classify";
import { SOURCES } from "@/config/sources";

const reuters = SOURCES.find((s) => s.id === "reuters")!;
const theHindu = SOURCES.find((s) => s.id === "the-hindu")!;

const cases: { desc: string; got: string; want: string }[] = [];

function check(desc: string, got: string, want: string) {
  cases.push({ desc, got, want });
}

// The substring bugs that inflated "technology" and would misroute "Indiana".
check('"said"/"again" must not match the "ai" keyword', classifyCategory("Minister said talks will begin again", null), "business-economy");
check('"chair" must not match "ai"', classifyCategory("Committee chair to maintain current stance", null), "business-economy");
check('"Indiana" must not put a US story in india-abroad', classifyScope(reuters, "Indiana factory closes after storm damage", null), "world");

// True positives must still work.
check('real "AI" story is technology', classifyCategory("New AI model beats benchmarks", null), "technology");
check("cricket is sports", classifyCategory("India wins cricket World Cup final", null), "sports");
check("multi-word phrase matches", classifyCategory("Stock market rallies as sensex climbs", null), "finance");
check("India keyword routes global source to india-abroad", classifyScope(reuters, "India signs trade deal with Brazil", null), "india-abroad");
check("impact keyword routes to impact-on-india", classifyScope(reuters, "Federal Reserve holds fed rate steady", null), "impact-on-india");
check("Indian source defaults to india scope", classifyScope(theHindu, "Monsoon session begins", null), "india");

// URL section path beats headline keywords, and rescues headlines with no keyword at all.
check("section path wins over keywordless headline", classifyCategory("Man stabbed to death in east Delhi", null, "https://theprint.in/india/man-stabbed/1/"), "business-economy");
check("sports section path classifies", classifyCategory("Late goal seals it", null, "https://apnews.com/sports/late-goal"), "sports");
check("business section path classifies", classifyCategory("Firm names new head", null, "https://www.business-standard.com/business/firm-names-head"), "business-economy");
check("entertainment section path classifies", classifyCategory("Star announces project", null, "https://indianexpress.com/entertainment/star-project/"), "entertainment");

// Opinion detection from section path (News Report vs Opinion/Analysis).
check("guardian commentisfree is opinion", classifyContentType("https://www.theguardian.com/commentisfree/2026/sep/06/piece"), "opinion");
check("opinion path is opinion", classifyContentType("https://www.thehindu.com/opinion/lead/article.ece"), "opinion");
check("plain news path is news-report", classifyContentType("https://www.thehindu.com/news/national/article.ece"), "news-report");

// Foreign-desk sections: an Indian outlet's /world/ story is not India news.
check("Indian source /world/ story goes to world", classifyScope(theHindu, "Nigerian families seek news from kidnappers", null, "https://theprint.in/world/nigeria-abduction/3033860"), "world");
check("Indian source /world/ story with impact keyword goes to impact-on-india", classifyScope(theHindu, "Crude oil prices surge after OPEC decision", null, "https://theprint.in/world/opec-oil/1"), "impact-on-india");
check("Indian source domestic story stays india", classifyScope(theHindu, "Nigerian families seek news", null, "https://www.thehindu.com/news/national/story.ece"), "india");
check("global source /world/ story about India is india-abroad", classifyScope(reuters, "India signs trade deal", null, "https://www.reuters.com/world/india-trade-deal"), "india-abroad");

let failed = 0;
for (const c of cases) {
  const ok = c.got === c.want;
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${c.desc}\n      got=${c.got} want=${c.want}`);
}
console.log(`\n${cases.length - failed}/${cases.length} passed`);
process.exit(failed > 0 ? 1 : 0);
