import assert from "node:assert/strict";
import test from "node:test";
import { completeCheckout } from "../src/services/checkout.js";
import { getDailyStats } from "../src/domain/order.js";
import { loadTransactions, transactionStorageKey } from "../src/services/transactionStore.js";

function installFakeStorage() {
  const values = new Map();
  globalThis.window = { localStorage: {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
  } };
  return values;
}

const serverReceipt = {
  items: [
    { id: 2, name: "Ulam", unitPrice: 35, quantity: 1, lineTotal: 35 },
    { id: 4, name: "Ice Cream", unitPrice: 10, quantity: 4, lineTotal: 40 },
  ],
  subtotal: 75,
  discount: 15,
  totalDue: 60,
  freeDrinks: 1,
  cashPaid: 70,
  change: 10,
};

test("successful Python checkout is adapted and saved in the existing localStorage transaction format", async () => {
  installFakeStorage();
  let savedRecord;
  const result = await completeCheckout([{ id: 2, quantity: 1 }, { id: 4, quantity: 4 }], 70, {
    checkoutRequest: async (items, payment) => {
      assert.deepEqual(items, [{ id: 2, quantity: 1 }, { id: 4, quantity: 4 }]);
      assert.equal(payment, 70);
      return serverReceipt;
    },
    createMetadata: () => ({ id: "backend-checkout-1", completedAt: new Date("2026-10-17T10:00:00+08:00") }),
    saveTransaction: (record) => {
      savedRecord = record;
      return [{ ...record, transactionNumber: "JR-20261017-001" }];
    },
  });

  assert.equal(result.receipt.totalDue, 60);
  assert.deepEqual({ subtotal: savedRecord.subtotal, discount: savedRecord.discount, totalDue: savedRecord.totalDue, cashPaid: savedRecord.cashPaid, change: savedRecord.change }, {
    subtotal: 75, discount: 15, totalDue: 60, cashPaid: 70, change: 10,
  });
  assert.equal(savedRecord.items[1].unitPrice, 10);
  assert.equal(savedRecord.freeDrinks, 1);
});

test("failed backend checkout does not save a transaction", async () => {
  const values = installFakeStorage();
  await assert.rejects(completeCheckout([{ id: 2, quantity: 1 }], 20, {
    checkoutRequest: async () => { throw new Error("Insufficient payment."); },
  }), /Insufficient payment/);
  assert.equal(values.has(transactionStorageKey), false);
});

test("browser Summary continues to calculate only from persisted transactions", async () => {
  installFakeStorage();
  await completeCheckout([{ id: 2, quantity: 1 }, { id: 4, quantity: 4 }], 70, {
    checkoutRequest: async () => serverReceipt,
    createMetadata: () => ({ id: "summary-checkout", completedAt: new Date("2026-10-17T10:00:00+08:00") }),
  });
  const stored = loadTransactions();
  const stats = getDailyStats(stored.transactions, "2026-10-17");
  assert.deepEqual({ sales: stats.sales, customers: stats.customers, freeDrinks: stats.freeDrinks }, { sales: 60, customers: 1, freeDrinks: 1 });
});
