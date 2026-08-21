/**
 * RankOps — Automated Test Suite for Groq Multi-Key Fallback Engine
 */

const assert = require('assert');
const { GroqClient, GroqApiError } = require('../lib/groq-client');

async function runTests() {
  console.log('=== Starting RankOps Groq Multi-Key Fallback Test Suite ===\n');
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

  it('Loads both primary GROQ_API_KEY and FALL_BACK_GROQ_API_KEY from environment', () => {
    process.env.GROQ_API_KEY = 'gsk_primary_123';
    process.env.FALL_BACK_GROQ_API_KEY = 'gsk_fallback_456';

    const client = new GroqClient();
    const keys = client.getApiKeys();

    assert.strictEqual(keys.length, 2);
    assert.strictEqual(keys[0], 'gsk_primary_123');
    assert.strictEqual(keys[1], 'gsk_fallback_456');
  });

  await itAsync('Automatically fails over to fallback key when primary key encounters 429 Rate Limit', async () => {
    const attemptedKeys = [];

    const mockFetch = async (url, options) => {
      const auth = options.headers['Authorization'];
      attemptedKeys.push(auth);

      if (auth.includes('gsk_primary_123')) {
        return {
          ok: false,
          status: 429,
          headers: new Map(),
          json: async () => ({ error: { message: 'Rate limit reached on primary tier' } })
        };
      }

      if (auth.includes('gsk_fallback_456')) {
        return {
          ok: true,
          status: 200,
          headers: new Map(),
          json: async () => ({
            choices: [{ message: { content: '{"auditScore": 95}' } }],
            model: 'llama-3.3-70b-versatile',
            usage: { total_tokens: 150 }
          })
        };
      }

      return { ok: false, status: 500 };
    };

    const client = new GroqClient({
      apiKey: 'gsk_primary_123',
      fallbackApiKey: 'gsk_fallback_456',
      fetchFn: mockFetch
    });

    const result = await client.chatCompletion({
      messages: [{ role: 'user', content: 'test' }],
      jsonMode: true
    });

    assert.strictEqual(result.parsedJson.auditScore, 95);
    assert.strictEqual(result.keyIndexUsed, 1);
    assert.ok(attemptedKeys.includes('Bearer gsk_primary_123'));
    assert.ok(attemptedKeys.includes('Bearer gsk_fallback_456'));
  });

  await itAsync('Automatically fails over to fallback key when primary key encounters 401 Unauthorized', async () => {
    const mockFetch = async (url, options) => {
      const auth = options.headers['Authorization'];

      if (auth.includes('gsk_bad_primary')) {
        return {
          ok: false,
          status: 401,
          json: async () => ({ error: { message: 'Invalid API Key' } })
        };
      }

      return {
        ok: true,
        status: 200,
        json: async () => ({
          choices: [{ message: { content: '{"status": "ok"}' } }],
          model: 'llama-3.3-70b-versatile'
        })
      };
    };

    const client = new GroqClient({
      apiKey: 'gsk_bad_primary',
      fallbackApiKey: 'gsk_valid_fallback',
      fetchFn: mockFetch
    });

    const result = await client.chatCompletion({
      messages: [{ role: 'user', content: 'test' }],
      jsonMode: true
    });

    assert.strictEqual(result.parsedJson.status, 'ok');
    assert.strictEqual(result.keyIndexUsed, 1);
  });

  console.log(`\n===================================`);
  console.log(`Total Tests: ${passed + failed} | Passed: ${passed} | Failed: ${failed}`);
  console.log(`===================================\n`);

  if (failed > 0) process.exit(1);
}

runTests();
