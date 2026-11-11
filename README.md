# Supply Chain System v2

A React model of the Home Cartel supply chain: **Procurement → Fulfillment → Delivery**, with the
workflow rules enforced in one place.

```
npm install
npm run dev      # http://localhost:5173
npm test         # rules, every page renders, the vault's links
npm run build
npm run vault    # regenerate the Obsidian vault from the source
```

- `src/domain/`: the workflow engine (`actions.js`), the rules as data (`rules.js`), the sample data (`seed.js`)
- `src/pages/`, `src/ui/`: screens declared as data, rendered by one generic `Screen`
- `vault/`: an Obsidian vault, **generated** from the code. Open the `vault` folder in Obsidian, start at `Home`.

Data is kept in the browser's `localStorage`. There is no server, sign-in or Zoho connection.
