import { fileURLToPath } from 'node:url'
import { mergeConfig, defineConfig, configDefaults } from 'vitest/config'
import viteConfig from './vite.config.js'

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: 'jsdom',
      exclude: [...configDefaults.exclude, 'e2e/**'],
      setupFiles: ['./vitest.setup.ts'],
      root: fileURLToPath(new URL('./', import.meta.url)),
      coverage: {
        provider: 'v8',
        include: ['src/**/*.{ts,tsx,vue}'],
        exclude: [
          '**/node_modules/**',
          '**/dist/**',
          '**/__tests__/**',
          '**/*.test.ts',
          '**/*.spec.ts',
          '**/*.d.ts',
          '**/types/**',
          'src/config/**',
          'src/test-support/**',
          'src/views/**',
          'src/App.vue',
          'src/AppWrapper.vue',
          'src/i18n/**',
          'src/sw.ts',
          'src/main.ts',
        ],
        reportsDirectory: './coverage',
        reporter: ['text', 'html', 'json', 'lcov'],
        // Ratchet floor, measured over the logic (composables, stores, utils, router)
        // and the components; route-level views are left to the e2e suite.
        // Raise these thresholds as new tests are added.
        thresholds: {
          lines: 55,
          functions: 46,
          branches: 45,
          statements: 55,
        },
      },
    },
  }),
)
