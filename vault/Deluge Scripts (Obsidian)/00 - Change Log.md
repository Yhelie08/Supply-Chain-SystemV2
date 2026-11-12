---
title: "Change Log"
tags:
  - changelog
  - status
---

# Change log

Newest first. Current picture: [[00 - Current System]]. Deluge porting: [[00 - Port Status]].

## 2026-11-12
- Updated these Obsidian notes: added [[00 - Current System]], [[00 - Design System]], [[00 - Port Status]] (generated) and this log; the two index notes now point to them.

## 2026-11-11

**Login and hosting**
- Added sign-in with user accounts (`server/auth.mjs`) and an admin *Manage users* page. Everything now needs a signed-in user.
- Removed the Local tag, the New/Zoho design toggle and the "Signed in as" box from the header; added an account menu (change password, manage users, sign out).
- Deployed to Railway (`supply-chain-app`, volume at `/data`). Found and fixed a deploy bug: an unanchored `.railwayignore` rule dropped every `index.html`, so the main page and most widgets were missing. Replaced `railway.json` with Railway variables (Railway ends support 2026-12-01).
- Fixed a bug where the file-download route could never be reached.

**Redesign**
- Installed `impeccable`, `ui-ux-pro-max`, `design-taste-frontend`, `huashu-design`; copied `frontend-design` into the repo.
- Wrote `PRODUCT.md`; built "The Rail Network" with Impeccable (rolled direction, two review rounds, detector clean); wrote `DESIGN.md`. See [[00 - Design System]].
- Earlier in the day: a first redesign (Archivo font, brass accent, colour-temperature band) was replaced by the rail network.

**Folders and notes**
- Moved widgets into `modules/<Section>/<Tab>/` to match the section dropdown, with a README per section; copied this Obsidian vault into the repo. Pushed to GitHub as `f320e2a`.
- Deleted 34 unused one-off scripts from `tools/` (tests still 171/171).

**Running outside Zoho**
- Parsed the Zoho `.ds` export (`tools/parse-ds.mjs`): 90 forms, 94 reports, 46 pages, 43 Deluge functions, 187 workflows → `zoho-export/parsed/`.
- Built the local server (`server/`): SQLite tables from the forms, a Zoho SDK stand-in, 3 custom APIs ported (confirm / decline schedule request, CMS push skipped).
- Imported the widget source for all 6 sections and 42 tabs from the widget zips and ran them locally; checked all 45 pages in a browser, no errors.

## Install the design skills on another computer
```
npx skills add pbakaus/impeccable
npx skills add https://github.com/nextlevelbuilder/ui-ux-pro-max-skill --skill ui-ux-pro-max
npx skills add https://github.com/Leonxlnx/taste-skill --skill design-taste-frontend
npx -y skills add alchaincyf/huashu-design --skill huashu-design --agent claude-code
```
