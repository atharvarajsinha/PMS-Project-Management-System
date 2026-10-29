# PMS Frontend — Phase 1

React 18 · Vite · Tailwind 3.4 · shadcn/ui (JSX) · react-query · react-hook-form + zod · PWA.
Built against `docs/API.md` (contract) and `docs/design.md` (design system and conventions).

## Run

```bash
npm install
npm run dev:mock   # no backend: the API is served in the browser by MSW (src/mocks/)
npm run dev        # real backend: proxies /api to VITE_API_PROXY_TARGET
npm run build
```

### Environment (`.env`)

| Variable | Default | Purpose |
|---|---|---|
| `VITE_API_BASE_URL` | `/api/v1` | Base URL for API calls. Keep it relative so auth cookies stay first-party. |
| `VITE_API_PROXY_TARGET` | `http://127.0.0.1:8000` | Where the dev server forwards `/api` (dev only). Use `127.0.0.1`, not `localhost`: Node may resolve `localhost` to IPv6 while Django listens on IPv4. |
| `VITE_USE_MOCKS` | `false` | `true` serves the API from MSW (set in `.env.mock`). |

`.env.example` documents each variable. Put machine-specific overrides in `.env.local` (git-ignored). Only `VITE_*` values reach the browser, so never put secrets in these files.

### Mock mode accounts (seed data in `src/mocks/db.js`)

| Role | Email | Password |
|---|---|---|
| Super Admin | superadmin@pms.test | Admin@1234 |
| College Admin (SITARE) | admin@sitare.test | Admin@1234 |
| Faculty | faculty@sitare.test | Faculty@1234 |
| Student | student@sitare.test | Student@1234 |
| Student, must change password | newuser@sitare.test | Temp@1234 |

- Password-reset OTPs and "emailed" temporary passwords are printed to the browser console as `[mock] …`.
- Mock data persists in localStorage; reset it from the console with `__pmsMock.resetDb()`.
- Not simulated: `TOKEN_EXPIRED`/refresh, rate limiting, the 60 s OTP resend cooldown (the UI still enforces it).

## Layout

See `docs/design.md` §13. Notable pieces:
- `src/lib/api.js` — axios client: CSRF header, `X-College-Id` for Super Admin, single shared refresh, normalized errors.
- `src/context/` — Theme, Auth (session bootstrap, `pms:logout` / `pms:password-change-required` events), College (Super Admin "managing" mode).
- `src/config/nav.js` — role → nav items (data-driven; Phase 2/3 add entries here).
- `src/components/common/DataView.jsx` — table at `md+`, cards below `md`.
- `src/hooks/useListParams.js` + `usePagedList.js` — list filters/page in the URL; falls back to page 1 if a page disappears.

## TODO

- PWA PNG icons (`public/icons/icon-192.png`, `icon-512.png`, `maskable-512.png`, `apple-touch-180.png`) are referenced by the manifest but not created yet.
- Set the Render service URL in `vercel.json`.
- Faculty/student dashboards show only profile/college info: their academic read APIs arrive in Phase 2.
