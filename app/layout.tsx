import { Suspense } from "react";
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { cookies } from "next/headers";
import { Nav } from "./nav.tsx";
import { ThemeProvider } from "./theme-provider.tsx";
import { Analytics } from "./analytics-provider.tsx";
import { isValidSession, sessionCookie } from "@/lib/auth.ts";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Invoice Ingester",
  description: "Extract, match and search invoice spend.",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const jar = await cookies();
  const signedIn = await isValidSession(jar.get(sessionCookie.name)?.value);

  return (
    <html
      lang="en"
      // next-themes sets the class on <html> before paint, which React cannot
      // know about during hydration.
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <ThemeProvider>
          <Suspense>
            <Analytics>
              <Nav signedIn={signedIn} />
              {children}
            </Analytics>
          </Suspense>
        </ThemeProvider>
      </body>
    </html>
  );
}
