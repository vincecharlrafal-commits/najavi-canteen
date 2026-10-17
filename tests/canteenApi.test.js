import assert from "node:assert/strict";
import test from "node:test";
import { fetchMenu, requestCheckout, requestQuote } from "../src/services/canteenApi.js";

function mockFetch(handler) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = handler;
  return () => { globalThis.fetch = originalFetch; };
}

test("menu integration reads authoritative server menu data", async () => {
  const restore = mockFetch(async (url, options) => {
    assert.equal(url, "/api/menu");
    assert.equal(options.method, undefined);
    return Response.json({ items: [{ id: 1, name: "Kanin", price: 15 }] });
  });
  try {
    assert.deepEqual(await fetchMenu(), [{ id: 1, name: "Kanin", price: 15 }]);
  } finally {
    restore();
  }
});

test("quote sends only item IDs and quantities and returns Python totals unchanged", async () => {
  const expected = {
    items: [
      { id: 2, name: "Ulam", unitPrice: 35, quantity: 1, lineTotal: 35 },
      { id: 4, name: "Ice Cream", unitPrice: 10, quantity: 4, lineTotal: 40 },
    ],
    subtotal: 75,
    discount: 15,
    totalDue: 60,
    freeDrinks: 1,
  };
  const restore = mockFetch(async (url, options) => {
    assert.equal(url, "/api/quote");
    assert.equal(options.method, "POST");
    assert.deepEqual(JSON.parse(options.body), { items: [{ id: 2, quantity: 1 }, { id: 4, quantity: 4 }] });
    return Response.json(expected);
  });
  try {
    assert.deepEqual(await requestQuote([{ id: 2, quantity: 1 }, { id: 4, quantity: 4 }]), expected);
  } finally {
    restore();
  }
});

test("checkout uses the Flask schema and returns its receipt", async () => {
  const receipt = { items: [], subtotal: 35, discount: 0, totalDue: 35, freeDrinks: 0, cashPaid: 50, change: 15 };
  const restore = mockFetch(async (url, options) => {
    assert.equal(url, "/api/checkout");
    assert.equal(options.method, "POST");
    assert.equal(options.headers["Content-Type"], "application/json");
    assert.deepEqual(JSON.parse(options.body), { items: [{ id: 2, quantity: 1 }], payment: 50 });
    return Response.json({ receipt });
  });
  try {
    assert.deepEqual(await requestCheckout([{ id: 2, quantity: 1 }], 50), receipt);
  } finally {
    restore();
  }
});

test("API errors and unavailable Flask server return clear errors", async () => {
  let restore = mockFetch(async () => Response.json({ error: { message: "Insufficient payment. Amount still needed: 10 pesos." } }, { status: 400 }));
  try {
    await assert.rejects(requestCheckout([{ id: 2, quantity: 1 }], 25), /Insufficient payment/);
  } finally {
    restore();
  }

  restore = mockFetch(async () => { throw new TypeError("fetch failed"); });
  try {
    await assert.rejects(fetchMenu(), /Canteen server is unavailable/);
  } finally {
    restore();
  }
});
