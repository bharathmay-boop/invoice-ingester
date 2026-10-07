// A contract is read once and then answers one question forever: what rate was
// in force on this date. Everything here protects that answer.
import assert from "node:assert/strict";
import { test } from "node:test";

import { parseContractResponse } from "../lib/contracts/schema.ts";

const rate = {
  printed_name: "A4 Paper 80 GSM",
  unit: "ream",
  rate: 285,
  effective_from: null,
  effective_to: null,
  page: 44,
  quote: "A4 Paper 80 GSM, per ream - Rs. 285.00",
};

const contract = {
  vendor_name: "Sharma Paper Products",
  vendor_address: "12 Mill Road, Pune",
  tax_id: "27AAACB6134D1Z4",
  tax_id_kind: "gstin" as const,
  currency: "INR" as const,
  effective_from: "2025-04-01",
  effective_to: "2026-03-31",
  rates: [rate],
  other_terms: [],
};

const reply = (over: Record<string, unknown> = {}) => ({
  reason: "A rate contract between two companies.",
  is_contract: true,
  contract: { ...contract, ...over },
});

test("a rate with no dates of its own takes the contract's", () => {
  const result = parseContractResponse(reply());
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.contract.rates[0].effective_from, "2025-04-01");
  assert.equal(result.contract.rates[0].effective_to, "2026-03-31");
});

test("a rate keeps its own dates over the contract's", () => {
  // This is what makes an escalation work without a rule to interpret later: a
  // revision letter's rate overrides the period it sits inside.
  const result = parseContractResponse(
    reply({ rates: [{ ...rate, effective_from: "2025-10-01", effective_to: null }] }),
  );
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.contract.rates[0].effective_from, "2025-10-01");
  assert.equal(result.contract.rates[0].effective_to, "2026-03-31");
});

test("a rate that ends up with no date at all is dropped", () => {
  // A rate in force either always or never cannot answer the only question
  // this exists to answer, so it is better gone than stored.
  const result = parseContractResponse(
    reply({ effective_from: null, effective_to: null, rates: [rate] }),
  );
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.contract.rates.length, 0);
});

test("an escalation written out as dated rates stays three rates", () => {
  const result = parseContractResponse(
    reply({
      rates: [
        { ...rate, rate: 100, effective_from: "2025-04-01", effective_to: "2026-03-31" },
        { ...rate, rate: 105, effective_from: "2026-04-01", effective_to: "2027-03-31" },
        { ...rate, rate: 110.25, effective_from: "2027-04-01", effective_to: null },
      ],
    }),
  );
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(
    result.contract.rates.map((r) => r.rate),
    [100, 105, 110.25],
  );
});

test("a contract with no rate card is a contract, not a failure", () => {
  // A services agreement with a revenue share and no price list is ordinary.
  const result = parseContractResponse(
    reply({
      rates: [],
      other_terms: [
        {
          kind: "revenue_share",
          label: "Share of collections",
          summary: "Eighteen percent of amounts collected, paid quarterly.",
          page: 9,
          quote: "the Supplier shall receive eighteen percent (18%)",
        },
      ],
    }),
  );
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.contract.rates.length, 0);
  assert.equal(result.contract.other_terms[0].kind, "revenue_share");
});

test("a document the model declines is not a failure either", () => {
  const result = parseContractResponse({
    reason: "This is a purchase order, not a contract.",
    is_contract: false,
    contract: null,
  });
  assert.equal(result.ok, false);
  assert.equal(result.ok === false && result.notContract, true);
});

test("a yes with nothing attached is a failure", () => {
  const result = parseContractResponse({ reason: "A contract.", is_contract: true, contract: null });
  assert.equal(result.ok, false);
  assert.equal(result.ok === false && result.notContract, undefined);
});

test("a lowercase currency is canonicalized rather than failing the whole read", () => {
  // The mirror of "currency is stored as an uppercase canonical code" in
  // logic.test.ts. The invoice side had that test and this side did not, which
  // is why the asymmetry survived: the same model output passed on an invoice
  // and failed a contract that had been read perfectly.
  const result = parseContractResponse(reply({ currency: " eur " }));
  assert.equal(result.ok, true);
  assert.equal(result.ok && result.contract.currency, "EUR");
});

test("a malformed reply fails with something readable rather than throwing", () => {
  const result = parseContractResponse(reply({ currency: "GBP" }));
  assert.equal(result.ok, false);
  if (result.ok || result.notContract) return assert.fail("should have been a plain failure");
  assert.match(result.failure.message, /did not validate/);
  assert.equal(result.failure.retryable, false);
});
