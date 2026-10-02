const TRACKING_PARAMS = [
  "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content",
  "fbclid", "gclid", "ref", "ref_src", "cid", "amp", "outputType", "taid",
  "__twitter_impression", "action-mode", "sr_share",
];

// Removes tracking params, the #fragment and trailing slash so duplicate URLs match.
export function canonicalizeUrl(rawUrl: string): string {
  try {
    const url = new URL(rawUrl);
    for (const param of TRACKING_PARAMS) url.searchParams.delete(param);
    url.hash = "";
    // sort the rest so order doesn't matter
    url.searchParams.sort();
    let result = url.toString();
    if (result.endsWith("/") && url.pathname !== "/") result = result.slice(0, -1);
    return result;
  } catch {
    return rawUrl;
  }
}
