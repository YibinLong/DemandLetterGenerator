import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig(({ mode }) => {
  // Load env file from root directory
  const env = loadEnv(mode, path.resolve(__dirname, '..'), '')

  return {
    plugins: [react()],
    envDir: '..',
    server: {
      port: 5173,
      proxy: {
        '/api': {
          target: env.VITE_API_URL || 'http://localhost:3001',
          changeOrigin: true,
        },
      },
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    // Build optimizations
    build: {
      // Target modern browsers for smaller bundle size
      target: 'es2020',
      // Enable minification
      minify: 'esbuild',
      // Configure chunk splitting for better caching
      rollupOptions: {
        output: {
          manualChunks: {
            // Vendor chunks - separate large dependencies for better caching
            'vendor-react': ['react', 'react-dom', 'react-router-dom'],
            'vendor-query': ['@tanstack/react-query'],
            'vendor-editor': ['@tiptap/react', '@tiptap/starter-kit', '@tiptap/extension-collaboration', '@tiptap/extension-collaboration-cursor', 'yjs'],
            'vendor-socket': ['socket.io-client'],
            'vendor-utils': ['axios'],
          },
          // Use content hash for cache busting
          chunkFileNames: 'assets/[name]-[hash].js',
          entryFileNames: 'assets/[name]-[hash].js',
          assetFileNames: 'assets/[name]-[hash].[ext]',
        },
      },
      // Generate source maps for production debugging
      sourcemap: mode === 'development',
      // Report compressed size
      reportCompressedSize: true,
      // Chunk size warning limit (500KB)
      chunkSizeWarningLimit: 500,
    },
    // Optimize dependencies
    optimizeDeps: {
      include: [
        'react',
        'react-dom',
        'react-router-dom',
        '@tanstack/react-query',
        'axios',
      ],
      // Force esbuild to use JSX transform
      esbuildOptions: {
        jsx: 'automatic',
      },
    },
    // CSS optimization
    css: {
      devSourcemap: true,
    },
    // Preview server (for testing builds)
    preview: {
      port: 4173,
    },
    test: {
      globals: true,
      environment: 'jsdom',
      setupFiles: ['./src/test/setup.ts'],
      include: ['src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    },
  }
})
