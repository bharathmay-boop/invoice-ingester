"use client";

import { ThemeProvider as NextThemes } from "next-themes";

/**
 * shadcn's dark mode is class based, so without this the `dark:` variants and
 * the token overrides in globals.css never fire and the app is light only.
 * defaultTheme "system" keeps the behaviour the app already had, and puts a
 * real toggle within reach later.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemes attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      {children}
    </NextThemes>
  );
}
