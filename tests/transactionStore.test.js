import assert from "node:assert/strict";
import test from "node:test";
import { appendTransaction, hasReceiptData, loadTransactions, transactionStorageKey } from "../src/services/transactionStore.js";

function installFakeStorage() {
  const values = new Map();
  globalThis.window = {
    localStorage: {
      getItem(key) { return values.has(key) ? values.get(key) : null; },
      setItem(key, value) { values.set(key, String(value)); },
    },
  };
  return values;
}

const transaction = {
  id: "txn-1",
  completedAt: "2026-10-11T02:00:00.000Z",
  businessDate: "2026-10-11",
  subtotal: 75,
  discount: 15,
  totalDue: 60,
  cashPaid: 70,
  change: 10,
  freeDrinks: 1,
  itemCount: 3,
  items: [
    { id: 1, name: "Kanin", unitPrice: 15, quantity: 1, lineTotal: 15 },
    { id: 2, name: "Ulam", unitPrice: 35, quantity: 1, lineTotal: 35 },
    { id: 4, name: "Ice Cream", unitPrice: 25, quantity: 1, lineTotal: 25 },
  ],
};

test("completed transactions persist in versioned local storage and reload after a fresh read", () => {
  const values = installFakeStorage();
  assert.deepEqual(loadTransactions(), { transactions: [], error: null });
  const saved = appendTransaction(transaction);
  assert.equal(saved.length, 1);
  assert.equal(saved[0].transactionNumber, "JR-20261011-001");
  assert.equal(typeof saved[0].date, "string");
  assert.equal(typeof saved[0].time, "string");
  assert.equal(hasReceiptData(saved[0]), true);

  // A second load simulates the app initializing again after a page refresh.
  assert.deepEqual(loadTransactions(), { transactions: saved, error: null });
  const persisted = JSON.parse(values.get(transactionStorageKey));
  assert.equal(persisted.version, 1);
  assert.equal(persisted.transactions[0].id, transaction.id);
});

test("duplicate ids and malformed saved history are rejected rather than overwritten", () => {
  installFakeStorage();
  appendTransaction(transaction);
  assert.throws(() => appendTransaction(transaction), /already been recorded/);

  globalThis.window.localStorage.setItem(transactionStorageKey, "not-json");
  assert.match(loadTransactions().error, /JSON|position|property/i);
  assert.throws(() => appendTransaction({ ...transaction, id: "txn-2" }));
});

test("receipt numbers advance per business day and legacy summary rows without receipt detail remain readable", () => {
  const values = installFakeStorage();
  const first = appendTransaction(transaction)[0];
  const second = appendTransaction({ ...transaction, id: "txn-2" })[1];
  assert.equal(first.transactionNumber, "JR-20261011-001");
  assert.equal(second.transactionNumber, "JR-20261011-002");

  const oldButComplete = { ...transaction };
  values.set(transactionStorageKey, JSON.stringify({ version: 1, transactions: [oldButComplete] }));
  const loadedComplete = loadTransactions();
  assert.equal(loadedComplete.error, null);
  assert.equal(hasReceiptData(loadedComplete.transactions[0]), true);

  const legacy = { id: "legacy-1", completedAt: "2026-10-11T01:00:00.000Z", businessDate: "2026-10-11", totalDue: 42 };
  values.set(transactionStorageKey, JSON.stringify({ version: 1, transactions: [legacy] }));
  const loaded = loadTransactions();
  assert.equal(loaded.error, null);
  assert.deepEqual(loaded.transactions, [legacy]);
  assert.equal(hasReceiptData(legacy), false);
});

test("local storage write failures surface to the caller", () => {
  globalThis.window = { localStorage: { getItem: () => null, setItem: () => { throw new Error("quota exceeded"); } } };
  assert.throws(() => appendTransaction(transaction), /quota exceeded/);
});
