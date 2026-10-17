const API_BASE_URL = (import.meta.env?.VITE_API_BASE_URL || "/api").replace(/\/$/, "");

async function requestJson(path, options = {}) {
  let response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      headers: options.body ? { "Content-Type": "application/json", ...options.headers } : options.headers,
    });
  } catch {
    throw new Error("Canteen server is unavailable. Start Flask and try again.");
  }

  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new Error("Canteen server returned an unreadable response.");
  }

  if (!response.ok) {
    throw new Error(payload?.error?.message || `Canteen server request failed (${response.status}).`);
  }
  return payload;
}

export async function fetchMenu(options = {}) {
  const payload = await requestJson("/menu", options);
  if (!Array.isArray(payload.items)) throw new Error("Canteen server returned an invalid menu.");
  return payload.items;
}

export async function requestQuote(items, options = {}) {
  return requestJson("/quote", {
    ...options,
    method: "POST",
    body: JSON.stringify({ items }),
  });
}

export async function requestCheckout(items, payment, options = {}) {
  const payload = await requestJson("/checkout", {
    ...options,
    method: "POST",
    body: JSON.stringify({ items, payment }),
  });
  if (!payload.receipt || !Array.isArray(payload.receipt.items)) {
    throw new Error("Canteen server returned an invalid receipt.");
  }
  return payload.receipt;
}
