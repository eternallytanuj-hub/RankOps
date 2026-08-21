/**
 * RankOps — Automated Test Suite for Phase 4: AI Surgeon Patch Generation & Guardrail Diffs
 */

const assert = require('assert');
const { AISurgeon, AISurgeonError, generateUnifiedDiff, validatePatchSafety } = require('../lib/ai-surgeon');

async function runTests() {
  console.log('=== Starting RankOps Phase 4 AI Surgeon Test Suite ===\n');
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

  console.log('--- 1. Standardized Git Unified Diff Construction Tests ---');

  it('Generates clean unified diff for modified files with hunk headers', () => {
    const oldHtml = '<html>\n<head>\n  <title>Old Title</title>\n</head>\n<body></body>\n</html>';
    const newHtml = '<html>\n<head>\n  <title>New Title</title>\n  <meta name="description" content="AI Optimized">\n</head>\n<body></body>\n</html>';

    const diffResult = generateUnifiedDiff(oldHtml, newHtml, 'index.html', false);
    assert.ok(diffResult.diff.includes('diff --git a/index.html b/index.html'));
    assert.ok(diffResult.diff.includes('--- a/index.html'));
    assert.ok(diffResult.diff.includes('+++ b/index.html'));
    assert.ok(diffResult.diff.includes('@@ -1,6 +1,7 @@') || diffResult.diff.includes('@@'));
    assert.ok(diffResult.diff.includes('-  <title>Old Title</title>'));
    assert.ok(diffResult.diff.includes('+  <title>New Title</title>'));
    assert.ok(diffResult.diff.includes('+  <meta name="description" content="AI Optimized">'));
    assert.strictEqual(diffResult.linesRemoved, 1);
    assert.strictEqual(diffResult.linesAdded, 2);
  });

  it('Generates new file mode diff for newly created files (/dev/null)', () => {
    const llmsContent = '# My Project\n> Summary\n- Docs: https://app.dev/docs';
    const diffResult = generateUnifiedDiff('', llmsContent, 'llms.txt', true);

    assert.ok(diffResult.diff.includes('diff --git a/llms.txt b/llms.txt'));
    assert.ok(diffResult.diff.includes('new file mode 100644'));
    assert.ok(diffResult.diff.includes('--- /dev/null'));
    assert.ok(diffResult.diff.includes('+++ b/llms.txt'));
    assert.ok(diffResult.diff.includes('+## Overview') || diffResult.diff.includes('+# My Project'));
    assert.strictEqual(diffResult.linesRemoved, 0);
    assert.strictEqual(diffResult.linesAdded, 3);
  });

  console.log('\n--- 2. Guardrail Safety Validation Tests ---');

  it('Validates correct HTML with valid JSON-LD schema', () => {
    const validHtml = `<!DOCTYPE html><html><head><title>App</title><script type="application/ld+json">{"@context":"https://schema.org","@type":"WebSite"}</script></head><body></body></html>`;
    const safety = validatePatchSafety('index.html', validHtml);
    assert.strictEqual(safety.passed, true);
    assert.strictEqual(safety.errors.length, 0);
  });

  it('Rejects malformed JSON-LD structured data in HTML', () => {
    const brokenHtml = `<!DOCTYPE html><html><head><title>App</title><script type="application/ld+json">{ broken json : missing quotes }</script></head><body></body></html>`;
    const safety = validatePatchSafety('index.html', brokenHtml);
    assert.strictEqual(safety.passed, false);
    assert.ok(safety.errors.some(e => e.includes('Invalid JSON-LD syntax')));
  });

  it('Validates robots.txt, llms.txt, and sitemap.xml specifications', () => {
    assert.strictEqual(validatePatchSafety('robots.txt', 'User-agent: *\nAllow: /').passed, true);
    assert.strictEqual(validatePatchSafety('robots.txt', 'Disallow: /admin').passed, false); // missing User-agent

    assert.strictEqual(validatePatchSafety('llms.txt', '# Project Title\n> Summary').passed, true);
    assert.strictEqual(validatePatchSafety('llms.txt', 'plain text without h1 header').passed, false);

    assert.strictEqual(validatePatchSafety('sitemap.xml', '<?xml version="1.0"?><urlset><url><loc>https://app.dev/</loc></url></urlset>').passed, true);
    assert.strictEqual(validatePatchSafety('sitemap.xml', '<badxml></badxml>').passed, false);
  });

  console.log('\n--- 3. AI Surgeon Full Patch Synthesis & Delta Scoring ---');

  const surgeon = new AISurgeon();
  const sampleRepo = {
    owner: 'eternallytanuj-hub',
    repo: 'RankOps',
    fullName: 'eternallytanuj-hub/RankOps',
    defaultBranch: 'main',
    description: 'Automated Web Application SEO & AI Engine Optimization Auditor'
  };

  const sampleArtifacts = [
    {
      path: 'index.html',
      category: 'html_layout',
      label: 'HTML Document / App Shell',
      content: '<!DOCTYPE html>\n<html>\n<head>\n  <title>My Web App</title>\n</head>\n<body>\n</body>\n</html>'
    },
    {
      path: 'robots.txt',
      category: 'robots',
      label: 'Robots.txt Specification',
      content: 'User-agent: *\nDisallow: /admin'
    }
  ];

  const sampleAnalysis = {
    auditScore: 54,
    seoScore: 60,
    aeoScore: 48,
    issues: [
      { id: 'MISSING_LLMS_TXT', targetFile: 'llms.txt' },
      { id: 'MISSING_AI_CRAWLERS_ROBOTS', targetFile: 'robots.txt' },
      { id: 'MISSING_META_DESCRIPTION', targetFile: 'index.html' }
    ]
  };

  await itAsync('Synthesizes 4-file patch suite with Git diffs and projected score delta', async () => {
    const result = await surgeon.generatePatches(sampleRepo, sampleArtifacts, sampleAnalysis);

    assert.strictEqual(result.filesPatchedCount, 4);
    assert.strictEqual(result.baselineScore, 54);
    assert.strictEqual(result.projectedScore, 92);
    assert.strictEqual(result.scoreDelta, '+38 pts');
    assert.strictEqual(result.guardrailStatus, 'PASSED');

    const patchedFiles = result.patches.map(p => p.filePath);
    assert.ok(patchedFiles.includes('index.html'));
    assert.ok(patchedFiles.includes('robots.txt'));
    assert.ok(patchedFiles.includes('llms.txt'));
    assert.ok(patchedFiles.includes('sitemap.xml'));

    // Check index.html patch
    const htmlPatch = result.patches.find(p => p.filePath === 'index.html');
    assert.ok(htmlPatch.patchedContent.includes('<meta name="description"'));
    assert.ok(htmlPatch.patchedContent.includes('<meta property="og:image"'));
    assert.ok(htmlPatch.patchedContent.includes('<script type="application/ld+json">'));
    assert.ok(htmlPatch.diff.includes('+  <meta name="description"'));

    // Check robots.txt patch
    const robotsPatch = result.patches.find(p => p.filePath === 'robots.txt');
    assert.ok(robotsPatch.patchedContent.includes('User-agent: GPTBot'));
    assert.ok(robotsPatch.patchedContent.includes('User-agent: ClaudeBot'));
    assert.ok(robotsPatch.patchedContent.includes('User-agent: PerplexityBot'));

    // Check llms.txt patch
    const llmsPatch = result.patches.find(p => p.filePath === 'llms.txt');
    assert.strictEqual(llmsPatch.isNewFile, true);
    assert.ok(llmsPatch.diff.includes('new file mode 100644'));
    assert.ok(llmsPatch.patchedContent.includes('# RankOps'));

    // Verify concatenated full diff
    assert.ok(result.fullUnifiedDiff.includes('diff --git a/index.html b/index.html'));
    assert.ok(result.fullUnifiedDiff.includes('diff --git a/robots.txt b/robots.txt'));
    assert.ok(result.fullUnifiedDiff.includes('diff --git a/llms.txt b/llms.txt'));
    assert.ok(result.fullUnifiedDiff.includes('diff --git a/sitemap.xml b/sitemap.xml'));

    console.log(`     [AI Surgeon]: Patched ${result.filesPatchedSummary}`);
    console.log(`     [Score Improvement]: ${result.baselineScore}/100 -> ${result.projectedScore}/100 (${result.scoreDelta})`);
    console.log(`     [Guardrail Status]: ${result.guardrailStatus}`);
  });

  console.log(`\n===================================`);
  console.log(`Total Tests: ${passed + failed} | Passed: ${passed} | Failed: ${failed}`);
  console.log(`===================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
