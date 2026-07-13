// Dev-only static file server for local preview. Not deployed (GitHub Pages
// serves the static files directly). Excluded from the public deploy snapshot.
const http = require('http'), fs = require('fs'), path = require('path');
// Serve the Eleventy build output (_site) — exactly what Cloudflare Pages serves
// once the build command flips to `npx @11ty/eleventy`. Run `npx @11ty/eleventy`
// (or `npx @11ty/eleventy --serve`) to refresh it.
const root = path.join(__dirname, '_site'), port = process.env.PORT || 8778;
const types = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.geojson': 'application/json', '.topojson': 'application/json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon',
  '.woff2': 'font/woff2', '.map': 'application/json',
};
http.createServer((req, res) => {
  let p = decodeURIComponent((req.url || '/').split('?')[0]);
  if (p.endsWith('/')) p += 'index.html';
  const fp = path.join(root, p);
  if (!fp.startsWith(root)) { res.writeHead(403); return res.end('forbidden'); }
  fs.readFile(fp, (e, d) => {
    if (e) { res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('not found: ' + p); }
    res.writeHead(200, { 'Content-Type': types[path.extname(fp)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(d);
  });
}).listen(port, () => console.log('mexico site → http://localhost:' + port));
