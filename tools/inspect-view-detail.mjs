import fs from 'node:fs';

const html = fs.readFileSync('tools/widgets/procurement/03-pr-decision-workspace.html', 'utf8');
const start = html.indexOf('id="view-detail"');
// Let's find next id="view-
const nextView = html.indexOf('id="view-', start + 20);
console.log('Start:', start, 'Next view:', nextView);
const snippet = html.slice(start - 10, nextView !== -1 ? nextView : start + 10000);
fs.writeFileSync('tools/widgets/procurement/view-detail-extracted.html', snippet, 'utf8');
console.log('Saved snippet length:', snippet.length);
