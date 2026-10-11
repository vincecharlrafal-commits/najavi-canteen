import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import "./App.css";
import { addProductToCart, buildTransactionRecord, changeCartQuantity, clearCart, createTransactionMetadata, getCartItemCount, getDailyStats, getOrderTotals, getPaymentResult, localDateKey, removeProductFromCart } from "./domain/order.js";
import { appendTransaction, hasReceiptData, loadTransactions } from "./services/transactionStore.js";

import kaninImage from "./assets/kanin.png";
import ulamImage from "./assets/ulam.png";
import softdrinksImage from "./assets/softdrinks.png";
import iceCreamImage from "./assets/ice_cream.png";

const products = [
  { id: 1, name: "Kanin", price: 15, category: "Meals", description: "Steamed Rice", image: kaninImage },
  { id: 2, name: "Ulam", price: 35, category: "Meals", description: "Canteen Viand", image: ulamImage },
  { id: 3, name: "Softdrinks", price: 20, category: "Drinks", description: "Chilled Drink", image: softdrinksImage },
  { id: 4, name: "Ice Cream", price: 25, category: "Desserts", description: "Cold Dessert", image: iceCreamImage },
];

function Icon({ name, size = 20 }) {
  const shared = { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true };

  if (name === "logo") return <svg {...shared}><path d="M4 9h16l-2 10H6L4 9Z" /><path d="M7 9c0-3 2-5 5-5s5 2 5 5M8 13h8" /></svg>;
  if (name === "home") return <svg {...shared}><path d="m3 11 9-8 9 8" /><path d="M5 10v10h14V10M9 20v-6h6v6" /></svg>;
  if (name === "chart") return <svg {...shared}><path d="M4 19V10h4v9M10 19V5h4v14M16 19v-7h4v7" /><path d="M3 21h18" /></svg>;
  if (name === "search") return <svg {...shared}><circle cx="10.8" cy="10.8" r="6.8" /><path d="m16 16 5 5" /></svg>;
  if (name === "cart") return <svg {...shared}><path d="M3 4h2l2.2 11.2a2 2 0 0 0 2 1.6h8.6a2 2 0 0 0 1.9-1.4L22 8H6" /><circle cx="10" cy="20" r="1" /><circle cx="18" cy="20" r="1" /></svg>;
  if (name === "gift") return <svg {...shared}><rect x="3" y="9" width="18" height="12" rx="1" /><path d="M2 6h20v4H2zM12 6v15M12 6H8.5a2.5 2.5 0 1 1 2.5-2.5V6Zm0 0h3.5a2.5 2.5 0 1 0-2.5-2.5V6Z" /></svg>;
  return <svg {...shared}><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M7 10h10M7 14h4" /></svg>;
}

function App() {
  const [transactionsState, setTransactionsState] = useState(loadTransactions);
  const [cart, setCart] = useState([]);
  const [cashPayment, setCashPayment] = useState("");
  const [paymentStatus, setPaymentStatus] = useState(null);
  const [activeReceipt, setActiveReceipt] = useState(null);
  const [activeCategory, setActiveCategory] = useState("All");
  const [searchQuery, setSearchQuery] = useState("");
  const [activePage, setActivePage] = useState("Menu");
  const [mobileCartOpen, setMobileCartOpen] = useState(false);
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const checkoutLock = useRef(false);
  const transactionSubmitted = useRef(false);
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
    if (!mobileCartOpen) return undefined;

    const closeOnEscape = (event) => {
      if (event.key === "Escape") setMobileCartOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [mobileCartOpen]);

  const addToCart = (product) => {
    transactionSubmitted.current = false;
    setCart((currentCart) => addProductToCart(currentCart, product));
    setPaymentStatus(null);
  };

  const updateQuantity = (productId, change) => {
    transactionSubmitted.current = false;
    setCart((currentCart) => changeCartQuantity(currentCart, productId, change));
    setPaymentStatus(null);
  };

  const removeFromCart = (productId) => {
    transactionSubmitted.current = false;
    setCart((currentCart) => removeProductFromCart(currentCart, productId));
    setPaymentStatus(null);
  };

  const clearOrder = () => {
    transactionSubmitted.current = false;
    setCart(clearCart());
    setCashPayment("");
    setPaymentStatus(null);
  };

  const { subtotal, discount, totalDue, freeDrinks, amountToPromotion, promotionProgress } = getOrderTotals(cart);
  const itemCount = getCartItemCount(cart);
  const paymentResult = getPaymentResult(cashPayment, totalDue);
  const isCheckoutEnabled = cart.length > 0 && paymentResult.valid && !transactionsState.error;
  const todayStats = getDailyStats(transactionsState.transactions, todayKey);

  const handleCheckout = () => {
    if (checkoutLock.current || transactionSubmitted.current) return;
    if (cart.length === 0) {
      setPaymentStatus({ type: "error", message: "Add items to your order before checkout." });
    } else if (!paymentResult.valid) {
      setPaymentStatus({ type: "error", message: "Please enter a valid cash payment amount." });
    } else if (transactionsState.error) {
      setPaymentStatus({ type: "error", message: "Transaction history is unavailable. Checkout is disabled to protect existing records." });
    } else {
      checkoutLock.current = true;
      try {
        const { id: transactionId, completedAt } = createTransactionMetadata();
        const transaction = buildTransactionRecord(cart, cashPayment, completedAt, transactionId);
        const savedTransactions = appendTransaction(transaction);
        const savedReceipt = savedTransactions[savedTransactions.length - 1];
        transactionSubmitted.current = true;
        setTransactionsState({ transactions: savedTransactions, error: null });
        setCurrentDate(completedAt);
        setCart([]);
        setCashPayment("");
        setMobileCartOpen(false);
        setPaymentStatus({ type: "success", message: `Order completed. Change: ₱${paymentResult.change.toFixed(2)}.` });
        setActiveReceipt(savedReceipt);
      } catch (error) {
        setPaymentStatus({ type: "error", message: error instanceof Error ? error.message : "The transaction could not be saved." });
      } finally {
        checkoutLock.current = false;
      }
    }
  };

  const visibleProducts = products.filter((product) => {
    const matchesCategory = activeCategory === "All" || product.category === activeCategory;
    const query = searchQuery.trim().toLowerCase();
    const matchesSearch = !query || `${product.name} ${product.description} ${product.category}`.toLowerCase().includes(query);
    return matchesCategory && matchesSearch;
  });

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
                <button className="add-button" type="button" onClick={() => addToCart(product)}><span aria-hidden="true">＋</span> Add to Cart</button>
              </article>
            ))}
            {visibleProducts.length === 0 && <p className="no-products">No menu items match your search.</p>}
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
            </div>
            <section className="transaction-history">
              <h2>Completed transactions</h2>
              {todayStats.transactions.length === 0 ? <p className="no-transactions">No completed transactions today.</p> : (
                <div className="transaction-list">
                  {[...todayStats.transactions].reverse().map((transaction) => {
                    const receiptAvailable = hasReceiptData(transaction);
                    const transactionItems = transaction.itemCount ?? transaction.items?.reduce((count, item) => count + item.quantity, 0) ?? 0;
                    return (
                      <article className="transaction-card" key={transaction.id}>
                        <div className="transaction-details">
                          <strong>{new Date(transaction.completedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</strong>
                          {transaction.transactionNumber && <span className="transaction-number">{transaction.transactionNumber}</span>}
                          <span>{transactionItems} {transactionItems === 1 ? "item" : "items"}</span>
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
        {itemCount > 0 && <strong className="mobile-cart-total">₱{totalDue.toFixed(2)}</strong>}
      </button>
      {mobileCartOpen && <button className="mobile-cart-backdrop" type="button" aria-label="Close My Order" onClick={() => setMobileCartOpen(false)} />}

      <aside id="my-order-panel" className={`order-panel${mobileCartOpen ? " mobile-cart-open" : ""}`} aria-label="My Order" role={mobileCartOpen ? "dialog" : undefined} aria-modal={mobileCartOpen ? "true" : undefined}>
        <div className="order-header">
          <h2>My Order</h2>
          <span className="item-count-badge">{itemCount} {itemCount === 1 ? "item" : "items"}</span>
          <button className="clear-order" type="button" onClick={clearOrder} disabled={cart.length === 0}>× <span>Clear Order</span></button>
          <button className="mobile-cart-close" type="button" aria-label="Close My Order" onClick={() => setMobileCartOpen(false)}>×</button>
        </div>

        <div className={`order-items${cart.length === 0 ? " empty" : ""}`}>
          {cart.length === 0 ? (
            <div className="empty-order"><div className="empty-cart-icon"><Icon name="cart" size={42} /></div><p>Your order is empty. Add items from the menu.</p></div>
          ) : cart.map((item) => (
            <div className="order-item" key={item.id}>
              <div className="order-item-main">
                <h3>{item.name}</h3>
                <p>₱{item.price} each</p>
                <div className="quantity-controls" aria-label={`${item.name} quantity`}>
                  <button className="quantity-button" type="button" aria-label={`Decrease ${item.name} quantity`} onClick={() => updateQuantity(item.id, -1)}>−</button>
                  <span className="quantity-value">{item.quantity}</span>
                  <button className="quantity-button" type="button" aria-label={`Increase ${item.name} quantity`} onClick={() => updateQuantity(item.id, 1)}>+</button>
                  <button className="remove-button" type="button" onClick={() => removeFromCart(item.id)}>Remove</button>
                </div>
              </div>
              <strong className="line-total">₱{(item.price * item.quantity).toFixed(2)}</strong>
            </div>
          ))}
        </div>

        <div className="order-bottom">
          <section className={`promotion-card${freeDrinks > 0 ? " promotion-qualified" : ""}`} aria-label="Free-drink promotion">
            <div className="promotion-heading"><Icon name="gift" size={22} /><strong>{freeDrinks > 0 ? "Free Drink Unlocked!" : "Free Drink Reward"}</strong><span>{freeDrinks > 0 ? "Qualified!" : `₱${amountToPromotion} to go`}</span></div>
            <div className="progress-track"><div className="progress-fill" style={{ width: `${promotionProgress}%` }} /></div>
            <p>{freeDrinks > 0 ? "₱15 deduction applied" : `Add ₱${amountToPromotion} more to unlock your free drink.`}</p>
          </section>

          <div className="order-totals">
            <div className="summary-row"><span>Subtotal</span><strong>₱{subtotal.toFixed(2)}</strong></div>
            <div className="summary-row deduction-row"><span>Free-drink deduction</span><strong>−₱{discount.toFixed(2)}</strong></div>
            <div className="total-row"><span>TOTAL DUE</span><strong>₱{totalDue.toFixed(2)}</strong></div>
          </div>

          <section className="payment-card">
            <label className="cash-label" htmlFor="cash-payment"><span><Icon name="cash" size={17} />Cash Payment</span>
              <input id="cash-payment" type="number" inputMode="decimal" min="0" step="0.01" placeholder="Enter amount" value={cashPayment} onChange={(event) => { const value = event.target.value; setCashPayment(value.startsWith("-") ? "" : value); setPaymentStatus(null); }} />
            </label>
            {cart.length > 0 && !cashPayment.trim() && <p className="payment-hint">Enter a cash amount to enable checkout.</p>}
            {paymentResult.reason === "invalid" && <p className="payment-message payment-error" role="status">Enter a valid non-negative cash amount.</p>}
            {paymentResult.reason === "insufficient" && <p className="payment-message payment-error" role="status">Insufficient payment. Amount still needed: ₱{paymentResult.amountNeeded.toFixed(2)}.</p>}
            {paymentResult.valid && <div className="change-row"><span>Change</span><strong>₱{paymentResult.change.toFixed(2)}</strong></div>}
            {paymentStatus && <p className={`payment-message payment-${paymentStatus.type}`} role="status">{paymentStatus.message}</p>}
            {transactionsState.error && <p className="payment-message payment-error" role="alert">Transaction storage is unavailable. Existing records are protected; checkout is disabled.</p>}
            <button className="checkout-button" type="button" onClick={handleCheckout} disabled={!isCheckoutEnabled}>▣&nbsp; Checkout</button>
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
              <div className="receipt-total"><span>TOTAL DUE</span><strong>₱{activeReceipt.totalDue.toFixed(2)}</strong></div>
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
