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

The React app stores completed transactions in localStorage in the current browser on this device. Its Summary uses those browser records. The Flask API added for the next integration stage is stateless and does not save transactions; the React frontend is not connected to it yet. No database is used.

## Python backend (not yet connected to the frontend)

The Flask API calculates quotes and checkout totals using the server-side menu. The console program uses the same pricing and promotion logic.

Install the Python dependencies from the project root:

```sh
python -m pip install -r backend/requirements.txt
```

Start the local API:

```sh
python backend/app.py
```

The API listens at `http://127.0.0.1:5000`. By default, CORS allows the Vite development origins `http://localhost:5173` and `http://127.0.0.1:5173`, plus the Vite preview origin `http://localhost:4173`. Set `FRONTEND_ORIGINS` to a comma-separated list of allowed origins when deploying.

Available endpoints are `GET /api/health`, `GET /api/menu`, `POST /api/quote`, and `POST /api/checkout`. Quote and checkout accept an `items` array containing the existing frontend product IDs and integer quantities; checkout also accepts an integer `payment` amount in pesos. For example:

```json
{
  "items": [{ "id": 2, "quantity": 1 }, { "id": 4, "quantity": 4 }],
  "payment": 70
}
```

The API looks up prices by item ID and ignores any browser-supplied prices or totals. It keeps no transaction history.

Run the console canteen program:

```sh
python backend/console_app.py
```

Run the Python logic and API tests:

```sh
python -m unittest discover -s backend -p "test_*.py" -v
```
