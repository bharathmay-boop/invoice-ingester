// The demo contracts, checked the way the product reads them.
//
// The point of giving the demo its own documents was that a rate nobody can
// point at is a claim rather than a fact. So the test that matters is the round
// trip: generate the PDF, read it back with the same `unpdf` path the worker
// uses, and locate every stored quote with the same function the review screen
// relies on. If a quote is not on the page it claims, the demo makes the same
// promise the review screen makes and does not keep it.
import assert from "node:assert/strict";
import { test } from "node:test";

import { contractPdf } from "../lib/demo/contract-pdf.ts";
import { contracts } from "../lib/demo/contracts.ts";
import { items, vendors } from "../lib/demo/dataset.ts";
import { locate, readPages } from "../lib/contracts/locate.ts";

test("every quote is on the page its rate claims", async () => {
  for (const contract of contracts) {
    const pages = await readPages(contractPdf(contract.pages));
    assert.equal(pages.length, contract.pages.length, contract.title);

    for (const rate of contract.rates) {
      const found = locate(pages, rate.quote);
      assert.equal(
        found.page,
        rate.page,
        `${contract.title}: "${rate.quote}" claims page ${rate.page}, located ${found.page}`,
      );
    }
  }
});

test("every other term is on its page too", async () => {
  // Shown to the reader beside the rates, with the same jump to the page, so
  // the same promise applies.
  for (const contract of contracts) {
    const pages = await readPages(contractPdf(contract.pages));
    for (const term of contract.otherTerms) {
      assert.equal(locate(pages, term.quote).page, term.page, `${contract.title}: ${term.label}`);
    }
  }
});

test("a generated contract is not mistaken for a scan", async () => {
  // `scanned` is what the review screen uses to say nothing can be located.
  // A generated document has a text layer, so claiming otherwise would send
  // somebody to re-scan a document that reads perfectly.
  for (const contract of contracts) {
    const pages = await readPages(contractPdf(contract.pages));
    assert.equal(locate(pages, null).scanned, false, contract.title);
  }
});

test("every contract belongs to a demo supplier", () => {
  const known = new Set(vendors.map((vendor) => vendor.gstin));
  for (const contract of contracts) {
    assert.ok(known.has(contract.gstin), `${contract.title} has no demo supplier`);
  }
});

test("every priced rate points at an item the demo actually has", () => {
  // A rate pointing at an item that does not exist is invisible to the lookup,
  // so the contract would be live and check nothing.
  const known = new Set(items.map((item) => item.normalizedName));
  for (const contract of contracts) {
    for (const rate of contract.rates) {
      if (rate.item === null) continue;
      assert.ok(known.has(rate.item), `${contract.title}: ${rate.printedName} -> ${rate.item}`);
    }
  }
});

test("no rate is in force outside its own contract's period", () => {
  for (const contract of contracts) {
    for (const rate of contract.rates) {
      assert.ok(
        rate.effectiveFrom >= contract.effectiveFrom,
        `${contract.title}: ${rate.printedName} starts before the contract does`,
      );
      if (contract.effectiveTo && rate.effectiveTo) {
        assert.ok(
          rate.effectiveTo <= contract.effectiveTo,
          `${contract.title}: ${rate.printedName} runs past the contract`,
        );
      }
      if (contract.effectiveTo) {
        assert.ok(
          rate.effectiveTo !== null,
          `${contract.title}: ${rate.printedName} is open ended inside a contract that ends`,
        );
      }
    }
  }
});

test("the demo covers the answers it exists to show", () => {
  // Not the tags themselves, which `recomputeVariance` writes against the
  // database, but the conditions that produce them. Each of these is a
  // deliberate property of the data and each would be easy to lose in an edit
  // that looked harmless.
  const byGstin = new Map(contracts.map((contract) => [contract.gstin, contract]));

  const lapsed = byGstin.get("29AACFN5678G1Z2");
  assert.equal(lapsed?.effectiveTo, "2026-06-30", "a contract has to lapse mid year");

  const open = byGstin.get("29AAECV3456J1Z4");
  assert.equal(open?.effectiveTo, null, "one contract has to be open ended");

  const revised = byGstin.get("29AABCA1234F1Z5");
  const paper = revised?.rates.filter((rate) => rate.printedName === "A4 Paper 500 Sheets") ?? [];
  assert.equal(paper.length, 2, "paper has to be priced over two periods");
  assert.notEqual(paper[0].rate, paper[1].rate, "and at two different rates");

  const packSize = contracts
    .flatMap((contract) => contract.rates)
    .find((rate) => rate.unit.startsWith("box of"));
  assert.ok(packSize, "something has to be agreed by a pack size, so units_differ shows");

  // One supplier with no contract at all, which is the silence case.
  assert.ok(
    vendors.some((vendor) => !byGstin.has(vendor.gstin)),
    "a supplier has to be left uncontracted",
  );
});
