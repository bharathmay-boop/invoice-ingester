import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Set once here so no route can forget them.
  //
  // Framing is same-origin rather than refused outright, because the app shows
  // its own stored originals in an iframe. Another site framing a page is still
  // refused, which is what stops a click on a disguised button.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'self'" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
      {
        // A stored original's bytes come from whoever wrote the document, and
        // they are served from this origin, so nothing in one may ever run as
        // the app. Checked in Chromium and Firefox: a sandboxed PDF still
        // renders in the dialog's object, the review's iframe and its own tab.
        // After the rule above on purpose: the last match for a header wins.
        source: "/api/original",
        headers: [{ key: "Content-Security-Policy", value: "frame-ancestors 'self'; sandbox" }],
      },
    ];
  },
};

export default nextConfig;
