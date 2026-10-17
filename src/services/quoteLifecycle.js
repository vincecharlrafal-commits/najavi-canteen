/** Debounce quote requests and ignore any result from an obsolete cart. */
export function createDebouncedQuoteRequester(requestQuote, delayMs = 200) {
  let timer = null;
  let controller = null;
  let requestId = 0;

  const cancel = () => {
    requestId += 1;
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    controller?.abort();
    controller = null;
  };

  const schedule = (items, { onSuccess, onError }) => {
    cancel();
    const activeRequestId = requestId;
    const signature = JSON.stringify(items);
    const requestItems = items.map(({ id, quantity }) => ({ id, quantity }));

    timer = setTimeout(async () => {
      timer = null;
      const requestController = new AbortController();
      controller = requestController;

      let data;
      try {
        data = await requestQuote(requestItems, { signal: requestController.signal });
      } catch (error) {
        if (activeRequestId === requestId && !requestController.signal.aborted) {
          onError({ signature, error });
        }
        return;
      }

      if (activeRequestId === requestId && !requestController.signal.aborted) {
        onSuccess({ signature, data });
      }
    }, delayMs);
  };

  return { schedule, cancel };
}

/** Keep the last successful quote available for display, but never for checkout. */
export function getQuotePresentation(state, cartSignature, hasItems) {
  const matchesCart = state.signature === cartSignature;
  const currentQuote = matchesCart && state.status === "ready" ? state.data : null;
  const error = matchesCart && state.status === "error" ? state.error : null;

  return {
    currentQuote,
    displayQuote: hasItems ? (currentQuote ?? state.data) : null,
    error,
    loading: hasItems && !currentQuote && !error,
  };
}

/** Render the last successful quoted line total when it is available. */
export function getVisibleLineTotal(quoteLine) {
  if (quoteLine) return `₱${quoteLine.lineTotal.toFixed(2)}`;
  return null;
}

/** Map the last successful server subtotal to the reward bar's displayed width. */
export function getRewardProgress(quote) {
  return quote ? Math.min((quote.subtotal / 75) * 100, 100) : 0;
}
