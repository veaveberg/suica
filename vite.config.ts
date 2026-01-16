import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'
import basicSsl from '@vitejs/plugin-basic-ssl'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), basicSsl()],
  // Change 'suica' to your GitHub repo name for GH Pages
  base: process.env.NODE_ENV === 'production' ? '/suica/' : '/',
  server: {
    https: {},
    host: true, // Allow access from mobile devices on same network
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      }
    }
  },
})

