import Link from "next/link";
import { cookies } from "next/headers";
import { isValidSession, sessionCookie } from "@/lib/auth.ts";
import { getProvider, PROVIDER_LABEL, SECRET_FOR } from "@/lib/extract/provider.ts";
import { describeSecret } from "@/lib/settings/store.ts";
import { Dropzone } from "./dropzone.tsx";

export const dynamic = "force-dynamic";

export const metadata = { title: "Upload" };

export default async function Upload() {
  const jar = await cookies();
  const signedIn = await isValidSession(jar.get(sessionCookie.name)?.value);

  const provider = await getProvider();
  const key = await describeSecret(SECRET_FOR[provider]);
  const ready = signedIn && key.present;

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8 sm:px-6 sm:py-12">
      <h1 className="text-2xl font-semibold sm:text-3xl">Upload</h1>
      <p className="text-muted-foreground mt-2 max-w-prose text-sm">
        Drop an invoice in and it is read, checked and held for you to confirm.
        Nothing is saved until you do.
      </p>

      {!signedIn && (
        <Notice>
          Reading the app is open to everyone, but uploading needs the password.{" "}
          <Link href="/login" className="underline">
            Sign in
          </Link>{" "}
          to add invoices.
        </Notice>
      )}

      {signedIn && !key.present && (
        <Notice>
          No {PROVIDER_LABEL[provider]} key is saved, so there is nothing to read
          the invoice with.{" "}
          <Link href="/settings" className="underline">
            Add one in settings
          </Link>
          , then come back.
        </Notice>
      )}

      <div className="mt-8">
        <Dropzone enabled={ready} />
      </div>
    </main>
  );
}

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-6 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm">
      {children}
    </p>
  );
}
