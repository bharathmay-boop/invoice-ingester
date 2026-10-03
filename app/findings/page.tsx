export const dynamic = "force-dynamic";

/**
 * Nothing picked yet. On a narrow screen the list fills the page and this is
 * never seen; on a wide one it says what the right hand side is for rather
 * than leaving a hole.
 */
export default function PickOne() {
  return (
    <div className="text-muted-foreground hidden rounded-xl border border-dashed px-6 py-16 text-center text-sm lg:block">
      Pick a finding to see the invoice line, the agreed rate, and the words in
      the contract that set it.
    </div>
  );
}
