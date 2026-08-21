/**
 * RankOps — Automated Test Suite for GitHub PR Creator
 */

const assert = require('assert');
const { GitHubPRCreator, GitHubPRError } = require('../lib/github-pr-creator');

async function runTests() {
  console.log('=== Starting RankOps GitHub PR Creator Test Suite ===\n');
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

  const samplePatches = [
    {
      filePath: 'robots.txt',
      category: 'AEO (AI Crawlers)',
      isNewFile: false,
      patchedContent: 'User-agent: *\nAllow: /\nUser-agent: GPTBot\nAllow: /',
      linesAdded: 3,
      linesRemoved: 0
    },
    {
      filePath: 'llms.txt',
      category: 'AEO (llms.txt)',
      isNewFile: true,
      patchedContent: '# Mock App\n> Summary blockquote',
      linesAdded: 2,
      linesRemoved: 0
    }
  ];

  const sampleAnalysis = {
    baselineScore: 48,
    projectedScore: 94,
    scoreDelta: '+46 pts'
  };

  const mockFetch = async (url, options = {}) => {
    const method = options.method || 'GET';

    // 1. Base Branch Ref
    if (url.includes('/git/ref/heads/main')) {
      if (url.includes('not-found-org')) {
        return { ok: false, status: 404, json: async () => ({ message: 'Not Found' }) };
      }
      if (url.includes('no-perms-org')) {
        return { ok: false, status: 403, json: async () => ({ message: 'Resource not accessible by integration' }) };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          ref: 'refs/heads/main',
          object: { sha: '7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b' }
        })
      };
    }

    // 2. Create Branch Ref
    if (url.includes('/git/refs') && method === 'POST') {
      const body = JSON.parse(options.body);
      return {
        ok: true,
        status: 201,
        json: async () => ({
          ref: body.ref,
          object: { sha: body.sha }
        })
      };
    }

    // 3. Put / Contents
    if (url.includes('/contents/')) {
      if (method === 'GET') {
        return { ok: false, status: 404, json: async () => ({ message: 'Not Found' }) };
      }
      if (method === 'PUT') {
        return {
          ok: true,
          status: 201,
          json: async () => ({ content: { name: 'file', sha: 'blob_sha_123' } })
        };
      }
    }

    // 4. Create Pull Request
    if (url.includes('/pulls') && method === 'POST') {
      const body = JSON.parse(options.body);
      return {
        ok: true,
        status: 201,
        json: async () => ({
          html_url: `https://github.com/mock-org/mock-repo/pull/7`,
          number: 7,
          title: body.title,
          state: 'open'
        })
      };
    }

    return { ok: false, status: 500, json: async () => ({ message: 'Unhandled mock URL' }) };
  };

  const creator = new GitHubPRCreator({
    token: 'ghp_mock_token_12345',
    fetchFn: mockFetch
  });

  it('Builds comprehensive Markdown PR description with AEO score improvements', () => {
    const desc = creator.buildPRDescription({ owner: 'mock-org', repo: 'mock-repo' }, samplePatches, sampleAnalysis);
    assert.ok(desc.includes('48/100'));
    assert.ok(desc.includes('94/100'));
    assert.ok(desc.includes('+46 pts'));
    assert.ok(desc.includes('robots.txt'));
    assert.ok(desc.includes('llms.txt'));
    assert.ok(desc.includes('GPTBot'));
  });

  await itAsync('Executes complete PR Creation flow and returns live GitHub PR link', async () => {
    const result = await creator.createPullRequest({
      owner: 'mock-org',
      repo: 'mock-repo',
      baseBranch: 'main',
      patches: samplePatches,
      analysis: sampleAnalysis
    });

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.prNumber, 7);
    assert.strictEqual(result.prUrl, 'https://github.com/mock-org/mock-repo/pull/7');
    assert.ok(result.branchName.startsWith('rankops-aeo-patch-'));
  });

  await itAsync('Properly catches 404 for non-existent repositories', async () => {
    try {
      await creator.createPullRequest({
        owner: 'not-found-org',
        repo: 'missing-repo',
        patches: samplePatches
      });
      assert.fail('Should have thrown 404');
    } catch (err) {
      assert.strictEqual(err.statusCode, 404);
      assert.strictEqual(err.code, 'REPO_OR_BRANCH_NOT_FOUND');
    }
  });

  await itAsync('Properly catches 403 Permission Denied with compare URL', async () => {
    try {
      await creator.createPullRequest({
        owner: 'no-perms-org',
        repo: 'locked-repo',
        patches: samplePatches
      });
      assert.fail('Should have thrown 403');
    } catch (err) {
      assert.strictEqual(err.statusCode, 403);
      assert.strictEqual(err.code, 'PERMISSION_DENIED');
      assert.ok(err.details.compareUrl);
    }
  });

  console.log(`\n===================================`);
  console.log(`Total Tests: ${passed + failed} | Passed: ${passed} | Failed: ${failed}`);
  console.log(`===================================\n`);

  if (failed > 0) process.exit(1);
}

runTests();
