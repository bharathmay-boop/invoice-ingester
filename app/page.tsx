export default function Home() {
  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-4 px-6 py-24">
      <h1 className="text-3xl font-semibold">Invoice Ingester</h1>
      <p className="text-sm opacity-70">
        Drop in invoices, extract the particulars, match vendors and items, then
        search spend by vendor or by item.
      </p>
      <p className="text-sm opacity-70">
        Under construction. Progress is on the{" "}
        <a
          className="underline"
          href="https://github.com/users/bharathmay-boop/projects/1"
        >
          issue board
        </a>
        .
      </p>
    </main>
  );
}
