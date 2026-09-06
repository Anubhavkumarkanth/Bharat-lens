import { fetchText } from "./http";

export interface RobotsInfo {
  sitemaps: string[];
  disallow: string[]; // paths disallowed for User-agent: *
}

export async function fetchRobots(homepage: string): Promise<RobotsInfo> {
  const robotsUrl = new URL("/robots.txt", homepage).toString();
  const body = await fetchText(robotsUrl);
  const info: RobotsInfo = { sitemaps: [], disallow: [] };
  if (!body) return info;

  let inWildcardAgent = false;
  for (const rawLine of body.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const [rawKey, ...rest] = line.split(":");
    const key = rawKey.trim().toLowerCase();
    const value = rest.join(":").trim();
    if (key === "sitemap") {
      info.sitemaps.push(value);
    } else if (key === "user-agent") {
      inWildcardAgent = value === "*";
    } else if (key === "disallow" && inWildcardAgent && value) {
      info.disallow.push(value);
    }
  }
  return info;
}

/** Simple prefix + wildcard match against robots Disallow rules. */
export function isDisallowed(path: string, disallow: string[]): boolean {
  return disallow.some((rule) => {
    if (rule === "/") return true;
    const pattern = rule.replace(/\*/g, ".*").replace(/\$$/, "$");
    try {
      return new RegExp("^" + pattern).test(path);
    } catch {
      return path.startsWith(rule);
    }
  });
}
