/**
 * web-research.js — fetch reference text from Wikipedia (browser-safe, no API key).
 *
 * Uses the MediaWiki API with origin=* so requests work from static pages.
 * This is “information from the web” in a structured, citable form—not arbitrary scraping.
 */

/**
 * @param {string} query Search string (e.g. document title or first topic line)
 * @param {number} maxChars Trim extract length
 * @returns {Promise<{ title: string, extract: string, url: string } | null>}
 */
export async function fetchWikipediaContext(query, maxChars = 12000) {
  const q = (query || "").trim().slice(0, 200);
  if (!q) return null;

  const searchUrl = new URL("https://en.wikipedia.org/w/api.php");
  searchUrl.searchParams.set("action", "opensearch");
  searchUrl.searchParams.set("search", q);
  searchUrl.searchParams.set("limit", "1");
  searchUrl.searchParams.set("namespace", "0");
  searchUrl.searchParams.set("format", "json");
  searchUrl.searchParams.set("origin", "*");

  let titles;
  try {
    const sRes = await fetch(searchUrl.toString());
    if (!sRes.ok) return null;
    const sData = await sRes.json();
    if (!sData || !Array.isArray(sData[1])) return null;
    titles = sData[1];
    if (!titles.length) return null;
  } catch {
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
    const eRes = await fetch(extractUrl.toString());
    if (!eRes.ok) return null;
    const eData = await eRes.json();
    const pages = eData.query?.pages;
    if (!pages) return null;
    const page = Object.values(pages)[0];
    if (!page || page.missing) return null;
    let extract = page.extract || "";
    extract = extract.replace(/\s+/g, " ").trim();
    if (maxChars && extract.length > maxChars) extract = extract.slice(0, maxChars) + "…";
    const url = `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, "_"))}`;
    return { title, extract, url };
  } catch {
    return null;
  }
}
