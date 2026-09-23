import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { usageSince, type Usage as UsageTotals } from "@/lib/usage.ts";
import { getThresholds } from "@/lib/items/match.ts";
import { NumberSetting } from "./number-setting.tsx";
import { saveThresholds, saveTolerance } from "./actions.ts";
import { describeSecret } from "@/lib/settings/store.ts";
import { DEFAULT_TOLERANCE_RUPEES } from "@/lib/extract/validate.ts";
import { getProvider, MODEL_SETTING, PROVIDER_LABEL } from "@/lib/extract/provider.ts";
import { DEFAULT_OPENROUTER_MODEL, formatCost, listModels } from "@/lib/extract/models.ts";
import { getSetting } from "@/lib/settings/store.ts";
import { ModelPicker } from "./model-picker.tsx";
import { Pending } from "./pending.tsx";
import { ProviderSettings, type ProviderView } from "./provider-settings.tsx";

export const dynamic = "force-dynamic";

export const metadata = { title: "Settings" };

// Nothing here writes yet. Each section is the shell its own issue fills in,
// and every one says which, so the page is honest about being a shell rather
// than looking finished and doing nothing.
function Usage({ label, usage }: { label: string; usage: UsageTotals }) {
  return (
    <div>
      <p className="text-sm font-medium">{label}</p>
      <dl className="mt-2 grid gap-3 sm:grid-cols-4">
        <Reading label="Calls" value={String(usage.calls)} />
        <Reading label="Invoices read" value={String(usage.invoices)} />
        <Reading
          label="Spend"
          // A call the catalogue had no price for is counted but not costed,
          // so the total is a floor rather than a figure.
          value={`$${usage.cost.toFixed(4)}${usage.unpriced ? " or more" : ""}`}
        />
        <Reading label="Failed" value={String(usage.failures)} />
      </dl>
    </div>
  );
}

export default async function Settings() {
  const [thresholds, tolerance] = await Promise.all([
    getThresholds(),
    getSetting<number>("rounding_tolerance").then((v) => v ?? DEFAULT_TOLERANCE_RUPEES),
  ]);

  const now = new Date();
  const [today, month] = await Promise.all([
    usageSince(new Date(now.getFullYear(), now.getMonth(), now.getDate())),
    usageSince(new Date(now.getFullYear(), now.getMonth(), 1)),
  ]);

  const [anthropic, openrouter, selected] = await Promise.all([
    describeSecret("anthropic_api_key"),
    describeSecret("openrouter_api_key"),
    getProvider(),
  ]);

  // Only fetched when it is the provider in use, so choosing Claude does not
  // pay for a catalogue nobody is going to look at.
  const catalogue = selected === "openrouter" ? await listModels() : null;
  const chosenModel =
    (await getSetting<string>(MODEL_SETTING)) ?? DEFAULT_OPENROUTER_MODEL;

  const providers: ProviderView[] = [
    {
      id: "anthropic",
      label: PROVIDER_LABEL.anthropic,
      blurb: "Claude reads the invoice directly. No model to choose. Around two to four cents an invoice.",
      present: anthropic.present,
      masked: anthropic.masked,
    },
    {
      id: "openrouter",
      label: PROVIDER_LABEL.openrouter,
      blurb: "Any vision model that supports structured output, billed through OpenRouter.",
      present: openrouter.present,
      masked: openrouter.masked,
    },
  ];

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8 sm:px-6 sm:py-12">
      <h1 className="text-2xl font-semibold sm:text-3xl">Settings</h1>
      <p className="text-muted-foreground mt-2 max-w-prose text-sm">
        Only reachable when signed in. Reading the app needs no password.
      </p>

      <Tabs defaultValue="extraction" className="mt-8">
        <TabsList>
          <TabsTrigger value="extraction">Extraction</TabsTrigger>
          <TabsTrigger value="matching">Matching</TabsTrigger>
          <TabsTrigger value="invoices">Invoices</TabsTrigger>
          <TabsTrigger value="usage">Usage</TabsTrigger>
          <TabsTrigger value="data">Data</TabsTrigger>
        </TabsList>

        <TabsContent value="extraction" className="mt-6 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Provider</CardTitle>
              <CardDescription>
                Which model reads an invoice. Both providers return the same
                object and pass the same validation, so swapping one for the
                other changes nothing downstream.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ProviderSettings providers={providers} selected={selected} />
            </CardContent>
          </Card>

          {catalogue && (
            <Card>
              <CardHeader>
                <CardTitle>Model</CardTitle>
                <CardDescription>
                  Which model on OpenRouter reads the invoice. They differ by
                  more than twenty times in price for the same job, so this is
                  worth choosing rather than accepting.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {catalogue.ok ? (
                  <ModelPicker
                    selected={chosenModel}
                    stale={catalogue.stale}
                    models={catalogue.models.map((m) => ({
                      id: m.id,
                      name: m.name,
                      cost: formatCost(m.cost),
                      recommended: m.recommended,
                    }))}
                  />
                ) : (
                  <p className="text-destructive text-sm">
                    {catalogue.reason} The model list will appear once
                    OpenRouter is reachable.
                  </p>
                )}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="usage" className="mt-6 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>What extraction has cost</CardTitle>
              <CardDescription>
                Every provider call, including the ones that failed. Priced at
                the model&apos;s catalogue rate when the call was made.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Usage label="Today" usage={today} />
              <Separator />
              <Usage label="This month" usage={month} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="matching" className="mt-6 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Item matching thresholds</CardTitle>
              <CardDescription>
                How close two descriptions have to be before they are treated as
                the same thing. The right values depend on how varied the real
                invoices are, which is why they are settings rather than
                constants.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <NumberSetting
                action={saveThresholds}
                fields={[
                  {
                    name: "link",
                    label: "Link automatically at",
                    note: "At or above this, the line is linked without asking.",
                    value: thresholds.link,
                    min: 0.05,
                    max: 1,
                    step: 0.01,
                  },
                  {
                    name: "suggest",
                    label: "Suggest from",
                    note: "Between the two, the line waits in Suggestions. Below it, a new catalogue item.",
                    value: thresholds.suggest,
                    min: 0.05,
                    max: 1,
                    step: 0.01,
                  },
                ]}
              >
                <p className="text-muted-foreground text-sm">
                  Measured on real descriptions, the bands overlap: two
                  different cartridges scored 0.79 while two spellings of one
                  stapler scored 0.69. Lowering the link threshold to catch the
                  stapler would merge the cartridges, and a wrong merge is
                  invisible in a spend figure while an unanswered suggestion is
                  visible in a queue.
                </p>
              </NumberSetting>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="invoices" className="mt-6 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Invoice defaults</CardTitle>
              <CardDescription>
                An invoice whose figures disagree by more than the tolerance is
                held for review instead of being saved as confirmed.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <NumberSetting
                action={saveTolerance}
                fields={[
                  {
                    name: "tolerance",
                    label: "Rounding tolerance",
                    note: "In rupees. A difference at or under this is forgiven; anything more holds the invoice.",
                    value: tolerance,
                    min: 0,
                    max: 100,
                    // Paise, because the checks compare in paise. A coarser
                    // step would have the browser refuse figures the server
                    // accepts, such as 4.99.
                    step: 0.01,
                  },
                ]}
              />
              <Separator />
              <dl className="grid gap-3 sm:grid-cols-2">
                <Reading label="Financial year starts" value="1 April" />
              </dl>
              <p className="text-muted-foreground text-xs">
                The financial year is fixed at 1 April and nothing reads it yet.
                A control for a value nothing reads would look like a setting
                and change nothing, so it stays a reading until a screen groups
                spend by year.
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="data" className="mt-6 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Data</CardTitle>
              <CardDescription>
                The demo dataset is marked as demo data in the database, so
                resetting it cannot remove a real invoice.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-muted-foreground text-sm">
                Reset and export run from the command line for now:{" "}
                <code className="bg-muted rounded px-1.5 py-0.5 font-mono text-xs">
                  npm run seed
                </code>
              </p>
              <Separator />
              <Pending issue={19} what="CSV export and a reset button" />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </main>
  );
}

function Reading({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-muted-foreground text-xs uppercase tracking-wide">{label}</dt>
      <dd className="mt-0.5 text-sm font-medium tabular-nums">{value}</dd>
    </div>
  );
}
