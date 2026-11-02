import { sessionCookie } from "@/lib/auth.ts";
import { CONSENT_KEY } from "@/lib/analytics/consent.ts";
import { ConsentChoices } from "../consent-banner.tsx";
import { Page } from "../ui.tsx";

export const metadata = { title: "Cookies" };

const DAYS = Math.round(sessionCookie.maxAge / 86_400);

/**
 * What this site stores in a browser, each with why and for how long (#175).
 * Taken from the code that sets each one, so it changes when they do.
 */
export default function Cookies() {
  const rows = [
    {
      name: sessionCookie.name,
      kind: "Cookie, set by this site",
      why: "Keeps you signed in, or in the read only demo. Strictly necessary, so it is set without asking.",
      lasts: `${DAYS} days, or until you sign out`,
    },
    {
      name: CONSENT_KEY,
      kind: "Browser storage, set by this site",
      why: "Remembers whether you accepted or rejected analytics, and when, so you are not asked on every visit.",
      lasts: "Until you clear it",
    },
    {
      name: "ph_<project>_posthog",
      kind: "Cookie and browser storage, set by PostHog",
      why: "Only if you accept: an identifier so visits can be linked, and session recordings with every word masked.",
      lasts: "Up to a year, and cleared if you withdraw",
    },
  ];

  return (
    <Page
      title="Cookies"
      lead="What this site stores in your browser. Before you choose, visits are counted without storing anything."
    >
      <dl className="divide-y divide-black/10 dark:divide-white/15">
        {rows.map((row) => (
          <div key={row.name} className="grid gap-1 py-4 sm:grid-cols-[14rem_1fr]">
            <dt className="font-mono text-sm">{row.name}</dt>
            <dd className="text-sm">
              <span className="text-muted-foreground text-xs">{row.kind}. {row.lasts}.</span>
              <p className="mt-1">{row.why}</p>
            </dd>
          </div>
        ))}
      </dl>
      <p className="text-muted-foreground mt-6 text-sm">
        A browser sending Global Privacy Control is treated as having rejected analytics, without
        being asked.{" "}
        <ConsentChoices className="underline underline-offset-4" />
      </p>
    </Page>
  );
}
