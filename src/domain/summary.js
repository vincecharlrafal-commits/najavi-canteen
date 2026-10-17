export function getAverageOrderValue(transactions) {
  const completed = transactions.filter((transaction) => Number.isFinite(transaction?.totalDue) && transaction.totalDue >= 0);
  if (completed.length === 0) return 0;

  return completed.reduce((total, transaction) => total + transaction.totalDue, 0) / completed.length;
}

export function getRecentTransactions(transactions, limit = 8) {
  const safeLimit = Number.isInteger(limit) ? Math.max(0, limit) : 8;

  return transactions
    .map((transaction, index) => ({ transaction, index, timestamp: Date.parse(transaction?.completedAt) }))
    .sort((first, second) => {
      const firstTime = Number.isFinite(first.timestamp) ? first.timestamp : 0;
      const secondTime = Number.isFinite(second.timestamp) ? second.timestamp : 0;
      return secondTime - firstTime || first.index - second.index;
    })
    .slice(0, safeLimit)
    .map(({ transaction }) => transaction);
}

export function formatTransactionDateTime(transaction) {
  const date = new Date(transaction?.completedAt ?? "");
  if (Number.isFinite(date.getTime())) {
    return date.toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
  }

  const fallback = [transaction?.date, transaction?.time]
    .filter((value) => typeof value === "string" && value.trim())
    .join(" · ");
  return fallback || "Date unavailable";
}
