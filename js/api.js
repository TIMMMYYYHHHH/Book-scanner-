const OL_SEARCH  = "https://openlibrary.org/search.json";
const OL_COVERS  = "https://covers.openlibrary.org/b";
const GB_API     = "https://www.googleapis.com/books/v1/volumes";

export async function fetchBookByIsbn(isbn) {
  const clean = isbn.replace(/[^0-9X]/gi, "");
  if (clean.length !== 10 && clean.length !== 13) {
    throw new Error("That doesn't look like a valid ISBN. Please check and try again.");
  }

  // Run all sources in parallel for speed
  const [olSearch, gb] = await Promise.all([
    fetchOpenLibrarySearch(clean).catch(() => null),
    fetchGoogleBooks(clean).catch(() => null),
  ]);

  if (!olSearch && !gb) {
    throw new Error("Book not found. Check the ISBN and try again.");
  }

  return mergeResults(clean, olSearch, gb);
}

// ── OpenLibrary search endpoint (better series coverage than the book API) ──
async function fetchOpenLibrarySearch(isbn) {
  const fields = "title,author_name,series,cover_i,publisher,first_publish_year,number_of_pages_median";
  const res = await fetch(`${OL_SEARCH}?isbn=${isbn}&fields=${fields}&limit=1`);
  if (!res.ok) return null;
  const data = await res.json();
  if (!data.docs?.length) return null;

  const doc = data.docs[0];

  // Series field comes back as e.g. ["Harry Potter #1"] or ["Harry Potter"]
  let seriesName = null, seriesNumber = null;
  if (doc.series?.length) {
    const raw = doc.series[0];
    const parsed = parseSeriesString(raw) || parseSeriesFromTitle(raw);
    if (parsed) { seriesName = parsed.name; seriesNumber = parsed.num; }
    else seriesName = raw.trim();
  }

  // If the series field had no number, try to find it in the title
  if (seriesName && !seriesNumber) {
    const t = parseSeriesFromTitle(doc.title || "");
    if (t) seriesNumber = t.num;
  }

  // Fall back to parsing the whole title when series field is missing
  if (!seriesName) {
    const t = parseSeriesFromTitle(doc.title || "");
    if (t) { seriesName = t.name; seriesNumber = t.num; }
  }

  const coverUrl = doc.cover_i
    ? `${OL_COVERS}/id/${doc.cover_i}-L.jpg`
    : (isbn ? `${OL_COVERS}/isbn/${isbn}-L.jpg` : null);

  return {
    title:       doc.title || null,
    authors:     doc.author_name || [],
    coverUrl,
    publisher:   doc.publisher?.[0] || null,
    publishYear: doc.first_publish_year?.toString() || null,
    pages:       doc.number_of_pages_median || null,
    seriesName,
    seriesNumber,
  };
}

// ── Google Books ─────────────────────────────────────────────────────────────
async function fetchGoogleBooks(isbn) {
  const res = await fetch(`${GB_API}?q=isbn:${isbn}&maxResults=1`);
  if (!res.ok) return null;
  const data = await res.json();
  if (!data.items?.length) return null;

  const v = data.items[0].volumeInfo;

  let coverUrl = null;
  if (v.imageLinks) {
    const raw = v.imageLinks.extraLarge || v.imageLinks.large ||
                v.imageLinks.medium    || v.imageLinks.thumbnail || null;
    coverUrl = raw?.replace("http://", "https://") ?? null;
  }

  let seriesName = null, seriesNumber = null;
  // Google Books occasionally has structured series info
  if (v.seriesInfo?.bookSeries?.[0]) {
    seriesName = v.seriesInfo.bookSeries[0].seriesId || null;
    seriesNumber = v.seriesInfo.volumeSeries?.[0]?.orderNumber
      ? parseInt(v.seriesInfo.volumeSeries[0].orderNumber) : null;
  }
  if (!seriesName) {
    const t = parseSeriesFromTitle(v.title || "");
    if (t) { seriesName = t.name; seriesNumber = t.num; }
  }

  return {
    title:       v.title  || null,
    authors:     v.authors || [],
    coverUrl,
    publisher:   v.publisher || null,
    publishYear: v.publishedDate?.slice(0, 4) || null,
    pages:       v.pageCount || null,
    seriesName,
    seriesNumber,
  };
}

// ── Merge best fields from both sources ──────────────────────────────────────
function mergeResults(isbn, ol, gb) {
  const p = ol || gb;   // primary (prefer OL for text data)
  const s = ol ? gb : null; // secondary

  // Prefer the source that has series data
  let seriesName   = ol?.seriesName   || gb?.seriesName   || null;
  let seriesNumber = ol?.seriesNumber ?? gb?.seriesNumber ?? null;

  // Prefer GB cover if OL's is just the placeholder fallback URL
  const cover = ol?.coverUrl && !ol.coverUrl.includes("isbn/")
    ? ol.coverUrl
    : (gb?.coverUrl || ol?.coverUrl || null);

  return {
    isbn,
    title:       p.title       || s?.title       || "Unknown Title",
    authors:     p.authors?.length ? p.authors : (s?.authors || []),
    coverUrl:    cover,
    publisher:   p.publisher   || s?.publisher   || null,
    publishYear: p.publishYear || s?.publishYear || null,
    pages:       p.pages       || s?.pages       || null,
    seriesName,
    seriesNumber,
    seriesTotal: null,
    isBindup:    false,
    bindupFrom:  null,
    bindupTo:    null,
  };
}

// ── Series string parsers ─────────────────────────────────────────────────────

// Parses strings like "Harry Potter #1" or "Harry Potter, Book 1"
function parseSeriesString(raw) {
  const patterns = [
    /^(.+?)\s*#\s*(\d+)$/,                          // Name #N
    /^(.+?),\s*(?:book|vol\.?|volume)\s*(\d+)$/i,   // Name, Book N
    /^(.+?)\s+(?:book|vol\.?|volume)\s*(\d+)$/i,    // Name Book N
  ];
  for (const p of patterns) {
    const m = raw.trim().match(p);
    if (m) return { name: m[1].trim(), num: parseInt(m[2]) };
  }
  return null;
}

// Parses series embedded in book titles, e.g. "Title (Series, #N)"
function parseSeriesFromTitle(title) {
  const patterns = [
    /\(([^,()]+),\s*#\s*(\d+)\)/,                              // (Series, #N)
    /\(([^()]+?),?\s*(?:book|vol\.?)\s*(\d+)\)/i,              // (Series, Book N)
    /:\s*([^:]+?),\s*(?:book|vol\.?)\s*(\d+)$/i,               // : Series, Book N
    /:\s*(?:book|vol\.?)\s*(\d+)\s+of\s+(.+)$/i,               // : Book N of Series (swap groups)
  ];
  for (const p of patterns) {
    const m = title.match(p);
    if (m) {
      // Handle the "Book N of Series" swap
      if (p.source.includes("of\\s+")) return { name: m[2].trim(), num: parseInt(m[1]) };
      return { name: m[1].trim(), num: parseInt(m[2]) };
    }
  }
  return null;
}
