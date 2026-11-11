import { spawn } from 'node:child_process';
import http from 'node:http';

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const userDataDir = process.env.TEMP + '\\chrome-debug';
const targetUrl = 'https://creatorapp.zoho.com/homecartel/supply-chain-app#Page:Dashboard';

console.log('Starting Chrome daemon with remote debugging on port 9222...');
const chrome = spawn(chromePath, [
  '--remote-debugging-port=9222',
  '--remote-allow-origins=*',
  `--user-data-dir=${userDataDir}`,
  targetUrl,
], {
  stdio: 'inherit',
});

chrome.on('exit', (code, signal) => {
  console.log(`Chrome exited with code ${code}, signal ${signal}`);
  process.exit(code || 0);
});

// Keep node alive
setInterval(() => {}, 10000);
