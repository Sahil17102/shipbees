# ShipBees portals

The existing landing page remains in `dist/` and is not modified by these portal apps.

Local development URLs:

- User panel: `http://127.0.0.1:5174/login`
- Franchise login: `http://127.0.0.1:5175/login`
- Admin login: `http://127.0.0.1:5176/auth/signin`

All three portals use `https://shipbees2.onrender.com/api` by default. Override it with
`VITE_API_URL`, `VITE_API_BASE_URL`, or `REACT_APP_API_BASE_URL` respectively when needed.

