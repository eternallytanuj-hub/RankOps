/**
 * RankOps — Hardened Automated Test Suite for Phase 1: Repository Parsing & Validation
 */

const assert = require('assert');
const { parseGitHubUrl, GitHubParserError } = require('../lib/github-parser');
const { GitHubClient, GitHubApiError } = require('../lib/github-client');

async function runTests() {
  console.log('=== Starting RankOps Phase 1 Security & Edge Case Test Suite ===\n');
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

  console.log('--- 1. Regex & URL Parsing Tests ---');

  it('Parses standard HTTPS GitHub URL', () => {
    const res = parseGitHubUrl('https://github.com/facebook/react');
    assert.strictEqual(res.owner, 'facebook');
    assert.strictEqual(res.repo, 'react');
    assert.strictEqual(res.fullName, 'facebook/react');
    assert.strictEqual(res.canonicalUrl, 'https://github.com/facebook/react');
  });

  it('Parses URL with trailing slash and .git extension', () => {
    const res = parseGitHubUrl('https://github.com/vercel/next.js.git/');
    assert.strictEqual(res.owner, 'vercel');
    assert.strictEqual(res.repo, 'next.js');
    assert.strictEqual(res.fullName, 'vercel/next.js');
  });

  it('Parses SSH git URL', () => {
    const res = parseGitHubUrl('git@github.com:torvalds/linux.git');
    assert.strictEqual(res.owner, 'torvalds');
    assert.strictEqual(res.repo, 'linux');
  });

  it('Parses short domain URL (github.com/owner/repo)', () => {
    const res = parseGitHubUrl('github.com/astral-sh/uv');
    assert.strictEqual(res.owner, 'astral-sh');
    assert.strictEqual(res.repo, 'uv');
  });

  it('Parses multi-segment branch names with forward slashes', () => {
    const res = parseGitHubUrl('https://github.com/tailwindlabs/tailwindcss/tree/feature/dark-mode-v4');
    assert.strictEqual(res.owner, 'tailwindlabs');
    assert.strictEqual(res.repo, 'tailwindcss');
    assert.strictEqual(res.explicitBranch, 'feature/dark-mode-v4');
  });

  it('Strips query parameters and URL fragments cleanly', () => {
    const res = parseGitHubUrl('https://github.com/langchain-ai/langgraph?tab=readme-ov-file#quick-start');
    assert.strictEqual(res.owner, 'langchain-ai');
    assert.strictEqual(res.repo, 'langgraph');
    assert.strictEqual(res.canonicalUrl, 'https://github.com/langchain-ai/langgraph');
  });

  console.log('\n--- 2. Security, SSRF & Host Spoofing Guardrail Tests ---');

  it('Blocks host spoofing attempts (evilgithub.com, attacker-github.com)', () => {
    assert.throws(() => {
      parseGitHubUrl('https://evilgithub.com/owner/repo');
    }, /Invalid repository host/);

    assert.throws(() => {
      parseGitHubUrl('https://attacker-github.com/owner/repo');
    }, /Invalid repository host/);

    assert.throws(() => {
      parseGitHubUrl('https://gitlab.com/owner/repo');
    }, /Invalid repository host/);
  });

  it('Blocks disallowed protocols (file://, javascript:)', () => {
    assert.throws(() => {
      parseGitHubUrl('file:///etc/passwd');
    }, /Disallowed URL protocol scheme/);

    assert.throws(() => {
      parseGitHubUrl('javascript:alert(1)');
    }, /Disallowed URL protocol scheme/);
  });

  it('Rejects empty or whitespace-only inputs', () => {
    assert.throws(() => {
      parseGitHubUrl('   ');
    }, /cannot be empty/);
  });

  it('Rejects invalid GitHub usernames with consecutive or leading hyphens', () => {
    assert.throws(() => {
      parseGitHubUrl('https://github.com/-invalidUser/repo');
    }, /Invalid GitHub username/);

    assert.throws(() => {
      parseGitHubUrl('https://github.com/invalid--user/repo');
    }, /Invalid GitHub username/);
  });

  console.log('\n--- 3. GitHub REST API Client & Error Classification Tests ---');

  // Mock Fetch Router
  const mockFetch = async (url) => {
    if (url.includes('/repos/mock-org/mock-app/branches/main')) {
      return {
        ok: true,
        status: 200,
        headers: new Headers({ 'x-ratelimit-remaining': '4999' }),
        json: async () => ({
          name: 'main',
          commit: {
            sha: 'e4d909c290d0fb1ca068ffaddf22bee0dfc52b45',
            commit: {
              tree: {
                sha: '7c9a93f54817a02ecf042e97ef5f6060bc0df887'
              }
            }
          }
        })
      };
    }

    if (url.includes('/repos/mock-org/mock-app')) {
      return {
        ok: true,
        status: 200,
        headers: new Headers({ 'x-ratelimit-remaining': '5000' }),
        json: async () => ({
          name: 'mock-app',
          full_name: 'mock-org/mock-app',
          html_url: 'https://github.com/mock-org/mock-app',
          default_branch: 'main',
          private: false,
          stargazers_count: 1420,
          description: 'A mock web application for automated audits'
        })
      };
    }

    if (url.includes('/repos/empty-org/empty-repo/branches/main')) {
      return {
        ok: false,
        status: 404,
        headers: new Headers(),
        json: async () => ({ message: 'Branch not found' })
      };
    }

    if (url.includes('/repos/empty-org/empty-repo')) {
      return {
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => ({
          name: 'empty-repo',
          full_name: 'empty-org/empty-repo',
          default_branch: 'main',
          size: 0
        })
      };
    }

    if (url.includes('/repos/rate-limited/repo')) {
      return {
        ok: false,
        status: 403,
        headers: new Headers({
          'x-ratelimit-remaining': '0',
          'x-ratelimit-reset': String(Math.floor(Date.now() / 1000) + 60)
        }),
        json: async () => ({ message: 'API rate limit exceeded' })
      };
    }

    if (url.includes('/repos/forbidden-org/private-repo')) {
      return {
        ok: false,
        status: 403,
        headers: new Headers({
          'x-ratelimit-remaining': '4990'
        }),
        json: async () => ({ message: 'Must authenticate with SAML organization' })
      };
    }

    // Default 404
    return {
      ok: false,
      status: 404,
      headers: new Headers(),
      json: async () => ({ message: 'Not Found' })
    };
  };

  const client = new GitHubClient({ fetchFn: mockFetch });

  await itAsync('Resolves repository default branch, commit SHA, and tree SHA successfully', async () => {
    const data = await client.resolveRepository('https://github.com/mock-org/mock-app');
    assert.strictEqual(data.owner, 'mock-org');
    assert.strictEqual(data.repo, 'mock-app');
    assert.strictEqual(data.defaultBranch, 'main');
    assert.strictEqual(data.commitSha, 'e4d909c290d0fb1ca068ffaddf22bee0dfc52b45');
    assert.strictEqual(data.treeSha, '7c9a93f54817a02ecf042e97ef5f6060bc0df887');
    assert.strictEqual(data.stars, 1420);
    assert.strictEqual(data.isPrivate, false);
  });

  await itAsync('Properly catches and formats 404 Not Found error', async () => {
    try {
      await client.resolveRepository('https://github.com/unknown/not-existing');
      assert.fail('Should have thrown 404');
    } catch (err) {
      assert.strictEqual(err.statusCode, 404);
      assert.strictEqual(err.code, 'REPO_NOT_FOUND');
    }
  });

  await itAsync('Properly distinguishes 429 Rate Limit error from standard 403 Forbidden', async () => {
    try {
      await client.resolveRepository('https://github.com/rate-limited/repo');
      assert.fail('Should have thrown 429');
    } catch (err) {
      assert.strictEqual(err.statusCode, 429);
      assert.strictEqual(err.code, 'RATE_LIMITED');
      assert.ok(err.details.resetSeconds >= 0);
    }
  });

  await itAsync('Properly identifies 403 Forbidden when rate limit remaining > 0', async () => {
    try {
      await client.resolveRepository('https://github.com/forbidden-org/private-repo');
      assert.fail('Should have thrown 403');
    } catch (err) {
      assert.strictEqual(err.statusCode, 403);
      assert.strictEqual(err.code, 'FORBIDDEN');
    }
  });

  await itAsync('Properly catches empty repositories and maps to 422 EMPTY_REPOSITORY', async () => {
    try {
      await client.resolveRepository('https://github.com/empty-org/empty-repo');
      assert.fail('Should have thrown 422');
    } catch (err) {
      assert.strictEqual(err.statusCode, 422);
      assert.strictEqual(err.code, 'EMPTY_REPOSITORY');
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
