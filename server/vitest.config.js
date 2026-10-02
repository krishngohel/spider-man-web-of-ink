import { defineConfig } from 'vitest/config';
import { cloudflareTest } from '@cloudflare/vitest-pool-workers';

// Server tests run inside the Workers runtime (Miniflare). Short rejoin and empty windows so the
// timeouts can be tested without waiting minutes.
export default defineConfig({
  plugins: [cloudflareTest({ wrangler: { configPath: './wrangler.jsonc' }, miniflare: { bindings: { REJOIN_MS: '400', EMPTY_MS: '500' } } })],
  test: { include: ['test/**/*.test.js'] },
});
