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
    ];
  },
};

export default nextConfig;
