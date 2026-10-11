const STORAGE_KEY = "javarice.transactions.v1";
const STORAGE_VERSION = 1;

function validateTransaction(transaction) {
  const hasValidFields = transaction &&
    typeof transaction.id === "string" &&
    typeof transaction.completedAt === "string" &&
    typeof transaction.businessDate === "string" &&
    Number.isFinite(transaction.subtotal) &&
    Number.isFinite(transaction.discount) &&
    Number.isFinite(transaction.totalDue) &&
    Number.isFinite(transaction.cashPaid) &&
    Number.isFinite(transaction.change) &&
    Number.isInteger(transaction.freeDrinks) &&
    (transaction.freeDrinks === 0 || transaction.freeDrinks === 1) &&
    Number.isInteger(transaction.itemCount) &&
    Array.isArray(transaction.items) &&
    transaction.items.length > 0 &&
    transaction.items.every((item) => item &&
      (typeof item.id === "string" || Number.isFinite(item.id)) &&
      typeof item.name === "string" &&
      Number.isFinite(item.unitPrice) && item.unitPrice >= 0 &&
      Number.isInteger(item.quantity) && item.quantity > 0 &&
      Number.isFinite(item.lineTotal) && item.lineTotal === item.unitPrice * item.quantity);

  if (!hasValidFields) return false;

  const calculatedSubtotal = transaction.items.reduce((total, item) => total + item.lineTotal, 0);
  const calculatedFreeDrinkCount = transaction.subtotal >= 75 ? 1 : 0;
  return transaction.itemCount === transaction.items.reduce((total, item) => total + item.quantity, 0) &&
    transaction.subtotal === calculatedSubtotal &&
    transaction.discount === calculatedFreeDrinkCount * 15 &&
    transaction.freeDrinks === calculatedFreeDrinkCount &&
    (transaction.transactionNumber === undefined || typeof transaction.transactionNumber === "string") &&
    (transaction.date === undefined || typeof transaction.date === "string") &&
    (transaction.time === undefined || typeof transaction.time === "string") &&
    transaction.totalDue === transaction.subtotal - transaction.discount &&
    transaction.cashPaid >= transaction.totalDue &&
    Math.abs(transaction.change - (transaction.cashPaid - transaction.totalDue)) < 0.001;
}

function validateReadableTransaction(transaction) {
  if (!transaction || typeof transaction.id !== "string" ||
      typeof transaction.completedAt !== "string" || !Number.isFinite(Date.parse(transaction.completedAt)) ||
      typeof transaction.businessDate !== "string" || !Number.isFinite(transaction.totalDue) || transaction.totalDue < 0) {
    return false;
  }

  return (transaction.subtotal === undefined || Number.isFinite(transaction.subtotal)) &&
    (transaction.discount === undefined || Number.isFinite(transaction.discount)) &&
    (transaction.freeDrinks === undefined || Number.isInteger(transaction.freeDrinks)) &&
    (transaction.items === undefined || Array.isArray(transaction.items)) &&
    (transaction.transactionNumber === undefined || typeof transaction.transactionNumber === "string") &&
    (transaction.date === undefined || typeof transaction.date === "string") &&
    (transaction.time === undefined || typeof transaction.time === "string");
}

export function hasReceiptData(transaction) {
  if (!transaction ||
      typeof transaction.completedAt !== "string" || !Number.isFinite(Date.parse(transaction.completedAt)) ||
      !Number.isFinite(transaction.subtotal) || !Number.isFinite(transaction.discount) ||
      !Number.isFinite(transaction.totalDue) || !Number.isFinite(transaction.cashPaid) ||
      !Number.isFinite(transaction.change) || !Array.isArray(transaction.items) || transaction.items.length === 0 ||
      !transaction.items.every((item) => item && typeof item.name === "string" &&
        Number.isFinite(item.unitPrice) && Number.isInteger(item.quantity) && item.quantity > 0 &&
        Number.isFinite(item.lineTotal) && item.lineTotal === item.unitPrice * item.quantity)) return false;

  const itemsSubtotal = transaction.items.reduce((total, item) => total + item.lineTotal, 0);
  return itemsSubtotal === transaction.subtotal &&
    transaction.subtotal - transaction.discount === transaction.totalDue &&
    Math.abs(transaction.cashPaid - transaction.change - transaction.totalDue) < 0.001;
}

function makeTransactionNumber(transaction, transactions) {
  const datePart = transaction.businessDate.replaceAll("-", "");
  const existingNumbers = new Set(transactions
    .filter((saved) => saved.businessDate === transaction.businessDate)
    .map((saved) => saved.transactionNumber)
    .filter((number) => typeof number === "string"));

  let sequence = 1;
  let number = `JR-${datePart}-${String(sequence).padStart(3, "0")}`;
  while (existingNumbers.has(number)) {
    sequence += 1;
    number = `JR-${datePart}-${String(sequence).padStart(3, "0")}`;
  }
  return number;
}

function readTransactionData() {
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored === null) return [];

  const data = JSON.parse(stored);
  if (data.version !== STORAGE_VERSION || !Array.isArray(data.transactions) || !data.transactions.every(validateReadableTransaction)) {
    throw new Error("Saved transaction data has an unsupported or invalid format.");
  }

  return data.transactions;
}

export function loadTransactions() {
  try {
    return { transactions: readTransactionData(), error: null };
  } catch (error) {
    return { transactions: [], error: error instanceof Error ? error.message : "Saved transactions could not be loaded." };
  }
}

export function appendTransaction(transaction) {
  if (!validateTransaction(transaction)) {
    throw new Error("Transaction data failed validation and was not saved.");
  }

  const transactions = readTransactionData();
  if (transactions.some((saved) => saved.id === transaction.id)) {
    throw new Error("This transaction has already been recorded.");
  }

  const completedDate = new Date(transaction.completedAt);
  const savedTransaction = {
    ...transaction,
    transactionNumber: transaction.transactionNumber ?? makeTransactionNumber(transaction, transactions),
    date: transaction.date ?? completedDate.toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "2-digit" }),
    time: transaction.time ?? completedDate.toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit" }),
  };
  const nextTransactions = [...transactions, savedTransaction];
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: STORAGE_VERSION, transactions: nextTransactions }));
  return nextTransactions;
}

export const transactionStorageKey = STORAGE_KEY;
