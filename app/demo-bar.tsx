/**
 * Shown on every screen of a demo session, so nobody mistakes the seeded data
 * for real invoices or wonders why nothing can be changed (#234).
 */
export function DemoBar() {
  return (
    <p className="bg-secondary text-secondary-foreground px-4 py-1.5 text-center text-xs">
      Demo. Invented data, read only.
    </p>
  );
}
