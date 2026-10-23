/// <reference types="vitest/config" />
import path from 'node:path'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig, type Plugin } from 'vite'

/** وحدات supabase/functions/_shared تستورد zod بصيغة Deno (`npm:zod@4`)؛ في vitest نحلّها إلى حزمة zod المثبتة هنا. */
const denoNpmSpecifiers: Plugin = {
  name: 'highlink:deno-npm-specifiers',
  enforce: 'pre',
  resolveId(id) {
    // المستورِد خارج apps/web (لا يرى node_modules هنا) — نحلّ من موقع هذا الملف
    if (id === 'npm:zod@4') return this.resolve('zod', path.resolve(import.meta.dirname, 'package.json'), { skipSelf: true })
    return null
  },
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [denoNpmSpecifiers, react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
      '@shared': path.resolve(import.meta.dirname, '../../packages/shared'),
      '@content': path.resolve(import.meta.dirname, '../../content'),
    },
  },
  server: { port: 5173, fs: { allow: [path.resolve(import.meta.dirname, '../..')] } },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}', '../../packages/shared/**/*.test.ts', '../../supabase/functions/_shared/**/*.test.ts'],
  },
})
