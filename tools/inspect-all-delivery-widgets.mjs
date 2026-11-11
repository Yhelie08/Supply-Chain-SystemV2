import fs from 'node:fs';
import path from 'node:path';

const outRoot = 'tools/widgets/delivery';
const dirs = fs.readdirSync(outRoot, { withFileTypes: true });

for (const d of dirs) {
  if (d.isDirectory()) {
    const full = path.join(outRoot, d.name, 'app');
    if (!fs.existsSync(full)) continue;
    const htmlFile = fs.readdirSync(full).find(f => f.endsWith('.html'));
    if (!htmlFile) continue;

    const htmlPath = path.join(full, htmlFile);
    const content = fs.readFileSync(htmlPath, 'utf8');

    // Title
    const titleMatch = content.match(/<title>(.*?)<\/title>/i);
    const title = titleMatch ? titleMatch[1] : d.name;

    // Headers / headings
    const h1s = (content.match(/<h1\b[^>]*>(.*?)<\/h1>/gi) || []).map(h => h.replace(/<[^>]+>/g, '').trim());
    const h2s = (content.match(/<h2\b[^>]*>(.*?)<\/h2>/gi) || []).map(h => h.replace(/<[^>]+>/g, '').trim());

    // Tabs or navigation
    const tabs = (content.match(/class=["'][^"']*(?:tab|pill|btn-tab)[^"']*["'][^>]*>(.*?)<\/(?:button|a|div)>/gi) || [])
      .map(t => t.replace(/<[^>]+>/g, '').trim())
      .filter(t => t && t.length < 40 && !t.includes('\n'));

    // Buttons
    const buttons = (content.match(/<button\b[^>]*>(.*?)<\/button>/gi) || [])
      .map(b => b.replace(/<[^>]+>/g, '').trim())
      .filter(b => b && b.length < 40 && !b.includes('\n'));

    console.log(`\n========================================`);
    console.log(`MODULE: ${d.name} (${htmlFile}, ${content.length} bytes)`);
    console.log(`Title: ${title}`);
    console.log(`H1s:`, h1s);
    console.log(`H2s:`, h2s.slice(0, 5));
    console.log(`Sample Buttons:`, Array.from(new Set(buttons)).slice(0, 8));
  }
}

