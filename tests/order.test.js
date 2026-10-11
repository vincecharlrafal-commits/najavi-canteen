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
  getDailyStats,
  getOrderTotals,
  getPaymentResult,
  removeProductFromCart,
} from "../src/domain/order.js";

const product = (id, name, price) => ({ id, name, price, quantity: 1 });
const kanin = { id: 1, name: "Kanin", price: 15 };
const ulam = { id: 2, name: "Ulam", price: 35 };
const softdrinks = { id: 3, name: "Softdrinks", price: 20 };
const iceCream = { id: 4, name: "Ice Cream", price: 25 };

test("all menu image assets exist and product prices remain correct", () => {
  const assetRoot = fileURLToPath(new URL("../src/assets/", import.meta.url));
  for (const file of ["kanin.png", "ulam.png", "softdrinks.png", "ice_cream.png"]) {
    assert.equal(existsSync(`${assetRoot}${file}`), true, `${file} should exist`);
  }
  assert.deepEqual([kanin.price, ulam.price, softdrinks.price, iceCream.price], [15, 35, 20, 25]);
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
  assert.deepEqual(removeProductFromCart(secondProductCart, kanin.id).map((item) => item.id), [ulam.id]);
  assert.deepEqual(clearCart(), []);
});

test("subtotal and promotion totals cover ₱70, ₱75, ₱100, and dropping below threshold", () => {
  const at70 = [product(1, "Kanin", 15), product(2, "Ulam", 35), product(3, "Softdrinks", 20)];
  const at75 = [product(1, "Kanin", 15), product(2, "Ulam", 35), product(4, "Ice Cream", 25)];
  const at100 = [product(1, "Kanin", 15), product(2, "Ulam", 35), { ...product(4, "Ice Cream", 25), quantity: 2 }];

  assert.deepEqual(getOrderTotals(at70), { subtotal: 70, discount: 0, totalDue: 70, freeDrinks: 0, amountToPromotion: 5, promotionProgress: 100 * 70 / 75 });
  assert.deepEqual(getOrderTotals(at75), { subtotal: 75, discount: 15, totalDue: 60, freeDrinks: 1, amountToPromotion: 0, promotionProgress: 100 });
  assert.deepEqual(getOrderTotals(at100), { subtotal: 100, discount: 15, totalDue: 85, freeDrinks: 1, amountToPromotion: 0, promotionProgress: 100 });

  const below = changeCartQuantity(at75, 4, -1);
  assert.deepEqual([getOrderTotals(below).discount, getOrderTotals(below).totalDue, getOrderTotals(below).freeDrinks], [0, 50, 0]);
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
  const cart = [{ ...kanin, quantity: 1 }, { ...ulam, quantity: 1 }, { ...iceCream, quantity: 2 }];
  const completedAt = new Date("2026-10-11T10:00:00+08:00");
  const record = buildTransactionRecord(cart, "120", completedAt, "txn-test");
  assert.deepEqual({ subtotal: record.subtotal, discount: record.discount, totalDue: record.totalDue, cashPaid: record.cashPaid, change: record.change, freeDrinks: record.freeDrinks, itemCount: record.itemCount }, {
    subtotal: 100, discount: 15, totalDue: 85, cashPaid: 120, change: 35, freeDrinks: 1, itemCount: 4,
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
