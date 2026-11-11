import fs from 'node:fs';

const html = fs.readFileSync('tools/widgets/procurement/03-pr-decision-workspace.html', 'utf8');
const start = html.indexOf('id="dSidebar"');
console.log('dSidebar start:', start);
const end = html.indexOf('</script>', start);
const sidebarSnippet = html.slice(start - 20, start + 6000);
fs.writeFileSync('tools/widgets/procurement/sidebar-extracted.html', sidebarSnippet, 'utf8');
console.log('Saved tools/widgets/procurement/sidebar-extracted.html');

