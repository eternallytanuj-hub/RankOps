/**
 * RankOps — Automated Test Suite for C-Level Executive Report Generator
 */

const assert = require('assert');
const { ReportGenerator } = require('../lib/report-generator');

async function runTests() {
  console.log('=== Starting RankOps Executive Report Generator Test Suite ===\n');
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

  const sampleRepo = {
    owner: 'eternallytanuj-hub',
    repo: 'RankOps',
    fullName: 'eternallytanuj-hub/RankOps',
    defaultBranch: 'main'
  };

  const sampleAnalysis = {
    baselineScore: 54,
    projectedScore: 96,
    scoreDelta: '+42 pts',
    auditScore: 54
  };

  const samplePatches = [
    { filePath: 'index.html', category: 'SEO & Structured Data', linesAdded: 45, linesRemoved: 2, isNewFile: false },
    { filePath: 'robots.txt', category: 'AEO (AI Crawlers)', linesAdded: 65, linesRemoved: 1, isNewFile: false },
    { filePath: 'llms.txt', category: 'AEO (llms.txt)', linesAdded: 30, linesRemoved: 0, isNewFile: true },
    { filePath: 'llms-full.txt', category: 'AEO (llms-full.txt)', linesAdded: 25, linesRemoved: 0, isNewFile: true },
    { filePath: 'sitemap.xml', category: 'SEO (Sitemap)', linesAdded: 20, linesRemoved: 0, isNewFile: true }
  ];

  console.log('--- 1. Four-Pillar AI Discovery Matrix Calculation Tests ---');

  it('Calculates all 4 discovery pillars (Perplexity, ChatGPT, Claude, Google/Bing)', () => {
    const pillars = ReportGenerator.calculateFourPillars(sampleAnalysis, samplePatches);

    assert.ok(pillars.perplexity);
    assert.strictEqual(pillars.perplexity.status, 'OPTIMAL');
    assert.strictEqual(pillars.perplexity.projected, 98);

    assert.ok(pillars.chatgpt);
    assert.strictEqual(pillars.chatgpt.status, 'OPTIMAL');
    assert.strictEqual(pillars.chatgpt.projected, 96);

    assert.ok(pillars.claude);
    assert.strictEqual(pillars.claude.status, 'OPTIMAL');
    assert.strictEqual(pillars.claude.projected, 95);

    assert.ok(pillars.traditionalSeo);
    assert.strictEqual(pillars.traditionalSeo.status, 'OPTIMAL');
    assert.strictEqual(pillars.traditionalSeo.projected, 96);
  });

  console.log('\n--- 2. C-Level Executive Markdown Brief Generation Tests ---');

  it('Generates structured Markdown report with all 5 mandatory executive sections', () => {
    const md = ReportGenerator.generateExecutiveMarkdownReport(sampleRepo, sampleAnalysis, samplePatches);

    assert.ok(md.includes('# 📄 C-LEVEL EXECUTIVE AUDIT & COMPLIANCE BRIEF'));
    assert.ok(md.includes('RankOps Enterprise Engine v1.2'));
    assert.ok(md.includes('eternallytanuj-hub/RankOps'));
    assert.ok(md.includes('96/100'));
    assert.ok(md.includes('LOW RISK (FULLY MITIGATED)'));
    assert.ok(md.includes('### 📊 1. Four-Pillar AI & Search Discovery Matrix'));
    assert.ok(md.includes('### ⚠️ 2. Identified AI Blindspots & Revenue Vulnerabilities'));
    assert.ok(md.includes('### 🛠 3. 5-Point Automated Remediation Roadmap'));
    assert.ok(md.includes('### 📈 4. Projected Business Impact & Traffic Forecast (90 Days)'));
    assert.ok(md.includes('### ✍️ 5. Sign-Off & Verification Clearance'));
    assert.ok(md.includes('+240% to +380% increase'));
    assert.ok(md.includes('`robots.txt`'));
    assert.ok(md.includes('`llms.txt`'));
  });

  console.log('\n--- 3. Standalone Printable HTML Report Generation Tests ---');

  it('Generates valid, print-optimized HTML document with Linear/Stripe styling', () => {
    const html = ReportGenerator.generateExecutiveHtmlReport(sampleRepo, sampleAnalysis, samplePatches);

    assert.ok(html.includes('<!DOCTYPE html>'));
    assert.ok(html.includes('<title>RankOps Executive Report — eternallytanuj-hub/RankOps</title>'));
    assert.ok(html.includes('@media print'));
    assert.ok(html.includes('Four-Pillar AI &amp; Search Discovery Matrix'));
    assert.ok(html.includes('96/100'));
    assert.ok(html.includes('window.print()'));
    assert.ok(html.includes('scorecard-grid'));
  });

  console.log(`\n===================================`);
  console.log(`Total Tests: ${passed + failed} | Passed: ${passed} | Failed: ${failed}`);
  console.log(`===================================\n`);

  if (failed > 0) process.exit(1);
}

runTests();
