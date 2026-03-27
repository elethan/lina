import { defineConfig } from 'vite'
import { devtools } from '@tanstack/devtools-vite'
import tsconfigPaths from 'vite-tsconfig-paths'

import { tanstackStart } from '@tanstack/react-start/plugin/vite'

import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const config = defineConfig(({ command }) => ({
  plugins: [
    ...(command === 'serve' ? [devtools()] : []),
    tsconfigPaths({ projects: ['./tsconfig.json'] }),
    tailwindcss(),
    tanstackStart(),
    viteReact(),
  ],
  // added this to try to test site in DigitakOcean, adjust or remove when internal
  preview: {
    //allowedHosts: ['46.101.53.201.sslip.io'], // explicitly allows your magic domain
 allowedHosts: true, // Disables Vite's internal host check completely
  },
  server: {
  //  allowedHosts: ['46.101.53.201.sslip.io'], // good practice to add here too
  allowedHosts: true, // Disables Vite's internal host check completely
  },
  build: {
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return

          if (
            id.includes('@tanstack/react-router-devtools') ||
            id.includes('@tanstack/react-query-devtools') ||
            id.includes('@tanstack/react-devtools')
          ) {
            return 'devtools'
          }

          if (
            id.includes('@tanstack/react-table') ||
            id.includes('@tanstack/match-sorter-utils')
          ) {
            return 'table'
          }

          if (id.includes('lucide-react')) {
            return 'icons'
          }

          if (id.includes('@radix-ui') || id.includes('radix-ui')) {
            return 'ui-radix'
          }

          return 'vendor'
        },
      },
    },
  },
}))

export default config
