# Ember — Coffee App (React + TypeScript)

A bold, high-contrast order-ahead coffee app with a barista-style AI assistant.
This is a runnable React + TypeScript (Vite) implementation of the Ember design.

> **About this bundle.** `design-reference/` contains the original HTML design prototype
> (look-and-behavior reference). `src/` is the real React + TypeScript implementation of
> that design. If you're dropping this into an existing codebase, treat `src/` as a faithful
> reference and adapt it to your app's established patterns, component library, and design
> tokens rather than copying verbatim. Fidelity is **high (hifi)** — colors, type, spacing
> and interactions are final.

---

## Run it

```bash
cd design_handoff_ember_app
npm install
npm run dev      # start the dev server (Vite)
npm run build    # type-check + production build
```

Open the printed localhost URL. The app is **fully responsive** — it fills the viewport
edge-to-edge on a phone, and centers as a single app column (max 480px) on web/tablet.
There is no device bezel and no fake status bar. Fonts (Space Grotesk + DM Sans) load from
Google Fonts via `index.html`.

---

## Tech

- **React 18 + TypeScript**, bundled with **Vite**
- **lucide-react** for all icons
- **Inline styles** driven by a single token object (`src/theme.ts`) — no CSS framework.
  Swap for your own styling layer (CSS Modules, Tailwind, styled-components) on integration.

---

## Project structure

```
src/
  main.tsx                 App entry (createRoot)
  App.tsx                  State machine: active view, cart, chat variant
  theme.ts                 Design tokens + striped-placeholder helper
  types.ts                 Drink, CartItem, ChatMessage, Tab, View, …
  data.ts                  Mock menu, extras, rewards, money() formatter
  components/
    Icon.tsx               lucide-react by-name wrapper
    PhoneFrame.tsx         Responsive app shell (fills phone / centers on web)
    TabBar.tsx             Bottom nav (Menu / Rewards / Chat / Bag / You) + bag badge
    Placeholder.tsx        Striped stand-in for product photos
  screens/
    MenuScreen.tsx         Browse, categories, featured + popular, quick-add
    DrinkDetailScreen.tsx  Size / milk / extras / qty with live price
    RewardsScreen.tsx      Star balance, 4/8 progress, offers, activity
    ChatScreen.tsx         Two assistant directions (bubbles + voice)
    CartScreen.tsx         Pickup, line items, totals, empty state
design-reference/
    Ember Coffee App.dc.html   Original HTML design prototype (all 6 screens)
```

---

## Screens & behavior

### Menu (`menu`)
Greeting header, search field, scrollable category chips (first selected), an accent
**featured** card, and a "Popular today" list. Tapping a card opens the drink detail;
the `+` buttons **quick-add** with defaults (Medium / Oat / no extras).

### Drink detail (`detail`)
Local state for temperature, size, milk, extras (Set of ids), and quantity. **Unit price
recomputes live** = `base + SIZE_DELTA[size] + Σ extras`, and the CTA shows `unitPrice × qty`.
Adding routes to the bag.

### Rewards (`rewards`)
Espresso-dark star-balance card showing `240 ★` and a `4 / 8` star row (4 filled gold),
"2× stars" / "Free oat" offer cards, and an activity feed (earned green, redeemed muted).
Static / read-only.

### Assistant chat (`chat`) — two directions, toggleable in-app
- **A · Bubbles (light):** conversational thread with an in-bubble product card (Add to bag),
  a gold rewards-nudge bubble, quick-reply chips, and a working text input. Sending a message
  appends the user bubble and a canned bot reply (with a recommendation card) ~600ms later.
- **B · Voice (dark):** immersive espresso-dark layout — mood cards (Bold & hot / Sweet & iced /
  Surprise me), a recommendation card, and a hold-to-talk mic. The keyboard button moves back to
  variant A; the whole shell flips dark for variant B.

Chat is full-bleed (no tab bar): the back arrow (bubbles) / × (voice) exits to the menu.

### Cart (`bag`)
Pickup card with ETA, line items with quantity steppers (qty→0 removes the line), promo row,
and a live summary (subtotal, 7.8% tax, total, stars earned). Empty state prompts browsing.

---

## State (in `App.tsx`)

| State | Type | Purpose |
|---|---|---|
| `view` | `{kind:'tab', tab} \| {kind:'detail', drinkId}` | Current screen |
| `cart` | `CartItem[]` | Bag contents; `bagCount` derived via `useMemo` |
| `chatVariant` | `'bubbles' \| 'voice'` | Drives chat layout **and** the dark app shell |

Key actions: `addItem(config)`, `quickAdd(drink)`, `changeQty(lineId, ±1)`, `goTab(tab)`.

---

## Design tokens (`src/theme.ts`)

| Token | Value | Use |
|---|---|---|
| `cream` | `#F4EFE6` | App / light screen surface |
| `paper` | `#FFFFFF` | Cards, fields |
| `ink` | `#221B16` | Primary text, dark chips |
| `sub` | `#6B5E54` | Secondary text |
| `muted` / `faint` | `#9A8D80` / `#B4A99E` | Tertiary text, inactive tab |
| `accent` | `#EE5A24` | Primary brand orange (CTAs, active) |
| `accentSoft` | `#FBE3D6` | Accent tint chips |
| `dark` / `darkElev` | `#1E1713` / `#2A211B` | Voice-chat surfaces |
| `gold` / `goldSoft` | `#E9A23B` / `#FFF1DA` | Stars / rewards |
| `green` | `#1F8A5B` | Online dot, earned stars, ETA |
| `line` / `lineStrong` | `rgba(34,27,22,0.08 / 0.12)` | Borders |

**Type:** Space Grotesk (display, 600–700) + DM Sans (body, 400–600).
**Radii:** card `22`, field `15`, pill `999`. Shell is responsive (full-width phone, max 480px web).

---

## Assets

No raster assets ship in this bundle. Product imagery is rendered by `Placeholder.tsx`
(diagonal-stripe blocks with a monospace caption). **Replace each `<Placeholder>` with a
real `<img>`** during integration — each is sized and radiused to match the final photo slot.
Icons come from `lucide-react`. Fonts come from Google Fonts.
