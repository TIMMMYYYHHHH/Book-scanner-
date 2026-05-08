const OL_API    = "https://openlibrary.org/api/books";
const OL_COVERS = "https://covers.openlibrary.org/b/isbn";
const GB_API    = "https://www.googleapis.com/books/v1/volumes";

export async function fetchBookByIsbn(isbn) {
  const clean = isbn.replace(/[^0-9X]/gi, "");
  if (clean.length !== 10 && clean.length !== 13) {
    throw new Error("That doesn't look like a valid ISBN. Please check and try again.");
  }

  const [olResult, gbResult] = await Promise.allSettled([
    fetchOpenLibrary(clean),
    fetchGoogleBooks(clean)
  ]);

  const ol = olResult.status === "fulfilled" ? olResult.value : null;
  const gb = gbResult.status === "fulfilled" ? gbResult.value : null;

  if (!ol && !gb) throw new Error("Book not found. Check the ISBN and try again.");

  return mergeResults(clean, ol, gb);
}

async function fetchOpenLibrary(isbn) {
  const res = await fetch(`${OL_API}?bibkeys=ISBN:${isbn}&format=json&jscmd=data`);
  if (!res.ok) return null;
  const data = await res.json();
  const book = data[`ISBN:${isbn}`];
  if (!book) return null;

  let seriesName = null, seriesNumber = null;

  // Try to get series from the work record
  if (book.works?.[0]?.key) {
    try {
      const work = await fetch(`https://openlibrary.org${book.works[0].key}.json`).then(r => r.json());
      if (work.series?.length) {
        const raw = work.series[0];
        const m = raw.match(/^(.+?)\s*#?(\d+)$/);
        seriesName   = m ? m[1].trim() : raw;
        seriesNumber = m ? parseInt(m[2]) : null;
      }
    } catch { /* series info is optional */ }
  }

  // Fall back to parsing from title
  if (!seriesName) {
    const parsed = parseSeriesFromTitle(book.title || "");
    if (parsed) { seriesName = parsed.name; seriesNumber = parsed.num; }
  }

  return {
    title:       book.title || null,
    authors:     (book.authors || []).map(a => a.name).filter(Boolean),
    coverUrl:    book.cover?.large || book.cover?.medium || `${OL_COVERS}/${isbn}-L.jpg`,
    publisher:   book.publishers?.[0]?.name || null,
    publishYear: (book.publish_date || "").match(/\d{4}/)?.[0] || null,
    pages:       book.number_of_pages || null,
    seriesName,
    seriesNumber,
  };
}

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
    coverUrl = raw ? raw.replace("http://", "https://") : null;
  }

  let seriesName = null, seriesNumber = null;
  if (v.seriesInfo?.bookSeries?.[0]) {
    seriesName   = v.seriesInfo.bookSeries[0].seriesId || null;
    seriesNumber = v.seriesInfo.volumeSeries?.[0]?.orderNumber
                    ? parseInt(v.seriesInfo.volumeSeries[0].orderNumber)
                    : null;
  }
  if (!seriesName) {
    const parsed = parseSeriesFromTitle(v.title || "");
    if (parsed) { seriesName = parsed.name; seriesNumber = parsed.num; }
  }

  return {
    title:       v.title || null,
    authors:     v.authors || [],
    coverUrl,
    publisher:   v.publisher || null,
    publishYear: v.publishedDate?.slice(0, 4) || null,
    pages:       v.pageCount || null,
    seriesName,
    seriesNumber,
  };
}

function mergeResults(isbn, ol, gb) {
  const primary   = ol || gb;
  const secondary = ol ? gb : null;

  return {
    isbn,
    title:       primary.title       || secondary?.title       || "Unknown Title",
    authors:     primary.authors?.length ? primary.authors : (secondary?.authors || []),
    coverUrl:    primary.coverUrl    || secondary?.coverUrl    || null,
    publisher:   primary.publisher   || secondary?.publisher   || null,
    publishYear: primary.publishYear || secondary?.publishYear || null,
    pages:       primary.pages       || secondary?.pages       || null,
    seriesName:  primary.seriesName  || secondary?.seriesName  || null,
    seriesNumber:primary.seriesNumber ?? secondary?.seriesNumber ?? null,
    seriesTotal: null,
  };
}

function parseSeriesFromTitle(title) {
  const patterns = [
    /\(([^,()]+),\s*#?(\d+)\)/,          // (Series Name, #N)
    /\(([^()]+?)\s+(?:book|vol\.?|volume)\s*#?(\d+)\)/i,  // (Series Name Book N)
    /:\s*(.+?)\s+(?:book|vol\.?|volume)\s*#?(\d+)$/i,     // Title: Series Book N
  ];
  for (const pat of patterns) {
    const m = title.match(pat);
    if (m) return { name: m[1].trim(), num: parseInt(m[2]) };
  }
  return null;
}
