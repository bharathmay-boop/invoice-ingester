import Link from "next/link";
import { cookies } from "next/headers";
import { isValidSession, sessionCookie } from "@/lib/auth.ts";
import { getProvider, PROVIDER_LABEL, SECRET_FOR } from "@/lib/extract/provider.ts";
import { describeSecret } from "@/lib/settings/store.ts";
import { estimateBatch } from "@/lib/extract/estimate.ts";
import { Dropzone } from "./dropzone.tsx";
import { UploadTabs } from "./upload-tabs.tsx";
import { ContractDropzone } from "../contracts/contract-dropzone.tsx";
import { CONTRACT_READER_SECRET } from "@/lib/contracts/read.ts";
import { uploadKind } from "@/lib/upload-kind.ts";

export const dynamic = "force-dynamic";

export const metadata = { title: "Upload" };

export default async function Upload({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string | string[] }>;
}) {
  const { kind } = await searchParams;
  const jar = await cookies();
  const signedIn = await isValidSession(jar.get(sessionCookie.name)?.value);

  const provider = await getProvider();
  const estimate = await estimateBatch(provider);
  const key = await describeSecret(SECRET_FOR[provider]);
  const ready = signedIn && key.present;
  const contractKey = await describeSecret(CONTRACT_READER_SECRET);

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8 sm:px-6 sm:py-12">
      <h1 className="text-2xl font-semibold sm:text-3xl">Upload</h1>
      <p className="text-muted-foreground mt-2 max-w-prose text-sm">
        Drop an invoice or a contract in and it is read, checked and held for
        you to confirm. Nothing counts until you do.
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

      <UploadTabs
        initial={uploadKind(kind)}
        explicit={kind !== undefined}
        invoices={
          <>
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
            <Dropzone enabled={ready} estimate={estimate} />
          </>
        }
        contracts={
          signedIn ? (
            <>
              {!contractKey.present && (
                <Notice>
                  Contracts are read through OpenRouter, and no OpenRouter key is saved.{" "}
                  <Link href="/settings" className="underline">
                    Add one in settings
                  </Link>
                  , then come back.
                </Notice>
              )}
              <ContractDropzone />
              <p className="text-muted-foreground mt-4 text-sm">
                Contracts are read in the background and wait on{" "}
                <Link href="/contracts" className="underline">
                  Contracts
                </Link>{" "}
                for you to review.
              </p>
            </>
          ) : (
            <Notice>Uploading needs the password.</Notice>
          )
        }
      />
    </main>
  );
}

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-6 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm">
      {children}
    </p>
  );
}
