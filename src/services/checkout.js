import { appendTransaction } from "./transactionStore.js";
import { requestCheckout } from "./canteenApi.js";
import { createTransactionMetadata, localDateKey } from "../domain/order.js";

export function transactionFromReceipt(receipt, { id, completedAt }) {
  return {
    id,
    completedAt: completedAt.toISOString(),
    businessDate: localDateKey(completedAt),
    subtotal: receipt.subtotal,
    discount: receipt.discount,
    totalDue: receipt.totalDue,
    cashPaid: receipt.cashPaid,
    change: receipt.change,
    freeDrinks: receipt.freeDrinks,
    itemCount: receipt.items.reduce((count, item) => count + item.quantity, 0),
    items: receipt.items.map((item) => ({
      id: item.id,
      name: item.name,
      unitPrice: item.unitPrice,
      quantity: item.quantity,
      lineTotal: item.lineTotal,
    })),
  };
}

export async function completeCheckout(items, payment, {
  checkoutRequest = requestCheckout,
  saveTransaction = appendTransaction,
  createMetadata = createTransactionMetadata,
} = {}) {
  const receipt = await checkoutRequest(items, payment);
  const metadata = createMetadata();
  const transaction = transactionFromReceipt(receipt, metadata);

  try {
    const transactions = saveTransaction(transaction);
    return {
      receipt: transactions[transactions.length - 1],
      transactions,
      transaction,
      persistenceError: null,
    };
  } catch (error) {
    const completionError = new Error("Checkout succeeded, but the receipt could not be saved in this browser.");
    completionError.backendReceipt = { ...transaction, ...receipt };
    completionError.transaction = transaction;
    completionError.cause = error;
    throw completionError;
  }
}
