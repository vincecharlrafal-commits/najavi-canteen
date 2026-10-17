# NaJaVi Canteen

A React and Vite ordering and billing app for the NU Canteen, integrated with its Flask order API.

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
- JavaScript and CSS
- Python and Flask

## Run the integrated app locally

Use two terminals from the project root. In the first terminal, install the Python dependencies and start Flask:

```sh
python -m pip install -r backend/requirements.txt
python backend/app.py
```

In the second terminal, install the frontend dependencies and start Vite:

```sh
npm install
npm run dev
```

Copy `.env.example` to `.env` before starting Vite if you want to set frontend variables explicitly (`Copy-Item .env.example .env` in PowerShell). The frontend uses `VITE_API_BASE_URL=/api`; Vite proxies `/api` to Flask at `http://127.0.0.1:5000`. Set `VITE_API_BASE_URL` to the deployed API base including `/api` when a backend is deployed. Flask allows the local Vite origins by default; configure `FRONTEND_ORIGINS` for other origins. Restart Vite after changing frontend environment values.

## Production deployment (Vercel + Render)

The frontend reads `VITE_API_BASE_URL` at build time. Set `VITE_API_BASE_URL` to `https://najavi-canteen.onrender.com/api` in the Vercel **Production** environment; keep any Preview configuration scoped to Preview. Production currently tracks `main`, so merge the reviewed pull request into `main` before expecting its corresponding Vercel Production deployment. Do not promote a Preview deployment to Production unless you have verified that its source is the intended commit on `main`. The app appends `/menu`, `/quote`, and `/checkout` to this base, so do not add another `/api` segment.

For the Render web service, use `backend` as the Root Directory, install with `pip install -r requirements.txt`, and start with `gunicorn --bind 0.0.0.0:$PORT app:app`. Set `FRONTEND_ORIGINS` to the exact public Vercel production origin, for example `https://your-production-domain.vercel.app` (scheme and host only, no path or trailing slash). Add any custom production domain and any Preview origin that needs API access as comma-separated origins. Render supplies `PORT`; do not set a fixed port. The service must deploy the same `python-backend-upgrade` branch containing the current Flask catalog.

After deployment, confirm `https://najavi-canteen.onrender.com/api/health` returns `{"status":"ok"}` and `https://najavi-canteen.onrender.com/api/menu` returns prices `[15, 35, 15, 10]`. In the Vercel Production deployment, verify the menu, a quote at subtotal ₱75 (₱15 deduction, ₱60 due), checkout and receipt, and Summary history in the same browser. Transaction history is saved in browser localStorage; it is not shared between browsers or devices. If Vercel still serves an older UI, confirm the Production deployment's source commit is the intended branch head and redeploy that commit.
## Checks and production build

```sh
npm test
npm run lint
npm run build
python -m unittest discover -s backend -p "test_*.py" -v
```

## Storage limitation

The React app requests menu data and quotes from Flask, then sends checkout to Flask for payment validation and receipt calculations. Only after a successful Flask checkout does React save the returned receipt in localStorage. The Summary continues to use browser-stored transactions. Flask is stateless and does not save transactions; no database is used.

## API and console program

The API listens at `http://127.0.0.1:5000`. Its endpoints are `GET /api/health`, `GET /api/menu`, `POST /api/quote`, and `POST /api/checkout`. CORS allows the Vite development origins `http://localhost:5173` and `http://127.0.0.1:5173`, plus the Vite preview origin `http://localhost:4173`. Set `FRONTEND_ORIGINS` to a comma-separated list of allowed origins when deploying. Quote and checkout accept an `items` array containing the existing frontend product IDs and integer quantities; checkout also accepts an integer `payment` amount in pesos. For example:

```json
{
  "items": [{ "id": 2, "quantity": 1 }, { "id": 4, "quantity": 4 }],
  "payment": 70
}
```

The API looks up prices by item ID and ignores any browser-supplied prices or totals. It keeps no transaction history. The frontend rejects a menu response whose item IDs, names, or prices do not match the approved catalog, so an older backend deployment shows an actionable error instead of stale prices.

The separate academic console program is [NUCanteenBillingSystem.py](NUCanteenBillingSystem.py) at the repository root; it is independent of this Flask API.

Run the Python logic and API tests (in addition to the frontend tests above):

```sh
python -m unittest discover -s backend -p "test_*.py" -v
```
