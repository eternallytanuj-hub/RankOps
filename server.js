const http = require('http');
const fs = require('fs');
const path = require('path');
const { GitHubClient, GitHubApiError } = require('./lib/github-client');
const { GitHubParserError } = require('./lib/github-parser');
const { MapFilterFetchPipeline, MapFilterFetchError } = require('./lib/map-filter-fetch');

const PORT = 3333;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon'
};

const server = http.createServer(async (req, res) => {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const urlPath = req.url.split('?')[0];

  // Helper for reading JSON bodies safely
  const readJsonBody = () => {
    return new Promise((resolve, reject) => {
      let body = '';
      let exceeded = false;

      req.on('error', (err) => {
        console.error('[HTTP Stream Error]:', err.message);
        reject(err);
      });

      req.on('data', chunk => {
        body += chunk.toString();
        // Body size guard (100KB limit)
        if (body.length > 100 * 1024 && !exceeded) {
          exceeded = true;
          res.writeHead(413, { 'Content-Type': 'application/problem+json' });
          res.end(JSON.stringify({
            type: 'https://rankops.dev/errors/payload-too-large',
            title: 'Payload Too Large',
            status: 413,
            detail: 'Request body exceeds maximum size of 100KB.'
          }));
          req.destroy();
        }
      });

      req.on('end', () => {
        if (exceeded) return;
        try {
          const parsed = body.trim() ? JSON.parse(body) : {};
          resolve(parsed);
        } catch (err) {
          reject(new SyntaxError('Malformed JSON payload.'));
        }
      });
    });
  };

  // API Route: POST /api/audit/parse-repo (Phase 1)
  if (urlPath === '/api/audit/parse-repo') {
    if (req.method !== 'POST') {
      res.writeHead(405, { 'Content-Type': 'application/problem+json' });
      res.end(JSON.stringify({
        type: 'https://rankops.dev/errors/method-not-allowed',
        title: 'Method Not Allowed',
        status: 405,
        detail: `HTTP method ${req.method} is not supported. Use POST.`
      }));
      return;
    }

    try {
      const parsedBody = await readJsonBody();
      const { url } = parsedBody;
      if (!url || typeof url !== 'string') {
        res.writeHead(400, { 'Content-Type': 'application/problem+json' });
        res.end(JSON.stringify({
          type: 'https://rankops.dev/errors/invalid-request-body',
          title: 'Bad Request',
          status: 400,
          detail: 'Missing required field "url" in JSON request body.'
        }));
        return;
      }

      const authHeader = req.headers['authorization'];
      const userToken = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
      const client = new GitHubClient({ token: userToken });

      const data = await client.resolveRepository(url);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        data
      }));
    } catch (err) {
      if (err instanceof SyntaxError) {
        res.writeHead(400, { 'Content-Type': 'application/problem+json' });
        res.end(JSON.stringify({
          type: 'https://rankops.dev/errors/invalid-json',
          title: 'Bad Request',
          status: 400,
          detail: err.message
        }));
        return;
      }

      if (err instanceof GitHubParserError) {
        res.writeHead(400, { 'Content-Type': 'application/problem+json' });
        res.end(JSON.stringify({
          type: 'https://rankops.dev/errors/invalid-github-url',
          title: 'Invalid GitHub URL',
          status: 400,
          code: err.code,
          detail: err.message
        }));
        return;
      }

      if (err instanceof GitHubApiError) {
        res.writeHead(err.statusCode, { 'Content-Type': 'application/problem+json' });
        res.end(JSON.stringify({
          type: `https://rankops.dev/errors/${err.code.toLowerCase().replace(/_/g, '-')}`,
          title: err.title || 'GitHub API Error',
          status: err.statusCode,
          code: err.code,
          detail: err.message,
          details: err.details
        }));
        return;
      }

      console.error('[Server Error - parse-repo]:', err);
      res.writeHead(500, { 'Content-Type': 'application/problem+json' });
      res.end(JSON.stringify({
        type: 'https://rankops.dev/errors/internal-server-error',
        title: 'Internal Server Error',
        status: 500,
        detail: 'An unexpected error occurred while resolving the repository.'
      }));
    }
    return;
  }

  // API Route: POST /api/audit/map-filter-fetch (Phase 2)
  if (urlPath === '/api/audit/map-filter-fetch') {
    if (req.method !== 'POST') {
      res.writeHead(405, { 'Content-Type': 'application/problem+json' });
      res.end(JSON.stringify({
        type: 'https://rankops.dev/errors/method-not-allowed',
        title: 'Method Not Allowed',
        status: 405,
        detail: `HTTP method ${req.method} is not supported. Use POST.`
      }));
      return;
    }

    try {
      const parsedBody = await readJsonBody();
      const { owner, repo, treeSha, enabledCategories } = parsedBody;

      if (!owner || !repo || !treeSha) {
        res.writeHead(400, { 'Content-Type': 'application/problem+json' });
        res.end(JSON.stringify({
          type: 'https://rankops.dev/errors/invalid-request-body',
          title: 'Bad Request',
          status: 400,
          detail: 'Missing required parameters (owner, repo, treeSha) in JSON request body.'
        }));
        return;
      }

      const authHeader = req.headers['authorization'];
      const userToken = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
      const client = new GitHubClient({ token: userToken });
      const pipeline = new MapFilterFetchPipeline({ client });

      const result = await pipeline.execute(owner, repo, treeSha, { enabledCategories });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        data: result
      }));
    } catch (err) {
      if (err instanceof SyntaxError) {
        res.writeHead(400, { 'Content-Type': 'application/problem+json' });
        res.end(JSON.stringify({
          type: 'https://rankops.dev/errors/invalid-json',
          title: 'Bad Request',
          status: 400,
          detail: err.message
        }));
        return;
      }

      if (err instanceof MapFilterFetchError || err instanceof GitHubApiError) {
        res.writeHead(err.statusCode || 500, { 'Content-Type': 'application/problem+json' });
        res.end(JSON.stringify({
          type: `https://rankops.dev/errors/${(err.code || 'error').toLowerCase().replace(/_/g, '-')}`,
          title: err.title || 'Pipeline Error',
          status: err.statusCode || 500,
          code: err.code,
          detail: err.message,
          details: err.details
        }));
        return;
      }

      console.error('[Server Error - map-filter-fetch]:', err);
      res.writeHead(500, { 'Content-Type': 'application/problem+json' });
      res.end(JSON.stringify({
        type: 'https://rankops.dev/errors/internal-server-error',
        title: 'Internal Server Error',
        status: 500,
        detail: 'An unexpected error occurred during the Map-Filter-Fetch pipeline.'
      }));
    }
    return;
  }

  // Static File Serving with Path Traversal Protection (CWE-22)
  const safeRoot = path.resolve(__dirname);
  const targetPath = path.resolve(path.join(safeRoot, urlPath === '/' ? 'index.html' : urlPath));

  if (!targetPath.startsWith(safeRoot)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('403 Forbidden: Directory traversal attempt detected');
    return;
  }

  const filePath = targetPath;
  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, content) => {
    if (err) {
      if (err.code === 'ENOENT') {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('404 Not Found');
      } else {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end(`500 Server Error: ${err.code}`);
      }
    } else {
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content, 'utf-8');
    }
  });
});

server.listen(PORT, () => {
  console.log(`RankOps server running at http://localhost:${PORT}/`);
});
