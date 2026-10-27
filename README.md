# Bollington Feminist Book Club

The public website for the Bollington Feminist Book Club: a catalogue of the books members are sharing, a wish list, a members page and a way to add books by ISBN.

Live site: https://bollington-feminist-book-club.github.io/

Contact: bollyfem-bookclub@googlegroups.com

The site is plain HTML, CSS and JavaScript, hosted free on GitHub Pages. All the data lives in Baserow, which stays the back office: members, books, borrowings, ratings and approvals are all managed there.

## Pages

| Page | File | What it does |
|---|---|---|
| Home | `index.html` | Intro, the three newest covers, the four newest books and a join button |
| Books | `books.html` | The full catalogue with search, filters (genre, language, available now) and sorting. Each book opens a panel with its details and Borrow and Rate buttons |
| Add a book | `add.html` | A member types an ISBN; the site looks the book up and opens the Baserow form already filled in |
| Wish list | `wishlist.html` | Books members want to read that nobody owns yet |
| Members | `members.html` | Usernames, profile pictures, join dates and books shared. Each links to that member's page |
| Member | `member.html?u=Name` | One member's shelf, what they're borrowing now, past loans and their ratings |
| About | `about.html` | How the club works, when and where, what counts, who we are |

Every page shares the same header and footer, repeated in each file.

## How the data flows

The site only ever **reads** from Baserow. Anything that adds or changes data – joining, borrowing, rating, adding or recommending a book – goes through a public Baserow form, so the site never needs permission to write.

- **Catalogue, wish list, borrowings and ratings** are read with a read-only database token. Borrowings and ratings only feed the member pages.
- **Members** are read from a publicly shared Baserow view that shows only safe fields. Emails and phone numbers never reach the site.
- **Forms** are opened in a new tab. Borrow and Rate pre-fill the book; Adding a book happens on our own page and is submitted directly to the Baserow form.

### Approvals

- New members arrive with no status. Set **Active** to *Active* in the Members table to approve them.
- Borrow requests arrive in Borrowings. Set their **Status** to *Borrowed* or *Returned* as books change hands.
- New books arrive in the Catalogue straight away. Check the author spelling, genres and anything in the *Suggested Genre* or *Suggested Language* columns.

### Usernames

Members choose a username when they join. It's the Members table's first column, so it's what every dropdown and the site show. Real names are kept in the private *Full name* field.

## Adding a book by ISBN

`add.html` looks the ISBN up in two free sources:

1. **Open Library** (openlibrary.org), first for title, author, pages, language and cover.
2. **Google Books**, to fill anything Open Library lacks. The longer of the two synopses is used.

The member sees a preview, then chooses:

- **I own it** – a form appears on our own page, built from the Baserow *Add a book* form (its questions, genres and usernames are read from Baserow, so changes there show up automatically). Everything the lookup found is filled in, including the full synopsis. The member picks format, genres and username and presses *Add to the shelves*; the page submits straight to the Baserow form. Nothing goes through a long link, which is what used to trigger Baserow's firewall (HTTP 403).
- **I want to read it** – opens the Recommend a book form with title and author filled in.

The cover is saved as a web address in the Catalogue's *Cover URL* field (forms can't receive an uploaded image this way). The site shows covers in this order: an uploaded *Cover photo*, then *Cover URL*, then the Open Library cover for the book's *ISBN*. If none exists, the book gets a cloth binding in indigo, terracotta or oxblood with its title stamped on. If a book has no synopsis saved, its panel on the site fetches one by ISBN.

### Spam protection

The on-page add form has two traps: a hidden box that only bots fill in, and a minimum time to complete the form. A proper captcha isn't possible on a site with no server, because a captcha has to be checked on a server, and Baserow's public forms can be posted to directly anyway. The real safeguard is reviewing new rows in Baserow.

## Settings (`config.js`)

| Setting | What it is |
|---|---|
| `clubName` | Shown in the header and browser tab |
| `baserowToken` | Read-only database token (see below) |
| `catalogueTableId`, `wishListTableId`, `borrowingsTableId`, `ratingsTableId` | Baserow table IDs |
| `membersViewLink` | Share link of the *Public members view* in the Members table |
| `forms` | Share links of the five Baserow forms below |

### The token

Create it in Baserow under My settings → Database tokens. It must have:

- **Read** on **Catalogue**, **Wish list**, **Borrowings** and **Ratings** only
- **No** create, update or delete permission on anything

The token is visible to anyone who views the page source. That's acceptable only because it can do nothing but read those four tables, none of which holds contact details. Never give it access to Members, and never give it write permissions.

With no token, the site shows three sample books from `data/sample.json`.

### The members view

The *Public members view* must show only **Username**, **Profile photo**, **Joined Date** and **Catalogue**. Hide every other field before sharing it, because sharing exposes whatever is visible. It's filtered to Active members.

### The forms

| Key | Baserow table | Form view |
|---|---|---|
| `join` | Members | Join the club |
| `borrow` | Borrowings | Borrow a book |
| `rate` | Ratings | Give us your rating |
| `addBook` | Catalogue | Add a book |
| `recommend` | Wish list | Recommend a book |

To get a link: open the form view in Baserow → Share view → copy. A button with no link shows greyed out.

Pre-filling uses the **table field names**, not the questions' labels on the form. Renaming a field in Baserow (for example *Book title* or *Cover URL*) will stop that field pre-filling until `app.js` is updated to match.

## Being found and counting visits

- **Search engines:** every page has a title, description and canonical address; `sitemap.xml` lists the public pages; the home page describes the club to Google as an organisation in Bollington. `add.html`, `member.html` and `join/` are kept out of search results. Submit `sitemap.xml` in Google Search Console after verifying the site there.
- **Link previews:** `assets/share.jpg` is the image shown when the link is shared on WhatsApp, Facebook and so on.
- **Counting:** set `goatcounter` in `config.js` to your free GoatCounter code to count visits (no cookies, no consent banner needed).
- **QR codes:** point printed QR codes at `join/?from=NAME` (e.g. `join/?from=library`). The page records a scan as `/qr/NAME` in GoatCounter, then sends the visitor to the home page. Use a different NAME for each place a poster goes to see which one works.

## Reading comfort

The site follows the British Dyslexia Association's style guide by default: sans-serif body text, generous line spacing, no italics or typewriter type for reading text, nothing smaller than 15px, left-aligned paragraphs, an off-white background, and the line-art pattern kept out from behind any text (and hidden on narrower screens).

The **Aa** button in the header switches on *Easier reading* for anyone who wants more: larger text, extra letter and word spacing (the WCAG text-spacing values), shorter lines, sans-serif headings and no background patterns or textures. Like dark mode, it's remembered on that device.

## Making changes

Edit files directly on GitHub (pencil icon) or locally, then commit to `main`. The *Deploy Jekyll* GitHub Action publishes the site in about a minute; check the Actions tab if a change doesn't appear.

Each page loads `styles.css`, `config.js` and `app.js` with a fresh version number every minute, so visitors always get the latest code without any manual cache-busting. The pages themselves can be cached by browsers for up to ten minutes after a change.

## Files

- `index.html`, `books.html`, `add.html`, `wishlist.html`, `members.html`, `member.html`, `about.html` – the pages
- `styles.css` – design (Playfair Display and Source Sans 3, coral and indigo, light and dark mode)
- `app.js` – loads data from Baserow, renders the pages, ISBN lookup, form links
- `config.js` – settings
- `data/sample.json` – sample books for preview mode
- `assets/cloth-grain.webp` – book-cloth weave, taken from the club's texture photos and recoloured on the page; used for cover-less books and the join band
- `assets/white-nancy.png`, `assets/white-nancy-bold.png` – the White Nancy logo (fine line for large sizes, heavier line for the header); white ink on transparent so the site colours it
- `favicon.ico`, `favicon-32.png`, `apple-touch-icon.png`, `assets/icon-192.png`, `assets/icon-512.png`, `site.webmanifest` – browser and home-screen icons (solid White Nancy, cream on indigo)
- `assets/share.jpg` – link-preview image
- `join/index.html` – QR-code landing page that counts the scan then opens the home page
- `sitemap.xml` – list of public pages for search engines
- `assets/lines.png` – the line-art faces, cut out so the site can colour them (used in the join band)
- `.github/workflows/jekyll-gh-pages.yml` – deployment
