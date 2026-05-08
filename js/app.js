import { initializeApp }      from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import firebaseConfig          from "./config.js";
import { initAuth, signIn, signUp, signOut_, onAuthChange } from "./auth.js";
import { initDb, addBook, updateBook, deleteBook, getBookByIsbn, subscribeToBooks } from "./db.js";
import { fetchBookByIsbn }     from "./api.js";
import { createScanner }       from "./scanner.js";

// ─── Init ────────────────────────────────────────────────────────────────────
const fbApp = initializeApp(firebaseConfig);
initAuth(fbApp);

let allBooks        = [];
let unsubscribe     = null;
let scanner         = null;
let previewBook     = null; // book data shown in scan preview (not yet saved)
let scanCooldown    = false;
let lastScannedIsbn = null;

// ─── Auth UI ─────────────────────────────────────────────────────────────────
const authScreen  = $("auth-screen");
const appScreen   = $("app-screen");
const authForm    = $("auth-form");
const authBtn     = $("auth-btn");
const authError   = $("auth-error");

let authMode = "signin";

$$(".auth-tab").forEach(tab =>
  tab.addEventListener("click", () => {
    $$(".auth-tab").forEach(t => t.classList.remove("active"));
    tab.classList.add("active");
    authMode = tab.dataset.tab;
    authBtn.textContent = authMode === "signin" ? "Sign In" : "Create Account";
    authError.textContent = "";
  })
);

authForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = $("auth-email").value.trim();
  const pw    = $("auth-password").value;
  authBtn.disabled = true;
  authError.textContent = "";
  try {
    authMode === "signin" ? await signIn(email, pw) : await signUp(email, pw);
  } catch (err) {
    authError.textContent = friendlyError(err.code);
    authBtn.disabled = false;
  }
});

$("signout-btn").addEventListener("click", async () => {
  if (unsubscribe)  { unsubscribe();  unsubscribe = null; }
  if (scanner?.isRunning()) await scanner.stop();
  await signOut_();
});

onAuthChange(async (user) => {
  if (user) {
    initDb(fbApp, user.uid);
    authScreen.classList.add("hidden");
    appScreen.classList.remove("hidden");
    authBtn.disabled = false;
    startApp();
  } else {
    authScreen.classList.remove("hidden");
    appScreen.classList.add("hidden");
    if (unsubscribe) { unsubscribe(); unsubscribe = null; }
    allBooks = [];
  }
});

// ─── Navigation ──────────────────────────────────────────────────────────────
const PAGE_TITLES = {
  home: "My Library", scan: "Scan a Book",
  collection: "My Collection", series: "Series", authors: "Authors"
};

$$(".nav-btn").forEach(btn =>
  btn.addEventListener("click", () => navigateTo(btn.dataset.view))
);

function navigateTo(view) {
  if (view !== "scan" && scanner?.isRunning()) {
    scanner.stop();
    $("btn-start-scan").classList.remove("hidden");
    $("btn-stop-scan").classList.add("hidden");
  }

  $$(".nav-btn").forEach(b => b.classList.toggle("active", b.dataset.view === view));
  $$(".view").forEach(v => v.classList.toggle("hidden", v.id !== `view-${view}`));
  $("page-title").textContent = PAGE_TITLES[view] ?? "My Library";

  if (view === "home")       renderHome();
  if (view === "collection") renderCollection();
  if (view === "series")     renderSeries();
  if (view === "authors")    renderAuthors();
}

// ─── App start ───────────────────────────────────────────────────────────────
function startApp() {
  unsubscribe = subscribeToBooks((books) => {
    allBooks = books.sort((a, b) => (b.addedAt?.toMillis?.() ?? 0) - (a.addedAt?.toMillis?.() ?? 0));
    updateStats();
    const active = document.querySelector(".nav-btn.active")?.dataset.view;
    if (active === "home")       renderHome();
    if (active === "collection") renderCollection();
    if (active === "series")     renderSeries();
    if (active === "authors")    renderAuthors();
  });

  scanner = createScanner("reader", handleScannedIsbn);

  $("btn-start-scan").addEventListener("click", startCamera);
  $("btn-stop-scan").addEventListener("click",  stopCamera);
  $("btn-lookup").addEventListener("click", () => lookupIsbn($("isbn-input").value.trim()));
  $("isbn-input").addEventListener("keydown", (e) => {
    if (e.key === "Enter") lookupIsbn($("isbn-input").value.trim());
  });

  $("collection-search").addEventListener("input", renderCollection);
  $("collection-sort").addEventListener("change",  renderCollection);

  // Modals
  $$(".modal-close").forEach(b => b.addEventListener("click", closeAllModals));
  $$(".modal-overlay").forEach(o => o.addEventListener("click", closeAllModals));

  // Series form
  $("series-form").addEventListener("submit", saveSeriesForm);
  $("series-form").querySelector(".btn-clear-series").addEventListener("click", clearSeriesForm);

  renderHome();
}

// ─── Camera ──────────────────────────────────────────────────────────────────
async function startCamera() {
  try {
    await scanner.start();
    $("btn-start-scan").classList.add("hidden");
    $("btn-stop-scan").classList.remove("hidden");
  } catch (e) {
    toast("Camera error: " + e.message);
  }
}

async function stopCamera() {
  await scanner.stop();
  $("btn-start-scan").classList.remove("hidden");
  $("btn-stop-scan").classList.add("hidden");
}

async function handleScannedIsbn(isbn) {
  if (scanCooldown || isbn === lastScannedIsbn) return;
  scanCooldown    = true;
  lastScannedIsbn = isbn;
  setTimeout(() => { scanCooldown = false; }, 3500);

  await stopCamera();
  $("isbn-input").value = isbn;
  lookupIsbn(isbn);
}

// ─── ISBN lookup ─────────────────────────────────────────────────────────────
async function lookupIsbn(isbn) {
  if (!isbn) return;
  const preview = $("book-preview");
  preview.innerHTML = '<div class="spinner"></div>';
  preview.classList.remove("hidden");

  try {
    const existing = await getBookByIsbn(isbn);
    if (existing) {
      toast("Already in your collection! 📚");
      renderPreview(existing, true);
      return;
    }
    const book = await fetchBookByIsbn(isbn);
    previewBook = book;
    renderPreview(book, false);
  } catch (e) {
    preview.innerHTML = `<p class="empty-msg" style="padding:24px">❌ ${e.message}</p>`;
  }
}

function renderPreview(book, alreadyOwned) {
  const preview = $("book-preview");

  const coverHtml = coverImg(book.coverUrl, "preview-cover");

  const seriesHtml = book.seriesName
    ? `<div class="preview-series">📖 <strong>${esc(book.seriesName)}</strong>${book.seriesNumber ? ` — Book #${book.seriesNumber}` : ""}</div>`
    : "";

  const actionBtn = alreadyOwned
    ? `<button class="btn-secondary" id="preview-view-btn">View in Collection</button>`
    : `<button class="btn-primary"   id="preview-add-btn">Add to Collection ✓</button>`;

  preview.innerHTML = `
    <div class="preview-inner">
      <div class="preview-cover">${coverHtml}</div>
      <div class="preview-details">
        <div class="preview-title">${esc(book.title)}</div>
        <div class="preview-author">${esc((book.authors || []).join(", ") || "Unknown Author")}</div>
        <div class="preview-meta">
          ${book.publisher  ? esc(book.publisher)  + "<br>" : ""}
          ${book.publishYear ? "Published: " + book.publishYear : ""}
          ${book.pages       ? " · " + book.pages + " pages" : ""}
        </div>
      </div>
    </div>
    ${seriesHtml}
    <div class="preview-actions">
      ${actionBtn}
      <button class="btn-secondary" id="preview-series-btn">✏️ Series</button>
    </div>
  `;

  if (alreadyOwned) {
    $("preview-view-btn")?.addEventListener("click", () => {
      navigateTo("collection");
      $("book-preview").classList.add("hidden");
    });
  } else {
    $("preview-add-btn")?.addEventListener("click", addPreviewBook);
  }
  $("preview-series-btn")?.addEventListener("click", () => openSeriesModal(null, book));
}

async function addPreviewBook() {
  if (!previewBook) return;
  const btn = $("preview-add-btn");
  if (btn) { btn.disabled = true; btn.textContent = "Adding…"; }

  try {
    await addBook(previewBook);
    toast("✅ Added to your collection!");
    $("book-preview").classList.add("hidden");
    $("isbn-input").value = "";
    lastScannedIsbn = null;
    previewBook = null;
    navigateTo("collection");
  } catch (e) {
    toast("Error adding book — please try again.");
    if (btn) { btn.disabled = false; btn.textContent = "Add to Collection ✓"; }
  }
}

// ─── Stats ───────────────────────────────────────────────────────────────────
function updateStats() {
  $("stat-books").textContent   = allBooks.length;
  $("stat-series").textContent  = new Set(allBooks.filter(b => b.seriesName).map(b => b.seriesName)).size;
  $("stat-missing").textContent = countMissing();
  $("stat-authors").textContent = new Set(allBooks.flatMap(b => b.authors || []).filter(Boolean)).size;
}

function countMissing() {
  let n = 0;
  for (const [, s] of buildSeriesMap()) {
    if (s.total > 0) n += Math.max(0, s.total - s.owned.size);
  }
  return n;
}

function buildSeriesMap() {
  const map = new Map();
  for (const book of allBooks) {
    if (!book.seriesName) continue;
    if (!map.has(book.seriesName)) map.set(book.seriesName, { total: 0, owned: new Set(), books: [] });
    const s = map.get(book.seriesName);
    if (book.seriesNumber) s.owned.add(book.seriesNumber);
    if (book.seriesTotal && book.seriesTotal > s.total) s.total = book.seriesTotal;
    s.books.push(book);
  }
  return map;
}

// ─── Home ────────────────────────────────────────────────────────────────────
function renderHome() {
  const grid   = $("recent-grid");
  const recent = allBooks.slice(0, 8);

  if (!recent.length) {
    grid.innerHTML = `<p class="empty-msg" style="grid-column:1/-1">Scan your first book to get started! 📚</p>`;
    return;
  }
  grid.innerHTML = recent.map(bookCardHtml).join("");
  grid.querySelectorAll(".book-card").forEach(c =>
    c.addEventListener("click", () => openBookModal(c.dataset.id))
  );
}

// ─── Collection ──────────────────────────────────────────────────────────────
function renderCollection() {
  const search = $("collection-search").value.toLowerCase();
  const sort   = $("collection-sort").value;

  let books = allBooks.filter(b =>
    !search ||
    b.title?.toLowerCase().includes(search) ||
    (b.authors || []).some(a => a.toLowerCase().includes(search)) ||
    b.seriesName?.toLowerCase().includes(search)
  );

  books.sort((a, b) => {
    if (sort === "title")  return (a.title  || "").localeCompare(b.title  || "");
    if (sort === "author") return ((a.authors?.[0]) || "").localeCompare((b.authors?.[0]) || "");
    if (sort === "series") return (a.seriesName || "zzz").localeCompare(b.seriesName || "zzz");
    return (b.addedAt?.toMillis?.() ?? 0) - (a.addedAt?.toMillis?.() ?? 0);
  });

  const grid  = $("collection-grid");
  const empty = $("collection-empty");

  if (!books.length) {
    grid.innerHTML = "";
    empty.classList.remove("hidden");
    return;
  }
  empty.classList.add("hidden");
  grid.innerHTML = books.map(bookCardHtml).join("");
  grid.querySelectorAll(".book-card").forEach(c =>
    c.addEventListener("click", () => openBookModal(c.dataset.id))
  );
}

// ─── Series ──────────────────────────────────────────────────────────────────
function renderSeries() {
  const container = $("series-list");
  const empty     = $("series-empty");
  const seriesMap = buildSeriesMap();

  if (!seriesMap.size) {
    container.innerHTML = "";
    empty.classList.remove("hidden");
    return;
  }
  empty.classList.add("hidden");

  const entries = [...seriesMap.entries()].sort(([a], [b]) => a.localeCompare(b));

  container.innerHTML = entries.map(([name, info]) => {
    const total  = info.total;
    const owned  = info.owned;
    const pct    = total > 0 ? Math.round((owned.size / total) * 100) : 100;

    // Numbered chips
    let chips = "";
    if (total > 0) {
      for (let i = 1; i <= total; i++) {
        const book = info.books.find(b => b.seriesNumber === i);
        if (book) {
          chips += `<span class="series-chip chip-owned" data-id="${book.id}" title="${esc(book.title)}">#${i} ✓</span>`;
        } else {
          chips += `<span class="series-chip chip-missing" title="Missing">#${i} ✗</span>`;
        }
      }
    }
    // Books without a series number
    info.books.filter(b => !b.seriesNumber).forEach(b => {
      chips += `<span class="series-chip chip-owned" data-id="${b.id}" title="${esc(b.title)}">📚 ?</span>`;
    });

    const missingCount = total > 0 ? total - owned.size : 0;
    const footer = total === 0
      ? `<div class="series-set-total">Set the total in a book's series editor to track missing ones — <button data-open-series="${info.books[0]?.id}">Edit now</button></div>`
      : missingCount > 0
        ? `<div class="series-footer incomplete">Missing ${missingCount} book${missingCount > 1 ? "s" : ""}</div>`
        : `<div class="series-footer complete">✓ Complete!</div>`;

    const progressBar = total > 0
      ? `<div class="series-progress-bar"><div class="series-progress-fill" style="width:${pct}%"></div></div>`
      : "";

    return `
      <div class="series-item">
        <div class="series-header">
          <div class="series-name">${esc(name)}</div>
          <div class="series-count-badge">${owned.size}${total > 0 ? `/${total}` : ""} owned</div>
        </div>
        ${progressBar}
        <div class="series-books-row">${chips}</div>
        ${footer}
      </div>
    `;
  }).join("");

  // Owned chip → book modal
  container.querySelectorAll(".chip-owned[data-id]").forEach(chip =>
    chip.addEventListener("click", () => openBookModal(chip.dataset.id))
  );
  // "Edit now" button
  container.querySelectorAll("[data-open-series]").forEach(btn =>
    btn.addEventListener("click", () => {
      const book = allBooks.find(b => b.id === btn.dataset.openSeries);
      if (book) openSeriesModal(book.id, book);
    })
  );
}

// ─── Authors ─────────────────────────────────────────────────────────────────
function renderAuthors() {
  const container = $("authors-list");
  const empty     = $("authors-empty");

  const map = new Map();
  for (const book of allBooks) {
    for (const author of (book.authors || [])) {
      if (!author) continue;
      if (!map.has(author)) map.set(author, []);
      map.get(author).push(book);
    }
  }

  if (!map.size) {
    container.innerHTML = "";
    empty.classList.remove("hidden");
    return;
  }
  empty.classList.add("hidden");

  const entries = [...map.entries()].sort(([a], [b]) => a.localeCompare(b));

  container.innerHTML = entries.map(([author, books]) => {
    const rows = books
      .sort((a, b) => {
        if (a.seriesName && b.seriesName && a.seriesName === b.seriesName) {
          return (a.seriesNumber ?? 999) - (b.seriesNumber ?? 999);
        }
        return (a.title || "").localeCompare(b.title || "");
      })
      .map(b => {
        const badge = b.seriesName
          ? `<span class="author-book-series">${esc(b.seriesName)}${b.seriesNumber ? ` #${b.seriesNumber}` : ""}</span>`
          : "";
        return `<div class="author-book-row" data-id="${b.id}">📖 ${esc(b.title)} ${badge}</div>`;
      }).join("");

    return `
      <div class="author-item">
        <div class="author-header">
          <div class="author-name">${esc(author)}</div>
          <div style="display:flex;align-items:center;gap:6px">
            <div class="author-count">${books.length} book${books.length > 1 ? "s" : ""}</div>
            <span class="author-chevron">▼</span>
          </div>
        </div>
        <div class="author-books">${rows}</div>
      </div>
    `;
  }).join("");

  container.querySelectorAll(".author-item").forEach(item => {
    item.addEventListener("click", (e) => {
      const row = e.target.closest(".author-book-row");
      if (row) { openBookModal(row.dataset.id); return; }
      item.classList.toggle("expanded");
    });
  });
}

// ─── Book card HTML ──────────────────────────────────────────────────────────
function bookCardHtml(book) {
  const cover  = coverImg(book.coverUrl, "book-cover");
  const badge  = book.seriesName
    ? `<div class="book-series-badge">${esc(book.seriesName)}${book.seriesNumber ? ` #${book.seriesNumber}` : ""}</div>`
    : "";
  return `
    <div class="book-card" data-id="${book.id}">
      ${cover}
      <div class="book-info">
        <div class="book-title">${esc(book.title)}</div>
        <div class="book-author">${esc((book.authors || []).join(", ") || "Unknown")}</div>
        ${badge}
      </div>
    </div>
  `;
}

// ─── Book detail modal ───────────────────────────────────────────────────────
function openBookModal(bookId) {
  const book = allBooks.find(b => b.id === bookId);
  if (!book) return;

  const meta = [
    book.seriesName   ? { l: "Series",    v: `${esc(book.seriesName)}${book.seriesNumber ? ` #${book.seriesNumber}` : ""}` } : null,
    book.seriesTotal  ? { l: "Total",     v: `${book.seriesTotal} books in series` } : null,
    book.publisher    ? { l: "Publisher", v: esc(book.publisher) } : null,
    book.publishYear  ? { l: "Year",      v: book.publishYear } : null,
    book.pages        ? { l: "Pages",     v: book.pages } : null,
    { l: "ISBN",        v: book.isbn },
  ].filter(Boolean);

  const cover = coverImg(book.coverUrl, "modal-cover");

  $("modal-content").innerHTML = `
    <div class="modal-book">
      <div class="modal-cover-wrap"><div class="modal-cover">${cover}</div></div>
      <div class="modal-book-title">${esc(book.title)}</div>
      <div class="modal-book-author">${esc((book.authors || []).join(", ") || "Unknown Author")}</div>
      ${meta.length ? `<div class="modal-meta-grid">${meta.map(m => `
        <div class="modal-meta-item">
          <div class="modal-meta-label">${m.l}</div>
          <div class="modal-meta-value">${m.v}</div>
        </div>`).join("")}</div>` : ""}
      <div class="modal-actions">
        <button class="btn-edit"   id="modal-edit-series">✏️ Edit Series Info</button>
        <button class="btn-danger" id="modal-delete">🗑 Remove from Collection</button>
      </div>
    </div>
  `;

  $("book-modal").classList.remove("hidden");

  $("modal-edit-series").addEventListener("click", () => {
    closeAllModals();
    openSeriesModal(book.id, book);
  });

  $("modal-delete").addEventListener("click", async () => {
    if (!confirm(`Remove "${book.title}" from your collection?`)) return;
    await deleteBook(book.id);
    closeAllModals();
    toast("📕 Removed from collection.");
  });
}

// ─── Series modal ────────────────────────────────────────────────────────────
function openSeriesModal(bookId, book) {
  $("series-book-id").value     = bookId || "";
  $("series-name-input").value  = book?.seriesName   || "";
  $("series-num-input").value   = book?.seriesNumber || "";
  $("series-total-input").value = book?.seriesTotal  || "";
  $("series-modal").classList.remove("hidden");
}

async function saveSeriesForm(e) {
  e.preventDefault();
  const bookId      = $("series-book-id").value;
  const seriesName  = $("series-name-input").value.trim()      || null;
  const seriesNumber= parseInt($("series-num-input").value)    || null;
  const seriesTotal = parseInt($("series-total-input").value)  || null;
  const updates     = { seriesName, seriesNumber, seriesTotal };

  if (bookId) {
    await updateBook(bookId, updates);
    toast("✅ Series info updated!");
  } else if (previewBook) {
    Object.assign(previewBook, updates);
    renderPreview(previewBook, false);
  }
  closeAllModals();
}

async function clearSeriesForm() {
  const bookId = $("series-book-id").value;
  if (bookId) {
    await updateBook(bookId, { seriesName: null, seriesNumber: null, seriesTotal: null });
    toast("Series info cleared.");
  } else if (previewBook) {
    previewBook.seriesName = null;
    previewBook.seriesNumber = null;
    previewBook.seriesTotal = null;
    renderPreview(previewBook, false);
  }
  closeAllModals();
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function closeAllModals() {
  $("book-modal").classList.add("hidden");
  $("series-modal").classList.add("hidden");
}

function coverImg(url, cls) {
  if (url) {
    return `<img class="${cls}" src="${url}" alt="Book cover" loading="lazy"
      onerror="this.outerHTML='<div class=\\"book-cover-placeholder\\">📚</div>'">`;
  }
  return `<div class="book-cover-placeholder">📚</div>`;
}

function esc(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g,  "&amp;")
    .replace(/</g,  "&lt;")
    .replace(/>/g,  "&gt;")
    .replace(/"/g,  "&quot;")
    .replace(/'/g,  "&#39;");
}

let _toastTimer;
function toast(msg) {
  const el = $("toast");
  el.textContent = msg;
  el.classList.remove("hidden");
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => el.classList.add("hidden"), 3200);
}

function friendlyError(code) {
  return {
    "auth/user-not-found":       "No account found with that email.",
    "auth/wrong-password":       "Incorrect password.",
    "auth/email-already-in-use": "That email is already registered.",
    "auth/weak-password":        "Password must be at least 6 characters.",
    "auth/invalid-email":        "Please enter a valid email address.",
    "auth/too-many-requests":    "Too many attempts — please try again later.",
    "auth/invalid-credential":   "Incorrect email or password.",
  }[code] ?? "Something went wrong. Please try again.";
}

const $  = (id)  => document.getElementById(id);
const $$ = (sel) => document.querySelectorAll(sel);
