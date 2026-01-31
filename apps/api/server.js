const http = require('http');
const url = require('url');
const fs = require('fs');
const path = require('path');
const { scorePronunciation } = require('./src/lib/score');

const DATA_DIR = path.join(process.cwd(), 'data');
const WEB_ROOT = path.join(process.cwd(), 'apps', 'web');

function buildAllowedOrigins() {
  const extra = String(process.env.CORS_ORIGINS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return new Set(['http://localhost:3000', 'http://127.0.0.1:3000', ...extra]);
}

function sendJson(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify({ code: status, message: status === 200 ? 'ok' : 'error', data }));
}

function readJSONSafe(p) {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf-8'));
  } catch (e) {
    return null;
  }
}

function ensureDir(p) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

const server = http.createServer(async (req, res) => {
  const parsed = url.parse(req.url, true);
  const method = req.method || 'GET';
  const segments = (parsed.pathname || '/').split('/').filter(Boolean);

  // CORS for local testing (restrict, avoid wildcard)
  const allowed = buildAllowedOrigins();
  const origin = req.headers.origin;
  if (origin && allowed.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }

  // Static files from apps/web (Stage 1 Web prototype)
  if (method === 'GET' && (segments.length === 0 || segments[0] === 'web')) {
    const rel = segments.length === 0 ? 'index.html' : segments.slice(1).join('/');
    const normalized = path.posix.normalize('/' + rel).replace(/^\/+/, '');
    let filePath = path.join(WEB_ROOT, normalized);
    try {
      const root = path.resolve(WEB_ROOT) + path.sep;
      const resolved = path.resolve(filePath);
      if (!resolved.startsWith(root)) throw new Error('invalid path');
      const stat = fs.statSync(filePath);
      if (stat.isDirectory()) filePath = path.join(filePath, 'index.html');
      const ext = path.extname(filePath).toLowerCase();
      const type = ext === '.html' ? 'text/html; charset=utf-8'
        : ext === '.js' ? 'text/javascript; charset=utf-8'
        : ext === '.css' ? 'text/css; charset=utf-8'
        : ext === '.json' ? 'application/json; charset=utf-8'
        : 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': type });
      return fs.createReadStream(filePath).pipe(res);
    } catch (_) {
      // fallthrough to API routing
    }
  }

  // GET /lessons
  if (method === 'GET' && segments.length === 1 && segments[0] === 'lessons') {
    const indexPath = path.join(DATA_DIR, 'lessons', 'index.json');
    const index = readJSONSafe(indexPath) || [];
    return sendJson(res, 200, index);
  }

  // GET /lessons/:id
  if (method === 'GET' && segments.length === 2 && segments[0] === 'lessons') {
    const id = segments[1];
    if (!/^\d+$/.test(String(id || ''))) return sendJson(res, 400, { error: 'Invalid lesson id' });
    const metaPath = path.join(DATA_DIR, 'lessons', id, 'meta.json');
    const meta = readJSONSafe(metaPath);
    if (!meta) return sendJson(res, 404, { error: 'Lesson not found' });
    return sendJson(res, 200, meta);
  }

  // GET /lessons/:id/transcript
  if (method === 'GET' && segments.length === 3 && segments[0] === 'lessons' && segments[2] === 'transcript') {
    const id = segments[1];
    if (!/^\d+$/.test(String(id || ''))) return sendJson(res, 400, { error: 'Invalid lesson id' });
    const tranPath = path.join(DATA_DIR, 'lessons', id, 'transcript.json');
    const transcript = readJSONSafe(tranPath);
    if (!transcript) return sendJson(res, 404, { error: 'Transcript not found' });
    return sendJson(res, 200, transcript);
  }

  sendJson(res, 404, { error: 'Not Found' });
});

const PORT = process.env.PORT || 3001;
const HOST = process.env.HOST || '127.0.0.1';
server.listen(PORT, HOST, () => {
  // eslint-disable-next-line no-console
  console.log(`API listening on http://${HOST}:${PORT}`);
});
