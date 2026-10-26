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

  function stars(score) {
    if (score == null || isNaN(score)) return `<span class="unrated">Not yet rated</span>`;
    const full = Math.round(score);
    return `<span class="stars" aria-label="Rated ${score.toFixed(1)} out of 5">` +
      "★".repeat(full) + `<span class="off">${"★".repeat(5 - full)}</span></span>`;
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

  function coverHtml(b, eager) {
    const img = b.cover
      ? `<img src="${esc(b.cover)}" alt="" ${eager ? "" : 'loading="lazy"'} onerror="this.remove()">`
      : "";
    return `<div class="cover"><span class="fallback">${esc(b.title)}</span>${img}</div>`;
  }

  function cardHtml(b) {
    return `<button class="card" type="button" data-id="${b.id}" aria-label="${esc(b.title)}, ${STATUS_LABEL[b.status]}">
      <div style="position:relative">
        <span class="badge ${b.status}">${STATUS_LABEL[b.status]}</span>
        ${coverHtml(b)}
      </div>
      <div class="card-title">${esc(b.title)}</div>
      <div class="card-meta">${esc(b.authors.join(", "))}</div>
      <div>${stars(b.rating)}</div>
    </button>`;
  }

  function filtered() {
    const q = state.q.toLowerCase().trim();
    let list = state.books.filter((b) =>
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
    $("#grid").innerHTML = list.map(cardHtml).join("");
    const total = state.books.length;
    $("#count").textContent = list.length === total
      ? `${total} ${total === 1 ? "book" : "books"} on the shelves`
      : `Showing ${list.length} of ${total} books`;
    if (!list.length && total) {
      $("#grid").innerHTML = `<p class="notice">Nothing matches that. Try clearing a filter.</p>`;
    }
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

  function renderShelves() {
    const counts = new Map();
    for (const b of state.books) for (const o of b.owners) counts.set(o, (counts.get(o) || 0) + 1);
    const list = [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    $("#shelf-list").innerHTML = list.length
      ? list.map(([name, n]) => `<li><span class="avatar">${esc(name.charAt(0).toUpperCase())}</span>
          <span><strong>${esc(name)}</strong><span class="count">Sharing ${n} ${n === 1 ? "book" : "books"}</span></span></li>`).join("")
      : `<li>No shelves yet – be the first to add a book.</li>`;
  }

  function renderHero() {
    const picks = [...state.books].filter((b) => b.cover)
      .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0)).slice(0, 3);
    $("#hero-stack").innerHTML = picks.map((b) => `<img src="${esc(b.cover)}" alt="" onerror="this.remove()">`).join("");
  }

  function openBook(id) {
    const b = state.books.find((x) => String(x.id) === String(id));
    if (!b) return;
    const facts = [
      ["Language", b.language], ["Format", b.format],
      ["Length", b.pages ? `${b.pages} pages` : ""], ["Shared by", b.owners.join(", ")]
    ].filter(([, v]) => v);

    $("#d-body").innerHTML = `
      <div>${coverHtml(b, true)}</div>
      <div>
        <span class="badge ${b.status}" style="position:static;display:inline-block;margin-bottom:12px">${STATUS_LABEL[b.status]}</span>
        <h2 id="d-title">${esc(b.title)}</h2>
        <p class="d-author">${esc(b.authors.join(", "))}</p>
        <div>${stars(b.rating)}${b.ratingCount ? ` <span class="muted">(${b.ratingCount} ${b.ratingCount === 1 ? "rating" : "ratings"})</span>` : ""}</div>
        <div class="chips">${b.genres.map((g) => `<span class="chip">${esc(g)}</span>`).join("")}</div>
        <dl class="facts">${facts.map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join("")}</dl>
        <div class="synopsis">${renderMarkdown(b.synopsis) || '<p class="muted">No synopsis yet.</p>'}</div>
        <div class="d-actions">
          <a class="btn" data-dialog-form="borrow">${b.status === "available" ? "Request to borrow" : "Join the queue"}</a>
          <a class="btn btn-ghost" data-dialog-form="rate">I've read it – rate it</a>
        </div>
        <p class="d-hint">Members only. Not a member yet? <a data-dialog-form="join">Join the club</a>.</p>
      </div>`;

    wireFormLink($('[data-dialog-form="borrow"]'), "borrow", { Books: b.title });
    wireFormLink($('[data-dialog-form="rate"]'), "rate", { Book: b.title });
    wireFormLink($('[data-dialog-form="join"]'), "join");

    const dlg = $("#book-dialog");
    if (!dlg.open) dlg.showModal();
    history.replaceState(null, "", `#book-${b.id}`);
  }

  function skeleton(n = 8) {
    $("#grid").innerHTML = Array.from({ length: n }, () =>
      `<div class="card skeleton"><div class="cover"></div><div class="bar" style="width:80%"></div><div class="bar" style="width:50%"></div></div>`).join("");
  }

  /* ---------- wiring ---------- */

  function bind() {
    $$("[data-club-name]").forEach((el) => (el.textContent = cfg.clubName || "Book Club"));
    if (cfg.clubName) document.title = cfg.clubName;
    $$("[data-form]").forEach((a) => wireFormLink(a, a.dataset.form));

    $("#q").addEventListener("input", (e) => { state.q = e.target.value; renderGrid(); });
    $("#genre").addEventListener("change", (e) => { state.genre = e.target.value; renderGrid(); });
    $("#lang").addEventListener("change", (e) => { state.lang = e.target.value; renderGrid(); });
    $("#sort").addEventListener("change", (e) => { state.sort = e.target.value; renderGrid(); });
    $("#avail").addEventListener("change", (e) => { state.avail = e.target.checked; renderGrid(); });

    $("#grid").addEventListener("click", (e) => {
      const card = e.target.closest(".card[data-id]");
      if (card) openBook(card.dataset.id);
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
        n.textContent = "Preview mode: showing sample books. Add the read-only Baserow token in config.js to show the live catalogue.";
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
    renderShelves();
    renderHero();

    const m = location.hash.match(/^#book-(\d+)$/);
    if (m) openBook(m[1]);
  }

  document.addEventListener("DOMContentLoaded", init);
})();
