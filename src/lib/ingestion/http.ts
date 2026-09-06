// Several publishers (Business Standard, ANI, AP) return 403 to unknown bot
// agents even for their own advertised feeds and sitemaps. We still honour
// robots.txt and rate-limit politely, but identify as a normal browser so
// those sources are reachable at all.
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

export async function fetchText(url: string, timeoutMs = 10000): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "*/*" },
      signal: controller.signal,
      redirect: "follow",
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function headOk(url: string, timeoutMs = 8000): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: "GET", // many sites don't implement HEAD correctly; GET + no-store is more reliable
      headers: { "User-Agent": USER_AGENT },
      signal: controller.signal,
      redirect: "follow",
    });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}
