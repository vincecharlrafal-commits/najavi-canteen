# NaJaVi Canteen

A React and Vite ordering and billing app for the NU Canteen.

## Features

- Product menu with search and category filters
- Shopping cart with quantity controls
- Free-drink promotion: orders of ₱75 or more get a ₱15 deduction and one free drink
- Cash payment validation and change calculation
- Checkout with a digital receipt
- Completed transaction history and daily summary
- Transaction records stored in this browser using localStorage

## Technology

- React
- Vite
- JavaScript
- CSS

## Run locally

```sh
npm install
npm run dev
```

## Checks and production build

```sh
npm test
npm run lint
npm run build
npm run preview
```

## Storage limitation

Transactions are stored in localStorage in the current browser on this device. They are not synchronized with other browsers or devices. Clearing browser storage removes the saved transaction history. This app does not use a cloud database or backend.
