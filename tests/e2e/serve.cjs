const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.ND_E2E_PORT) || 8099; // ND_E2E_PORT — параллельные рабочие копии (worktree) не делят порт
const ROOT = path.join(__dirname, '..', '..');

const server = http.createServer((req, res) => {
  const file = req.url === '/' ? 'index.html' : req.url.split('?')[0].slice(1);
  const p = path.resolve(ROOT, file);
  if (!p.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
  try {
    const c = fs.readFileSync(p);
    const ext = path.extname(file);
    const types = {
      '.html': 'text/html', '.js': 'application/javascript',
      '.css': 'text/css', '.jpg': 'image/jpeg', '.png': 'image/png',
      '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
    };
    res.writeHead(200, { 'Content-Type': types[ext] || 'application/octet-stream', 'Access-Control-Allow-Origin': '*' });
    res.end(c);
  } catch {
    res.writeHead(404); res.end('Not found');
  }
});

server.listen(PORT, () => console.log(`E2E server :${PORT}`));
