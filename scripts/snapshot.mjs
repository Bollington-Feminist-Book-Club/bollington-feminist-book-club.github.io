// Copies the catalogue and borrowings from Baserow into data/snapshot.json, and every book's cover
// into assets/covers/, so the website can show them straight from GitHub without waiting on Baserow,
// Google or Open Library. Run by the deploy workflow every 30 minutes and on every push.
//
// Reads the read-only token, table IDs and Google Books key from config.js. Uses only Node 20 and sharp.

import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import crypto from "node:crypto";
import sharp from "sharp";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const SITE = "https://bollington-feminist-book-club.github.io/";
const COVER_DIR = path.join(ROOT, "assets", "covers");
const SNAPSHOT = path.join(ROOT, "data", "snapshot.json");
const SOURCES = path.join(ROOT, "data", "cover-sources.json"); // which picture each cover came from

const sandbox = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(ROOT, "config.js"), "utf8"), sandbox);
const cfg = sandbox.window.BOOKCLUB_CONFIG;
const API = cfg.baserowApi.replace(/\/$/, "");

async function table(id) {
  let url = `${API}/api/database/rows/table/${id}/?user_field_names=true&size=200`;
  const rows = [];
  while (url) {
    const res = await fetch(url, { headers: { Authorization: `Token ${cfg.baserowToken}` } });
    if (!res.ok) throw new Error(`Baserow table ${id} returned ${res.status}`);
    const data = await res.json();
    rows.push(...data.results);
    url = data.next ? data.next.replace(/^http:/, "https:") : null;
  }
  return rows;
}

const cleanIsbn = (s) => String(s || "").replace(/[^0-9Xx]/g, "").toUpperCase();

// Google's cover for an ISBN, asked for at a decent size. The key is locked to the website, so say we are it.
async function googleCover(isbn) {
  if (!isbn) return "";
  const key = cfg.googleBooksKey ? `&key=${encodeURIComponent(cfg.googleBooksKey)}` : "";
  try {
    const res = await fetch(`https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}${key}`, { headers: { Referer: SITE } });
    if (!res.ok) return "";
    const v = ((await res.json()).items || [])[0]?.volumeInfo;
    const img = v?.imageLinks?.thumbnail || v?.imageLinks?.smallThumbnail;
    return img ? img.replace(/^http:/, "https:").replace("&edge=curl", "").replace(/&fife=[^&]*/, "") + "&fife=w480-h720" : "";
  } catch { return ""; }
}

// What a cover depends on, cheap to work out: the uploaded photo, the saved link, or the ISBN.
// Google is only asked again when this changes, so the daily allowance isn't used up.
function coverBasis(r) {
  const photo = (r["Cover photo"] || []).find((f) => f.is_image !== false);
  if (photo) return `photo:${photo.name || photo.url}`;
  const saved = String(r["Cover URL"] || "").trim();
  return `link:${saved}|isbn:${cleanIsbn(r["ISBN"])}`;
}

// Where each book's cover should come from, best first: a photo uploaded in Baserow, a link saved in
// Cover URL, Google's cover for the ISBN, then Open Library's.
async function coverSource(r) {
  const photo = (r["Cover photo"] || []).find((f) => f.is_image !== false);
  if (photo) return photo.url;
  const saved = String(r["Cover URL"] || "").trim();
  if (saved && !/covers\.openlibrary\.org\/b\/isbn\//.test(saved)) return saved;
  const isbn = cleanIsbn(r["ISBN"]);
  const g = await googleCover(isbn);
  if (g) return g;
  if (saved) return saved;
  return isbn ? `https://covers.openlibrary.org/b/isbn/${isbn}-L.jpg?default=false` : "";
}

async function download(url) {
  const res = await fetch(url, { headers: { Referer: SITE }, redirect: "follow" });
  if (!res.ok) return null;
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 1500) return null; // blank placeholders
  const meta = await sharp(buf).metadata().catch(() => null);
  if (!meta || !meta.width || meta.width < 40) return null;
  return sharp(buf).rotate().resize({ width: 480, withoutEnlargement: true }).jpeg({ quality: 82, mozjpeg: true }).toBuffer();
}

// The members list, from the publicly shared view only (usernames, photos, join dates – never contact details)
async function publicMembers(link) {
  const slug = (String(link || "").match(/public\/grid\/([^/?#]+)/) || [])[1];
  if (!slug) return [];
  const info = await (await fetch(`${API}/api/database/views/${slug}/public/info/`)).json();
  const names = Object.fromEntries((info.fields || []).map((f) => [`field_${f.id}`, f.name]));
  const data = await (await fetch(`${API}/api/database/views/grid/${slug}/public/rows/?size=200`)).json();
  return (data.results || []).map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [names[k] || k, v])));
}

const catalogue = await table(cfg.catalogueTableId);
const borrowings = cfg.borrowingsTableId ? await table(cfg.borrowingsTableId) : [];
const ratings = cfg.ratingsTableId ? await table(cfg.ratingsTableId).catch(() => []) : [];
const members = await publicMembers(cfg.membersViewLink).catch((e) => { console.warn(`Members not copied: ${e.message}`); return []; });

fs.mkdirSync(COVER_DIR, { recursive: true });
const sources = fs.existsSync(SOURCES) ? JSON.parse(fs.readFileSync(SOURCES, "utf8")) : {};
const keep = new Set();
let fetched = 0;

for (const r of catalogue) {
  const file = `${r.id}.jpg`;
  const dest = path.join(COVER_DIR, file);
  const basis = coverBasis(r);
  // Look the cover up again only when what it depends on has changed (or it never worked)
  const prev = sources[r.id];
  const recentMiss = prev && prev.basis === basis && !prev.src && Date.now() - (prev.tried || 0) < 24 * 3600e3;
  if (!recentMiss && (!prev || prev.basis !== basis || !fs.existsSync(dest))) {
    const src = await coverSource(r);
    let ok = false;
    if (src) {
      try {
        const img = await download(src);
        if (img) { fs.writeFileSync(dest, img); sources[r.id] = { basis, src }; fetched++; ok = true; }
      } catch (e) { console.warn(`Cover for "${r["Book title"]}" failed: ${e.message}`); }
    }
    // Nothing found anywhere: note it and try again tomorrow rather than every half hour
    if (!ok && !fs.existsSync(dest)) sources[r.id] = { basis, src: "", tried: Date.now() };
  }
  if (fs.existsSync(dest)) {
    keep.add(file);
    // A short fingerprint, so browsers notice when a cover changes
    const tag = crypto.createHash("sha1").update((sources[r.id] && sources[r.id].src) || "").digest("hex").slice(0, 8);
    r.__cover = `assets/covers/${file}?${tag}`;
  }
}

// Remove covers of books that have gone
for (const f of fs.readdirSync(COVER_DIR)) {
  if (f.endsWith(".jpg") && !keep.has(f)) fs.unlinkSync(path.join(COVER_DIR, f));
}

// Member photos, made small: the originals can be several megabytes each
const PHOTO_DIR = path.join(ROOT, "assets", "members");
fs.mkdirSync(PHOTO_DIR, { recursive: true });
const keepPhotos = new Set();
for (const m of members) {
  const photo = (m["Profile photo"] || []).find((f) => f.is_image !== false);
  if (!photo) continue;
  const file = `${m.id}.jpg`, dest = path.join(PHOTO_DIR, file);
  const key = `member:${m.id}`;
  if (!sources[key] || sources[key].basis !== photo.name || !fs.existsSync(dest)) {
    try {
      const res = await fetch(photo.url);
      if (res.ok) {
        const buf = Buffer.from(await res.arrayBuffer());
        fs.writeFileSync(dest, await sharp(buf).rotate().resize({ width: 240, height: 240, fit: "cover" }).jpeg({ quality: 82, mozjpeg: true }).toBuffer());
        sources[key] = { basis: photo.name, src: photo.url };
      }
    } catch (e) { console.warn(`Photo for ${m["Username"]} failed: ${e.message}`); }
  }
  if (fs.existsSync(dest)) {
    keepPhotos.add(file);
    m.__photo = `assets/members/${file}?${crypto.createHash("sha1").update(photo.name || "").digest("hex").slice(0, 8)}`;
  }
}
for (const f of fs.readdirSync(PHOTO_DIR)) if (f.endsWith(".jpg") && !keepPhotos.has(f)) fs.unlinkSync(path.join(PHOTO_DIR, f));

fs.mkdirSync(path.dirname(SNAPSHOT), { recursive: true });
fs.writeFileSync(SNAPSHOT, JSON.stringify({ catalogue, borrowings, ratings, members }));
const ids = new Set(catalogue.map((r) => String(r.id)));
for (const m of members) ids.add(`member:${m.id}`);
for (const id of Object.keys(sources)) if (!ids.has(id)) delete sources[id];
fs.writeFileSync(SOURCES, JSON.stringify(sources, null, 1));
console.log(`${catalogue.length} books, ${borrowings.length} borrowings, ${ratings.length} ratings, ${members.length} members, ${keep.size} covers (${fetched} fetched), ${keepPhotos.size} member photos`);
