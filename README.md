# Supply Chain System v2

The Home Cartel supply chain app: **Procurement → Fulfillment → Delivery**. It runs the original Zoho
Creator widgets (`modules/`) on our own Node server (`server/`), behind a login, hosted on Railway. The
business data is moving from Zoho Creator to Postgres, module by module; Zoho Books and Inventory stay.

```
npm install
npm run dev:pg    # the whole app on a local Postgres, nothing to install: http://localhost:4000
npm test          # all tests (the Postgres ones run on PGlite, no server needed)
```

`npm run dev:pg` loads the newest backup from `data/zoho-backup` the first time. Make one with
`node tools/export-zoho-data.mjs` (read-only; needs Zoho credentials, see `.env.example`).
`npm start` runs the server with `BACKEND` as set: `pg` (Postgres, the target), `zoho` (the old app through its
API, the default for now) or `local` (SQLite, offline). Variables go in `.env` (copy `.env.example`).

Where to read more, in the Obsidian vault (`vault/`):
- `Deluge Scripts (Obsidian)/00 - Current System.md`: how it fits together, how to run and host it
- `Deluge Scripts (Obsidian)/00 - Port Status.md`: how much of the Zoho logic is ported
- `Deluge Scripts (Obsidian)/00 - Porting a Workflow.md`: how to port the next script
- `Plans/Plan - Full Migration Off Zoho Creator.md`: the plan and its phases
- `Plans/Plan - Module Folders and Team Split.md`: one folder per module (`server/modules/<module>/`), who owns what, working rules

## The earlier React prototype

`src/` is a React model of the same flow with the workflow rules in one place (`src/domain/`), data in the
browser's `localStorage`, no server, sign-in or Zoho connection. It is not the live app.

```
npm run dev:prototype   # http://localhost:5173
npm run build
npm run vault           # regenerate the prototype's notes in vault/
```

`npm run vault` **deletes and rewrites** `vault/Modules`, `Rules`, `Actions`, `Data Model` and `Guides`. Keep
hand-written notes in `vault/Deluge Scripts (Obsidian)/` or `vault/Plans/`, never in those five folders.
