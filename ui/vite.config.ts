import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  base: '/_ui',
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/_api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return
          if (id.includes('monaco-editor') || id.includes('@monaco-editor')) return 'vendor-monaco'
          if (id.includes('@xyflow')) return 'vendor-flow'
          if (id.includes('react-router-dom') || id.includes('@tanstack/react-query')) return 'vendor-routing'
          if (id.includes('lucide-react')) return 'vendor-icons'
          if (id.includes('react-dom') || id.includes('react')) return 'vendor-react'
        },
      },
    },
  },
})
