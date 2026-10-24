import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
export default defineConfig({
    plugins: [react(), tailwindcss()],
    server: {
        port: 3000,
        strictPort: true,
        // The API persists runtime data under data/. Vite must not treat those
        // writes as source changes and trigger a browser full reload.
        watch: {
            ignored: ['**/data/**'],
        },
        proxy: {
            '/api': {
                target: process.env.VITE_API_PROXY_TARGET || 'http://localhost:3030',
                changeOrigin: true,
            },
        },
    },
    build: { outDir: 'dist' },
});
