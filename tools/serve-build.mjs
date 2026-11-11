import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** Serve the production build under the same subpath used by GitHub Pages. */
export async function serveBuild({ base = '/Dino3D/', transformHtml } = {}) {
  const root = fileURLToPath(new URL('../dist/', import.meta.url));
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      const pathname = decodeURIComponent(url.pathname);
      if (!pathname.startsWith(base)) { res.writeHead(404).end(); return; }
      const relative = pathname.slice(base.length) || 'index.html';
      const file = path.resolve(root, relative);
      if (!file.startsWith(root)) { res.writeHead(403).end(); return; }
      let data = await readFile(file);
      if (transformHtml && path.extname(file) === '.html') data = Buffer.from(transformHtml(data.toString()));
      res.setHeader('content-type', types[path.extname(file)] || 'application/octet-stream');
      res.setHeader('cache-control', 'no-store');
      res.end(data);
    } catch { res.writeHead(404).end(); }
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  return {
    url: `http://127.0.0.1:${server.address().port}${base}`,
    close: () => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())),
  };
}
