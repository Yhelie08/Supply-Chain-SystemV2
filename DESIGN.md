---
name: Supply Chain App
description: Home Cartel's order journey as a rail network — every section a line, every page a station.
colors:
  station-navy: "#1b2330"
  station-navy-raised: "#263042"
  station-navy-rule: "#36425a"
  platform-concrete: "#eceff3"
  panel-white: "#ffffff"
  panel-mist: "#f5f7f9"
  panel-shade: "#e4e8ee"
  hairline: "#d5dbe3"
  hairline-strong: "#b7c0cc"
  ink: "#1b2330"
  ink-secondary: "#4a5566"
  ink-tertiary: "#5f6a7c"
  line-procurement-violet: "#6a3a9e"
  line-tony-fan-plum: "#96367f"
  line-fenteng-indigo: "#4744a6"
  line-fulfillment-yellow: "#f2b705"
  line-fulfillment-ochre: "#7a5a00"
  line-delivery-blue: "#1f5fad"
  status-ok: "#17693f"
  status-ok-soft: "#e2f2e8"
  status-warn: "#a8480b"
  status-warn-soft: "#fcebdc"
  status-bad: "#b3261e"
  status-bad-soft: "#fbe4e2"
  status-info: "#245ea6"
  status-info-soft: "#e3ecf8"
  status-violet: "#5b3ea8"
  status-violet-soft: "#ece7f8"
typography:
  title:
    fontFamily: "Overpass, Segoe UI, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 750
    letterSpacing: "-0.005em"
  body:
    fontFamily: "Overpass, Segoe UI, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.4
    fontFeature: "tnum"
  station-label:
    fontFamily: "Overpass, Segoe UI, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 550
  station-label-current:
    fontFamily: "Overpass, Segoe UI, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 750
  line-code:
    fontFamily: "Overpass, Segoe UI, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 800
    letterSpacing: "0.02em"
rounded:
  control: "5px"
  panel: "8px"
  menu: "10px"
  badge: "11px"
spacing:
  station-gap: "20px"
  header-x: "14px"
  header-y: "8px"
components:
  header:
    backgroundColor: "{colors.station-navy}"
    textColor: "{colors.panel-white}"
    height: "50px"
  line-badge-delivery:
    backgroundColor: "{colors.line-delivery-blue}"
    textColor: "{colors.panel-white}"
    typography: "{typography.line-code}"
    rounded: "{rounded.badge}"
  line-badge-fulfillment:
    backgroundColor: "{colors.line-fulfillment-yellow}"
    textColor: "{colors.ink}"
    typography: "{typography.line-code}"
    rounded: "{rounded.badge}"
  station-strip:
    backgroundColor: "{colors.panel-white}"
    textColor: "{colors.ink-secondary}"
    typography: "{typography.station-label}"
  button-primary-delivery:
    backgroundColor: "{colors.line-delivery-blue}"
    textColor: "{colors.panel-white}"
    rounded: "{rounded.panel}"
  button-primary-fulfillment:
    backgroundColor: "{colors.line-fulfillment-yellow}"
    textColor: "{colors.ink}"
    rounded: "{rounded.panel}"
---

# Design System: Supply Chain App

## Overview

**Creative North Star: "The Rail Network"**

Home Cartel's order journey runs like Manila's rail lines: Procurement, the two supplier portals, Fulfillment and Delivery are each a line with its own flat colour, and every page is a station on it. Where you are is a station on a line, not a highlighted word. The world lends only type, palette, density and that one signature move; layouts, tables and controls stay the ones staff already know from the Zoho app.

It is built as a theme layer: the 42 original Zoho widgets are served unchanged and `server/public/theme/theme.css` is injected into each, tagged with the widget's style system (`data-hc-kit`) and its section's line (`data-hc-line`). Density is at least Zoho's; nothing may become slower to scan.

**Key Characteristics:**
- Station-sign navy header over platform-concrete ground and white panels.
- One flat line colour per section, used for the line itself, the current station and the primary action.
- Overpass, a wayfinding face, with tabular figures in every table.
- One-pixel hairlines, no gradients, no decorative shadows.
- Status colours mean the same thing on every line.

## Colors

Cool concrete neutrals, navy signage, and one flat line colour per section.

### Primary (one per line)
- **Procurement Violet** (#6a3a9e): Procurement's line, primary actions and focus in Procurement pages.
- **Tony Fan Plum** (#96367f) and **Fenteng Indigo** (#4744a6): the two supplier branches of the Procurement line.
- **Fulfillment Yellow** (#f2b705): Fulfillment's line and solid fills, always with ink text (#1b2330) on it; **Fulfillment Ochre** (#7a5a00) is its colour for text on white.
- **Delivery Blue** (#1f5fad): Delivery Management's line, primary actions and focus.
- **Analytic** is the interchange: ink rail, white badge ringed in ink.

### Neutral
- **Station Navy** (#1b2330): header; also body ink.
- **Platform Concrete** (#eceff3): page ground.
- **Panel White** (#ffffff), **Panel Mist** (#f5f7f9), **Panel Shade** (#e4e8ee): panels, table headers, pressed fills.
- **Hairline** (#d5dbe3) and **Hairline Strong** (#b7c0cc): every border and divider.
- **Ink Secondary** (#4a5566) and **Ink Tertiary** (#5f6a7c): labels and supporting text, both ≥4.5:1 on white.

### Status
- **OK** (#17693f / #e2f2e8), **Warn** (#a8480b / #fcebdc), **Bad** (#b3261e / #fbe4e2), **Info** (#245ea6 / #e3ecf8), **Violet** (#5b3ea8 / #ece7f8): text / soft fill for pills and counters.

### Named Rules
**The Active Path Rule.** A line's colour appears only on its rail, the current station, the primary action, focus and selection. Never as decoration.
**The Same Signal Rule.** Status colours are global; a line colour never stands in for a status.

## Typography

**Body and display font:** Overpass (self-hosted variable woff2, 300–800), falling back to Segoe UI and system-ui.

**Character:** a highway-and-transit wayfinding face: open, slightly wide, unmistakable at small sizes and from a distance.

### Hierarchy
- **Title** (750, 15px): the app name in the header.
- **Body** (400, 14px, 1.4): everything else; widgets keep their own size scale, only the face changes.
- **Station label** (550, 13px; current station 750): tab names on the line.
- **Line code** (800, 12px, +0.02em): badge codes P, TF, FL, F, D, A.

### Named Rules
**The Columns Never Move Rule.** Tabular figures everywhere, so quantities, prices, dates and record numbers line up.
**The Sentence Case Rule.** Table headers and labels are in sentence case; tracked all-caps labels are removed.

## Layout

A navy header row (app name, line switcher, then Local / Design / user on the right), then the station strip, then the page at full width with no outer frame. The station strip scrolls sideways when a line has more stations than fit, fading the clipped edge; the current station is kept in view. Below 760px the header wraps and secondary labels hide.

## Elevation & Depth

Flat. Panels sit on the concrete ground with one quiet shadow (`0 1px 2px rgba(27,35,48,.06), 0 3px 10px rgba(27,35,48,.05)`); menus and dialogs get the lifted one (`0 16px 40px rgba(27,35,48,.18)`). Depth never carries meaning.

## Shapes

Small, consistent corners: controls 5px, panels and buttons 8px, menus 10px, line badges fully rounded. Rules are one pixel; the only thick stroke is the 4px rail.

## Components

### Navigation: the station strip (signature)
- **Rail:** 4px in the line colour, running from the first station to the last; a one-station line runs edge to edge.
- **Stations:** 12px white circles with a 3px line-colour ring; the current station is 18px, filled with the line colour, inside a white then line-colour ring, and its label turns ink and bold.
- **Hover:** the station grows 15% (180ms, ease-out); reduced motion turns it off.

### Line switcher
- Navy-raised button with the line badge and section name; menu lists every line with its badge and page count.

### Buttons
- **Primary:** line colour fill with the line's on-colour text (white, or ink on yellow), 8px radius.
- **Secondary:** white with hairline border.
- **Focus:** 2px outline in the line's text colour, 2px offset.

### Design toggle
- Segmented New / Zoho control in the header; Zoho serves every page without the theme layer for side-by-side checks.

## Do's and Don'ts

### Do:
- **Do** give every new section a line: a flat colour, a short code, and text and on-fill variants that pass 4.5:1.
- **Do** put new pages on their section's line as stations, in menu order.
- **Do** restyle widgets only through `theme.css` tokens and adapters, never by editing widget files.

### Don't:
- **Don't** use a line colour for decoration, backgrounds of whole panels, or status.
- **Don't** add gradients, glows, or shadows that carry meaning.
- **Don't** make a page less dense than its Zoho original.
