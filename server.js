const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 5000;
const STATIC_DIR = __dirname;
const QUESTIONS_FILE = path.join(__dirname, 'data', 'all-questions.json');

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json',
  '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png',
};

const server = http.createServer((req, res) => {
  // CORS headers for local dev
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  // API: save questions to disk
  if (req.method === 'POST' && req.url === '/api/save-bank') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const questions = JSON.parse(body);
        if (!Array.isArray(questions)) throw new Error('Not an array');
        // Re-number IDs
        questions.forEach((q, i) => { q.id = i + 1; });
        fs.writeFileSync(QUESTIONS_FILE, JSON.stringify(questions, null, 2));
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, count: questions.length }));
        console.log('[SAVED] ' + questions.length + ' questions -> data/all-questions.json');
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: err.message }));
        console.error('[ERROR]', err.message);
      }
    });
    return;
  }

  // Static file serving
  let filePath = req.url.split('?')[0];
  if (filePath === '/') filePath = '/index.html';
  const fullPath = path.join(STATIC_DIR, filePath);

  // Security: don't serve outside project dir
  if (!fullPath.startsWith(STATIC_DIR)) {
    res.writeHead(403); res.end('Forbidden'); return;
  }

  fs.readFile(fullPath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found: ' + filePath);
      return;
    }
    const ext = path.extname(fullPath);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log('');
  console.log('  CEH Flashcards Server');
  console.log('  ---------------------');
  console.log('  App:    http://localhost:' + PORT);
  console.log('  Import: http://localhost:' + PORT + '/import.html');
  console.log('  Bank:   http://localhost:' + PORT + '/export-bank.html');
  console.log('');
  console.log('  Saves directly to: data/all-questions.json');
  console.log('  Then just: git add -A && git commit -m "update bank" && git push');
  console.log('');
});