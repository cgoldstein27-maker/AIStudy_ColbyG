/**
 * web-research.js — fetch reference text from Wikipedia (browser-safe, no API key).
 *
 * Uses the MediaWiki API with origin=* so requests work from static pages.
 * This is “information from the web” in a structured, citable form—not arbitrary scraping.
 */

const WIKI_REQUEST_TIMEOUT_MS = 8000;
const WIKI_TOTAL_TIMEOUT_MS = 12000;

function wikiTimedOutResult() {
  return { title: "", extract: "", url: "", timedOut: true };
}

async function fetchJsonWithTimeout(url, timeoutMs) {
  const ctrl = new AbortController();
  const tid = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) return null;
    return await res.json();
  } finally {
    clearTimeout(tid);
  }
}

/**
 * @param {string} query Search string (e.g. document title or first topic line)
 * @param {number} maxChars Trim extract length
 * @returns {Promise<{ title: string, extract: string, url: string, timedOut?: boolean } | null>}
 */
export async function fetchWikipediaContext(query, maxChars = 12000) {
  const q = (query || "").trim().slice(0, 200);
  if (!q) return null;
  const startedAt = Date.now();
  const timeLeft = () => Math.max(0, WIKI_TOTAL_TIMEOUT_MS - (Date.now() - startedAt));

  const searchUrl = new URL("https://en.wikipedia.org/w/api.php");
  searchUrl.searchParams.set("action", "opensearch");
  searchUrl.searchParams.set("search", q);
  searchUrl.searchParams.set("limit", "1");
  searchUrl.searchParams.set("namespace", "0");
  searchUrl.searchParams.set("format", "json");
  searchUrl.searchParams.set("origin", "*");

  let titles;
  try {
    const sTimeout = Math.min(WIKI_REQUEST_TIMEOUT_MS, Math.max(1200, timeLeft()));
    if (sTimeout <= 0) return wikiTimedOutResult();
    const sData = await fetchJsonWithTimeout(searchUrl.toString(), sTimeout);
    if (!sData || !Array.isArray(sData[1])) return null;
    titles = sData[1];
    if (!titles.length) return null;
  } catch (e) {
    if (e?.name === "AbortError") return wikiTimedOutResult();
    return null;
  }

  const title = titles[0];
  const extractUrl = new URL("https://en.wikipedia.org/w/api.php");
  extractUrl.searchParams.set("action", "query");
  extractUrl.searchParams.set("format", "json");
  extractUrl.searchParams.set("origin", "*");
  extractUrl.searchParams.set("prop", "extracts");
  extractUrl.searchParams.set("exintro", "false");
  extractUrl.searchParams.set("explaintext", "true");
  extractUrl.searchParams.set("titles", title);

  try {
    const eTimeout = Math.min(WIKI_REQUEST_TIMEOUT_MS, Math.max(1200, timeLeft()));
    if (eTimeout <= 0) return wikiTimedOutResult();
    const eData = await fetchJsonWithTimeout(extractUrl.toString(), eTimeout);
    if (!eData) return null;
    const pages = eData.query?.pages;
    if (!pages) return null;
    const page = Object.values(pages)[0];
    if (!page || page.missing) return null;
    let extract = page.extract || "";
    extract = extract.replace(/\s+/g, " ").trim();
    if (maxChars && extract.length > maxChars) extract = extract.slice(0, maxChars) + "…";
    const url = `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, "_"))}`;
    return { title, extract, url };
  } catch (e) {
    if (e?.name === "AbortError") return wikiTimedOutResult();
    return null;
  }
}
