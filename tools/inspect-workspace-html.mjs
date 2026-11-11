import fs from 'node:fs';

const html = fs.readFileSync('tools/widgets/procurement/03-pr-decision-workspace.html', 'utf8');
const idx = html.indexOf('id="view-detail"');
if (idx !== -1) {
  console.log(html.slice(idx - 50, idx + 1200));
} else {
  // Let's find any element with detail or workspace
  console.log('Searching for workspace / detail IDs:');
  const ids = html.match(/id="[^"]+"/g) || [];
  console.log(ids.filter(id => id.includes('detail') || id.includes('Workspace') || id.includes('view') || id.includes('Top')));
}

