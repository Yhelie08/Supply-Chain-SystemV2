---
version: 1
slug: "server-public-index-html"
primary_target: "server/public/index.html"
related_targets: ["server/public/theme/theme.css"]
---

# Surface brief: app shell + theme layer (all 42 pages)

Scope: the app frame (`server/public/index.html`) and the theme layer injected into every widget (`server/public/theme/theme.css`). Mode: Operate. Build path: code-led. First page judged: Delivery Management → Initial Scheduling. Widget code is never edited (re-import safe, every Zoho function preserved).

Audience and task: Home Cartel staff at desktops all day, crews on phones, suppliers in their portals, management on dashboards; find the right page and scan dense order tables fast. Constraint from the owner: nothing may become slower to scan than the Zoho app.

Decided without a decision round: the owner asked to proceed without further questions (2026-11-11); assigned direction built as rolled.

## Direction contract

THESIS: The app is a rail network and every section is a line. The tab row is that line drawn with its stations, so where you are is a station on a line, not a highlighted word. Refuses the default: a grey top bar with a pill-highlighted active tab and one accent everywhere.

OWN-WORLD: Station-sign navy header, flat line colours as the only identity colour per section (Procurement violet, Tony Fan and Fenteng branches of it, Fulfillment green, Delivery blue, Analytic interchange black), cool platform-concrete ground, white panels, 1px hairlines only, no gradients or soft glows. Overpass, a wayfinding face, with tabular figures; line badges carry short codes.

STORY: Staff see which line they are on and which station, read the table, act, and hop to another station or line without losing their place.

FIRST VIEWPORT: Navy header: app name left, line switcher (line badge + name) beside it, local / design / user on the right. Under it the section's line: a 4px rule in the line colour across the full width with a station dot under each tab label, the current station a large ringed dot. Then the page at full width; its primary action, active filters and focus in the line colour.

FORM: Manila rail line map (LRT-1, LRT-2, MRT-3), position 3 of 7 on the ordered list; seed:eefd3d15bf881ca7. Raises: from the split-flap board, fixed table columns with tabular figures; from the orienteering map, the line colour is reserved for the active path and primary action, never decoration; from the centre-rail edition, every rule is a one-pixel hairline; from the factory catalog, every line carries a short code; from the zoo guide map, flat unmodulated fills only; from the vertical feed, the current station alone carries emphasis.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Unresolved
- Layout inside widgets stays as built (theme layer only).
- Hard-coded colours inside Procurement and supplier widgets keep their values.
