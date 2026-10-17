import assert from "node:assert/strict";
import test from "node:test";
import { formatTransactionDateTime, getAverageOrderValue, getRecentTransactions } from "../src/domain/summary.js";

test("average order value uses completed transactions and returns zero for empty history", () => {
  assert.equal(getAverageOrderValue([]), 0);
  assert.equal(getAverageOrderValue([
    { totalDue: 60 },
    { totalDue: 35 },
    { totalDue: 0 },
  ]), 95 / 3);
  assert.equal(getAverageOrderValue([{ totalDue: 25 }, { totalDue: "not-a-number" }]), 25);
});

test("recent transactions sort newest first without mutating saved history", () => {
  const history = [
    { id: "older", completedAt: "2026-10-11T09:00:00.000Z" },
    { id: "newest", completedAt: "2026-10-12T09:00:00.000Z" },
    { id: "middle", completedAt: "2026-10-11T12:00:00.000Z" },
  ];

  assert.deepEqual(getRecentTransactions(history, 2).map(({ id }) => id), ["newest", "middle"]);
  assert.deepEqual(history.map(({ id }) => id), ["older", "newest", "middle"]);
  assert.deepEqual(getRecentTransactions([], 8), []);
});

test("older transactions fall back to their saved date and time labels", () => {
  assert.equal(formatTransactionDateTime({ date: "Oct 11, 2026", time: "9:00 AM" }), "Oct 11, 2026 · 9:00 AM");
  assert.equal(formatTransactionDateTime({}), "Date unavailable");
});
