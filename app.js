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
      cover: cover ? cover.url : "",
      format: single(r["Format"]),
      language: single(r["Language"]).replace(/^_not listed$/, ""),
      pages: r["Pages"] ? Number(r["Pages"]) : null,
      authors: values(r["Author(s)"]),
      genres: values(r["Genre"]),
      owners: values(r["Owner"]),
      rating: avg,
      ratingCount: scores.length,
      status
    };
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

  function renderFeatured() {
    const pool = [...state.books].sort((a, b) => b.order - a.order);
    const b = pool.find((x) => x.status === "available" && x.cover) || pool[0];
    if (!b) { $("#featured").innerHTML = ""; return; }
    const owner = b.owners[0];
    $("#featured").innerHTML = `<article class="featured">
      <a class="featured__cover" href="#book-${b.id}" data-open="${b.id}" tabindex="-1" aria-hidden="true">${coverHtml(b, true)}</a>
      <div>
        <p class="featured__label">Newest on the shelves</p>
        <div class="tags">${b.genres.slice(0, 3).map((g) => `<span class="tag">${esc(g)}</span>`).join("")}</div>
        <h2 class="featured__title"><a href="#book-${b.id}" data-open="${b.id}">${esc(b.title)}</a></h2>
        <p class="featured__author">${esc(b.authors.join(", "))}</p>
        <p class="featured__excerpt">${esc(excerpt(b.synopsis))}</p>
        ${owner ? `<div class="meta"><span class="avatar">${initial(owner)}</span>
          <span><strong>Shared by ${esc(owner)}</strong>${status(b)}</span></div>` : ""}
      </div>
    </article>`;
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
    history.replaceState(null, "", `#book-${b.id}`);
  }

  function skeleton(n = 4) {
    $("#grid").innerHTML = Array.from({ length: n }, () =>
      `<div class="skeleton"><div class="cover"></div><div class="bar" style="width:80%"></div><div class="bar" style="width:50%"></div></div>`).join("");
  }

  /* ---------- wiring ---------- */

  function bind() {
    $$("[data-club-name]").forEach((el) => (el.textContent = cfg.clubName || "Book Club"));
    if (cfg.clubName) document.title = cfg.clubName;
    $("#year").textContent = new Date().getFullYear();
    $$("[data-form]").forEach((a) => wireFormLink(a, a.dataset.form));

    $("#q").addEventListener("input", (e) => { state.q = e.target.value; renderGrid(); });
    $("#genre").addEventListener("change", (e) => { state.genre = e.target.value; renderGrid(); });
    $("#lang").addEventListener("change", (e) => { state.lang = e.target.value; renderGrid(); });
    $("#sort").addEventListener("change", (e) => { state.sort = e.target.value; renderGrid(); });
    $("#avail").addEventListener("change", (e) => { state.avail = e.target.checked; renderGrid(); });

    $("#grid").addEventListener("click", (e) => {
      const card = e.target.closest(".book[data-id]");
      if (card) openBook(card.dataset.id);
    });
    $("#featured").addEventListener("click", (e) => {
      const link = e.target.closest("[data-open]");
      if (link) { e.preventDefault(); openBook(link.dataset.open); }
    });

    $(".theme-toggle").addEventListener("click", () => {
      const root = document.documentElement;
      const dark = root.getAttribute("data-theme") !== "dark";
      if (dark) root.setAttribute("data-theme", "dark"); else root.removeAttribute("data-theme");
      try { localStorage.setItem("theme", dark ? "dark" : "light"); } catch (e) {}
    });

    const dlg = $("#book-dialog");
    $(".close", dlg).addEventListener("click", () => dlg.close());
    dlg.addEventListener("click", (e) => { if (e.target === dlg) dlg.close(); });
    dlg.addEventListener("close", () => {
      if (location.hash.startsWith("#book-")) history.replaceState(null, "", "#books");
    });
  }

  async function init() {
    bind();
    skeleton();
    try {
      const { rows, sample } = await fetchBooks();
      state.books = rows.map(normalise);
      if (sample) {
        const n = $("#notice");
        n.hidden = false;
        n.textContent = "Showing sample books until the Baserow token is added to config.js.";
      }
    } catch (err) {
      console.error(err);
      $("#grid").innerHTML = "";
      const n = $("#notice");
      n.hidden = false;
      n.textContent = "We couldn't load the catalogue just now. Please try again in a moment.";
      return;
    }
    renderFilters();
    renderGrid();
    renderFeatured();

    const m = location.hash.match(/^#book-(\d+)$/);
    if (m) openBook(m[1]);
  }

  document.addEventListener("DOMContentLoaded", init);
})();
