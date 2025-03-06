import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteStaticCopy } from 'vite-plugin-static-copy';
// import basicSsl from '@vitejs/plugin-basic-ssl';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.join(__dirname, 'src'),
    },
  },
  plugins: [
    react(),
    // basicSsl({
    //   /** name of certification */
    //   name: 'test',
    //   /** custom trust domains */
    //   domains: ['*.custom.com'],
    //   /** custom certification directory */
    //   certDir: '/Users/.../.devServer/cert',
    // }),
    viteStaticCopy({
      targets: [
        {
          src: 'node_modules/@ricky0123/vad-web/dist/vad.worklet.bundle.min.js',
          dest: './',
        },
        {
          src: 'node_modules/@ricky0123/vad-web/dist/*.onnx',
          dest: './',
        },
        {
          src: 'node_modules/onnxruntime-web/dist/*.wasm',
          dest: './',
        },
        {
          src: 'node_modules/onnxruntime-web/dist/*.mjs',
          dest: './',
        },
      ],
    }),
  ],
  worker: {
    format: 'es',
  },
  server: {
    open: true,
    host: true,
    // https: true,
  },
});
