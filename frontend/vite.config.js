import { copyFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// GitHub Pages sirve un proyecto bajo /<nombre-del-repo>/, no en la raíz. El flujo
// de despliegue pasa VITE_BASE con ese prefijo; en local queda '/' y no molesta.
const base = process.env.VITE_BASE || '/'

// GitHub Pages no sabe reescribir rutas a index.html: si alguien entra directo a
// /admin/dashboard o recarga la página, busca ese archivo y no lo encuentra. Al
// servir 404.html para lo que no existe, basta con que 404.html SEA la aplicación
// para que el router resuelva la ruta. La URL se mantiene intacta.
const spaFallback = () => ({
  name: 'copiar-index-a-404',
  closeBundle() {
    const dist = resolve(__dirname, 'dist')
    copyFileSync(resolve(dist, 'index.html'), resolve(dist, '404.html'))
  },
})

// https://vite.dev/config/
export default defineConfig({
  base,
  plugins: [react(), spaFallback()],
  server: {
    // El servidor de desarrollo rechaza los hosts que no conoce (protección
    // contra DNS rebinding). Al exponerlo por un túnel de Cloudflare llega con un
    // dominio *.trycloudflare.com que cambia en cada reinicio, así que se permite
    // el subdominio entero en vez de una URL concreta.
    // Sólo afecta a `npm run dev`: el build estático no usa esta sección.
    allowedHosts: ['.trycloudflare.com'],
  },
})
