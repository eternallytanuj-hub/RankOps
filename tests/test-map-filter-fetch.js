/**
 * RankOps — Automated Test Suite for Phase 2: Map-Filter-Fetch Pipeline
 */

const assert = require('assert');
const { MapFilterFetchPipeline, MapFilterFetchError, ARTIFACT_RULES } = require('../lib/map-filter-fetch');
const { GitHubClient } = require('../lib/github-client');

async function runTests() {
  console.log('=== Starting RankOps Phase 2 Map-Filter-Fetch Test Suite ===\n');
  let passed = 0;
  let failed = 0;

  function it(desc, fn) {
    try {
      fn();
      console.log(`  ✓ ${desc}`);
      passed++;
    } catch (err) {
      console.error(`  ✗ ${desc}`);
      console.error(`    ${err.message}`);
      failed++;
    }
  }

  async function itAsync(desc, fn) {
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

  console.log('--- 1. Filter Step Heuristics & Category Tests ---');

  const pipeline = new MapFilterFetchPipeline();

  const mockTree = [
    { path: 'public/robots.txt', type: 'blob', sha: 'sha_robots', size: 120 },
    { path: 'public/sitemap.xml', type: 'blob', sha: 'sha_sitemap', size: 450 },
    { path: '.well-known/llms.txt', type: 'blob', sha: 'sha_llms', size: 850 },
    { path: 'src/index.html', type: 'blob', sha: 'sha_html', size: 2100 },
    { path: 'src/app/layout.tsx', type: 'blob', sha: 'sha_layout', size: 3400 },
    { path: 'schema.json', type: 'blob', sha: 'sha_schema', size: 900 },
    // Non-target files that MUST be filtered out:
    { path: 'node_modules/react/index.js', type: 'blob', sha: 'sha_nm', size: 50000 },
    { path: '.next/static/chunks/main.js', type: 'blob', sha: 'sha_next', size: 80000 },
    { path: 'dist/bundle.js', type: 'blob', sha: 'sha_dist', size: 120000 },
    { path: 'src/components/Header.tsx', type: 'blob', sha: 'sha_header', size: 1800 },
    { path: 'src/utils/helpers.ts', type: 'blob', sha: 'sha_helpers', size: 2200 },
    { path: 'public/images/hero.png', type: 'blob', sha: 'sha_hero', size: 450000 },
    { path: 'src', type: 'tree', sha: 'sha_tree_src' } // tree directory item
  ];

  it('Isolates exact 6 SEO/AEO files out of 13 mixed tree items', () => {
    const filtered = pipeline.filterArtifacts(mockTree);
    assert.strictEqual(filtered.length, 6);
    const paths = filtered.map(f => f.path);
    assert.ok(paths.includes('public/robots.txt'));
    assert.ok(paths.includes('public/sitemap.xml'));
    assert.ok(paths.includes('.well-known/llms.txt'));
    assert.ok(paths.includes('src/index.html'));
    assert.ok(paths.includes('src/app/layout.tsx'));
    assert.ok(paths.includes('schema.json'));
    assert.ok(!paths.includes('node_modules/react/index.js'));
    assert.ok(!paths.includes('src/components/Header.tsx'));
  });

  it('Supports category filtering (e.g. only robots & sitemap)', () => {
    const filtered = pipeline.filterArtifacts(mockTree, { enabledCategories: ['robots', 'sitemap'] });
    assert.strictEqual(filtered.length, 2);
    assert.strictEqual(filtered[0].category, 'robots');
    assert.strictEqual(filtered[1].category, 'sitemap');
  });

  console.log('\n--- 2. Full Map-Filter-Fetch Pipeline with Mock GitHub API ---');

  const mockBlobsDb = {
    'sha_robots': 'User-agent: *\nAllow: /\nDisallow: /admin\nSitemap: https://app.dev/sitemap.xml',
    'sha_sitemap': '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>https://app.dev/</loc></url></urlset>',
    'sha_llms': '# LLM Context\n> RankOps Automated Auditor\n## Documentation\n- https://app.dev/docs',
    'sha_html': '<!DOCTYPE html><html><head><title>App</title><meta name="description" content="AI App"></head><body></body></html>',
    'sha_layout': 'export default function RootLayout({ children }) { return <html><head><title>Next</title></head><body>{children}</body></html>; }',
    'sha_schema': '{"@context": "https://schema.org", "@type": "WebApplication", "name": "RankOps"}'
  };

  const mockFetch = async (url) => {
    // 1. Recursive Tree Endpoint
    if (url.includes('/git/trees/root_tree_sha_12345?recursive=1')) {
      return {
        ok: true,
        status: 200,
        headers: new Headers({ 'x-ratelimit-remaining': '4990' }),
        json: async () => ({
          sha: 'root_tree_sha_12345',
          tree: mockTree,
          truncated: false
        })
      };
    }

    // 2. Blob Endpoints
    const blobMatch = url.match(/\/git\/blobs\/(sha_[a-z]+)/);
    if (blobMatch) {
      const sha = blobMatch[1];
      const text = mockBlobsDb[sha] || 'fallback content';
      return {
        ok: true,
        status: 200,
        headers: new Headers({ 'x-ratelimit-remaining': '4985' }),
        json: async () => ({
          sha,
          size: text.length,
          encoding: 'base64',
          content: Buffer.from(text, 'utf8').toString('base64')
        })
      };
    }

    return {
      ok: false,
      status: 404,
      headers: new Headers(),
      json: async () => ({ message: 'Not Found' })
    };
  };

  const client = new GitHubClient({ fetchFn: mockFetch });
  const testPipeline = new MapFilterFetchPipeline({ client });

  await itAsync('Executes complete Map -> Filter -> Fetch pipeline', async () => {
    const result = await testPipeline.execute('test-owner', 'test-repo', 'root_tree_sha_12345');

    assert.strictEqual(result.owner, 'test-owner');
    assert.strictEqual(result.repo, 'test-repo');
    assert.strictEqual(result.isTruncated, false);
    assert.strictEqual(result.artifacts.length, 6);

    const robotsArtifact = result.artifacts.find(a => a.path === 'public/robots.txt');
    assert.ok(robotsArtifact);
    assert.strictEqual(robotsArtifact.category, 'robots');
    assert.ok(robotsArtifact.content.includes('User-agent: *'));
    assert.ok(robotsArtifact.estimatedTokens > 0);

    const llmsArtifact = result.artifacts.find(a => a.path === '.well-known/llms.txt');
    assert.ok(llmsArtifact);
    assert.strictEqual(llmsArtifact.category, 'llms_txt');
    assert.ok(llmsArtifact.content.includes('# LLM Context'));

    // Verify token metrics
    assert.strictEqual(result.metrics.totalFilesScanned, 13);
    assert.strictEqual(result.metrics.targetFilesIsolated, 6);
    assert.ok(result.metrics.tokenSavingsPercent >= 80, `Expected >= 80% token savings, got ${result.metrics.tokenSavingsPercent}%`);
    assert.ok(result.metrics.fileSavingsPercent >= 50);

    console.log(`     [Metrics] Scanned: ${result.metrics.totalFilesScanned} files | Isolated: ${result.metrics.targetFilesIsolated} | Token Savings: ${result.metrics.tokenSavingsPercent}%`);
  });

  console.log('\n--- 3. Error Handling & Guardrail Tests ---');

  await itAsync('Throws error for missing parameters in mapTree', async () => {
    try {
      await testPipeline.mapTree('', 'repo', 'sha');
      assert.fail('Should have thrown error');
    } catch (err) {
      assert.strictEqual(err.statusCode, 400);
      assert.strictEqual(err.code, 'INVALID_MAP_PARAMS');
    }
  });

  await itAsync('Handles 404 tree error gracefully', async () => {
    try {
      await testPipeline.mapTree('test-owner', 'test-repo', 'invalid_tree_sha');
      assert.fail('Should have thrown 404 error');
    } catch (err) {
      assert.strictEqual(err.statusCode, 404);
    }
  });

  console.log(`\n===================================`);
  console.log(`Total Tests: ${passed + failed} | Passed: ${passed} | Failed: ${failed}`);
  console.log(`===================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
