import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import "./App.css";
import { addProductToCart, changeCartQuantity, clearCart, getCartItemCount, getDailyStats, getProductQuantity, localDateKey, removeProductFromCart } from "./domain/order.js";
import { formatTransactionDateTime, getAverageOrderValue, getRecentTransactions } from "./domain/summary.js";
import { hasReceiptData, loadTransactions } from "./services/transactionStore.js";
import { fetchMenu, requestQuote } from "./services/canteenApi.js";
import { createDebouncedQuoteRequester, getQuotePresentation, getRewardProgress, getVisibleLineTotal } from "./services/quoteLifecycle.js";
import { completeCheckout } from "./services/checkout.js";

import kaninImage from "./assets/kanin.png";
import ulamImage from "./assets/ulam.png";
import softdrinksImage from "./assets/softdrinks.png";
import iceCreamImage from "./assets/ice_cream.png";

const productPresentation = {
  1: { category: "Meals", image: kaninImage },
  2: { category: "Meals", image: ulamImage },
  3: { category: "Drinks", image: softdrinksImage },
  4: { category: "Desserts", image: iceCreamImage },
};

function isWholePesoAmount(value) {
  return /^\d+$/.test(value.trim()) && Number.isSafeInteger(Number(value));
}

function formatMenuItems(items) {
  return items.map((item) => ({
    ...item,
    description: item.english_name,
    ...productPresentation[item.id],
  }));
}

function Icon({ name, size = 20 }) {
  const shared = { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true };

  if (name === "logo") return <svg {...shared}><path d="M4 9h16l-2 10H6L4 9Z" /><path d="M7 9c0-3 2-5 5-5s5 2 5 5M8 13h8" /></svg>;
  if (name === "home") return <svg {...shared}><path d="m3 11 9-8 9 8" /><path d="M5 10v10h14V10M9 20v-6h6v6" /></svg>;
  if (name === "chart") return <svg {...shared}><path d="M4 19V10h4v9M10 19V5h4v14M16 19v-7h4v7" /><path d="M3 21h18" /></svg>;
  if (name === "search") return <svg {...shared}><circle cx="10.8" cy="10.8" r="6.8" /><path d="m16 16 5 5" /></svg>;
  if (name === "cart") return <svg {...shared}><path d="M3 4h2l2.2 11.2a2 2 0 0 0 2 1.6h8.6a2 2 0 0 0 1.9-1.4L22 8H6" /><circle cx="10" cy="20" r="1" /><circle cx="18" cy="20" r="1" /></svg>;
  if (name === "gift") return <svg {...shared}><rect x="3" y="9" width="18" height="12" rx="1" /><path d="M2 6h20v4H2zM12 6v15M12 6H8.5a2.5 2.5 0 1 1 2.5-2.5V6Zm0 0h3.5a2.5 2.5 0 1 0-2.5-2.5V6Z" /></svg>;
  if (name === "trash") return <svg {...shared}><path d="M3 6h18M19 6v14c0 1.1-.9 2-2 2H7c-1.1 0-2-.9-2-2V6M8 6V4c0-1.1.9-2 2-2h4c1.1 0 2 .9 2 2v2M10 11v6M14 11v6" /></svg>;
  return <svg {...shared}><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M7 10h10M7 14h4" /></svg>;
}

function App() {
  const [transactionsState, setTransactionsState] = useState(loadTransactions);
  const [products, setProducts] = useState([]);
  const [menuLoading, setMenuLoading] = useState(true);
  const [menuError, setMenuError] = useState(null);
  const [menuReload, setMenuReload] = useState(0);
  const [cart, setCart] = useState([]);
  const [quoteState, setQuoteState] = useState({ signature: "", status: "idle", data: null, error: null });
  const [quoteReload, setQuoteReload] = useState(0);
  const [cashPayment, setCashPayment] = useState("");
  const [checkoutPending, setCheckoutPending] = useState(false);
  const [paymentStatus, setPaymentStatus] = useState(null);
  const [activeReceipt, setActiveReceipt] = useState(null);
  const [activeCategory, setActiveCategory] = useState("All");
  const [searchQuery, setSearchQuery] = useState("");
  const [activePage, setActivePage] = useState("Menu");
  const [mobileCartOpen, setMobileCartOpen] = useState(false);
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const quoteRequester = useMemo(() => createDebouncedQuoteRequester(requestQuote, 200), []);
  const checkoutLock = useRef(false);
  const transactionSubmitted = useRef(false);
  const cartSignature = JSON.stringify(cart.map(({ id, quantity }) => ({ id, quantity })));
  const { currentQuote, displayQuote, error: quoteError, loading: quoteLoading } = getQuotePresentation(quoteState, cartSignature, cart.length > 0);
  const today = currentDate.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric", year: "numeric" });
  const todayKey = localDateKey(currentDate);

  useEffect(() => {
    const refreshDate = () => {
      const now = new Date();
      setCurrentDate((previousDate) => localDateKey(previousDate) === localDateKey(now) ? previousDate : now);
    };
    const interval = window.setInterval(refreshDate, 60_000);
    window.addEventListener("focus", refreshDate);
    document.addEventListener("visibilitychange", refreshDate);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", refreshDate);
      document.removeEventListener("visibilitychange", refreshDate);
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    fetchMenu({ signal: controller.signal })
      .then((items) => {
        if (controller.signal.aborted) return;
        setProducts(formatMenuItems(items));
        setMenuLoading(false);
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        setMenuError(error instanceof Error ? error.message : "The menu could not be loaded.");
        setMenuLoading(false);
      });
    return () => controller.abort();
  }, [menuReload]);

  useEffect(() => {
    if (cartSignature === "[]") {
      quoteRequester.cancel();
      return undefined;
    }

    const items = JSON.parse(cartSignature);
    quoteRequester.schedule(items, {
      onSuccess: ({ signature, data }) => {
        setQuoteState((previous) => ({ ...previous, signature, status: "ready", data, error: null }));
      },
      onError: ({ signature, error }) => {
        setQuoteState((previous) => ({
          ...previous,
          signature,
          status: "error",
          error: error instanceof Error ? error.message : "The order quote could not be loaded.",
        }));
      },
    });
    return () => quoteRequester.cancel();
  }, [cartSignature, quoteReload, quoteRequester]);

  useEffect(() => {
    if (!mobileCartOpen) return undefined;

    const closeOnEscape = (event) => {
      if (event.key === "Escape") setMobileCartOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [mobileCartOpen]);

  const applyCartUpdate = (nextCart) => {
    const nextSignature = JSON.stringify(nextCart.map(({ id, quantity }) => ({ id, quantity })));
    setCart(nextCart);
    setQuoteState((previous) => ({
      ...previous,
      signature: nextSignature,
      status: nextCart.length > 0 ? "loading" : "idle",
      error: null,
    }));
  };

  const addToCart = (product) => {
    if (checkoutPending) return;
    transactionSubmitted.current = false;
    applyCartUpdate(addProductToCart(cart, product));
    setPaymentStatus(null);
  };

  const updateQuantity = (productId, change) => {
    if (checkoutPending) return;
    transactionSubmitted.current = false;
    applyCartUpdate(changeCartQuantity(cart, productId, change));
    setPaymentStatus(null);
  };

  const removeFromCart = (productId) => {
    if (checkoutPending) return;
    transactionSubmitted.current = false;
    applyCartUpdate(removeProductFromCart(cart, productId));
    setPaymentStatus(null);
  };

  const clearOrder = () => {
    if (checkoutPending) return;
    transactionSubmitted.current = false;
    applyCartUpdate(clearCart());
    setCashPayment("");
    setPaymentStatus(null);
  };

  const itemCount = getCartItemCount(cart);
  const subtotal = displayQuote?.subtotal;
  const discount = displayQuote?.discount;
  const totalDue = displayQuote?.totalDue;
  const displayFreeDrinks = displayQuote?.freeDrinks ?? 0;
  const amountToPromotion = displayQuote ? Math.max(75 - displayQuote.subtotal, 0) : null;
  const promotionProgress = getRewardProgress(displayQuote);
  const validPaymentInput = isWholePesoAmount(cashPayment);
  const isCheckoutEnabled = cart.length > 0 && Boolean(currentQuote) && !quoteLoading && !quoteError && validPaymentInput && !checkoutPending && !transactionsState.error;
  const todayStats = getDailyStats(transactionsState.transactions, todayKey);
  const averageOrderValue = getAverageOrderValue(transactionsState.transactions);
  const recentTransactions = getRecentTransactions(transactionsState.transactions);

  const handleCheckout = async () => {
    if (checkoutLock.current || transactionSubmitted.current || checkoutPending) return;
    if (cart.length === 0) {
      setPaymentStatus({ type: "error", message: "Add items to your order before checkout." });
      return;
    }
    if (!currentQuote || quoteLoading || quoteError) {
      setPaymentStatus({ type: "error", message: quoteError || "Wait for a current server quote before checkout." });
      return;
    }
    if (!validPaymentInput) {
      setPaymentStatus({ type: "error", message: "Enter payment as a non-negative whole number of pesos." });
      return;
    }
    if (transactionsState.error) {
      setPaymentStatus({ type: "error", message: "Transaction history is unavailable. Checkout is disabled to protect existing records." });
      return;
    }

    checkoutLock.current = true;
    setCheckoutPending(true);
    setPaymentStatus(null);
    try {
      const checkoutItems = cart.map(({ id, quantity }) => ({ id, quantity }));
      const result = await completeCheckout(checkoutItems, Number(cashPayment));
      transactionSubmitted.current = true;
      setTransactionsState({ transactions: result.transactions, error: null });
      setCurrentDate(new Date(result.transaction.completedAt));
      setCart([]);
      setCashPayment("");
      setMobileCartOpen(false);
      setPaymentStatus({ type: "success", message: `Order completed by the canteen server. Change: ₱${result.receipt.change.toFixed(2)}.` });
      setActiveReceipt(result.receipt);
    } catch (error) {
      if (error?.backendReceipt) {
        transactionSubmitted.current = true;
        setCart([]);
        setCashPayment("");
        setMobileCartOpen(false);
        setActiveReceipt(error.backendReceipt);
        setPaymentStatus({ type: "error", message: `${error.message} Keep this receipt; the completed order is not in this browser's Summary.` });
      } else {
        setPaymentStatus({ type: "error", message: error instanceof Error ? error.message : "Checkout could not be completed." });
      }
    } finally {
      checkoutLock.current = false;
      setCheckoutPending(false);
    }
  };
  const visibleProducts = products.filter((product) => {
    const matchesCategory = activeCategory === "All" || product.category === activeCategory;
    const query = searchQuery.trim().toLowerCase();
    const matchesSearch = !query || `${product.name} ${product.description} ${product.category}`.toLowerCase().includes(query);
    return matchesCategory && matchesSearch;
  });

  const retryMenu = () => {
    setProducts([]);
    setMenuError(null);
    setMenuLoading(true);
    setMenuReload((value) => value + 1);
  };

  const retryQuote = () => {
    setQuoteState((previous) => ({ ...previous, signature: cartSignature, status: "loading", error: null }));
    setQuoteReload((value) => value + 1);
  };

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand-block">
          <div className="brand-mark"><Icon name="logo" size={36} /></div>
          <div className="brand-copy">
            <strong>NaJaVi Canteen</strong>
            <span>NU CANTEEN</span>
          </div>
        </div>
        <nav className="side-navigation" aria-label="Main navigation">
          <button className={`nav-button${activePage === "Menu" ? " active" : ""}`} type="button" onClick={() => setActivePage("Menu")}><Icon name="home" />Menu</button>
          <button className={`nav-button${activePage === "Summary" ? " active" : ""}`} type="button" onClick={() => setActivePage("Summary")}><Icon name="chart" />Summary</button>
        </nav>
        <div className="sidebar-location">NU Manila</div>
      </aside>

      <header className="mobile-app-header">
        <div className="mobile-brand">
          <div className="mobile-brand-mark"><Icon name="logo" size={32} /></div>
          <div className="mobile-brand-copy">
            <strong>NaJaVi Canteen</strong>
            <span>May Kanin Busseng</span>
          </div>
        </div>
        <nav className="mobile-navigation" aria-label="Main navigation">
          <button className={`nav-button${activePage === "Menu" ? " active" : ""}`} type="button" aria-label="Menu" onClick={() => setActivePage("Menu")}><Icon name="home" /></button>
          <button className={`nav-button${activePage === "Summary" ? " active" : ""}`} type="button" aria-label="Summary" onClick={() => setActivePage("Summary")}><Icon name="chart" /></button>
        </nav>
      </header>

      <main className="menu-area">
        {activePage === "Menu" ? <>
        <div className="menu-topline">
          <div className="welcome-block">
            <p className="current-date">{today}</p>
            <h1>NaJaVi Canteen</h1>
            <p className="tagline">May Kanin Busseng</p>
          </div>
          <label className="search-box">
            <Icon name="search" />
            <input type="search" placeholder="Search menu..." value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} aria-label="Search menu" />
          </label>
        </div>

        {menuLoading && <p className="payment-hint" role="status">Loading menu from the canteen server…</p>}
        {menuError && <div className="payment-message payment-error" role="alert"><span>{menuError}</span> <button type="button" onClick={retryMenu}>Retry menu</button></div>}

        <div className="category-filters" aria-label="Filter menu by category">
          {["All", "Meals", "Drinks", "Desserts"].map((category) => (
            <button key={category} type="button" className={`category-button${activeCategory === category ? " selected" : ""}`} onClick={() => setActiveCategory(category)}>{category}</button>
          ))}
        </div>

        <section className="menu-listing">
          <h2>Today's Menu</h2>
          <div className="product-grid">
            {visibleProducts.map((product) => (
              <article className="product-card" key={product.id}>
                <div className="product-image-container"><img src={product.image} alt={product.name} className="product-image" /></div>
                <div className="product-details">
                  <span className="product-category">{product.category}</span>
                  <h3>{product.name}</h3>
                  <p className="product-description">{product.description}</p>
                  <strong className="product-price">₱{product.price}</strong>
                </div>
                <div className="product-action">
                  {getProductQuantity(cart, product.id) === 0 ? (
                    <button className="add-button" type="button" onClick={() => addToCart(product)} disabled={checkoutPending}>
                      <span aria-hidden="true">+</span> Add to Cart
                    </button>
                  ) : (
                    <div className="product-card-stepper" role="group" aria-label={`${product.name} quantity`}>
                      <button type="button" aria-label={`Remove one ${product.name}`} onClick={() => updateQuantity(product.id, -1)} disabled={checkoutPending}>-</button>
                      <span aria-live="polite" aria-atomic="true">{getProductQuantity(cart, product.id)}</span>
                      <button type="button" aria-label={`Add one ${product.name}`} onClick={() => updateQuantity(product.id, 1)} disabled={checkoutPending}>+</button>
                    </div>
                  )}
                </div>
              </article>
            ))}
            {visibleProducts.length === 0 && !menuLoading && !menuError && <p className="no-products">No menu items match your search.</p>}
          </div>
        </section>
        </> : (
          <section className="summary-view">
            <p className="current-date">{today}</p>
            <h1>Today's Summary</h1>
            <p className="tagline">Sales are counted from completed transactions only.</p>
            {transactionsState.error && <p className="storage-warning" role="alert">Saved transaction history could not be read: {transactionsState.error}</p>}
            <div className="statistics-grid">
              <article className="statistic-card"><span>Today's Sales</span><strong>₱{todayStats.sales.toFixed(2)}</strong></article>
              <article className="statistic-card"><span>Customers Served</span><strong>{todayStats.customers}</strong></article>
              <article className="statistic-card"><span>Free Drinks</span><strong>{todayStats.freeDrinks}</strong></article>
              <article className="statistic-card"><span>Average Order Value</span><strong>₱{averageOrderValue.toFixed(2)}</strong></article>
            </div>
            <section className="transaction-history">
              <h2>Recent transactions</h2>
              {recentTransactions.length === 0 ? <p className="no-transactions">No completed transactions yet.</p> : (
                <div className="transaction-list">
                  {recentTransactions.map((transaction) => {
                    const receiptAvailable = hasReceiptData(transaction);
                    const transactionItems = transaction.itemCount ?? transaction.items?.reduce((count, item) => count + item.quantity, 0) ?? null;
                    return (
                      <article className="transaction-card" key={transaction.id}>
                        <div className="transaction-details">
                          <strong className="transaction-number">{transaction.transactionNumber || transaction.id || "Transaction"}</strong>
                          <time dateTime={transaction.completedAt}>{formatTransactionDateTime(transaction)}</time>
                          <span>{transactionItems === null ? "Item count unavailable" : `${transactionItems} ${transactionItems === 1 ? "item" : "items"}`}</span>
                        </div>
                        <div className="transaction-actions">
                          <strong>₱{Number(transaction.totalDue).toFixed(2)}</strong>
                          {receiptAvailable && <button className="view-receipt-button" type="button" onClick={() => setActiveReceipt(transaction)}>View Receipt</button>}
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </section>
            <p className="storage-note">Transactions are saved in this browser on this device. They are not synchronized with other devices.</p>
          </section>
        )}
      </main>

      <button className="mobile-cart-bar" type="button" aria-controls="my-order-panel" aria-expanded={mobileCartOpen} onClick={() => setMobileCartOpen(true)}>
        <span className="mobile-cart-label"><Icon name="cart" size={20} />My Order</span>
        <span className="mobile-cart-count">{itemCount} {itemCount === 1 ? "item" : "items"}</span>
        {itemCount > 0 && <strong className="mobile-cart-total">{displayQuote ? `₱${displayQuote.totalDue.toFixed(2)}` : "…"}</strong>}
      </button>
      {mobileCartOpen && <button className="mobile-cart-backdrop" type="button" aria-label="Close My Order" onClick={() => setMobileCartOpen(false)} />}

      <aside id="my-order-panel" className={`order-panel${mobileCartOpen ? " mobile-cart-open" : ""}`} aria-label="My Order" role={mobileCartOpen ? "dialog" : undefined} aria-modal={mobileCartOpen ? "true" : undefined}>
        <div className="order-header">
          <h2>My Order</h2>
          <span className="item-count-badge">{itemCount} {itemCount === 1 ? "item" : "items"}</span>
          <button className="clear-order" type="button" onClick={clearOrder} disabled={cart.length === 0 || checkoutPending}>× <span>Clear Order</span></button>
          <button className="mobile-cart-close" type="button" aria-label="Close My Order" onClick={() => setMobileCartOpen(false)}>×</button>
        </div>

        <div className={`order-items${cart.length === 0 ? " empty" : ""}`}>
          {cart.length === 0 ? (
            <div className="empty-order"><div className="empty-cart-icon"><Icon name="cart" size={42} /></div><p>Your order is empty. Add items from the menu.</p></div>
          ) : cart.map((item) => {
            const quoteLine = displayQuote?.items.find((line) => line.id === item.id);
            const lineTotal = getVisibleLineTotal(quoteLine);
            return (
              <div className="order-item" key={item.id}>
                <img className="order-item-image" src={item.image} alt="" />
                <div className="order-item-main">
                  <h3>{item.name}</h3>
                  <p>₱{quoteLine?.unitPrice ?? item.price} each</p>
                  <div className="quantity-controls" aria-label={`${item.name} quantity`}>
                    <button className="quantity-button" type="button" aria-label={`Decrease ${item.name} quantity`} onClick={() => updateQuantity(item.id, -1)} disabled={checkoutPending}>−</button>
                    <span className="quantity-value">{item.quantity}</span>
                    <button className="quantity-button" type="button" aria-label={`Increase ${item.name} quantity`} onClick={() => updateQuantity(item.id, 1)} disabled={checkoutPending}>+</button>
                    <button className="remove-button" type="button" aria-label="Remove item" title="Remove item" onClick={() => removeFromCart(item.id)} disabled={checkoutPending}><Icon name="trash" size={16} /></button>
                  </div>
                </div>
                <strong className="line-total" aria-hidden={lineTotal === null}>{lineTotal ?? ""}</strong>
              </div>
            );
          })}
        </div>

        <div className="order-bottom">
          <section className={`promotion-card${displayFreeDrinks > 0 ? " promotion-qualified" : ""}`} aria-label="Free-drink promotion">
            <div className="promotion-heading"><Icon name="gift" size={22} /><strong>{displayFreeDrinks > 0 ? "Free Drink Unlocked!" : "Free Drink Reward"}</strong><span>{displayFreeDrinks > 0 ? "Qualified!" : amountToPromotion === null ? "Add items" : `₱${amountToPromotion} to go`}</span></div>
            <div className="progress-track"><div className="progress-fill" style={{ width: `${promotionProgress}%` }} /></div>
            <p>{displayFreeDrinks > 0 ? "₱15 deduction applied" : amountToPromotion === null ? "Add items to see reward progress." : `Add ₱${amountToPromotion} more to unlock your free drink.`}</p>
          </section>

          <div className="order-totals">
            <div className="summary-row"><span>Subtotal</span><strong>{displayQuote ? `₱${subtotal.toFixed(2)}` : "—"}</strong></div>
            <div className="summary-row deduction-row"><span>Free-drink deduction</span><strong>{displayQuote ? `−₱${discount.toFixed(2)}` : "—"}</strong></div>
            <div className="total-row"><span>Total Due</span><strong>{displayQuote ? `₱${totalDue.toFixed(2)}` : "—"}</strong></div>
          </div>

          <section className="payment-card">
            <label className="cash-label" htmlFor="cash-payment"><span><Icon name="cash" size={17} />Cash Payment</span>
              <input id="cash-payment" type="number" inputMode="numeric" min="0" step="1" placeholder="Enter whole pesos" value={cashPayment} disabled={checkoutPending} onChange={(event) => { const value = event.target.value; setCashPayment(value.startsWith("-") ? "" : value); setPaymentStatus(null); }} />
            </label>
            {cart.length > 0 && !cashPayment.trim() && <p className="payment-hint">Enter whole pesos to enable server checkout.</p>}
            {cashPayment.trim() && !validPaymentInput && <p className="payment-message payment-error" role="status">Enter payment as a non-negative whole number of pesos.</p>}
            {quoteError && <p className="payment-message payment-error" role="alert">{quoteError} <button type="button" onClick={retryQuote}>Retry quote</button></p>}
            {paymentStatus && <p className={`payment-message payment-${paymentStatus.type}`} role="status">{paymentStatus.message}</p>}
            {transactionsState.error && <p className="payment-message payment-error" role="alert">Transaction storage is unavailable. Existing records are protected; checkout is disabled.</p>}
            <button className="checkout-button" type="button" onClick={handleCheckout} disabled={!isCheckoutEnabled}>{checkoutPending ? "Checking out…" : "▣  Checkout"}</button>
          </section>
        </div>
      </aside>

      {activeReceipt && createPortal(
        <div className="receipt-backdrop" role="presentation" onClick={(event) => { if (event.target === event.currentTarget) setActiveReceipt(null); }}>
          <section className="receipt-modal" role="dialog" aria-modal="true" aria-labelledby="receipt-title">
            <header className="receipt-brand">
              <div className="receipt-logo"><Icon name="logo" size={30} /></div>
              <h2 id="receipt-title">NaJaVi Canteen</h2>
              <p>May Kanin Busseng</p>
              <button className="receipt-dismiss" type="button" aria-label="Close receipt" onClick={() => setActiveReceipt(null)}>×</button>
            </header>

            <div className="receipt-meta">
              <span>Receipt / Transaction #</span>
              <strong>{activeReceipt.transactionNumber ?? activeReceipt.id}</strong>
              <div><span>Date: {activeReceipt.date ?? new Date(activeReceipt.completedAt).toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "2-digit" })}</span><span>Time: {activeReceipt.time ?? new Date(activeReceipt.completedAt).toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit" })}</span></div>
            </div>

            <section className="receipt-items-section">
              <h3>ITEMS</h3>
              <table className="receipt-items-table">
                <thead><tr><th>Product</th><th>Qty</th><th>Amount</th></tr></thead>
                <tbody>{activeReceipt.items.map((item, index) => (
                  <tr key={`${item.id ?? item.name}-${index}`}>
                    <td><strong>{item.name}</strong><span>₱{Number(item.unitPrice).toFixed(2)} each</span></td>
                    <td>{item.quantity}</td>
                    <td>₱{Number(item.lineTotal).toFixed(2)}</td>
                  </tr>
                ))}</tbody>
              </table>
            </section>

            <div className="receipt-calculations">
              <div><span>Subtotal</span><strong>₱{activeReceipt.subtotal.toFixed(2)}</strong></div>
              <div><span>Free-drink deduction</span><strong>−₱{activeReceipt.discount.toFixed(2)}</strong></div>
              {(activeReceipt.freeDrinks ?? (activeReceipt.discount >= 15 ? 1 : 0)) > 0 && <p className="receipt-free-drink">Free drink awarded: {activeReceipt.freeDrinks ?? 1}</p>}
              <div className="receipt-total"><span>Total Due</span><strong>₱{activeReceipt.totalDue.toFixed(2)}</strong></div>
              <div><span>Cash received</span><strong>₱{activeReceipt.cashPaid.toFixed(2)}</strong></div>
              <div><span>Change</span><strong>₱{activeReceipt.change.toFixed(2)}</strong></div>
            </div>

            <p className="receipt-thanks">Thank you for ordering!</p>
            <footer className="receipt-actions">
              <button className="receipt-print-button" type="button" onClick={() => window.print()}>Print Receipt</button>
              <button className="receipt-close-button" type="button" onClick={() => setActiveReceipt(null)}>Close</button>
            </footer>
          </section>
        </div>,
        document.body
      )}
    </div>
  );
}

export default App;
