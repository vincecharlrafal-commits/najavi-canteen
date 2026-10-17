import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("cart rows keep product keys, markup, and fixed columns across quote states", async () => {
  const app = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
  const css = await readFile(new URL("../src/App.css", import.meta.url), "utf8");

  assert.match(app, /cart\.map\(\(item\) => \{[\s\S]*?<div className="order-item" key=\{item\.id\}>/);
  assert.match(app, /<img className="order-item-image" src=\{item\.image\} alt="" \/>/, "cart item images remain mounted");
  assert.match(app, /const quoteLine = displayQuote\?\.items\.find\(\(line\) => line\.id === item\.id\);/);
  assert.match(app, /const subtotal = displayQuote\?\.subtotal;/, "summary figures use the last successful quote during refresh");
  assert.match(app, /<strong className="line-total" aria-hidden=\{lineTotal === null\}>\{lineTotal \?\? ""\}<\/strong>/);
  assert.doesNotMatch(app, /order-item-no-total|key=\{item\.quantity\}/);
  assert.match(css, /\.order-item\s*\{[^}]*display:\s*grid;[^}]*grid-template-columns:\s*52px\s+minmax\(0,\s*1fr\)\s+76px;/s);
  assert.doesNotMatch(css, /\.order-item\s*\{[^}]*transition:[^}]*\b(?:transform|opacity|width|height)\b/s);
  assert.match(app, /<div className="progress-track"><div className="progress-fill" style=\{\{ width: `\$\{promotionProgress\}%` \}\} \/><\/div>/, "the reward fill stays mounted as the quote changes");
});
