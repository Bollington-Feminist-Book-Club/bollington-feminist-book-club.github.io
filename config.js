// Book club site settings – the only file you need to edit.

window.BOOKCLUB_CONFIG = {
  // Name shown in the header and browser tab
  clubName: "Bollington Feminist Book Club",

  // Read-only Baserow database token.
  // Create it in Baserow: Settings → Database tokens → Create token.
  // Give it READ access to the Catalogue and Wish list tables only – no create, update or delete.
  // Leave empty to preview the site with sample data.
  baserowToken: "eVc6EMIE0sW3fj3IJUWVt4yCaMswONK7",

  baserowApi: "https://api.baserow.io",
  catalogueTableId: 938797,
  wishListTableId: 938117,     // the token also needs READ on the Wish list table
  borrowingsTableId: 938123,   // member pages: the token needs READ on Borrowings
  ratingsTableId: 938122,      // member pages: the token needs READ on Ratings

  // Public link to the "Public members" view in Baserow (Share view → copy link).
  // Hide every field in that view except Username, Profile photo and Joined Date first.
  membersViewLink: "https://baserow.io/public/grid/2Hx161pnPxp32vF-IbZgPhN4l9SZvQcM54DQ8YXEkpE",

  // Public form links from Baserow (open each form view → Share view → copy link)
  forms: {
    join: "https://baserow.io/form/JyFUBO4jZHg4ZRWKvltvtUQUDOVVJJuRBy9dVzPpQL0",     // "Join the club" form on the Members table
    borrow: "https://baserow.io/form/gHe7Gcha10zhemrbIKBeduWc_j2YxGuARvsgTBEIK60",   // "Borrow a book" form on the Borrowings table
    rate: "https://baserow.io/form/764QzvI0Qz1ynRflAkxudQ4BCkgGOml6EKSV33AxVVc",     // "Give us your rating" form on the Ratings table
    addBook: "https://baserow.io/form/o_3_Ov5bqI5lWHKR6_UM2fcV3MzMXZ_ExzTmzpKe67M",   // "Add a book" form on the Catalogue table
    recommend: "https://baserow.io/form/yESotg2NnBv3CHrNF9P1DavI3y7I-ybZ8j5lOX0__-E"  // "Recommend a book" form on the Wish list table
  }
};
