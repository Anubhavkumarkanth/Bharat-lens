const TRACKING_PARAMS = [
  "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content",
  "fbclid", "gclid", "ref", "ref_src", "cid", "amp", "outputType", "taid",
  "__twitter_impression", "action-mode", "sr_share",
];

/** Strips tracking params, fragment, and trailing slash so the same story from the same URL always dedups. */
export function canonicalizeUrl(rawUrl: string): string {
  try {
    const url = new URL(rawUrl);
    for (const param of TRACKING_PARAMS) url.searchParams.delete(param);
    url.hash = "";
    // Sort remaining params for stable ordering.
    url.searchParams.sort();
    let result = url.toString();
    if (result.endsWith("/") && url.pathname !== "/") result = result.slice(0, -1);
    return result;
  } catch {
    return rawUrl;
  }
}
