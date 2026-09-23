"use client";

import { useEffect } from "react";
import posthog from "posthog-js";

/**
 * A crash in the root layout itself. It replaces the whole document, so it
 * carries its own html and body and cannot use anything from the layout,
 * including the theme tokens.
 */
export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    if (process.env.NEXT_PUBLIC_POSTHOG_KEY) posthog.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          fontFamily: "system-ui, sans-serif",
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <main style={{ maxWidth: "32rem", padding: "1rem" }}>
          <h1 style={{ fontSize: "1.5rem" }}>Something broke</h1>
          <p>The error has been reported. Reloading the page is safe.</p>
          {/* A plain link on purpose: the root layout is what crashed, so a
              full page load is more likely to work than client navigation. */}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a href="/">Go to the start</a>
        </main>
      </body>
    </html>
  );
}
