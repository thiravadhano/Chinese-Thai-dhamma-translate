import { defineConfig } from 'astro/config';
import node from '@astrojs/node';

// LOCAL: output = 'server' + node adapter
// DEPLOY (Cloudflare Pages): change to output='static' or use @astrojs/cloudflare
// Switch via: DEPLOY_TARGET=cloudflare astro build

const isCloudflare = process.env.DEPLOY_TARGET === 'cloudflare';

export default defineConfig({
  output: 'server',
  adapter: node({ mode: 'standalone' }),
  server: {
    port: 4321,
  },
});
