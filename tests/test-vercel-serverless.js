/**
 * RankOps — Automated Test Suite for Vercel Serverless Function Handlers
 * 
 * Simulates Vercel Serverless Function execution environment, CORS preflight,
 * HTTP methods, JSON responses, and RFC 7807 error formatting across all /api endpoints.
 */

const assert = require('assert');

// Mock Vercel Request & Response Helpers
function createMockReq(options = {}) {
  return {
    method: options.method || 'GET',
    headers: options.headers || {},
    body: options.body || null,
    query: options.query || {}
  };
}

function createMockRes() {
  const res = {
    statusCode: 200,
    headers: {},
    body: null,
    ended: false,
    setHeader(key, val) {
      this.headers[key.toLowerCase()] = val;
      return this;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      this.body = data;
      this.ended = true;
      return this;
    },
    send(data) {
      this.body = data;
      this.ended = true;
      return this;
    },
    end(data) {
      if (data) this.body = data;
      this.ended = true;
      return this;
    }
  };
  return res;
}

async function runVercelTests() {
  console.log('=== Starting RankOps Vercel Serverless Functions Test Suite ===\n');
  let passed = 0;
  let failed = 0;

  async function it(desc, fn) {
    try {
      await fn();
      console.log(`  ✓ ${desc}`);
      passed++;
    } catch (err) {
      console.error(`  ✗ ${desc}`);
      console.error(`    ${err.message}`);
      failed++;
    }
  }

  // Test 1: GET /api/stats/overview
  const statsHandler = require('../api/stats/overview');
  await it('GET /api/stats/overview returns 200 with live metrics and CORS headers', async () => {
    const req = createMockReq({ method: 'GET' });
    const res = createMockRes();

    await statsHandler(req, res);

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.headers['access-control-allow-origin'], '*');
    assert.strictEqual(res.body.success, true);
    assert.ok(typeof res.body.data.totalAudits === 'number');
    assert.ok(Array.isArray(res.body.data.recentAudits));
  });

  await it('OPTIONS /api/stats/overview handles CORS preflight with 204 No Content', async () => {
    const req = createMockReq({ method: 'OPTIONS' });
    const res = createMockRes();

    await statsHandler(req, res);

    assert.strictEqual(res.statusCode, 204);
    assert.strictEqual(res.ended, true);
  });

  // Test 2: POST /api/audit/parse-repo
  const parseRepoHandler = require('../api/audit/parse-repo');
  await it('POST /api/audit/parse-repo validates URL and resolves repository metadata', async () => {
    const req = createMockReq({
      method: 'POST',
      body: { url: 'https://github.com/eternallytanuj-hub/RankOps' }
    });
    const res = createMockRes();

    await parseRepoHandler(req, res);

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.success, true);
    assert.strictEqual(res.body.data.owner, 'eternallytanuj-hub');
    assert.strictEqual(res.body.data.repo, 'RankOps');
  });

  await it('POST /api/audit/parse-repo rejects invalid URLs with 400 Bad Request', async () => {
    const req = createMockReq({
      method: 'POST',
      body: { url: 'https://evilgithub.com/bad/repo' }
    });
    const res = createMockRes();

    await parseRepoHandler(req, res);

    assert.strictEqual(res.statusCode, 400);
    assert.strictEqual(res.body.status, 400);
  });

  // Test 3: POST /api/audit/generate-patches
  const patchHandler = require('../api/audit/generate-patches');
  await it('POST /api/audit/generate-patches synthesizes 5-file suite on Vercel serverless', async () => {
    const req = createMockReq({
      method: 'POST',
      body: {
        repoInfo: { owner: 'eternallytanuj-hub', repo: 'RankOps', defaultBranch: 'main' },
        artifacts: [
          { path: 'index.html', content: '<html><head><title>App</title></head><body></body></html>' },
          { path: 'robots.txt', content: 'User-agent: *\nDisallow: /admin' }
        ],
        analysis: { baselineScore: 54 }
      }
    });
    const res = createMockRes();

    await patchHandler(req, res);

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.success, true);
    assert.strictEqual(res.body.data.filesPatchedCount, 5);
    assert.strictEqual(res.body.data.projectedScore, 96);
  });

  // Test 4: POST /api/audit/report
  const reportHandler = require('../api/audit/report');
  await it('POST /api/audit/report generates Markdown report on Vercel serverless', async () => {
    const req = createMockReq({
      method: 'POST',
      body: {
        repoInfo: { owner: 'eternallytanuj-hub', repo: 'RankOps', defaultBranch: 'main' },
        analysis: { baselineScore: 54, projectedScore: 96 },
        patches: [],
        format: 'markdown'
      }
    });
    const res = createMockRes();

    await reportHandler(req, res);

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.success, true);
    assert.ok(res.body.data.markdown.includes('C-LEVEL EXECUTIVE AUDIT'));
    assert.ok(res.body.data.pillars.perplexity);
  });

  await it('POST /api/audit/report generates printable HTML report on Vercel serverless', async () => {
    const req = createMockReq({
      method: 'POST',
      body: {
        repoInfo: { owner: 'eternallytanuj-hub', repo: 'RankOps', defaultBranch: 'main' },
        analysis: { baselineScore: 54, projectedScore: 96 },
        patches: [],
        format: 'html'
      }
    });
    const res = createMockRes();

    await reportHandler(req, res);

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.headers['content-type'], 'text/html; charset=utf-8');
    assert.ok(res.body.includes('<!DOCTYPE html>'));
    assert.ok(res.body.includes('@media print'));
  });

  console.log(`\n===================================`);
  console.log(`Total Tests: ${passed + failed} | Passed: ${passed} | Failed: ${failed}`);
  console.log(`===================================\n`);

  if (failed > 0) process.exit(1);
}

runVercelTests();
