/**
 * RankOps — Automated Test Suite for Phase 3: AI Analysis Orchestration
 */

const assert = require('assert');
const { AIAnalyzer, AIAnalysisError, SYSTEM_PROMPT } = require('../lib/ai-analyzer');
const { GroqClient, GroqApiError } = require('../lib/groq-client');

async function runTests() {
  console.log('=== Starting RankOps Phase 3 AI Analysis Test Suite ===\n');
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

  console.log('--- 1. Context Window Construction & Sanitization ---');

  const analyzer = new AIAnalyzer({ apiKey: 'mock_key' });

  const sampleRepo = {
    owner: 'mock-dev',
    repo: 'next-commerce',
    fullName: 'mock-dev/next-commerce',
    defaultBranch: 'main',
    description: 'AI-first headless storefront'
  };

  const sampleArtifacts = [
    {
      path: 'index.html',
      category: 'html_layout',
      label: 'HTML Document / App Shell',
      content: '<!DOCTYPE html><html><head><title>Next Commerce</title></head><body></body></html>'
    },
    {
      path: 'robots.txt',
      category: 'robots',
      label: 'Robots.txt Specification',
      content: 'User-agent: *\nAllow: /'
    }
  ];

  it('Builds clean, sanitized prompt context and flags missing artifacts', () => {
    const context = analyzer.buildPromptContext(sampleRepo, sampleArtifacts);
    assert.ok(context.includes('TARGET REPOSITORY: mock-dev/next-commerce'));
    assert.ok(context.includes('--- START FILE: index.html'));
    assert.ok(context.includes('--- START FILE: robots.txt'));
    assert.ok(context.includes('=== MISSING ARTIFACTS IN REPOSITORY ==='));
    assert.ok(context.includes('- [NOT FOUND]: sitemap.xml'));
    assert.ok(context.includes('- [NOT FOUND]: llms.txt'));
  });

  console.log('\n--- 2. Deterministic Rule Engine (Offline / Fallback Analysis) ---');

  it('Accurately identifies missing AEO (llms.txt, AI crawlers) and SEO (meta description, og:image, schema) items', () => {
    const result = analyzer.deterministicFallbackAnalysis(sampleRepo, sampleArtifacts);
    assert.ok(typeof result.auditScore === 'number' && result.auditScore >= 0 && result.auditScore <= 100);
    assert.ok(typeof result.aeoScore === 'number');
    assert.ok(typeof result.seoScore === 'number');

    const issueIds = result.issues.map(i => i.id);
    assert.ok(issueIds.includes('MISSING_LLMS_TXT'), 'Expected MISSING_LLMS_TXT');
    assert.ok(issueIds.includes('MISSING_AI_CRAWLERS_ROBOTS'), 'Expected MISSING_AI_CRAWLERS_ROBOTS');
    assert.ok(issueIds.includes('MISSING_META_DESCRIPTION'), 'Expected MISSING_META_DESCRIPTION');
    assert.ok(issueIds.includes('MISSING_OPENGRAPH_IMAGE'), 'Expected MISSING_OPENGRAPH_IMAGE');
    assert.ok(issueIds.includes('MISSING_JSON_LD_SCHEMA'), 'Expected MISSING_JSON_LD_SCHEMA');

    assert.ok(result.ruleChecks.length >= 4);
  });

  console.log('\n--- 3. Groq LLM Client & Mock Completion Tests ---');

  const mockGroqFetch = async (url, options) => {
    const body = JSON.parse(options.body);

    if (body.messages.some(m => m.content.includes('trigger_rate_limit'))) {
      return {
        ok: false,
        status: 429,
        headers: new Headers({ 'retry-after': '3' }),
        json: async () => ({ error: { message: 'Rate limit exceeded' } })
      };
    }

    if (body.messages.some(m => m.content.includes('trigger_unauthorized'))) {
      return {
        ok: false,
        status: 401,
        headers: new Headers(),
        json: async () => ({ error: { message: 'Invalid API key' } })
      };
    }

    // Standard Success Response
    const mockAnalysis = {
      auditScore: 68,
      seoScore: 72,
      aeoScore: 58,
      structuredDataScore: 45,
      summary: "RankOps AI analysis identified missing llms.txt and missing JSON-LD schema.",
      issues: [
        {
          id: "MISSING_LLMS_TXT",
          category: "AEO",
          severity: "HIGH",
          targetFile: "llms.txt",
          title: "Missing llms.txt Context File",
          description: "No llms.txt exists to feed context to AI reasoning engines.",
          recommendation: "Generate public/llms.txt.",
          impact: "AI search engines cannot accurately summarize documentation."
        },
        {
          id: "MISSING_AI_ROBOTS_RULES",
          category: "AEO",
          severity: "HIGH",
          targetFile: "robots.txt",
          title: "Robots.txt Missing GPTBot/ClaudeBot Directives",
          description: "Robots.txt does not configure modern AI crawler access.",
          recommendation: "Add User-agent: GPTBot / ClaudeBot rules.",
          impact: "Search bots may ignore deep product routes."
        }
      ],
      ruleChecks: [
        { ruleId: "AEO_LLMS", ruleName: "LLMs.txt Specification", category: "AEO", status: "FAIL", details: "File missing" }
      ]
    };

    return {
      ok: true,
      status: 200,
      headers: new Headers({ 'x-ratelimit-remaining-tokens': '58000' }),
      json: async () => ({
        id: 'chatcmpl_mock_12345',
        model: 'llama-3.3-70b-versatile',
        choices: [
          {
            message: {
              role: 'assistant',
              content: JSON.stringify(mockAnalysis)
            }
          }
        ],
        usage: { prompt_tokens: 420, completion_tokens: 380, total_tokens: 800 }
      })
    };
  };

  const groqClient = new GroqClient({
    apiKey: 'gsk_mock_valid_key',
    fetchFn: mockGroqFetch
  });

  await itAsync('Executes Groq chat completion in JSON mode successfully', async () => {
    const response = await groqClient.chatCompletion({
      messages: [{ role: 'user', content: 'Audit repository' }],
      jsonMode: true
    });

    assert.ok(response.parsedJson);
    assert.strictEqual(response.parsedJson.auditScore, 68);
    assert.strictEqual(response.parsedJson.issues.length, 2);
    assert.strictEqual(response.model, 'llama-3.3-70b-versatile');
  });

  await itAsync('Properly formats and catches 429 Rate Limit from Groq', async () => {
    try {
      await groqClient.chatCompletion({
        messages: [{ role: 'user', content: 'trigger_rate_limit' }]
      });
      assert.fail('Should have thrown 429');
    } catch (err) {
      assert.strictEqual(err.statusCode, 429);
      assert.strictEqual(err.code, 'GROQ_RATE_LIMITED');
    }
  });

  await itAsync('Properly formats and catches 401 Unauthorized from Groq', async () => {
    try {
      await groqClient.chatCompletion({
        messages: [{ role: 'user', content: 'trigger_unauthorized' }]
      });
      assert.fail('Should have thrown 401');
    } catch (err) {
      assert.strictEqual(err.statusCode, 401);
      assert.strictEqual(err.code, 'GROQ_UNAUTHORIZED');
    }
  });

  console.log('\n--- 4. Full AI Analyzer Pipeline Orchestration ---');

  const fullAnalyzer = new AIAnalyzer({ groqClient });

  await itAsync('Orchestrates full AI analysis from decoded Phase 2 artifacts', async () => {
    const analysis = await fullAnalyzer.analyze(sampleRepo, sampleArtifacts);
    assert.strictEqual(analysis.auditScore, 68);
    assert.strictEqual(analysis.seoScore, 72);
    assert.strictEqual(analysis.aeoScore, 58);
    assert.strictEqual(analysis.issues.length, 2);
    assert.strictEqual(analysis.modelUsed, 'llama-3.3-70b-versatile');
    assert.ok(analysis.usage.total_tokens > 0);

    console.log(`     [AI Audit Score]: ${analysis.auditScore}/100 (SEO: ${analysis.seoScore}, AEO: ${analysis.aeoScore})`);
    console.log(`     [Flagged Issues]: ${analysis.issues.map(i => i.id).join(', ')}`);
  });

  console.log(`\n===================================`);
  console.log(`Total Tests: ${passed + failed} | Passed: ${passed} | Failed: ${failed}`);
  console.log(`===================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
