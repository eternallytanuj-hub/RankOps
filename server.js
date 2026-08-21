const http = require('http');
const fs = require('fs');
const path = require('path');
const { GitHubClient, GitHubApiError } = require('./lib/github-client');
const { GitHubParserError } = require('./lib/github-parser');
const { MapFilterFetchPipeline, MapFilterFetchError } = require('./lib/map-filter-fetch');
const { AIAnalyzer, AIAnalysisError } = require('./lib/ai-analyzer');
const { GroqClient, GroqApiError } = require('./lib/groq-client');
const { AISurgeon, AISurgeonError } = require('./lib/ai-surgeon');
const { GitHubPRCreator, GitHubPRError } = require('./lib/github-pr-creator');
const { statsAggregator } = require('./lib/stats-aggregator');
const { ReportGenerator } = require('./lib/report-generator');

// Load environment variables from .env if present
try {
  const envPath = path.join(__dirname, '.env');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    envContent.split('\n').forEach(line => {
      const match = line.match(/^\s*([\w_]+)\s*=\s*(.*)?\s*$/);
      if (match && !process.env[match[1]]) {
        process.env[match[1]] = match[2].trim();
      }
    });
  }
} catch (e) {}

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
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Groq-Api-Key');

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
        if (body.length > 300 * 1024 && !exceeded) {
          exceeded = true;
          res.writeHead(413, { 'Content-Type': 'application/problem+json' });
          res.end(JSON.stringify({
            type: 'https://rankops.dev/errors/payload-too-large',
            title: 'Payload Too Large',
            status: 413,
            detail: 'Request body exceeds maximum size of 300KB.'
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

  // API Route: GET /api/stats/overview (Live Global Stats)
  if (urlPath === '/api/stats/overview') {
    if (req.method !== 'GET') {
      res.writeHead(405, { 'Content-Type': 'application/problem+json' });
      res.end(JSON.stringify({
        type: 'https://rankops.dev/errors/method-not-allowed',
        title: 'Method Not Allowed',
        status: 405,
        detail: `HTTP method ${req.method} is not supported. Use GET.`
      }));
      return;
    }

    const data = statsAggregator.getOverview();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
    return;
  }

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
      res.end(JSON.stringify({ success: true, data }));
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
      res.end(JSON.stringify({ success: true, data: result }));
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

  // API Route: POST /api/audit/analyze (Phase 3)
  if (urlPath === '/api/audit/analyze') {
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
      const { repoInfo, artifacts } = parsedBody;

      if (!repoInfo || !Array.isArray(artifacts)) {
        res.writeHead(400, { 'Content-Type': 'application/problem+json' });
        res.end(JSON.stringify({
          type: 'https://rankops.dev/errors/invalid-request-body',
          title: 'Bad Request',
          status: 400,
          detail: 'Missing required parameters (repoInfo, artifacts) in JSON request body.'
        }));
        return;
      }

      const customKey = req.headers['x-groq-api-key'] || null;
      const analyzer = new AIAnalyzer({ apiKey: customKey });

      const result = await analyzer.analyze(repoInfo, artifacts);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, data: result }));
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

      if (err instanceof GroqApiError || err instanceof AIAnalysisError) {
        res.writeHead(err.statusCode || 500, { 'Content-Type': 'application/problem+json' });
        res.end(JSON.stringify({
          type: `https://rankops.dev/errors/${(err.code || 'error').toLowerCase().replace(/_/g, '-')}`,
          title: err.title || 'Analysis Error',
          status: err.statusCode || 500,
          code: err.code,
          detail: err.message,
          details: err.details
        }));
        return;
      }

      console.error('[Server Error - analyze]:', err);
      res.writeHead(500, { 'Content-Type': 'application/problem+json' });
      res.end(JSON.stringify({
        type: 'https://rankops.dev/errors/internal-server-error',
        title: 'Internal Server Error',
        status: 500,
        detail: 'An unexpected error occurred during AI analysis orchestration.'
      }));
    }
    return;
  }

  // API Route: POST /api/audit/generate-patches (Phase 4)
  if (urlPath === '/api/audit/generate-patches') {
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
      const { repoInfo, artifacts, analysis } = parsedBody;

      if (!repoInfo || !Array.isArray(artifacts)) {
        res.writeHead(400, { 'Content-Type': 'application/problem+json' });
        res.end(JSON.stringify({
          type: 'https://rankops.dev/errors/invalid-request-body',
          title: 'Bad Request',
          status: 400,
          detail: 'Missing required parameters (repoInfo, artifacts) in JSON request body.'
        }));
        return;
      }

      const surgeon = new AISurgeon();
      const result = await surgeon.generatePatches(repoInfo, artifacts, analysis || {});

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, data: result }));
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

      if (err instanceof AISurgeonError) {
        res.writeHead(err.statusCode || 500, { 'Content-Type': 'application/problem+json' });
        res.end(JSON.stringify({
          type: `https://rankops.dev/errors/${(err.code || 'error').toLowerCase().replace(/_/g, '-')}`,
          title: err.title || 'AI Surgeon Error',
          status: err.statusCode || 500,
          code: err.code,
          detail: err.message,
          details: err.details
        }));
        return;
      }

      console.error('[Server Error - generate-patches]:', err);
      res.writeHead(500, { 'Content-Type': 'application/problem+json' });
      res.end(JSON.stringify({
        type: 'https://rankops.dev/errors/internal-server-error',
        title: 'Internal Server Error',
        status: 500,
        detail: 'An unexpected error occurred during AI Surgeon patch generation.'
      }));
    }
    return;
  }

  // API Route: POST /api/audit/create-pr (Phase 5: Real GitHub Pull Request)
  if (urlPath === '/api/audit/create-pr') {
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
      const { owner, repo, baseBranch, patches, analysis } = parsedBody;

      if (!owner || !repo || !Array.isArray(patches)) {
        res.writeHead(400, { 'Content-Type': 'application/problem+json' });
        res.end(JSON.stringify({
          type: 'https://rankops.dev/errors/invalid-request-body',
          title: 'Bad Request',
          status: 400,
          detail: 'Missing required parameters (owner, repo, patches) in JSON request body.'
        }));
        return;
      }

      const authHeader = req.headers['authorization'] || req.headers['x-github-token'];
      const userToken = parsedBody.customToken || (authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : authHeader) || null;
      const creator = new GitHubPRCreator({ token: userToken });

      const result = await creator.createPullRequest({
        owner,
        repo,
        baseBranch: baseBranch || 'main',
        patches,
        analysis: analysis || {},
        customToken: userToken
      });

      // Record in live stats
      statsAggregator.recordAudit({
        repo: `${owner}/${repo}`,
        defaultBranch: baseBranch || 'main',
        filesScanned: patches.length,
        scoreBefore: analysis?.baselineScore || 50,
        scoreAfter: analysis?.projectedScore || 92,
        scoreDelta: analysis?.scoreDelta || '+42 pts'
      });

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, data: result }));
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

      if (err instanceof GitHubPRError) {
        res.writeHead(err.statusCode || 500, { 'Content-Type': 'application/problem+json' });
        res.end(JSON.stringify({
          type: `https://rankops.dev/errors/${(err.code || 'error').toLowerCase().replace(/_/g, '-')}`,
          title: err.title || 'Pull Request Error',
          status: err.statusCode || 500,
          code: err.code,
          detail: err.message,
          details: err.details
        }));
        return;
      }

      console.error('[Server Error - create-pr]:', err);
      res.writeHead(500, { 'Content-Type': 'application/problem+json' });
      res.end(JSON.stringify({
        type: 'https://rankops.dev/errors/internal-server-error',
        title: 'Internal Server Error',
        status: 500,
        detail: 'An unexpected error occurred while creating the Pull Request.'
      }));
    }
    return;
  }

  // API Route: POST /api/audit/report (Executive Compliance & ROI Brief Generator)
  if (urlPath === '/api/audit/report') {
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
      const { repoInfo, analysis, patches, format = 'markdown' } = parsedBody;

      if (format === 'html' || format === 'pdf') {
        const html = ReportGenerator.generateExecutiveHtmlReport(repoInfo || {}, analysis || {}, patches || []);
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(html);
        return;
      }

      const markdown = ReportGenerator.generateExecutiveMarkdownReport(repoInfo || {}, analysis || {}, patches || []);
      const pillars = ReportGenerator.calculateFourPillars(analysis || {}, patches || []);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        data: {
          repoInfo: repoInfo || {},
          format: 'markdown',
          markdown,
          pillars,
          fileName: `${repoInfo?.repo || 'repository'}-RankOps-Executive-Report.md`
        }
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

      console.error('[Server Error - report]:', err);
      res.writeHead(500, { 'Content-Type': 'application/problem+json' });
      res.end(JSON.stringify({
        type: 'https://rankops.dev/errors/internal-server-error',
        title: 'Internal Server Error',
        status: 500,
        detail: 'An unexpected error occurred during executive report generation.'
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
