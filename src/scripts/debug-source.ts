import { SOURCES } from "@/config/sources";
import { discoverFeed } from "@/lib/ingestion/discovery";
import { fetchText } from "@/lib/ingestion/http";
import { parseFeed } from "@/lib/ingestion/feed-parser";
import { fetchSitemapItems } from "@/lib/ingestion/sitemap-parser";

const ids = process.argv.slice(2);

async function main() {
  for (const id of ids) {
    const source = SOURCES.find((s) => s.id === id);
    if (!source) {
      console.log(`${id}: NOT IN CONFIG`);
      continue;
    }
    const discovered = await discoverFeed(source);
    console.log(`\n=== ${id} ===`);
    console.log("discovery:", discovered);
    if (!discovered) continue;

    if (discovered.type === "rss") {
      const xml = await fetchText(discovered.feedUrl);
      console.log("fetched bytes:", xml?.length ?? "NULL (fetch failed)");
      if (xml) {
        console.log("head:", xml.slice(0, 200).replace(/\n/g, " "));
        const items = parseFeed(xml);
        console.log("parsed items:", items.length);
        if (items[0]) console.log("first item:", JSON.stringify(items[0]).slice(0, 300));
      }
    } else {
      const items = await fetchSitemapItems(discovered.feedUrl);
      console.log("sitemap items:", items.length);
      if (items[0]) console.log("first item:", JSON.stringify(items[0]).slice(0, 300));
    }
  }
  process.exit(0);
}

main();
