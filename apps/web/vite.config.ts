/// <reference types="vitest/config" />
import path from 'node:path'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig, type Plugin } from 'vite'

/**
 * وحدات supabase/functions/_shared تستورد بصيغة Deno (`npm:zod@4`، `npm:@supabase/supabase-js@2`)؛
 * في vitest نحلّها إلى الحزم المثبتة هنا (بلا رقم الإصدار) — يكفي لتحميل الوحدات واختبارها.
 */
const denoNpmSpecifiers: Plugin = {
  name: 'highlink:deno-npm-specifiers',
  enforce: 'pre',
  resolveId(id) {
    if (!id.startsWith('npm:')) return null
    const spec = id.slice('npm:'.length)
    // "@scope/name@2/sub" أو "name@4" → اسم الحزمة بلا إصدار (+ المسار الفرعي إن وُجد)
    const m = spec.match(/^((?:@[^/]+\/)?[^@/]+)(?:@[^/]+)?(\/.*)?$/)
    if (!m) return null
    // المستورِد خارج apps/web (لا يرى node_modules هنا) — نحلّ من موقع هذا الملف
    return this.resolve(m[1] + (m[2] ?? ''), path.resolve(import.meta.dirname, 'package.json'), { skipSelf: true })
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
