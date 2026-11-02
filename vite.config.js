import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    proxy: {
      // Use IPv4 explicitly so the Vite proxy reaches the Express process
      // consistently on machines where localhost resolves to IPv6 first.
      '/api': 'http://127.0.0.1:3001',
    },
  },
})
