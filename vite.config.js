import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: { host: true, port: 5173 },
  // The interaction tests drive the real components in a simulated browser. The rules and render tests
  // under tests/ use node's own runner (npm test), so vitest only looks in ui-tests/.
  test: {
    environment: 'jsdom',
    include: ['ui-tests/**/*.test.jsx'],
    setupFiles: ['ui-tests/setup.js'],
    testTimeout: 20000,
  },
});
