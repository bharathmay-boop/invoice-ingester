"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { isValidSession, sessionCookie } from "@/lib/auth.ts";
import { pool } from "@/lib/db.ts";
import { amendRateRow } from "@/lib/contracts/amend.ts";
import { getThresholds } from "@/lib/items/match.ts";
import { applyDecisions, resolveRateItems } from "@/lib/contracts/items.ts";
import { applyReview } from "@/lib/contracts/confirm.ts";
import { resolveNewContractVendor } from "@/lib/vendors/resolve.ts";
import { track } from "@/lib/analytics/server.ts";
import { recomputeVariance } from "@/lib/contracts/recompute.ts";

export type ReviewOutcome = { ok: false; message: string } | null;

const UUID = /^[0-9a-f-]{36}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

async function signedIn() {
  const jar = await cookies();
  return isValidSession(jar.get(sessionCookie.name)?.value);
}

/**
 * Agree with what was read, and let the rates start counting.
 *
 * Everything a contract says is inert until this runs. That is deliberate: the
 * document was read by a cheap model over a couple of hundred pages, and the
 * only thing standing between a misread rate and a wrong variance flag is a
 * person who had the document open while they looked.
 *
 * The vendor is confirmed here rather than guessed at save time. A contract
 * names its parties in legal form, so resolving it silently would create a
 * second vendor beside the one the invoices use, every rate would look
 * plausible, and no invoice would ever be checked against it.
 */
export async function confirmContract(
  _previous: ReviewOutcome,
  form: FormData,
): Promise<ReviewOutcome> {
  if (!(await signedIn())) return { ok: false, message: "Sign in to review a contract." };

  const contractId = String(form.get("contractId") ?? "");
  if (!UUID.test(contractId)) return { ok: false, message: "That contract id is not an id." };

  const vendorChoice = String(form.get("vendorId") ?? "");
  const vendorName = String(form.get("vendorName") ?? "").trim();
  const vendorAddress = String(form.get("vendorAddress") ?? "").trim();
  const taxId = String(form.get("taxId") ?? "").trim();
  const taxIdKind = String(form.get("taxIdKind") ?? "").trim();

  if (vendorChoice !== "new" && !UUID.test(vendorChoice)) {
    return { ok: false, message: "Pick the supplier this contract is with." };
  }
  if (vendorChoice === "new" && !vendorName) {
    return { ok: false, message: "A new supplier needs a name." };
  }
  if (taxId && !["gstin", "vat", "ein"].includes(taxIdKind)) {
    return { ok: false, message: "Say what kind of tax number that is." };
  }

  const from = String(form.get("effectiveFrom") ?? "").trim();
  const to = String(form.get("effectiveTo") ?? "").trim();
  if (!DATE.test(from)) {
    return {
      ok: false,
      message: "A contract needs a start date. Without one, no invoice can be checked against it.",
    };
  }
  if (to && !DATE.test(to)) return { ok: false, message: "That end date is not a date." };
  if (to && to < from) return { ok: false, message: "The end date is before the start date." };

  let confirmedVendorId = "";
  // Read before a connection is held; see recomputeVariance.
  const { suggest } = await getThresholds();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    let vendorId = vendorChoice;
    if (vendorChoice === "new") {
      // Same identity rules as the invoice path, on purpose. Two definitions
      // of the same supplier is one too many, and the whole point of a
      // contract is to be found by the invoices that arrive against it.
      const resolved = await resolveNewContractVendor(client, {
        name: vendorName,
        address: vendorAddress,
        taxId,
        taxIdKind,
      });
      if (!resolved.ok) {
        await client.query("ROLLBACK");
        return resolved;
      }
      vendorId = resolved.id;
    }

    // Every rate gets an item first: one the reviewer picked, or a new one made
    // from the printed name, unless the catalogue already has something close
    // and they have not said which (#149). Then every rate inherits the vendor
    // and the confirmed period, and becomes live.
    // What the screen showed, written before anything is resolved from what
    // was stored.
    const decided = await applyDecisions(client, contractId, form.getAll("decision").map(String));
    if (!decided.ok) {
      await client.query("ROLLBACK");
      return { ok: false, message: decided.message };
    }
    const items = await resolveRateItems(client, contractId, suggest);
    if (!items.ok) {
      await client.query("ROLLBACK");
      return { ok: false, message: items.message };
    }
    await applyReview(client, { contractId, vendorId, from, to });

    await client.query("COMMIT");
    confirmedVendorId = vendorId;
  } catch (error) {
    await client.query("ROLLBACK");
    return {
      ok: false,
      message: error instanceof Error ? error.message : "That could not be saved.",
    };
  } finally {
    client.release();
  }

  // Every invoice already saved from this supplier is checked now, which is
  // the moment the epic is worth having: review one contract and months of
  // invoices answer back. Done after the commit rather than inside it, so a
  // slow recompute cannot hold the transaction that made the contract live.
  await recomputeVariance(confirmedVendorId);

  await track("contract_reviewed", { contract_id: contractId });
  revalidatePath(`/contracts/${contractId}`);
  revalidatePath("/findings");
  revalidatePath("/contracts");
  return null;
}

/**
 * Correct one rate before agreeing with the contract.
 *
 * Saved one at a time rather than as one big form, because a contract can
 * carry forty rates and losing a reviewer's forty corrections to one bad field
 * is the kind of thing that makes people stop reviewing.
 */
export async function amendRate(
  _previous: ReviewOutcome,
  form: FormData,
): Promise<ReviewOutcome> {
  if (!(await signedIn())) return { ok: false, message: "Sign in to correct a rate." };

  const rateId = String(form.get("rateId") ?? "");
  const contractId = String(form.get("contractId") ?? "");
  if (!UUID.test(rateId) || !UUID.test(contractId)) {
    return { ok: false, message: "That rate has already gone." };
  }

  const itemId = String(form.get("itemId") ?? "");
  const newItemName = String(form.get("newItemName") ?? "").trim();
  const rate = Number(String(form.get("rate") ?? ""));
  const unit = String(form.get("unit") ?? "").trim();

  if (!Number.isFinite(rate) || rate < 0) {
    return { ok: false, message: "A rate has to be a number, and not a negative one." };
  }
  if (itemId && itemId !== "new" && !UUID.test(itemId)) {
    return { ok: false, message: "That item is not an item." };
  }
  if (itemId === "new" && !newItemName) {
    return { ok: false, message: "A new item needs a name." };
  }
  if (newItemName.length > 200) {
    return { ok: false, message: "That item name is too long." };
  }

  const { rechecked } = await amendRateRow({
    rateId,
    contractId,
    itemId: UUID.test(itemId) ? itemId : null,
    newItemName: itemId === "new" ? newItemName : null,
    rate,
    unit,
  });

  // A live contract's invoices were just re-checked, so the screens that show
  // those findings are stale too.
  if (rechecked) {
    revalidatePath("/findings");
    revalidatePath("/contracts");
  }
  revalidatePath(`/contracts/${contractId}`);
  return null;
}
