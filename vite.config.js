import { defineConfig } from 'vite';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Dev-only endpoint that lets the running game write a screenshot to disk.
 * Used by the visual-review and QA passes; it is never part of a build.
 */
function screenshotPlugin() {
  return {
    name: 'dino-screenshot',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__shot', (req, res) => {
        if (req.method !== 'POST') { res.statusCode = 405; res.end('POST only'); return; }
        const chunks = [];
        req.on('data', (c) => chunks.push(c));
        req.on('end', () => {
          try {
            const { name, data } = JSON.parse(Buffer.concat(chunks).toString('utf8'));
            const dir = path.resolve(process.cwd(), 'shots');
            fs.mkdirSync(dir, { recursive: true });
            const safe = String(name || 'shot').replace(/[^a-z0-9_.-]/gi, '_');
            const file = path.join(dir, `${safe}.png`);
            fs.writeFileSync(file, Buffer.from(String(data).split(',')[1], 'base64'));
            res.setHeader('content-type', 'application/json');
            res.end(JSON.stringify({ ok: true, file: `shots/${safe}.png` }));
          } catch (err) {
            res.statusCode = 500;
            res.end(String(err));
          }
        });
      });
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [screenshotPlugin()],
  server: { port: 5173, open: false },
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: {
        manualChunks: { three: ['three'] },
      },
    },
  },
});
