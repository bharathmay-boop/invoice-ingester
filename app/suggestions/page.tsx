import Link from "next/link";
import { cookies } from "next/headers";
import { isValidSession, sessionCookie } from "@/lib/auth.ts";
import { listSuggestions } from "@/lib/queries.ts";
import { formatDate, money } from "@/lib/format.ts";
import { Empty, Page } from "../ui.tsx";
import { SuggestionCard } from "./suggestion-card.tsx";

export const dynamic = "force-dynamic";

export const metadata = { title: "Suggestions" };

/**
 * The borderline matches, waiting for a yes or no.
 *
 * Each one shows both descriptions and the score, because the score alone is
 * not a reason to say either. What decides it is reading the two names.
 */
export default async function Suggestions() {
  const waiting = await listSuggestions();
  // Deciding needs a session, so a reader without one is shown the questions
  // and not the buttons. A control that refuses on click is worse than one
  // that is not offered.
  const jar = await cookies();
  const canDecide = await isValidSession(jar.get(sessionCookie.name)?.value);

  return (
    <Page
      title="Suggestions"
      lead="Line items that are close to something already in the catalogue, but not close enough to link without asking. Each decision is remembered, so nothing comes back twice."
    >
      {waiting.length === 0 ? (
        <Empty title="Nothing to decide">
          Matches that are clear enough get linked on save, and anything unlike
          the catalogue becomes a new item. Only the ones in between land here.
        </Empty>
      ) : (
        <ul className="space-y-4">
          {waiting.map((suggestion) => (
            <li key={suggestion.line_item_id}>
              <SuggestionCard
                canDecide={canDecide}
                lineItemId={suggestion.line_item_id}
                rawDescription={suggestion.raw_description}
                canonicalName={suggestion.canonical_name}
                score={suggestion.score}
                itemHref={`/items/${suggestion.item_id}`}
                purchases={suggestion.item_purchases}
                context={`${suggestion.vendor_name}, invoice ${suggestion.invoice_number}, ${formatDate(suggestion.invoice_date)}`}
                line={`${suggestion.quantity}${suggestion.unit ? ` ${suggestion.unit}` : ""} at ${money(suggestion.unit_price)}`}
              />
            </li>
          ))}
        </ul>
      )}

      <p className="mt-8 text-sm">
        <Link href="/items" className="underline">
          All items
        </Link>
      </p>
    </Page>
  );
}
