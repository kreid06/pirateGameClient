import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
  root: 'public',
  server: {
    port: 3000,
    host: true,
    cors: {
      origin: ['http://192.168.8.1:3000', 'http://192.168.8.1:8080'],
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      credentials: true,
      allowedHeaders: ['Content-Type', 'Authorization']
    },
    proxy: {
      '/api': {
        target: 'http://192.168.8.3:3000',
        changeOrigin: true,
        secure: false,
        ws: false,
        configure: (proxy, _options) => {
          proxy.on('error', (err, _req, _res) => {
            console.log('proxy error', err);
          });
          proxy.on('proxyReq', (proxyReq, req, _res) => {
            console.log('Sending Request:', req.method, req.url);
            proxyReq.setHeader('Origin', 'http://192.168.8.3:3000');
          });
          proxy.on('proxyRes', (proxyRes, req, _res) => {
            console.log('Received Response:', proxyRes.statusCode, req.url);
          });
        }
      },
      '/game': {
        target: 'ws://192.168.8.3:8080',
        ws: true,
        changeOrigin: true
      }
    }
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './public'),
      'matter-js': 'matter-js/build/matter.js', // Updated path
      '@network': path.resolve(__dirname, './public/js/network'),
      '@physics': path.resolve(__dirname, './public/js/physics')
    }
  },
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    sourcemap: true,
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'public/index.html')
      },
      output: {
        manualChunks: {
          'matter-js': ['matter-js'],
          'network': [
            '@network/WebSocketFrame',
            '@network/NetworkManager',
            '@network/protocol/MessageTypes'
          ],
          'physics': ['@physics/PhysicsManager']
        }
      }
    }
  },
  optimizeDeps: {
    include: ['matter-js']
  }
});
