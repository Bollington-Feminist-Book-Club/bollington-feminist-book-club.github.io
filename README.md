# Bollington Feminist Book Club

A swap shelf, not a reading list. This is the public site for the club: a catalogue of books members are sharing, with buttons to borrow, rate and join.

The site is plain HTML, CSS and JavaScript hosted free on GitHub Pages. The data lives in Baserow, which stays the admin back office.

## How it works

- **Catalogue:** read live from the Baserow Catalogue table using a read-only token.
- **Join, borrow, rate and add a book:** these open the club's existing Baserow forms. Borrow and rate pre-fill the book.
- **Approvals:** new members arrive as Pending and borrow requests as Requested. Approve them in Baserow.

Member contact details are never read by the site.

## Setup

All settings live in `config.js`.

1. **Read-only token.** In Baserow, go to Settings → Database tokens → Create token. Give it **read** access to the **Catalogue** table only, with no create, update or delete. Paste it into `baserowToken`.
   The token is visible to anyone who views the page source. That is acceptable only because it can do nothing but read the book list. Never give it any other permission.
2. **Form links.** For each form view in Baserow, open it, choose Share view and copy the link into `forms` (`borrow`, `rate`, `addBook`). Buttons without a link show as greyed out.
3. **Switch on Pages.** In the repo, go to Settings → Pages, choose Deploy from a branch and select `main`, folder `/ (root)`.

With no token, the site shows sample books in preview mode.

## Files

- `index.html` – home page
- `add.html` – add a book by ISBN (looks it up in Open Library, then Google Books for anything missing, and opens the Baserow form pre-filled)
- `books.html`, `wishlist.html`, `members.html`, `about.html` – the other pages (each repeats the same header and footer)
- `styles.css` – design
- `app.js` – loads the catalogue, filters, book details
- `config.js` – settings
- `data/sample.json` – sample books for preview mode

## After editing styles.css, app.js or config.js

Browsers keep old copies of these files. In every `.html` page, change the `?v=` number on the three lines that load them (any new value works) so visitors get the new version straight away.
