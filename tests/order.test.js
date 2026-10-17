import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  addProductToCart,
  buildTransactionRecord,
  changeCartQuantity,
  clearCart,
  getCartItemCount,
  getProductQuantity,
  getDailyStats,
  getOrderTotals,
  getPaymentResult,
  removeProductFromCart,
} from "../src/domain/order.js";

const product = (id, name, price) => ({ id, name, price, quantity: 1 });
const kanin = { id: 1, name: "Kanin", price: 15 };
const ulam = { id: 2, name: "Ulam", price: 35 };
const softdrinks = { id: 3, name: "Softdrinks", price: 15 };
const iceCream = { id: 4, name: "Ice Cream", price: 10 };

test("all menu image assets exist and product prices remain correct", () => {
  const assetRoot = fileURLToPath(new URL("../src/assets/", import.meta.url));
  for (const file of ["kanin.png", "ulam.png", "softdrinks.png", "ice_cream.png"]) {
    assert.equal(existsSync(`${assetRoot}${file}`), true, `${file} should exist`);
  }
  assert.deepEqual([kanin.price, ulam.price, softdrinks.price, iceCream.price], [15, 35, 15, 10]);
});

test("cart adds duplicates as quantities, decrements to removal, and rejects invalid quantity changes", () => {
  let cart = addProductToCart([], kanin);
  cart = addProductToCart(cart, kanin);
  assert.equal(cart.length, 1);
  assert.equal(cart[0].quantity, 2);

  cart = changeCartQuantity(cart, kanin.id, -1);
  assert.equal(cart[0].quantity, 1);
  assert.equal(changeCartQuantity(cart, kanin.id, 0)[0].quantity, 1);
  assert.equal(changeCartQuantity(cart, kanin.id, 0.5)[0].quantity, 1);
  assert.deepEqual(changeCartQuantity(cart, kanin.id, -1), []);
  const secondProductCart = addProductToCart(cart, ulam);
  assert.equal(getCartItemCount(secondProductCart), 2);
  assert.equal(getProductQuantity(secondProductCart, kanin.id), 1);
  assert.equal(getProductQuantity(secondProductCart, ulam.id), 1);
  assert.equal(getProductQuantity(secondProductCart, softdrinks.id), 0);
  const steppedUpCart = changeCartQuantity(secondProductCart, kanin.id, 1);
  assert.equal(getProductQuantity(steppedUpCart, kanin.id), 2);
  assert.equal(getProductQuantity(changeCartQuantity(steppedUpCart, kanin.id, -1), kanin.id), 1);
  assert.deepEqual(removeProductFromCart(secondProductCart, kanin.id).map((item) => item.id), [ulam.id]);
  assert.deepEqual(clearCart(), []);
});

test("quantity updates preserve cart order and the identity of unaffected items", () => {
  const cart = [kanin, ulam, softdrinks].map((item) => ({ ...item, quantity: 1 }));
  const updated = changeCartQuantity(cart, ulam.id, 1);

  assert.deepEqual(updated.map(({ id }) => id), [kanin.id, ulam.id, softdrinks.id]);
  assert.equal(updated[0], cart[0]);
  assert.equal(updated[2], cart[2]);
  assert.notEqual(updated[1], cart[1]);
  assert.equal(updated[1].quantity, 2);
});

test("subtotal and promotion totals cover ₱65, ₱75, ₱80, and dropping below threshold", () => {
  const at65 = [product(1, "Kanin", 15), product(2, "Ulam", 35), product(3, "Softdrinks", 15)];
  const at75 = [product(2, "Ulam", 35), { ...product(4, "Ice Cream", 10), quantity: 4 }];
  const at85 = [product(1, "Kanin", 15), product(2, "Ulam", 35), { ...product(4, "Ice Cream", 10), quantity: 3 }];

  assert.deepEqual(getOrderTotals(at65), { subtotal: 65, discount: 0, totalDue: 65, freeDrinks: 0, amountToPromotion: 10, promotionProgress: 100 * 65 / 75 });
  assert.deepEqual(getOrderTotals(at75), { subtotal: 75, discount: 15, totalDue: 60, freeDrinks: 1, amountToPromotion: 0, promotionProgress: 100 });
  assert.deepEqual(getOrderTotals(at85), { subtotal: 80, discount: 15, totalDue: 65, freeDrinks: 1, amountToPromotion: 0, promotionProgress: 100 });

  const below = changeCartQuantity(at75, 4, -1);
  assert.deepEqual([getOrderTotals(below).discount, getOrderTotals(below).totalDue, getOrderTotals(below).freeDrinks], [0, 65, 0]);
});

test("cash payment rejects empty, malformed, negative, and insufficient amounts and calculates change", () => {
  assert.equal(getPaymentResult("", 70).reason, "empty");
  assert.equal(getPaymentResult("12x", 70).reason, "invalid");
  assert.equal(getPaymentResult("-1", 70).reason, "invalid");
  assert.deepEqual(getPaymentResult("50", 70), { valid: false, reason: "insufficient", change: null, amountNeeded: 20 });
  assert.equal(getPaymentResult("70", 70).change, 0);
  assert.equal(getPaymentResult("100", 70).change, 30);
  assert.equal(getPaymentResult("100", 85).change, 15);
  assert.equal(getPaymentResult("70.25", 70).change, 0.25);
});

test("only a valid, non-empty paid order can become a transaction record", () => {
  const cart = [{ ...kanin, quantity: 1 }, { ...ulam, quantity: 1 }, { ...iceCream, quantity: 3 }];
  const completedAt = new Date("2026-10-11T10:00:00+08:00");
  const record = buildTransactionRecord(cart, "120", completedAt, "txn-test");
  assert.deepEqual({ subtotal: record.subtotal, discount: record.discount, totalDue: record.totalDue, cashPaid: record.cashPaid, change: record.change, freeDrinks: record.freeDrinks, itemCount: record.itemCount }, {
    subtotal: 80, discount: 15, totalDue: 65, cashPaid: 120, change: 55, freeDrinks: 1, itemCount: 5,
  });
  assert.equal(record.items.reduce((total, item) => total + item.lineTotal, 0), record.subtotal);
  assert.throws(() => buildTransactionRecord([], "0", completedAt, "empty"));
  assert.throws(() => buildTransactionRecord(cart, "50", completedAt, "short"));
  assert.throws(() => buildTransactionRecord([{ ...kanin, quantity: -1 }], "20", completedAt, "invalid-quantity"));
});

test("daily summary counts completed transactions only", () => {
  const records = [
    { businessDate: "2026-10-11", totalDue: 60, freeDrinks: 1 },
    { businessDate: "2026-10-11", totalDue: 70, freeDrinks: 0 },
    { businessDate: "2026-10-10", totalDue: 30, freeDrinks: 0 },
  ];
  assert.deepEqual(getDailyStats(records, "2026-10-11"), {
    transactions: records.slice(0, 2), sales: 130, customers: 2, freeDrinks: 1,
  });
});
