/**
 * "What it will not do", for the home page (#241). The titles are the README's
 * own words and a test holds them equal, so the site cannot promise something
 * the README has since taken back. The reasons are the README's, shortened.
 */
export const LIMITS = [
  {
    title: "It will not tell you two prices are comparable when they are not.",
    why: "Kilograms and grams are converted. A ream against a sheet is refused with the reason, since a ream is 500 sheets of one paper, not 500 of anything.",
  },
  {
    title: "It will not merge two products on a guess.",
    why: "Close but unclear matches wait for a person. On real invoices, two different cartridges scored higher than two spellings of one stapler.",
  },
  {
    title: "It will not save an invoice whose own figures disagree",
    why: "An invoice that does not add up is marked and held for checking, not folded into a spend total.",
  },
  {
    title: "It will not read a file that is not an invoice.",
    why: "A photo or a bank statement is declined with a reason, not turned into a draft of invented fields.",
  },
  {
    title: "It will not compare prices in two currencies.",
    why: "There is no exchange rate anywhere in the code, on purpose. Rupees and euros are reported separately and said to be incomparable.",
  },
  {
    title: "It will not check a contract term it cannot verify.",
    why: "Slabs, rebates, revenue share and minimum guarantees are shown with their page and words, and marked as not checked.",
  },
  {
    title: "It will not act on a contract nobody has read.",
    why: "Every rate stays inert until a person confirms it with the document open beside them.",
  },
  {
    title: "It is one user with one password.",
    why: "No accounts, roles or tenancy yet. It was the right call for a first version, and it is the first decision to be reversed.",
  },
] as const;
