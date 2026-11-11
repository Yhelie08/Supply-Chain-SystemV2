import fs from 'node:fs';
const b = JSON.parse(fs.readFileSync('ui-tests/parity-baseline.json', 'utf8'));
for (const [k, v] of Object.entries(b)) {
  if (k.startsWith('delivery/')) {
    console.log(`${k}: (${v.length} items)`);
    v.forEach(item => console.log(`  - ${item}`));
  }
}

