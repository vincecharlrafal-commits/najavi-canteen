import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createDebouncedQuoteRequester, getQuotePresentation, getRewardProgress, getVisibleLineTotal } from "../src/services/quoteLifecycle.js";

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

test("checkout stays disabled while the last successful quote is only display data", () => {
  const previousQuote = {
    items: [{ id: 1, unitPrice: 15, lineTotal: 15 }],
    subtotal: 30,
    discount: 0,
    totalDue: 30,
    freeDrinks: 0,
  };
  const state = { signature: '[{"id":1,"quantity":1}]', status: "loading", data: previousQuote, error: null };
  const presentation = getQuotePresentation(state, '[{"id":1,"quantity":2}]', true);

  assert.equal(presentation.currentQuote, null, "stale data is not valid for checkout");
  assert.equal(presentation.displayQuote, previousQuote, "the reward display retains its last successful quote");
  assert.equal(getVisibleLineTotal(presentation.displayQuote.items[0]), "₱15.00", "an existing line total stays visible during refresh");
  assert.equal(getVisibleLineTotal(presentation.displayQuote.items.find(({ id }) => id === 2)), null, "a newly added item has no fabricated quote line before the server responds");
  assert.deepEqual(
    [presentation.displayQuote.subtotal, presentation.displayQuote.discount, presentation.displayQuote.totalDue],
    [30, 0, 30],
    "the last successful order totals remain available during refresh",
  );
  assert.equal(Boolean(presentation.currentQuote), false, "checkout remains disabled until the cart has a matching quote");
  assert.equal(presentation.loading, true);
  assert.equal(presentation.error, null);

  const sameCartRefresh = getQuotePresentation({ ...state, signature: '[{"id":1,"quantity":2}]' }, '[{"id":1,"quantity":2}]', true);
  assert.equal(sameCartRefresh.currentQuote, null, "checkout waits for the quote refresh even if the cart matches a prior quote");
  assert.equal(Boolean(sameCartRefresh.currentQuote), false, "checkout cannot use the retained display quote");
  assert.equal(sameCartRefresh.displayQuote, previousQuote);
});

test("reward progress carries qualification through below-threshold and qualified quote updates", () => {
  const quote = (signature, subtotal, discount, freeDrinks) => ({
    signature,
    status: "ready",
    data: { subtotal, discount, totalDue: subtotal - discount, freeDrinks },
    error: null,
  });
  const progressFor = (state, signature) => {
    const { displayQuote } = getQuotePresentation(state, signature, true);
    return { progress: getRewardProgress(displayQuote), freeDrinks: displayQuote.freeDrinks };
  };

  assert.deepEqual(progressFor(quote("below", 65, 0, 0), "below"), { progress: 65 / 75 * 100, freeDrinks: 0 });
  assert.deepEqual(progressFor(quote("qualified", 75, 15, 1), "qualified"), { progress: 100, freeDrinks: 1 });
  assert.deepEqual(progressFor(quote("still-qualified", 80, 15, 1), "still-qualified"), { progress: 100, freeDrinks: 1 });
  assert.deepEqual(progressFor(quote("below-again", 65, 0, 0), "below-again"), { progress: 65 / 75 * 100, freeDrinks: 0 });
});

test("quote failures preserve the last successful display quote without making it current", () => {
  const previousQuote = { subtotal: 60, discount: 0, totalDue: 60, freeDrinks: 0 };
  const state = { signature: "current-cart", status: "error", data: previousQuote, error: "Server unavailable" };
  const presentation = getQuotePresentation(state, "current-cart", true);

  assert.equal(presentation.currentQuote, null);
  assert.equal(presentation.displayQuote, previousQuote);
  assert.equal(presentation.loading, false);
  assert.equal(presentation.error, "Server unavailable");
});

test("a quantity change shows no loading label beside the cart item", async () => {
  const app = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
  const css = await readFile(new URL("../src/App.css", import.meta.url), "utf8");

  assert.equal(getVisibleLineTotal(undefined, null), null, "a pending quote has no rendered line-total label");
  assert.equal(getVisibleLineTotal({ lineTotal: 35 }, null), "₱35.00");
  assert.doesNotMatch(app, /Updating(?:…|\.\.\.)|Quote pending|Waiting for the canteen server quote|Updating order totals from the canteen server/);
  assert.match(app, /<strong className="line-total" aria-hidden=\{lineTotal === null\}>\{lineTotal \?\? ""\}<\/strong>/, "the cart total slot remains mounted without loading copy");
  assert.match(css, /\.order-panel\.mobile-cart-open \.order-item\s*\{[^}]*grid-template-columns:\s*52px\s+minmax\(0,\s*1fr\)\s+76px;/s, "mobile cart rows keep fixed columns during quote changes");
});

test("rapid cart updates are debounced to one quote request for the latest items", async () => {
  const calls = [];
  const requester = createDebouncedQuoteRequester(async (items) => {
    calls.push(items);
    return { subtotal: 15 };
  }, 25);
  const results = [];
  const callbacks = { onSuccess: (result) => results.push(result), onError: assert.fail };

  requester.schedule([{ id: 1, quantity: 1 }], callbacks);
  requester.schedule([{ id: 1, quantity: 2 }], callbacks);
  requester.schedule([{ id: 1, quantity: 3 }], callbacks);
  await wait(60);

  assert.deepEqual(calls, [[{ id: 1, quantity: 3 }]]);
  assert.equal(results.length, 1);
  assert.deepEqual(JSON.parse(results[0].signature), [{ id: 1, quantity: 3 }]);
  requester.cancel();
});

test("an obsolete in-flight quote cannot overwrite the latest cart quote", async () => {
  let finishOldRequest;
  const results = [];
  const requester = createDebouncedQuoteRequester((items) => {
    if (items[0].quantity === 1) return new Promise((resolve) => { finishOldRequest = resolve; });
    return Promise.resolve({ subtotal: 45 });
  }, 0);
  const callbacks = { onSuccess: (result) => results.push(result), onError: assert.fail };

  requester.schedule([{ id: 1, quantity: 1 }], callbacks);
  await wait(5);
  requester.schedule([{ id: 1, quantity: 2 }], callbacks);
  await wait(5);
  finishOldRequest({ subtotal: 15 });
  await wait(5);

  assert.equal(results.length, 1);
  assert.deepEqual(JSON.parse(results[0].signature), [{ id: 1, quantity: 2 }]);
  assert.deepEqual(results[0].data, { subtotal: 45 });
  assert.equal(getRewardProgress(results[0].data), 60, "the obsolete 40% response cannot replace the latest 60% progress");
  requester.cancel();
});

test("reward progress has a width transition and remains based on the last display quote", async () => {
  const css = await readFile(new URL("../src/App.css", import.meta.url), "utf8");
  const fillRule = css.match(/\.progress-fill\s*\{([^}]+)\}/)?.[1];
  assert.ok(fillRule, "progress fill rule exists");
  assert.match(fillRule, /transition:\s*width\s+300ms\s+ease-in-out/);

  const lastQuote = { subtotal: 30, discount: 0, totalDue: 30, freeDrinks: 0 };
  const pending = getQuotePresentation({ signature: "old", status: "loading", data: lastQuote, error: null }, "new", true);
  assert.equal(getRewardProgress(pending.displayQuote), 40, "progress remains at 40% while the quote is pending");

  const succeeded = getQuotePresentation({ signature: "new", status: "ready", data: { subtotal: 45, discount: 0, totalDue: 45, freeDrinks: 0 }, error: null }, "new", true);
  assert.equal(getRewardProgress(succeeded.displayQuote), 60, "the successful quote updates progress directly to 60%");
  assert.equal(getRewardProgress(null), 0, "an empty order has no reward progress");
});
