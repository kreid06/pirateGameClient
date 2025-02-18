import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
  root: 'public',
  server: {
    port: 3000,
    host: true,
    cors: false,  // Let the proxy handle CORS
    proxy: {
      '/api': {
        target: 'http://192.168.8.3:3000',
        changeOrigin: true,
        secure: false,
        configure: (proxy, _options) => {
          proxy.on('proxyReq', (proxyReq, req, _res) => {
            console.log('[Proxy] Request:', req.method, req.url);
            // Don't set origin header, let proxy handle it
            proxyReq.removeHeader('origin');
            proxyReq.removeHeader('referer');
            
            if (req.method === 'POST') {
              proxyReq.setHeader('Content-Type', 'application/json');
            }
          });

          proxy.on('proxyRes', (proxyRes, req, res) => {
            // Set CORS headers on response
            res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
            res.setHeader('Access-Control-Allow-Methods', 'GET,HEAD,PUT,PATCH,POST,DELETE');
            res.setHeader('Access-Control-Allow-Credentials', 'true');
            res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Origin, Accept');
            
            if (req.method === 'OPTIONS') {
              res.statusCode = 200;
            }
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
  },
  envDir: './',
  envPrefix: ['VITE_']  // Update env prefix to match Vite's standard
});
