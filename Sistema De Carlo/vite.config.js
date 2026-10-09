import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { viteSingleFile } from 'vite-plugin-singlefile'

// `npm run build`       → build normal para Vercel/Netlify (pasta dist/)
// `npm run build:demo`  → um único HTML com tudo embutido (demo para enviar/mostrar)
export default defineConfig(({ mode }) => ({
  base: './',
  plugins: [react(), ...(mode === 'demo' ? [viteSingleFile()] : [])],
  build: mode === 'demo' ? { outDir: 'dist-demo', assetsInlineLimit: 100000000 } : {},
}))
