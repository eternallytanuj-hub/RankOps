/**
 * RankOps — Automated Test Suite for Dual-Mode GitHub PR Creator
 */

const assert = require('assert');
const { GitHubPRCreator, GitHubPRError } = require('../lib/github-pr-creator');

async function runTests() {
  console.log('=== Starting RankOps Dual-Mode GitHub PR Creator Test Suite ===\n');
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

    // 0. User Info
    if (url.endsWith('/user')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ login: 'bot-account', id: 12345 })
      };
    }

    // 1. Base Branch Ref (Direct on owned repo)
    if (url.includes('/repos/bot-account/my-repo/git/ref/heads/main')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ ref: 'refs/heads/main', object: { sha: 'base_sha_123' } })
      };
    }

    // 1b. Base Branch Ref (External foreign repo)
    if (url.includes('/repos/external-user/public-repo/git/ref/heads/main')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ ref: 'refs/heads/main', object: { sha: 'upstream_sha_456' } })
      };
    }

    // 2. Direct branch ref creation on foreign repo (fails with 403)
    if (url.includes('/repos/external-user/public-repo/git/refs') && method === 'POST') {
      return {
        ok: false,
        status: 403,
        json: async () => ({ message: 'Must have push access to repository' })
      };
    }

    // 3. Fork trigger
    if (url.includes('/repos/external-user/public-repo/forks') && method === 'POST') {
      return {
        ok: true,
        status: 202,
        json: async () => ({ owner: { login: 'bot-account' }, name: 'public-repo' })
      };
    }

    // 4. Check fork ref
    if (url.includes('/repos/bot-account/public-repo/git/ref/heads/main')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ ref: 'refs/heads/main', object: { sha: 'fork_sha_789' } })
      };
    }

    // 5. Create branch ref (on owned or fork repo)
    if (url.includes('/git/refs') && method === 'POST') {
      const body = JSON.parse(options.body);
      return {
        ok: true,
        status: 201,
        json: async () => ({ ref: body.ref, object: { sha: body.sha } })
      };
    }

    // 6. Put contents
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

    // 7. Pull Requests
    if (url.includes('/pulls') && method === 'POST') {
      const body = JSON.parse(options.body);
      const isCrossRepo = body.head.includes(':');
      return {
        ok: true,
        status: 201,
        json: async () => ({
          html_url: `${url.replace('/pulls', '')}/pull/12`,
          number: 12,
          title: body.title,
          state: 'open'
        })
      };
    }

    return { ok: false, status: 404, json: async () => ({ message: 'Not Found' }) };
  };

  const creator = new GitHubPRCreator({
    token: 'ghp_mock_token_12345',
    fetchFn: mockFetch,
    sleepFn: async () => {}
  });

  it('Builds comprehensive Markdown PR description with AEO score improvements', () => {
    const desc = creator.buildPRDescription({ owner: 'bot-account', repo: 'my-repo' }, samplePatches, sampleAnalysis);
    assert.ok(desc.includes('48/100'));
    assert.ok(desc.includes('94/100'));
    assert.ok(desc.includes('+46 pts'));
    assert.ok(desc.includes('robots.txt'));
  });

  await itAsync('Executes Direct Mode PR Creation when authenticated user owns repository', async () => {
    const result = await creator.createPullRequest({
      owner: 'bot-account',
      repo: 'my-repo',
      baseBranch: 'main',
      patches: samplePatches,
      analysis: sampleAnalysis
    });

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.isCrossRepoFork, false);
    assert.strictEqual(result.prNumber, 12);
    assert.ok(result.prUrl.includes('/repos/bot-account/my-repo/pull/12'));
  });

  await itAsync('Automatically executes Fork & Cross-Repo PR Mode when auditing external repository', async () => {
    const result = await creator.createPullRequest({
      owner: 'external-user',
      repo: 'public-repo',
      baseBranch: 'main',
      patches: samplePatches,
      analysis: sampleAnalysis
    });

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.isCrossRepoFork, true);
    assert.strictEqual(result.prNumber, 12);
    assert.strictEqual(result.repo, 'external-user/public-repo');
    assert.strictEqual(result.forkRepo, 'bot-account/public-repo');
    assert.ok(result.prUrl.includes('/repos/external-user/public-repo/pull/12'));
  });

  console.log(`\n===================================`);
  console.log(`Total Tests: ${passed + failed} | Passed: ${passed} | Failed: ${failed}`);
  console.log(`===================================\n`);

  if (failed > 0) process.exit(1);
}

runTests();
