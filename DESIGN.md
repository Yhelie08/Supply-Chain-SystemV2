---
name: Supply Chain App
description: A dark room lit by one warm lamp. Frosted glass panes, ember for the light you work in, signal green for health and partners.
colors:
  void: "#07090d"
  panel: "#131822"
  panel-raised: "#171d29"
  panel-high: "#1e2534"
  glass-edge: "rgba(255,255,255,0.11)"
  hairline: "rgba(255,255,255,0.10)"
  hairline-strong: "rgba(255,255,255,0.20)"
  ink: "#f1f3f8"
  ink-secondary: "#b2bac8"
  ink-tertiary: "#8d96a6"
  ember: "#ff7a1a"
  ember-hot: "#ffa14a"
  ember-ink: "#1c0d02"
  signal: "#2fe38f"
  signal-ink: "#04170d"
  status-warn: "#ffb347"
  status-bad: "#ff7676"
  status-info: "#78b6ff"
  status-violet: "#bda5ff"
typography:
  family: "Overpass (self-hosted, 300-800), Segoe UI, system-ui"
  page-title: { size: "26px", weight: 300, tracking: "-0.02em" }
  title: { size: "15-16px", weight: 700 }
  body: { size: "14px", weight: 400, figures: "tabular" }
  tab: { size: "13.5px", weight: 550, current: 700 }
rounded:
  control: "12px"
  panel: "14-18px"
  shell: "22px"
  pill: "999px"
---

# Design system

Home Cartel sells lighting, so the app is a dark room with the lamps on. The page behind everything is `void` with an ember lamp in the top-left and a signal lamp in the bottom-right; every surface is a pane of frosted glass in front of that light.

## One light, two colours

- **Ember** is the light you are working in: the current room and page, the primary action, focus, links, the active filter.
- **Signal green** means healthy or external: OK states, the live dot, and the two supplier portals (Tony Fan, Fenteng Lighting). Inside a portal the room's light is green, so a supplier sees at a glance that they are in a partner space.
- Warn, bad, info and violet are status colours only. They keep their meaning in every room.
- Ink on ember is `ember-ink`, never white (white on ember fails contrast).

## Shell (`server/public/index.html`)

- **Rail** on the left: the six sections as rooms, grouped Operations and Partners. The current room is lit (glow bar, tinted pane). Folds to icons; on phones it becomes a strip across the top.
- **Top bar**: the section name in light weight, a "Partner portal" tag for supplier rooms, and the account menu.
- **Beam**: one glowing line under the page tabs that slides to the page you open. This is the single motion on the page, besides the loading line on the stage while a page loads.
- **Stage**: the page lives in a glass pane. Real backdrop blur is used here and on the rail and menus, where the light behind is visible.

## Widgets (`server/public/theme/theme.css`)

Widget files are never edited. The server injects `theme.css` last in `<head>` with `data-hc-kit` (dms, legacy, tw) and `data-hc-line` (the section). The theme redefines each kit's own variables or utility classes so the original pages turn dark without changes:

- dms (Delivery): `--bg`, `--surface`, ... map to the `--hc-*` tokens.
- legacy (Procurement, supplier portals): `--blue` becomes the room's light; the grey scale is inverted so text stays on the 800 end.
- tw (Tailwind widgets): slate, ink and accent utility classes map to the same tokens.
- A scan of every page (headless Chrome, light backgrounds and dark text) found the remaining hard-coded pieces; each has a named rule near the end of `theme.css`.
- Panels inside widgets are translucent gradients with a 1px edge, because a backdrop blur inside an iframe cannot see the shell behind it. Menus, modals and confirm boxes stay opaque `panel`.

## Sign-in (`login.html`, `theme/pages.css`)

A pendant lamp hangs over the card and its light falls through the glass. It switches on once when the page loads (not with reduced motion). Account and Users pages use the same glass top bar.

## Detail views (`theme/views.css`)

One composition for every record page: an identity bar with the actions, the next-step strip, then **the work on the left and a 340px side column on the right** (pricing, status, audit, conversation). It is CSS only: widget markup, scripts and behaviour are untouched.

- Inquiry: the five readiness checks run as a strip across the top, with the result at the end; product, customer, supplier quotes and collateral are the left column; SRP, status signals and Books are the right.
- Purchase Request and Purchase Order: record on the left; priority, pricing, status and the conversation stacked on the right.
- Shipments, Replacement Request: the same two columns. Receiving gives the line-items table the full width and puts the info cards under it in two columns.
- Supplier portals: the response the supplier must fill in comes first (left); the record and the conversation sit beside it. Replacement Request is a balanced two-column stack.
- Fulfillment (Tailwind) pages use the same record + side grid. Delivery record drawers are wider and read in three columns.
- Section titles are sentence case over a hairline; no tinted bars, no tracked capitals.
- Purchase Request and Purchase Order follow the Inquiry composition: one bar with the identity and actions, the next-step strip, the readiness row (Purchase Request), then the work and the side column. Bars that stay at the top while scrolling are frosted (97% panel plus blur) so cards do not show through them.
- Every "Conversation" card has a minimize button (`theme/views.js`, injected with the theme). The choice is kept in localStorage (`hc-conv-min`).

## Light mode

A sun/moon button in the top bar (and on the sign-in, account and users pages) switches between dark and light. Dark is the default; the choice is kept in localStorage (`hc-theme`). `theme/theme-init.js` sets `data-theme` on `<html>` before first paint in the shell, the auth pages and every widget (the server injects it), and widgets follow a switch live through the `storage` event and a postMessage from the shell.

Light is the same room in daylight: white glass over a pale cool ground with peach and mint lamps. Ember and signal drop to deeper tones for text (`#b8480a`, `#0b8a55`) and slightly deeper fills (`#ef6d0c`, `#12a566`); text on those fills stays dark ink. Status colours get darker variants. Every colour is a token in `theme.css` / `pages.css` / `index.html`, so a new rule should use the token, never a literal.

## Rules

- Sentence case everywhere; no tracked capitals, no monospace for labels. Figures are tabular so columns do not move.
- Keyboard focus is a 2px ring in the room's light.
- `prefers-reduced-motion` turns every transition and animation off.
- Product behaviour and copy are unchanged; this is a visual layer.
