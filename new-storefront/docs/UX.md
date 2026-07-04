# Ember — UX Reference (for agents)

Purpose: give an agent enough context to reason about, extend, or reimplement the user
experience without re-reading every screen file. Source of truth is `src/`; this doc explains
*why* the screens are shaped the way they are, not just what's on them. See `README.md` for
file-by-file structure and design tokens.

## Product framing

Ember is an **order-ahead coffee app** with an AI-barista assistant as a first-class way to
order (not a side gimmick). The core UX bet: ordering a drink has three equally valid paths —
browse-and-tap, quick-add a default, or describe what you want in chat — and all three
converge on the same cart/checkout flow. Nothing in the data model favors one path over another.

The persona is "Alex," a returning loyalty member (240 ★, mid-progress to next reward) — the
app is tuned for a **repeat customer doing a fast daily reorder**, not a first-time visitor
discovering the menu. That's why the home screen leads with "Order ahead" + a greeting, not a
marketing hero, and why quick-add (`+` button) exists everywhere a drink is listed.

## Navigation model

Bottom tab bar with 5 destinations: **Menu · Rewards · Chat · Bag · You** (`TabBar.tsx`).
- `You` is a stub ("coming soon") — not implemented, don't build features assuming it works.
- Drink detail is **not** a tab — it's a modal-like push state (`{kind:'detail', drinkId}`)
  reachable only from Menu or Chat-add, and always returns to Menu on back.
- Chat is the one tab that goes **full-bleed**: the tab bar disappears, and a back/close
  control inside the chat header substitutes for it. This is deliberate — chat is treated as
  an immersive mode, not a page among pages.
- The cart badge on the Bag tab is the only persistent cross-screen state surfaced in nav.

## Screen-by-screen UX intent

### Menu (home)
Greeting → search → category chips → one accent-colored **featured** card → "Popular today"
list. The featured card and every list row carry an inline `+` that adds with defaults
(Medium / Oat / no extras) **without leaving the screen** — this is the fast path for repeat
orders. Tapping the card/row body (not the `+`) opens full customization instead. This dual
tap-target pattern (row opens detail, trailing icon quick-acts) repeats in Cart (qty stepper
vs. row tap) and is a convention worth preserving if you add more list rows.

### Drink detail (customize)
Single screen, no multi-step wizard: temperature toggle on the hero image, then size → milk →
extras (toggle switches) → quantity, with **price recalculating live** at every step and
echoed directly on the primary CTA (`Add to bag · $X.XX`). The UX principle is *no surprise
at checkout* — the user always sees the exact total before committing, and a sane default
(Medium/Oat, one shot pre-toggled) is pre-selected so a user who doesn't care about options
can just hit the CTA immediately.

### Rewards
Read-only / static dashboard — no interactive purchase flow lives here. Its job is motivation:
a dark hero card makes the star balance feel premium, a filled/unfilled star row gives instant
visual progress toward the next free drink, and the activity feed reinforces "you've been
here before, here's the trail." Offer cards (2× stars, free oat) are informational teasers,
not tappable flows yet.

### Assistant chat — two interchangeable directions
This is the most novel UX surface: the *same* underlying intent ("recommend + let me add
to bag") is expressed as two toggleable presentations, switchable mid-session via an icon in
the header/footer:
- **Bubbles (light):** a familiar messaging UI. The bot's recommendation is rendered as an
  inline **product card with its own Add-to-bag button** — i.e., the chat bubble doubles as a
  mini product page. A gold-tinted "nudge" bubble style exists specifically for rewards
  upsells, visually distinct from normal bot text. Quick-reply chips give a no-typing path;
  the first chip ("Add to bag") shortcuts straight to cart instead of sending a message.
- **Voice (dark):** an immersive full-screen mode — mood chips (Bold & hot / Sweet & iced /
  Surprise me) stand in for typing a prompt, and a large hold-to-talk mic is the primary
  input. The whole app shell (not just the screen) flips to dark theme while this variant is
  active (`App.tsx` `dark` flag) — this is the one place global chrome changes based on a
  sub-screen state, signaling "you've left the normal app into a different mode."
- Both variants exit to Menu, never to a "previous tab" — chat is conceptually a detour, not
  a stack you back out of.

This dual-direction setup in the README is explicit handoff language ("two assistant
directions, toggleable in-app") — treat it as two *design explorations* a real product would
pick one of, not two permanent shipped features. An agent extending the app should ask which
direction is canonical before building on top of both.

### Cart (bag)
Pickup-not-delivery framing throughout (ETA banner, "Pickup · store name", no address entry).
Standard pattern: editable line items with steppers (decrementing to 0 removes the line —
no separate delete control), a promo-code entry point (visual only, not wired), and a summary
that explicitly shows **stars earned by this order** before payment — reinforcing the loyalty
loop at the moment of commitment. Empty state is a soft redirect back to Menu, not a dead end.
There is no real payment integration — `Pay $X.XX` is a static CTA.

## Cross-cutting UX patterns worth preserving

- **Live price feedback.** Anywhere a price-affecting choice exists (size, milk via no-cost
  swap, extras, qty), the visible total updates immediately and is restated on the action
  button itself, not just in a summary elsewhere.
- **Default-then-customize.** Every entry point to adding a drink has a fast "just add it"
  affordance (quick-add `+`, chat's first chip) *and* a slower customize path — never force
  the long path.
- **Single source of truth for cart state.** All adds funnel through `addItem`/`quickAdd` in
  `App.tsx`; chat, detail screen, and menu quick-add all call the same functions, so behavior
  (line merging rules, qty defaults) stays consistent across entry points by construction.
- **Theme-as-mode signal.** Color scheme (light cream vs. dark espresso) is reserved for
  signaling "you're in a different mode" (voice chat), not used for arbitrary screen variety.
- **No dead ends.** Empty cart, "You" tab, and unconfigured promo code all have a clear
  next step rather than a blank or broken state — keep that property when adding new states.

## Known gaps (don't assume these work)

- `You` tab, promo code entry, real payment, search field, "See all" on Popular, notification
  bell, profile editing — all visually present but **non-functional** placeholders.
- Product imagery is a striped `Placeholder` component everywhere, not real photos.
- Bot replies in chat are canned/fixed, not a real LLM call — `setTimeout` simulates latency.
