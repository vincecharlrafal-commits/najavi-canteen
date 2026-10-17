export const PROMOTION_THRESHOLD = 75;
export const PROMOTION_DISCOUNT = 15;

export function getOrderTotals(cart) {
  const subtotal = cart.reduce((total, item) => total + item.price * item.quantity, 0);
  const qualifiesForPromotion = subtotal >= PROMOTION_THRESHOLD;
  const discount = qualifiesForPromotion ? PROMOTION_DISCOUNT : 0;

  return {
    subtotal,
    discount,
    totalDue: subtotal - discount,
    freeDrinks: qualifiesForPromotion ? 1 : 0,
    amountToPromotion: Math.max(PROMOTION_THRESHOLD - subtotal, 0),
    promotionProgress: Math.min((subtotal / PROMOTION_THRESHOLD) * 100, 100),
  };
}

export function addProductToCart(cart, product) {
  const existingItem = cart.find((item) => item.id === product.id);
  return existingItem
    ? cart.map((item) => item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item)
    : [...cart, { ...product, quantity: 1 }];
}

export function changeCartQuantity(cart, productId, change) {
  if (!Number.isInteger(change) || change === 0) return cart;

  return cart
    .map((item) => item.id === productId ? { ...item, quantity: item.quantity + change } : item)
    .filter((item) => item.quantity > 0);
}

export function removeProductFromCart(cart, productId) {
  return cart.filter((item) => item.id !== productId);
}

export function clearCart() {
  return [];
}

export function getCartItemCount(cart) {
  return cart.reduce((total, item) => total + item.quantity, 0);
}

export function getProductQuantity(cart, productId) {
  return cart.find((item) => item.id === productId)?.quantity ?? 0;
}

export function getPaymentResult(cashPayment, totalDue) {
  const trimmedCash = String(cashPayment).trim();
  if (!trimmedCash) return { valid: false, reason: "empty", change: null, amountNeeded: null };

  const cash = Number(trimmedCash);
  if (!Number.isFinite(cash) || cash < 0) {
    return { valid: false, reason: "invalid", change: null, amountNeeded: null };
  }

  if (cash < totalDue) {
    return {
      valid: false,
      reason: "insufficient",
      change: null,
      amountNeeded: Math.round((totalDue - cash) * 100) / 100,
    };
  }

  return {
    valid: true,
    reason: null,
    change: Math.round((cash - totalDue) * 100) / 100,
    amountNeeded: 0,
  };
}

export function localDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function createTransactionMetadata() {
  const completedAt = new Date();
  const id = globalThis.crypto?.randomUUID?.() ?? `jr-${completedAt.getTime()}-${Math.random().toString(36).slice(2, 10)}`;
  return { id, completedAt };
}

export function buildTransactionRecord(cart, cashPayment, completedAt, id) {
  const hasValidItems = cart.length > 0 && cart.every((item) =>
    Number.isFinite(item.price) && item.price >= 0 && Number.isInteger(item.quantity) && item.quantity > 0
  );
  const totals = getOrderTotals(cart);
  const payment = getPaymentResult(cashPayment, totals.totalDue);
  if (!hasValidItems || !payment.valid) {
    throw new Error("Only paid, non-empty orders can be recorded.");
  }

  return {
    id,
    completedAt: completedAt.toISOString(),
    businessDate: localDateKey(completedAt),
    subtotal: totals.subtotal,
    discount: totals.discount,
    totalDue: totals.totalDue,
    cashPaid: Number(cashPayment),
    change: payment.change,
    freeDrinks: totals.freeDrinks,
    itemCount: cart.reduce((total, item) => total + item.quantity, 0),
    items: cart.map((item) => ({
      id: item.id,
      name: item.name,
      unitPrice: item.price,
      quantity: item.quantity,
      lineTotal: item.price * item.quantity,
    })),
  };
}

export function getDailyStats(transactions, businessDate) {
  const todaysTransactions = transactions.filter((transaction) => transaction.businessDate === businessDate);
  return {
    transactions: todaysTransactions,
    sales: todaysTransactions.reduce((total, transaction) => total + transaction.totalDue, 0),
    customers: todaysTransactions.length,
    freeDrinks: todaysTransactions.reduce((total, transaction) => total + (transaction.freeDrinks ?? ((transaction.discount ?? 0) >= 15 ? 1 : 0)), 0),
  };
}
