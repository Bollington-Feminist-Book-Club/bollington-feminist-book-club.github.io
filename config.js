// Book club site settings – the only file you need to edit.

window.BOOKCLUB_CONFIG = {
  // Name shown in the header and browser tab
  clubName: "Bollington Book Club",

  // Read-only Baserow database token.
  // Create it in Baserow: Settings → Database tokens → Create token.
  // Give it READ access to the Catalogue table only – no create, update or delete.
  // Leave empty to preview the site with sample data.
  baserowToken: "",

  baserowApi: "https://api.baserow.io",
  catalogueTableId: 938797,

  // Public form links from Baserow (open each form view → Share view → copy link)
  forms: {
    join: "https://baserow.io/form/Bv6eH2XTbjC3VP0QkLFk-2PkM3GDyM-5jovU6JBR59s",
    borrow: "",   // "Borrow a book" form on the Borrowings table
    rate: "",     // "Give us your rating" form on the Ratings table
    addBook: ""   // "Add a New Book" form on the Catalogue table
  }
};
