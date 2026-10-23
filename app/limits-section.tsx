import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Reveal } from "@/components/reveal.tsx";
import { LIMITS } from "./limits.ts";

/** What it refuses to do, and why, said as plainly as the README says it (#241). */
export function LimitsSection() {
  return (
    <section id="limits" className="mx-auto w-full max-w-6xl scroll-mt-8 px-4 py-12 sm:px-6">
      <Reveal>
        <h2 className="text-2xl font-semibold tracking-tight">What it will not do</h2>
        <p className="text-muted-foreground mt-2 max-w-2xl text-sm leading-relaxed">
          A wrong answer that looks right costs more than no answer, so each of these is refused on
          purpose.
        </p>
      </Reveal>

      <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {LIMITS.map((limit, i) => (
          <li key={limit.title}>
            <Reveal delay={Math.min(i * 0.04, 0.2)} className="h-full">
              <Card className="h-full">
                <CardHeader>
                  <CardTitle className="text-sm leading-snug">{limit.title}</CardTitle>
                  <CardDescription className="text-xs leading-relaxed">{limit.why}</CardDescription>
                </CardHeader>
              </Card>
            </Reveal>
          </li>
        ))}
      </ul>
    </section>
  );
}
