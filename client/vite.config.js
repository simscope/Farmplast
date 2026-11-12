import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // React is CommonJS in these packages. Explicit externalization also keeps
  // SSR correct when local dependencies live behind a Windows junction.
  ssr: { external: ['react', 'react/jsx-runtime', 'react/jsx-dev-runtime', 'react-dom', 'react-dom/server', 'lucide-react'] },
  resolve: { preserveSymlinks: true, dedupe: ['react', 'react-dom', 'lucide-react'] },
  server: {
    proxy: {
      '/zkt': {
        target: 'http://127.0.0.1:8787',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/zkt/, ''),
      },
    },
  },
})
