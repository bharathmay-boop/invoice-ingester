import { CircleDollarSignIcon, CpuIcon, KeyRoundIcon } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Reveal } from "@/components/reveal.tsx";
import { DEFAULT_BATCH_CONFIRM_AT } from "@/lib/extract/estimate.ts";

/**
 * What it costs and who sees the documents: the first two questions anyone
 * asks about a tool that sends files to a model (#242).
 */
export function ModelsSection() {
  return (
    <section id="models" className="mx-auto w-full max-w-6xl scroll-mt-8 px-4 py-12 sm:px-6">
      <Reveal>
        <h2 className="text-2xl font-semibold tracking-tight">Your model, your key</h2>
        <p className="text-muted-foreground mt-2 max-w-2xl text-sm leading-relaxed">
          Documents are read by the model you choose, on your own account with that provider, and
          you see what a batch will cost before it starts.
        </p>
      </Reveal>

      <div className="mt-6 grid grid-cols-[minmax(0,1fr)] gap-4 md:grid-cols-3">
        <Reveal delay={0.05} className="h-full">
          <Point icon={<CpuIcon />} title="Pick the model">
            Claude through the Anthropic API, or any OpenRouter model that reads images and returns
            structured output. The OpenRouter list is fetched live, so a retired model never shows
            up as a choice.
          </Point>
        </Reveal>

        <Reveal delay={0.1} className="h-full">
          <Point icon={<CircleDollarSignIcon />} title="See the cost before it runs">
            The upload screen shows what each file will cost, as a range, before anything is sent.
            A batch of {DEFAULT_BATCH_CONFIRM_AT} files or more asks first, a number you can change.
            Afterwards it shows what was actually spent, from each call&rsquo;s own token count.
          </Point>
        </Reveal>

        <Reveal delay={0.15} className="h-full">
          <Point icon={<KeyRoundIcon />} title="Your key stays sealed">
            Keys are stored encrypted with AES-256-GCM, and the key that opens them lives outside
            the database. Test connection checks a key with the provider before you rely on it.
          </Point>
        </Reveal>
      </div>
    </section>
  );
}

function Point({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="h-full">
      <CardHeader>
        <span className="text-muted-foreground [&_svg]:size-5" aria-hidden>
          {icon}
        </span>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <CardDescription className="leading-relaxed">{children}</CardDescription>
      </CardContent>
    </Card>
  );
}
