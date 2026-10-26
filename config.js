// Book club site settings – the only file you need to edit.

window.BOOKCLUB_CONFIG = {
  // Name shown in the header and browser tab
  clubName: "Bollington Feminist Book Club",

  // Read-only Baserow database token.
  // Create it in Baserow: Settings → Database tokens → Create token.
  // Give it READ access to the Catalogue table only – no create, update or delete.
  // Leave empty to preview the site with sample data.
  baserowToken: "eVc6EMIE0sW3fj3IJUWVt4yCaMswONK7",

  baserowApi: "https://api.baserow.io",
  catalogueTableId: 938797,
  wishListTableId: 938117,   // the token also needs READ on the Wish list table

  // Public link to the "Public members" view in Baserow (Share view → copy link).
  // Hide every field in that view except Username, Profile photo and Joined Date first.
  membersViewLink: "",

  // Public form links from Baserow (open each form view → Share view → copy link)
  forms: {
    join: "https://baserow.io/form/Bv6eH2XTbjC3VP0QkLFk-2PkM3GDyM-5jovU6JBR59s",
    borrow: "https://baserow.io/form/gHe7Gcha10zhemrbIKBeduWc_j2YxGuARvsgTBEIK60",   // "Borrow a book" form on the Borrowings table
    rate: "https://baserow.io/form/764QzvI0Qz1ynRflAkxudQ4BCkgGOml6EKSV33AxVVc",     // "Give us your rating" form on the Ratings table
    addBook: "https://baserow.io/form/lEeCRjZM13T-OJZUUpuSSKMGB9xYcwTMdwpJZ_3mB08",   // "Add a New Book" form on the Catalogue table
    recommend: ""  // "Recommend a book" form on the Wish list table
  }
};
