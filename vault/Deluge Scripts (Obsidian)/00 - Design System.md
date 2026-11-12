---
title: "Design System"
tags:
  - design
  - ui
  - impeccable
---

# Design system: "The Rail Network"

Source of truth: `DESIGN.md` (tokens and rules) and `PRODUCT.md` (users and goal) in the project root, with `.impeccable/design.json` and the direction brief in `.impeccable/surfaces/`. This note is the short version. Where it runs: [[00 - Current System]].

## Idea

Home Cartel's order journey is a rail network. **Each section is a line with its own flat colour and short code; each page is a station on it.** The tab row is that line drawn with a station under each tab, the current page a large filled station.

| Section | Code | Line colour |
|---|---|---|
| Analytic | A | ink (the interchange) |
| Procurement | P | violet `#6a3a9e` |
| Tony Fan | TF | plum `#96367f` |
| Fenteng Lighting | FL | indigo `#4744a6` |
| Fulfillment | F | yellow `#f2b705` (ink text on it) |
| Delivery Management | D | blue `#1f5fad` |

## Rules

- A line's colour appears only on its rail, the current station, the primary action, focus and selection. Never decoration.
- Status colours (ok / warn / bad / info / violet) mean the same on every line.
- Font: **Overpass**, self-hosted in `server/public/theme/fonts/`. Tabular figures in every table. Sentence-case table headers.
- Navy header, concrete-grey ground, white panels, one-pixel hairlines, no gradients, no decorative shadows. Dark mode only on the Delivery screens (the other widgets hard-code light colours).
- Density is never lower than the Zoho original.

## How it is applied

A **theme layer**, not a rewrite: the server injects `server/public/theme/theme.css` into every widget and tags the page with `data-hc-kit` (`dms`, `legacy` or `tw`, the widget's own style system) and `data-hc-line` (its section). Widget code is untouched, so every function keeps working and re-importing widgets can't erase the design. Colours written directly into the Procurement and supplier-portal widgets keep their original values.

## Product record (from PRODUCT.md)

- **Users:** Home Cartel staff, the suppliers (Tony Fan, Fenteng Lighting, in China), delivery and install crews on phones, and management.
- **Goal:** fully replace Zoho Creator.
- **Languages:** English, Taglish for staff, Chinese (中文) for suppliers.
- **Principles:** parity before novelty; one order, one trail; each role sees its own job first; speak the user's language; nothing invented.

## Design skills installed

| Skill | Where | Used for |
|---|---|---|
| `frontend-design` (Anthropic) | in the repo, `.claude/skills/` | first design pass |
| `impeccable` | `~/.claude/skills/` (not in the repo) | product record, direction, critique, audit, polish |
| `ui-ux-pro-max`, `design-taste-frontend`, `huashu-design` | `~/.claude/skills/` (not in the repo) | installed, not yet used |

To install them on another computer, see the commands in [[00 - Change Log]].
