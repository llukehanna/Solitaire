import { defineConfig, minimal2023Preset } from '@vite-pwa/assets-generator/config';

// The apple-touch and maskable icons this preset writes are replaced by scripts/icons.ts with full-bleed versions.
export default defineConfig({
  headLinkOptions: { preset: '2023' },
  preset: minimal2023Preset,
  images: ['public/icon.svg'],
});
