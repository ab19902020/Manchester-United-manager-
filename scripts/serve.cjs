const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const port = Number(process.env.PORT || 4173);
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
};

http.createServer((request, response) => {
  const rawPath = decodeURIComponent((request.url || '/').split('?')[0]);
  const requested = rawPath === '/' ? '/index.html' : rawPath;
  const filename = path.resolve(root, `.${requested}`);
  if (!filename.startsWith(`${root}${path.sep}`)) {
    response.writeHead(403).end('Forbidden');
    return;
  }
  fs.readFile(filename, (error, content) => {
    if (error) {
      response.writeHead(error.code === 'ENOENT' ? 404 : 500).end('Not found');
      return;
    }
    response.writeHead(200, {
      'Content-Type': types[path.extname(filename)] || 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    response.end(content);
  });
}).listen(port, '0.0.0.0', () => {
  process.stdout.write(`The Results Business: http://localhost:${port}\n`);
});
