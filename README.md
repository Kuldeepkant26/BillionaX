# Billionax — Wave Coins

A **post-booking** hotel loyalty platform. Guests book rooms through any channel
(Agoda, MMT, the hotel's own site, walk-in); Billionax only starts creating
value once they arrive on the property.

**The loop:** guest scans a QR at reception → creates a free account → the hotel
allocates coins for their stay (`Room × Nights × Rate%`) → the guest redeems
coins the same stay at hotel outlets via a short-lived one-time code → staff
verify the code against a bill and apply the discount.

---

## Running it

Both apps need to be running.

```bash
# terminal 1 — API on :5001
cd backend && npm install && npm run dev

# terminal 2 — web app on :5173
cd frontend && npm install && npm run dev
```

Then seed the platform owner account (idempotent — safe to re-run):

```bash
cd backend && npm run seed
```

> Port 5001, not 5000: macOS Control Center (AirPlay Receiver) occupies 5000.

### Testing on a phone or a second device

Nothing extra to configure. Vite already listens on all interfaces and prints a
**Network** URL on startup:

```
➜  Network: http://192.168.31.112:5173/
```

Open that on any device on the same Wi-Fi.

It works because the frontend derives the API host from whatever host the page
was opened on (`src/api/axiosInstance.js`) — a hardcoded `localhost` would mean
*the phone itself*. The API's CORS allowlist accepts any private-network origin
in development for the same reason.

Find the IP again any time with `ipconfig getifaddr en0`.

If the page won't load from the phone, it's almost always one of:
- the two devices are on different networks (5GHz vs 2.4GHz counts as the same
  network on most routers, but guest Wi-Fi does not)
- the network blocks device-to-device traffic — common on corporate and guest
  Wi-Fi. Use a tunnel such as `ngrok http 5173` instead
- the macOS firewall is prompting for permission — allow `node`

### Sign in

| Surface | URL | Credentials |
|---|---|---|
| Main admin | `/admin/login` | `admin@billionax.com` / `Admin@12345` |
| Hotel panel | `/hotel/login` | created by the admin per hotel |
| Guest app | `/join/<hotel-slug>` | any phone number + **any OTP** (dev bypass) |

### First run, end to end

1. Sign in as the main admin → **Hotels → Register hotel**
2. Open the hotel → **Add account** (a manager), then either **Sell coins** from here or let the hotel buy their own from their Coins tab
3. Sign in to `/hotel/login` as that manager → **Members → Add coins for a stay**
4. Open `/join/<slug>` on a phone, enter that guest's number, any OTP
5. Guest: **Redeem** → generate a code
6. Manager: **Verify code** → enter the bill and the code → confirm

---

## Layout

```
backend/           Express + MongoDB (ESM)
  src/
    config/        env (validated on boot), db, constants
    models/        9 schemas — see "Data model" below
    routes/        auth · guest · hotel · admin · public
    controllers/   thin: parse → service → ApiResponse
    services/      all business logic
    middlewares/   auth · rbac · validate · rateLimiter · errorHandler
    utils/         ApiError · ApiResponse · asyncHandler · token · coinMath
  scripts/         seedAdmin · reconcile

frontend/          React 19 + Vite + react-router + zustand
  src/
    api/           axios instance (auth header, 401 refresh-retry) + per-role modules
    store/         one zustand store, sliced (auth · hotel · ui)
    routes/        guarded route tree (ProtectedRoute · RoleRoute · PublicOnlyRoute)
    components/    layouts (guest · panel) + shared UI
    features/      guest · panel widgets
    pages/         guest/ · hotel/ · admin/
    styles/        themes.css · components.css
```

### Data model

`User` (4 roles) · `Hotel` · `GuestHotelMembership` · `CoinPurchase` ·
`CoinTransaction` (the ledger) · `Voucher` · `PendingOtp` · `Content` ·
`PlatformSettings`

A guest's **phone is their global identity**, but they hold a **separate coin
balance at each hotel** — that's what `GuestHotelMembership` is for, and why the
app has a hotel "Switch" control.

---

## Things worth knowing before you change anything

**The ledger is the source of truth.** `CoinTransaction` is append-only —
never updated, never deleted. `membership.balance` is a cached projection of it.
`npm run reconcile` asserts `sum(ledger.coins) === balance` for every
membership; run it after touching any coin path.

**Coin writes use the balance check as the query filter, never read-then-write.**

```js
Hotel.findOneAndUpdate(
  { _id, coinInventory: { $gte: coins } },   // the guard IS the filter
  { $inc: { coinInventory: -coins } },
)
```

A `findById` → check → `save()` would lose updates under concurrency. Redemption
spans three documents, so it runs inside a Mongo transaction.

**Vouchers deliberately have no TTL index.** A TTL would delete the audit trail
linking a transaction to its code, and its ~60s sweep makes it unsafe as an
expiry *control*. Expiry is a query predicate:
`{ status: ACTIVE, expiresAt: { $gt: now } }`. TTL is used only on `PendingOtp`,
where nothing references the rows afterwards.

**`requireSameHotel` is applied at router level**, not per route — one route
missing it would leak another hotel's financial data.

**Two themes, one component library.** Both define the *same* CSS variable
names, scoped to `[data-theme]` on the layout root, so `Button`/`Card`/`Table`
are written once and render correctly in either surface. Guest =
`emerald-noir` (black/gold), panels = `ink-minimal` (light/editorial).

---

## Before this goes live

1. **Rotate the MongoDB Atlas password** — the current one has been shared in
   plain text. Also restrict Network Access away from `0.0.0.0/0`.
2. **Turn off the OTP bypass.** `OTP_DEV_BYPASS=true` accepts *any* code, so
   anyone can sign in as any phone number. It is force-disabled whenever
   `NODE_ENV=production`, but wire up a real SMS provider first — add it to the
   `providers` map in `src/services/otp.service.js`; nothing else changes.
3. Generate fresh `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET`.
4. Set `NODE_ENV=production` (also enables secure cookies).

## Payments

Coin purchases run in **demo mode**: the hotel picks a pack (or a custom
amount), chooses a method, and the purchase is recorded and credited
immediately without money moving. The reference is prefixed `SIM-`.

Wiring a real gateway means verifying its signature inside
`purchaseCoinPack()` in `src/services/coin.service.js` before it calls
`recordPurchase` — nothing downstream changes. Pack prices are defined
server-side in `COIN_PACKS` and re-checked on every request, so a tampered
client cannot buy 500k coins for ₹1.

## Not built yet (deliberately)

- Outlet-spend earning (`20 coins per ₹100`) — settings field exists, not wired
- Settlement/payout entity — platform fee is recorded per transaction, reporting only
- File uploads — content takes an image **URL** for now
- Coin expiry — balances persist; "same stay" is a UX convention, not enforced
