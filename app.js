(() => {
  "use strict";

  const cfg = window.BOOKCLUB_CONFIG || {};
  const forms = cfg.forms || {};
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  const state = { books: [], q: "", genre: "", lang: "", sort: "recent", avail: false };

  /* ---------- helpers ---------- */

  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  const values = (v) => Array.isArray(v) ? v.map((x) => x && x.value).filter(Boolean) : [];
  const single = (v) => (v && typeof v === "object" ? v.value : v) || "";

  // Baserow form link with a field pre-filled (prefill_<Field+name>=value)
  function formUrl(key, prefill) {
    const base = forms[key];
    if (!base) return "";
    if (!prefill) return base;
    const params = Object.entries(prefill)
      .map(([field, val]) => `prefill_${encodeURIComponent(field).replace(/%20/g, "+")}=${encodeURIComponent(val)}`)
      .join("&");
    return base + (base.includes("?") ? "&" : "?") + params;
  }

  function wireFormLink(a, key, prefill) {
    const url = formUrl(key, prefill);
    if (url) {
      a.href = url;
      a.target = "_blank";
      a.rel = "noopener";
      a.removeAttribute("aria-disabled");
      a.title = "";
    } else {
      a.href = "#";
      a.setAttribute("aria-disabled", "true");
      a.title = "Coming soon";
    }
  }

  // Tiny markdown renderer for Baserow rich text (paragraphs, bullets, bold, italic)
  function renderMarkdown(md) {
    const inline = (s) => esc(s)
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/(^|[^*])\*(?!\s)(.+?)\*/g, "$1<em>$2</em>");
    const out = [];
    let list = null;
    for (const raw of String(md || "").split("\n")) {
      const line = raw.trim();
      const bullet = line.match(/^[-*]\s+(.*)$/);
      if (bullet) {
        if (!list) { list = []; }
        list.push(`<li>${inline(bullet[1])}</li>`);
        continue;
      }
      if (list) { out.push(`<ul>${list.join("")}</ul>`); list = null; }
      if (line) out.push(`<p>${inline(line)}</p>`);
    }
    if (list) out.push(`<ul>${list.join("")}</ul>`);
    return out.join("");
  }

  /* ---------- data ---------- */

  const cleanIsbn = (s) => String(s || "").toUpperCase().replace(/[^0-9X]/g, "");

  function normalise(r) {
    const scores = values(r["Rating Scores"]).map(Number).filter((n) => !isNaN(n));
    const avg = r["Average Score"] != null && r["Average Score"] !== ""
      ? Number(r["Average Score"])
      : scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null;

    // Availability: a live loan or request wins over the manual Status field
    const loans = values(r["Borrowing Statuses"]);
    const manual = single(r["Status"]);
    let status = "available";
    if (loans.includes("Borrowed") || manual === "Borrowed") status = "out";
    else if (loans.includes("Requested")) status = "requested";

    const cover = (r["Cover photo"] || []).find((f) => f.is_image !== false);

    return {
      id: r.id,
      order: Number(r.order) || r.id,
      title: r["Book title"] || "Untitled",
      synopsis: r["Synopsis"] || "",
      cover: cover ? cover.url
        : (r["Cover URL"] || "").trim()
        || (cleanIsbn(r["ISBN"]) ? `https://covers.openlibrary.org/b/isbn/${cleanIsbn(r["ISBN"])}-L.jpg?default=false` : ""),
      isbn: cleanIsbn(r["ISBN"]),
      format: single(r["Format"]),
      language: single(r["Language"]).replace(/^_not listed$/, ""),
      pages: r["Pages"] ? Number(r["Pages"]) : null,
      authors: (r["Author"] || "").trim()
        ? r["Author"].split(",").map((s) => s.trim()).filter(Boolean)
        : values(r["Author(s)"]),
      genres: values(r["Genre"]),
      owners: values(r["Owner"]),
      rating: avg,
      ratingCount: scores.length,
      status
    };
  }

  const api = () => cfg.baserowApi.replace(/\/$/, "");

  async function fetchTable(tableId) {
    let url = `${api()}/api/database/rows/table/${tableId}/?user_field_names=true&size=200`;
    const rows = [];
    while (url) {
      const res = await fetch(url, { headers: { Authorization: `Token ${cfg.baserowToken}` } });
      if (!res.ok) throw new Error(`Baserow returned ${res.status}`);
      const data = await res.json();
      rows.push(...data.results);
      url = data.next ? data.next.replace(/^http:/, "https:") : null;
    }
    return rows;
  }

  // Rows of a publicly shared grid view: only the fields visible in that view are ever sent
  async function fetchPublicView(link) {
    const slug = (link.match(/public\/grid\/([^/?#]+)/) || link.match(/([A-Za-z0-9_-]{20,})\/?$/) || [])[1];
    if (!slug) throw new Error("Members view link not recognised");
    const info = await fetch(`${api()}/api/database/views/${slug}/public/info/`).then((r) => r.json());
    const names = Object.fromEntries((info.fields || []).map((f) => [`field_${f.id}`, f.name]));
    const data = await fetch(`${api()}/api/database/views/grid/${slug}/public/rows/?size=200`).then((r) => r.json());
    return (data.results || []).map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [names[k] || k, v])));
  }

  async function fetchBooks() {
    if (!cfg.baserowToken) {
      const res = await fetch("data/sample.json");
      const data = await res.json();
      return { rows: data.results, sample: true };
    }
    let url = `${cfg.baserowApi.replace(/\/$/, "")}/api/database/rows/table/${cfg.catalogueTableId}/?user_field_names=true&size=200`;
    const rows = [];
    while (url) {
      const res = await fetch(url, { headers: { Authorization: `Token ${cfg.baserowToken}` } });
      if (!res.ok) throw new Error(`Baserow returned ${res.status}`);
      const data = await res.json();
      rows.push(...data.results);
      url = data.next ? data.next.replace(/^http:/, "https:") : null;
    }
    return { rows, sample: false };
  }

  /* ---------- rendering ---------- */

  const STATUS_LABEL = { available: "Available", out: "On loan", requested: "Requested" };
  const status = (b) => `<span class="status status--${b.status}">${STATUS_LABEL[b.status]}</span>`;
  const initial = (name) => esc(name.trim().charAt(0).toUpperCase() || "?");

  function stars(score, count) {
    if (score == null || isNaN(score)) return "";
    const full = Math.round(score);
    return `<span class="stars" aria-label="Rated ${score.toFixed(1)} out of 5 by ${count}">` +
      "★".repeat(full) + `<span>${"★".repeat(5 - full)}</span></span>`;
  }

  function coverHtml(b, eager) {
    const img = b.cover
      ? `<img src="${esc(b.cover)}" alt="" ${eager ? "" : 'loading="lazy"'} onerror="this.remove()">`
      : "";
    return `<div class="cover"><span class="cover__fallback">${esc(b.title)}</span>${img}</div>`;
  }

  function excerpt(md, n = 220) {
    const plain = String(md || "").replace(/\*\*|[*_#>`]/g, "").replace(/^\s*-\s+/gm, "").replace(/\s+/g, " ").trim();
    return plain.length > n ? plain.slice(0, plain.lastIndexOf(" ", n)) + "…" : plain;
  }

  function cardHtml(b) {
    return `<button class="book" type="button" data-id="${b.id}" aria-label="${esc(b.title)} by ${esc(b.authors.join(", "))}, ${STATUS_LABEL[b.status]}">
      ${coverHtml(b)}
      <div class="book__title">${esc(b.title)}</div>
      <div class="book__author">${esc(b.authors.join(", "))}</div>
      <div class="book__line">${status(b)}${stars(b.rating, b.ratingCount)}</div>
    </button>`;
  }

  function filtered() {
    const q = state.q.toLowerCase().trim();
    const list = state.books.filter((b) =>
      (!q || b.title.toLowerCase().includes(q) || b.authors.some((a) => a.toLowerCase().includes(q))) &&
      (!state.genre || b.genres.includes(state.genre)) &&
      (!state.lang || b.language === state.lang) &&
      (!state.avail || b.status === "available"));

    const by = {
      recent: (a, b) => b.order - a.order,
      rating: (a, b) => (b.rating ?? -1) - (a.rating ?? -1) || b.ratingCount - a.ratingCount,
      title: (a, b) => a.title.localeCompare(b.title, "en-GB"),
      short: (a, b) => (a.pages ?? 1e9) - (b.pages ?? 1e9)
    }[state.sort];
    return list.sort(by);
  }

  function renderGrid() {
    const list = filtered();
    const total = state.books.length;
    $("#count").textContent = list.length === total
      ? `${total} ${total === 1 ? "book" : "books"} to borrow from`
      : `${list.length} of ${total} books`;
    $("#grid").innerHTML = list.length
      ? list.map(cardHtml).join("")
      : `<p class="notice">Nothing matches that. Try clearing a filter.</p>`;
  }

  function renderFilters() {
    const fill = (sel, items) => {
      const el = $(sel);
      const first = el.options[0].outerHTML;
      el.innerHTML = first + items.map((v) => `<option>${esc(v)}</option>`).join("");
    };
    const uniq = (arr) => [...new Set(arr)].filter(Boolean).sort((a, b) => a.localeCompare(b, "en-GB"));
    fill("#genre", uniq(state.books.flatMap((b) => b.genres)));
    fill("#lang", uniq(state.books.map((b) => b.language)));
  }

  function renderHero() {
    const newest = [...state.books].filter((b) => b.cover).sort((a, b) => b.order - a.order).slice(0, 3);
    // Newest sits in the middle, on top
    const order = newest.length === 3 ? [newest[1], newest[0], newest[2]] : newest;
    $("#hero-stack").innerHTML = order.map((b) =>
      `<button type="button" data-open="${b.id}" aria-label="${esc(b.title)}">${coverHtml(b, true)}</button>`).join("");
  }

  function renderWishlist(rows) {
    const el = $("#wish-items");
    const items = rows
      .filter((r) => (r["Book title"] || "").trim())
      .sort((a, b) => b.id - a.id)
      .map((r) => {
        const by = values(r["Recommended by"]);
        return `<li>
          <h3>${esc(r["Book title"])}</h3>
          ${r["Author"] ? `<p class="wish__author">${esc(r["Author"])}</p>` : ""}
          ${r["Why read it"] ? `<p class="wish__why">${esc(r["Why read it"])}</p>` : ""}
          ${by.length ? `<p class="wish__by">Recommended by ${esc(by.join(", "))}</p>` : ""}
        </li>`;
      });
    el.innerHTML = items.length ? items.join("") : `<li class="empty">Nothing yet – be the first to recommend a book.</li>`;
  }

  function renderMembers(rows) {
    const monthYear = (d) => d ? new Date(d).toLocaleDateString("en-GB", { month: "long", year: "numeric" }) : "";
    const items = rows
      .filter((r) => (r["Username"] || "").trim())
      .map((r) => {
        const name = r["Username"].trim();
        const photo = (r["Profile photo"] || []).find((f) => f.is_image !== false);
        const since = monthYear(r["Joined Date"]);
        const shared = Array.isArray(r["Catalogue"]) ? r["Catalogue"].length : 0;
        return `<li>
          <div class="member__photo">${photo ? `<img src="${esc(photo.url)}" alt="" loading="lazy">` : initial(name)}</div>
          <strong>${esc(name)}</strong>
          ${since ? `<span>Member since ${esc(since)}</span>` : ""}
          ${shared ? `<span class="member__shared">${shared} ${shared === 1 ? "book" : "books"} shared</span>` : ""}
        </li>`;
      });
    $("#members-list").innerHTML = items.join("");
  }

  function openBook(id) {
    const b = state.books.find((x) => String(x.id) === String(id));
    if (!b) return;
    const facts = [b.language, b.format, b.pages ? `${b.pages} pages` : ""].filter(Boolean).join(" · ");
    const ratingLine = b.rating != null
      ? `${stars(b.rating, b.ratingCount)} <span>${b.ratingCount} ${b.ratingCount === 1 ? "rating" : "ratings"}</span>`
      : "";

    $("#d-body").innerHTML = `
      <div>${coverHtml(b, true)}</div>
      <div>
        <div class="tags">${b.genres.map((g) => `<span class="tag">${esc(g)}</span>`).join("")}</div>
        <h2 id="d-title">${esc(b.title)}</h2>
        <p class="featured__author">${esc(b.authors.join(", "))}</p>
        <p class="dialog__facts">${esc(facts)}${ratingLine ? `<br>${ratingLine}` : ""}</p>
        <div class="dialog__synopsis">${renderMarkdown(b.synopsis) || "<p>No synopsis yet.</p>"}</div>
        ${b.owners[0] ? `<div class="meta"><span class="avatar">${initial(b.owners[0])}</span>
          <span><strong>Shared by ${esc(b.owners.join(", "))}</strong>${status(b)}</span></div>` : ""}
        <div class="dialog__actions">
          <a class="button" data-dialog-form="borrow">${b.status === "available" ? "Borrow this book" : "Ask for it next"}</a>
          <a class="button button--quiet" data-dialog-form="rate">Rate it</a>
        </div>
        <p class="dialog__hint">Borrowing is for members. New here? <a data-dialog-form="join">Join the club</a>.</p>
      </div>`;

    wireFormLink($('[data-dialog-form="borrow"]'), "borrow", { Books: b.title });
    wireFormLink($('[data-dialog-form="rate"]'), "rate", { Book: b.title });
    wireFormLink($('[data-dialog-form="join"]'), "join");

    const dlg = $("#book-dialog");
    if (!dlg.open) dlg.showModal();
    history.replaceState(null, "", `${location.pathname}#book-${b.id}`);
  }

  function skeleton(el, n = 4) {
    if (!el) return;
    el.innerHTML = Array.from({ length: n }, () =>
      `<div class="skeleton"><div class="cover"></div><div class="bar" style="width:80%"></div><div class="bar" style="width:50%"></div></div>`).join("");
  }

  function renderLatest() {
    const el = $("#grid-latest");
    if (!el) return;
    const newest = [...state.books].sort((a, b) => b.order - a.order).slice(0, 4);
    el.innerHTML = newest.map(cardHtml).join("");
  }

  /* ---------- wiring ---------- */

  const on = (sel, ev, fn) => { const el = $(sel); if (el) el.addEventListener(ev, fn); };

  function bind() {
    $$("[data-club-name]").forEach((el) => (el.textContent = cfg.clubName || "Book Club"));
    const page = document.body.dataset.page;
    const titles = { books: "Books", wishlist: "Wish list", members: "Members", about: "About", add: "Add a book" };
    document.title = titles[page] ? `${titles[page]} – ${cfg.clubName}` : cfg.clubName || document.title;
    $$(".nav a[data-page]").forEach((a) => { if (a.dataset.page === page) a.setAttribute("aria-current", "page"); });
    if ($("#year")) $("#year").textContent = new Date().getFullYear();
    $$("[data-form]").forEach((a) => wireFormLink(a, a.dataset.form));

    on("#q", "input", (e) => { state.q = e.target.value; renderGrid(); });
    on("#genre", "change", (e) => { state.genre = e.target.value; renderGrid(); });
    on("#lang", "change", (e) => { state.lang = e.target.value; renderGrid(); });
    on("#sort", "change", (e) => { state.sort = e.target.value; renderGrid(); });
    on("#avail", "change", (e) => { state.avail = e.target.checked; renderGrid(); });

    const openFrom = (e) => {
      const el = e.target.closest("[data-id], [data-open]");
      if (el) openBook(el.dataset.id || el.dataset.open);
    };
    on("#grid", "click", openFrom);
    on("#grid-latest", "click", openFrom);
    on("#hero-stack", "click", openFrom);

    on(".theme-toggle", "click", () => {
      const root = document.documentElement;
      const dark = root.getAttribute("data-theme") !== "dark";
      if (dark) root.setAttribute("data-theme", "dark"); else root.removeAttribute("data-theme");
      try { localStorage.setItem("theme", dark ? "dark" : "light"); } catch (e) {}
    });

    const dlg = $("#book-dialog");
    if (dlg) {
      $(".close", dlg).addEventListener("click", () => dlg.close());
      dlg.addEventListener("click", (e) => { if (e.target === dlg) dlg.close(); });
      dlg.addEventListener("close", () => {
        if (location.hash.startsWith("#book-")) history.replaceState(null, "", location.pathname);
      });
    }
  }

  function showNotice(text) {
    const n = $("#notice");
    if (!n) return;
    n.hidden = false;
    n.textContent = text;
  }

  async function loadBooks() {
    if (!$("#grid") && !$("#grid-latest") && !$("#hero-stack")) return;
    skeleton($("#grid"));
    skeleton($("#grid-latest"));
    try {
      const { rows, sample } = await fetchBooks();
      state.books = rows.map(normalise);
      if (sample) showNotice("Showing sample books until the Baserow token is added to config.js.");
    } catch (err) {
      console.error(err);
      ["#grid", "#grid-latest"].forEach((s) => { if ($(s)) $(s).innerHTML = ""; });
      showNotice("We couldn't load the catalogue just now. Please try again in a moment.");
      return;
    }
    if ($("#grid")) { renderFilters(); renderGrid(); }
    renderLatest();
    if ($("#hero-stack")) renderHero();

    const m = location.hash.match(/^#book-(\d+)$/);
    if (m) openBook(m[1]);
  }

  function loadWishlist() {
    if (!$("#wish-items")) return;
    if (!cfg.baserowToken || !cfg.wishListTableId) { renderWishlist([]); return; }
    fetchTable(cfg.wishListTableId).then(renderWishlist).catch((e) => {
      console.warn("Wish list not loaded", e);
      $("#wish-items").innerHTML = `<li class="empty">The wish list will appear here soon.</li>`;
    });
  }

  function loadMembers() {
    if (!$("#members-list")) return;
    const fail = (e) => {
      if (e) console.warn("Members not loaded", e);
      $("#members-list").innerHTML = `<li class="empty">The members list will appear here soon.</li>`;
    };
    if (!cfg.membersViewLink) { fail(); return; }
    fetchPublicView(cfg.membersViewLink).then(renderMembers).catch(fail);
  }


  /* ---------- ISBN lookup (Open Library, then Google Books for gaps) ---------- */

  const LANGS = { eng: "English", en: "English", spa: "Spanish", es: "Spanish", cat: "Catalan", ca: "Catalan",
    fre: "French", fra: "French", fr: "French", ger: "German", deu: "German", de: "German",
    ita: "Italian", it: "Italian", por: "Portuguese", pt: "Portuguese" };

  const getJson = (url) => fetch(url).then((r) => (r.ok ? r.json() : null)).catch(() => null);

  function imageExists(url) {
    return new Promise((resolve) => {
      if (!url) return resolve(false);
      const img = new Image();
      img.onload = () => resolve(img.naturalWidth > 1);
      img.onerror = () => resolve(false);
      img.src = url;
    });
  }

  async function fromOpenLibrary(isbn) {
    const ed = await getJson(`https://openlibrary.org/isbn/${isbn}.json`);
    if (!ed) return null;
    const out = { title: ed.title || "", pages: ed.number_of_pages || null, authors: [], synopsis: "", language: "" };
    if (ed.subtitle) out.title += `: ${ed.subtitle}`;
    const langKey = ((ed.languages || [])[0] || {}).key;
    if (langKey) out.language = LANGS[langKey.split("/").pop()] || langKey.split("/").pop();
    const workKey = ((ed.works || [])[0] || {}).key;
    const work = workKey ? await getJson(`https://openlibrary.org${workKey}.json`) : null;
    const desc = (ed.description || (work && work.description));
    out.synopsis = typeof desc === "string" ? desc : (desc && desc.value) || "";
    const authorKeys = (ed.authors || (work && work.authors && work.authors.map((a) => a.author)) || []).map((a) => a && a.key).filter(Boolean);
    const people = await Promise.all(authorKeys.slice(0, 4).map((k) => getJson(`https://openlibrary.org${k}.json`)));
    out.authors = people.filter(Boolean).map((p) => p.name).filter(Boolean);
    const coverUrl = `https://covers.openlibrary.org/b/isbn/${isbn}-L.jpg?default=false`;
    out.cover = (await imageExists(coverUrl)) ? coverUrl : "";
    return out;
  }

  async function fromGoogle(isbn) {
    const data = await getJson(`https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}`);
    const v = data && data.items && data.items[0] && data.items[0].volumeInfo;
    if (!v) return null;
    const tmp = document.createElement("div");
    tmp.innerHTML = v.description || "";
    const img = v.imageLinks && (v.imageLinks.thumbnail || v.imageLinks.smallThumbnail);
    return {
      title: [v.title, v.subtitle].filter(Boolean).join(": "),
      authors: v.authors || [],
      pages: v.pageCount || null,
      synopsis: tmp.textContent.trim(),
      language: LANGS[v.language] || v.language || "",
      cover: img ? img.replace(/^http:/, "https:").replace("&edge=curl", "") : ""
    };
  }

  async function lookupIsbn(isbn) {
    const [ol, g] = await Promise.all([fromOpenLibrary(isbn), fromGoogle(isbn)]);
    if (!ol && !g) return null;
    const a = ol || {}, b = g || {};
    return {
      isbn,
      title: a.title || b.title || "",
      authors: (a.authors && a.authors.length ? a.authors : b.authors) || [],
      pages: a.pages || b.pages || null,
      synopsis: (b.synopsis && b.synopsis.length > (a.synopsis || "").length ? b.synopsis : a.synopsis) || "",
      language: a.language || b.language || "",
      cover: a.cover || b.cover || "",
      sources: [ol && "Open Library", g && "Google Books"].filter(Boolean)
    };
  }

  function bindAddPage() {
    const formEl = $("#isbn-form");
    if (!formEl) return;
    const out = $("#isbn-result");
    const knownLangs = ["English", "Spanish"];

    formEl.addEventListener("submit", async (e) => {
      e.preventDefault();
      const isbn = cleanIsbn($("#isbn").value);
      if (isbn.length !== 10 && isbn.length !== 13) {
        out.innerHTML = `<p class="notice">That doesn't look like an ISBN. It's the 10 or 13-digit number on the back cover, near the barcode.</p>`;
        return;
      }
      out.innerHTML = `<p class="count">Looking it up…</p>`;
      if (!state.books.length) {
        try { state.books = (await fetchBooks()).rows.map(normalise); } catch (err) { /* duplicate check is optional */ }
      }
      const book = await lookupIsbn(isbn);
      if (!book) {
        out.innerHTML = `<p class="notice">We couldn't find that ISBN in Open Library or Google Books. You can still <a data-form="addBook" href="#">add the book by hand</a>.</p>`;
        $$("[data-form]", out).forEach((a) => wireFormLink(a, a.dataset.form));
        return;
      }

      const dup = state.books.find((b) => b.isbn === isbn || b.title.toLowerCase() === book.title.toLowerCase());
      const langListed = knownLangs.includes(book.language);
      const shelf = { "ISBN": isbn, "Book title": book.title };
      if (book.authors.length) shelf["Author"] = book.authors.join(", ");
      if (book.synopsis) shelf["Synopsis"] = book.synopsis.slice(0, 1800);
      if (book.pages) shelf["Pages"] = book.pages;
      if (book.language) { if (langListed) shelf["Language"] = book.language; else shelf["Suggested Language"] = book.language; }
      if (book.cover) shelf["Cover URL"] = book.cover;

      const preview = { id: "preview", title: book.title, authors: book.authors, cover: book.cover };
      const facts = [book.language, book.pages ? `${book.pages} pages` : ""].filter(Boolean).join(" · ");
      out.innerHTML = `<article class="lookup">
        <div class="lookup__cover">${coverHtml(preview, true)}</div>
        <div>
          <h2>${esc(book.title)}</h2>
          <p class="featured__author">${esc(book.authors.join(", ") || "Author not found")}</p>
          ${facts ? `<p class="dialog__facts">${esc(facts)}</p>` : ""}
          <p class="dialog__synopsis">${esc(excerpt(book.synopsis, 400)) || "<em>No synopsis found – you can add one on the form.</em>"}</p>
          ${dup ? `<p class="notice">"${esc(dup.title)}" is already on the shelves. You can still add your copy.</p>` : ""}
          <div class="dialog__actions">
            <a class="button" data-lookup="addBook">I own it – add it to the shelves</a>
            <a class="button button--quiet" data-lookup="recommend">I want to read it – add to the wish list</a>
          </div>
          <p class="dialog__hint">Details from ${esc(book.sources.join(" and "))}. Anything missing or wrong can be fixed on the form.</p>
        </div>
      </article>`;
      wireFormLink($('[data-lookup="addBook"]', out), "addBook", shelf);
      wireFormLink($('[data-lookup="recommend"]', out), "recommend", { "Book title": book.title, "Author": book.authors.join(", ") });
    });
  }

  function init() {
    bind();
    loadBooks();
    loadWishlist();
    loadMembers();
    bindAddPage();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
