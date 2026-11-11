import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const root = 'C:\\Users\\User\\Downloads\\Deluge script\\Delivery Management';
const outRoot = path.resolve('tools/widgets/delivery');

if (!fs.existsSync(outRoot)) fs.mkdirSync(outRoot, { recursive: true });

const entries = fs.readdirSync(root, { withFileTypes: true });

for (const e of entries) {
  if (e.isDirectory() && !e.name.startsWith('_')) {
    const widgetDir = path.join(root, e.name, 'Widget');
    if (fs.existsSync(widgetDir)) {
      const zips = fs.readdirSync(widgetDir).filter(f => f.endsWith('.zip'));
      for (const zip of zips) {
        const zipPath = path.join(widgetDir, zip);
        const targetDir = path.join(outRoot, e.name);
        if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });
        console.log(`Extracting ${zip} to ${targetDir}...`);
        try {
          // Use tar or powershell
          execSync(`powershell -NoProfile -Command "Expand-Archive -LiteralPath '${zipPath}' -DestinationPath '${targetDir}' -Force"`);
        } catch (err) {
          console.error(`Failed to extract ${zip}:`, err.message);
        }
      }
    }
  }
}

console.log('Extraction complete!');

