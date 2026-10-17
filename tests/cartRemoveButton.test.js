import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { removeProductFromCart } from "../src/domain/order.js";

test("cart trash button is accessible and removes only its selected item", async () => {
  const app = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
  const css = await readFile(new URL("../src/App.css", import.meta.url), "utf8");

  assert.match(app, /className="remove-button" type="button" aria-label="Remove item" title="Remove item" onClick=\{\(\) => removeFromCart\(item\.id\)\} disabled=\{checkoutPending\}><Icon name="trash" size=\{16\} \/>/);
  assert.match(css, /\.remove-button\s*\{[^}]*width:\s*32px;[^}]*height:\s*32px;[^}]*flex:\s*0 0 32px;/s);

  const cart = [
    { id: 1, name: "Kanin", quantity: 2 },
    { id: 2, name: "Ulam", quantity: 1 },
    { id: 3, name: "Softdrinks", quantity: 3 },
  ];
  const updatedCart = removeProductFromCart(cart, 2);

  assert.deepEqual(updatedCart.map(({ id }) => id), [1, 3]);
  assert.deepEqual(updatedCart.map(({ quantity }) => quantity), [2, 3]);
  assert.deepEqual(cart.map(({ id }) => id), [1, 2, 3], "removing an item leaves the existing cart input unchanged");
});
