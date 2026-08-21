/**
 * RankOps — Live Groq LLM API Smoke Test
 */

const fs = require('fs');
const path = require('path');
const { AIAnalyzer } = require('../lib/ai-analyzer');

// Load .env
try {
  const envPath = path.join(__dirname, '..', '.env');
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

async function testLiveGroq() {
  console.log('Testing live Groq LLM API connection with configured key...');
  
  const analyzer = new AIAnalyzer();
  const repoInfo = {
    owner: 'eternallytanuj-hub',
    repo: 'RankOps',
    fullName: 'eternallytanuj-hub/RankOps',
    defaultBranch: 'main',
    description: 'Automated Web Application SEO & AI Engine Optimization (AEO) Auditor'
  };

  const artifacts = [
    {
      path: 'index.html',
      category: 'html_layout',
      label: 'HTML Document / App Shell',
      content: '<!DOCTYPE html><html><head><title>RankOps</title><meta name="description" content="RankOps automated audit tool"></head><body><h1>RankOps</h1></body></html>'
    },
    {
      path: 'robots.txt',
      category: 'robots',
      label: 'Robots.txt Specification',
      content: 'User-agent: *\nAllow: /\n\nUser-agent: GPTBot\nAllow: /\n\nUser-agent: ClaudeBot\nAllow: /'
    }
  ];

  const result = await analyzer.analyze(repoInfo, artifacts);

  console.log('\n=== Live Groq AI Reasoning Output ===');
  console.log(`Model Used: ${result.modelUsed}`);
  console.log(`Audit Score: ${result.auditScore}/100 (SEO: ${result.seoScore}, AEO: ${result.aeoScore}, Structured Data: ${result.structuredDataScore})`);
  console.log(`Executive Summary: ${result.summary}`);
  console.log(`Flagged Issues Count: ${result.issues.length}`);
  result.issues.slice(0, 5).forEach((iss, i) => {
    console.log(`  ${i+1}. [${iss.severity}] ${iss.title} (${iss.targetFile}) -> ${iss.recommendation}`);
  });
}

testLiveGroq().catch(err => {
  console.error('Live Groq test error:', err.message);
});
