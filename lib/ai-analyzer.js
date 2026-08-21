/**
 * RankOps — Phase 3: AI Analysis Orchestration
 * 
 * Deep AEO & SEO rule engine utilizing Groq LLM API with deterministic fallbacks.
 */

const { GroqClient, GroqApiError } = require('./groq-client');

class AIAnalysisError extends Error {
  constructor(message, code = 'ANALYSIS_ERROR', statusCode = 500, details = {}, title = 'AI Analysis Error') {
    super(message);
    this.name = 'AIAnalysisError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
    this.title = title;
  }
}

// AI Crawlers & User-Agent Specification
const AI_CRAWLERS = [
  { name: 'GPTBot', company: 'OpenAI', role: 'AI Training & Content Indexing' },
  { name: 'ChatGPT-User', company: 'OpenAI', role: 'Real-time User Search / Browse' },
  { name: 'ClaudeBot', company: 'Anthropic', role: 'Claude AI Web Crawling' },
  { name: 'anthropic-ai', company: 'Anthropic', role: 'Anthropic Model Training' },
  { name: 'PerplexityBot', company: 'Perplexity', role: 'AI Search Engine Discovery' },
  { name: 'Google-Extended', company: 'Google', role: 'Gemini AI Training Data' },
  { name: 'Applebot-Extended', company: 'Apple', role: 'Apple Intelligence' },
  { name: 'CCBot', company: 'Common Crawl', role: 'Open AI Training Corpus' },
  { name: 'Bytespider', company: 'ByteDance', role: 'Doubao & ByteDance LLMs' }
];

const SYSTEM_PROMPT = `You are RankOps AI Surgeon & Auditor — a world-class principal SEO & AI Engine Optimization (AEO) specialist.
Your mission is to rigorously analyze web application repository artifacts for both traditional Search Engine Optimization (SEO) and modern AI Engine Optimization (AEO/LLMO).

EVALUATION KNOWLEDGE BASE:
1. AI Engine Optimization (AEO):
   - Robots.txt AI Crawlers: Check permissions for GPTBot, ChatGPT-User, ClaudeBot, anthropic-ai, PerplexityBot, Google-Extended, Applebot-Extended. Ensure legitimate search crawlers are ALLOWED rather than blindly blocked.
   - LLMs.txt Specification: Check if 'llms.txt' or '.well-known/llms.txt' exists. It must contain a clear Markdown H1 project title, blockquote summary, and links to documentation/API endpoints for AI agents.
   - AI Crawlability & Context: Ensure content is indexable by semantic embeddings without client-side Javascript execution barriers.

2. Traditional SEO & Web Standards:
   - Meta Tags: Validate <title> (30-60 chars), <meta name="description"> (120-160 chars), <link rel="canonical">, <meta name="viewport">, <meta charset="utf-8">.
   - OpenGraph: Validate og:title, og:description, og:image (1200x630px recommendation), og:url, og:type, og:site_name.
   - Twitter Card: Validate twitter:card (summary_large_image), twitter:title, twitter:description, twitter:image.
   - Schema.org Structured Data: Check for <script type="application/ld+json"> with valid JSON-LD schemas (WebSite, Organization, SoftwareApplication).
   - XML Sitemap: Check for sitemap.xml with valid XML declaration, <urlset>, <loc>, and <lastmod>.

OUTPUT INSTRUCTIONS:
You MUST respond with a single valid JSON object following this EXACT schema:
{
  "auditScore": <integer between 0 and 100>,
  "seoScore": <integer between 0 and 100>,
  "aeoScore": <integer between 0 and 100>,
  "structuredDataScore": <integer between 0 and 100>,
  "summary": "<2-3 sentence executive summary of application search and AI readiness>",
  "issues": [
    {
      "id": "<UPPERCASE_SNAKE_CASE_ID>",
      "category": "AEO" | "SEO" | "STRUCTURED_DATA" | "PERFORMANCE",
      "severity": "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "INFO",
      "targetFile": "<file path or artifact name, e.g. robots.txt, index.html, llms.txt>",
      "title": "<Concise issue title>",
      "description": "<Detailed explanation of what is missing or misconfigured>",
      "recommendation": "<Specific code fix or architectural instruction>",
      "impact": "<Why this matters for search rankings or AI discovery>"
    }
  ],
  "ruleChecks": [
    {
      "ruleId": "<RULE_ID>",
      "ruleName": "<Name of rule>",
      "category": "AEO" | "SEO" | "STRUCTURED_DATA",
      "status": "PASS" | "FAIL" | "WARNING",
      "details": "<Short explanation of status>"
    }
  ]
}`;

class AIAnalyzer {
  /**
   * @param {Object} options
   * @param {GroqClient} [options.groqClient]
   * @param {string} [options.apiKey]
   * @param {string} [options.model]
   */
  constructor(options = {}) {
    this.groqClient = options.groqClient || new GroqClient(options);
  }

  /**
   * Assembles decoded Phase 2 artifacts into a sanitized prompt context.
   * 
   * @param {Object} repoInfo
   * @param {Array<{ path: string, category: string, label: string, content: string }>} artifacts
   * @returns {string}
   */
  buildPromptContext(repoInfo = {}, artifacts = []) {
    let context = `TARGET REPOSITORY: ${repoInfo.fullName || `${repoInfo.owner || 'unknown'}/${repoInfo.repo || 'unknown'}`}\n`;
    context += `DEFAULT BRANCH: ${repoInfo.defaultBranch || 'main'}\n`;
    context += `DESCRIPTION: ${repoInfo.description || 'No description provided.'}\n`;
    context += `TOTAL ISOLATED ARTIFACTS: ${artifacts.length}\n\n`;

    context += `=== REPOSITORY ARTIFACT CONTENTS ===\n\n`;

    const knownFiles = ['robots.txt', 'sitemap.xml', 'llms.txt', 'index.html', 'app/layout.tsx', 'schema.json'];
    const foundPaths = new Set(artifacts.map(a => a.path));

    for (const artifact of artifacts) {
      context += `--- START FILE: ${artifact.path} (${artifact.label}) ---\n`;
      if (!artifact.content || artifact.content.trim() === '') {
        context += `[EMPTY FILE CONTENT]\n`;
      } else {
        // Sanitize delimiter backticks and cap individual file length to preserve TPM budget
        const safeContent = artifact.content.slice(0, 2500).replace(/```/g, "'''");
        context += `${safeContent}${artifact.content.length > 2500 ? '\n...[TRUNCATED FOR TOKEN OPTIMIZATION]...' : ''}\n`;
      }
      context += `--- END FILE: ${artifact.path} ---\n\n`;
    }

    // Explicitly flag missing key files to the LLM
    const missingCommon = knownFiles.filter(f => !foundPaths.has(f) && !Array.from(foundPaths).some(p => p.endsWith(f)));
    if (missingCommon.length > 0) {
      context += `=== MISSING ARTIFACTS IN REPOSITORY ===\n`;
      for (const missing of missingCommon) {
        context += `- [NOT FOUND]: ${missing}\n`;
      }
      context += `\n`;
    }

    return context;
  }

  /**
   * Deterministic local analysis engine used as fallback or verification baseline.
   */
  deterministicFallbackAnalysis(repoInfo = {}, artifacts = []) {
    const artifactMap = new Map();
    artifacts.forEach(a => {
      artifactMap.set(a.path, a.content || '');
      const basename = a.path.split('/').pop();
      if (basename && !artifactMap.has(basename)) {
        artifactMap.set(basename, a.content || '');
      }
    });

    const issues = [];
    const ruleChecks = [];

    // 1. Robots.txt check
    const robotsTxt = artifactMap.get('robots.txt') || '';
    if (!robotsTxt) {
      issues.push({
        id: 'MISSING_ROBOTS_TXT',
        category: 'AEO',
        severity: 'HIGH',
        targetFile: 'robots.txt',
        title: 'Missing robots.txt File',
        description: 'The repository lacks a robots.txt file to guide search engines and modern AI agents.',
        recommendation: 'Create a public/robots.txt file with explicit User-agent directives for Googlebot, GPTBot, ClaudeBot, and PerplexityBot.',
        impact: 'Search and AI crawlers will use default crawling behavior, risking uncrawled routes or crawl budget exhaustion.'
      });
      ruleChecks.push({
        ruleId: 'ROBOTS_TXT_PRESENCE',
        ruleName: 'Robots.txt Presence & Directives',
        category: 'AEO',
        status: 'FAIL',
        details: 'robots.txt is missing from repository.'
      });
    } else {
      const hasAiAgents = /GPTBot|ClaudeBot|PerplexityBot|Google-Extended/i.test(robotsTxt);
      if (!hasAiAgents) {
        issues.push({
          id: 'MISSING_AI_CRAWLERS_ROBOTS',
          category: 'AEO',
          severity: 'MEDIUM',
          targetFile: 'robots.txt',
          title: 'Robots.txt Missing Explicit AI Crawler Directives',
          description: 'robots.txt does not configure directives for modern AI crawlers (GPTBot, ClaudeBot, PerplexityBot).',
          recommendation: 'Add explicit User-agent directives for GPTBot, ClaudeBot, and PerplexityBot.',
          impact: 'May prevent generative AI search engines from indexing and citing your content in AI responses.'
        });
        ruleChecks.push({
          ruleId: 'ROBOTS_TXT_AI_AGENTS',
          ruleName: 'AI Crawler Directives',
          category: 'AEO',
          status: 'WARNING',
          details: 'robots.txt exists but lacks explicit AI crawler rules.'
        });
      } else {
        ruleChecks.push({
          ruleId: 'ROBOTS_TXT_AI_AGENTS',
          ruleName: 'AI Crawler Directives',
          category: 'AEO',
          status: 'PASS',
          details: 'robots.txt contains directives for modern AI crawlers.'
        });
      }
    }

    // 2. LLMs.txt check
    const llmsTxt = artifactMap.get('llms.txt') || '';
    if (!llmsTxt) {
      issues.push({
        id: 'MISSING_LLMS_TXT',
        category: 'AEO',
        severity: 'HIGH',
        targetFile: 'llms.txt',
        title: 'Missing llms.txt Specification',
        description: 'The repository lacks an llms.txt file to provide structured context for LLMs, Claude, and ChatGPT.',
        recommendation: 'Add a public/llms.txt or .well-known/llms.txt file with markdown project summary, key URLs, and API endpoints.',
        impact: 'AI agents cannot parse your website architecture in an optimized token format.'
      });
      ruleChecks.push({
        ruleId: 'LLMS_TXT_PRESENCE',
        ruleName: 'LLMs.txt Specification',
        category: 'AEO',
        status: 'FAIL',
        details: 'llms.txt is missing from repository.'
      });
    } else {
      ruleChecks.push({
        ruleId: 'LLMS_TXT_PRESENCE',
        ruleName: 'LLMs.txt Specification',
        category: 'AEO',
        status: 'PASS',
        details: 'llms.txt found and structured.'
      });
    }

    // 3. HTML / Layout Meta & OpenGraph check
    const htmlContent = artifactMap.get('index.html') || artifactMap.get('app/layout.tsx') || artifactMap.get('src/index.html') || '';
    if (htmlContent) {
      const hasTitle = /<title[^>]*>[\s\S]*?<\/title>/i.test(htmlContent) || /title\s*:/i.test(htmlContent);
      const hasDescription = /<meta[^>]*name=["']description["'][^>]*>/i.test(htmlContent) || /description\s*:/i.test(htmlContent);
      const hasOgImage = /<meta[^>]*property=["']og:image["'][^>]*>/i.test(htmlContent) || /openGraph[\s\S]*images/i.test(htmlContent);
      const hasCanonical = /<link[^>]*rel=["']canonical["'][^>]*>/i.test(htmlContent) || /alternates[\s\S]*canonical/i.test(htmlContent);
      const hasSchema = /application\/ld\+json/i.test(htmlContent) || artifactMap.has('schema.json');

      if (!hasDescription) {
        issues.push({
          id: 'MISSING_META_DESCRIPTION',
          category: 'SEO',
          severity: 'HIGH',
          targetFile: 'index.html',
          title: 'Missing Meta Description',
          description: 'No meta description tag was detected in the document head.',
          recommendation: 'Add a descriptive <meta name="description" content="..."> tag (120-160 characters).',
          impact: 'Google and social networks will generate random snippet text in search results.'
        });
        ruleChecks.push({
          ruleId: 'META_DESCRIPTION',
          ruleName: 'Meta Description Tag',
          category: 'SEO',
          status: 'FAIL',
          details: 'Meta description tag is missing.'
        });
      } else {
        ruleChecks.push({
          ruleId: 'META_DESCRIPTION',
          ruleName: 'Meta Description Tag',
          category: 'SEO',
          status: 'PASS',
          details: 'Meta description tag is present.'
        });
      }

      if (!hasOgImage) {
        issues.push({
          id: 'MISSING_OPENGRAPH_IMAGE',
          category: 'SEO',
          severity: 'MEDIUM',
          targetFile: 'index.html',
          title: 'Missing OpenGraph Image (og:image)',
          description: 'The document lacks an og:image tag for rich social media cards on Twitter, LinkedIn, and Discord.',
          recommendation: 'Add <meta property="og:image" content="https://.../preview.png"> (1200x630 resolution recommended).',
          impact: 'Shared links will display as plain text links without visual preview.'
        });
        ruleChecks.push({
          ruleId: 'OPENGRAPH_IMAGE',
          ruleName: 'OpenGraph Preview Image',
          category: 'SEO',
          status: 'WARNING',
          details: 'og:image tag is missing.'
        });
      }

      if (!hasCanonical) {
        issues.push({
          id: 'MISSING_CANONICAL_LINK',
          category: 'SEO',
          severity: 'MEDIUM',
          targetFile: 'index.html',
          title: 'Missing Canonical URL Tag',
          description: 'No <link rel="canonical"> tag was found to designate the authoritative URL.',
          recommendation: 'Add <link rel="canonical" href="https://yourdomain.com/">.',
          impact: 'Risk of duplicate content penalties across HTTP/HTTPS and URL query parameters.'
        });
      }

      if (!hasSchema) {
        issues.push({
          id: 'MISSING_JSON_LD_SCHEMA',
          category: 'STRUCTURED_DATA',
          severity: 'HIGH',
          targetFile: 'index.html',
          title: 'Missing Schema.org JSON-LD Structured Data',
          description: 'No JSON-LD structured data script (<script type="application/ld+json">) was found.',
          recommendation: 'Embed JSON-LD schema describing WebSite, Organization, or WebApplication.',
          impact: 'Search engines and AI crawlers cannot extract structured entity relationships for Knowledge Graph cards.'
        });
        ruleChecks.push({
          ruleId: 'JSON_LD_SCHEMA',
          ruleName: 'Schema.org JSON-LD Schema',
          category: 'STRUCTURED_DATA',
          status: 'FAIL',
          details: 'No JSON-LD structured data tag detected.'
        });
      } else {
        ruleChecks.push({
          ruleId: 'JSON_LD_SCHEMA',
          ruleName: 'Schema.org JSON-LD Schema',
          category: 'STRUCTURED_DATA',
          status: 'PASS',
          details: 'JSON-LD schema is present.'
        });
      }
    }

    // 4. Calculate Scores
    const criticalCount = issues.filter(i => i.severity === 'CRITICAL').length;
    const highCount = issues.filter(i => i.severity === 'HIGH').length;
    const mediumCount = issues.filter(i => i.severity === 'MEDIUM').length;

    const penalty = (criticalCount * 25) + (highCount * 15) + (mediumCount * 8);
    const auditScore = Math.max(20, Math.min(98, 100 - penalty));
    const aeoScore = Math.max(15, Math.min(96, 100 - (issues.filter(i => i.category === 'AEO').length * 28)));
    const seoScore = Math.max(25, Math.min(98, 100 - (issues.filter(i => i.category === 'SEO').length * 20)));
    const structuredDataScore = Math.max(10, Math.min(95, 100 - (issues.filter(i => i.category === 'STRUCTURED_DATA').length * 35)));

    return {
      auditScore,
      seoScore,
      aeoScore,
      structuredDataScore,
      summary: `Automated audit identified ${issues.length} optimization opportunities across AEO directives, OpenGraph tags, and Schema.org structured data.`,
      issues,
      ruleChecks
    };
  }

  /**
   * Validates and normalizes Groq LLM JSON output.
   */
  validateAndNormalizeOutput(rawJson, repoInfo, artifacts) {
    if (!rawJson || typeof rawJson !== 'object') {
      return this.deterministicFallbackAnalysis(repoInfo, artifacts);
    }

    const auditScore = typeof rawJson.auditScore === 'number' ? Math.max(0, Math.min(100, Math.round(rawJson.auditScore))) : 75;
    const seoScore = typeof rawJson.seoScore === 'number' ? Math.max(0, Math.min(100, Math.round(rawJson.seoScore))) : 78;
    const aeoScore = typeof rawJson.aeoScore === 'number' ? Math.max(0, Math.min(100, Math.round(rawJson.aeoScore))) : 65;
    const structuredDataScore = typeof rawJson.structuredDataScore === 'number' ? Math.max(0, Math.min(100, Math.round(rawJson.structuredDataScore))) : 70;

    const issues = Array.isArray(rawJson.issues) ? rawJson.issues.map((iss, index) => ({
      id: iss.id || `ISSUE_${index + 1}`,
      category: iss.category || 'SEO',
      severity: iss.severity || 'MEDIUM',
      targetFile: iss.targetFile || 'index.html',
      title: iss.title || 'Optimization Opportunity',
      description: iss.description || '',
      recommendation: iss.recommendation || '',
      impact: iss.impact || ''
    })) : [];

    const ruleChecks = Array.isArray(rawJson.ruleChecks) ? rawJson.ruleChecks : [];

    return {
      auditScore,
      seoScore,
      aeoScore,
      structuredDataScore,
      summary: rawJson.summary || `RankOps AI analysis complete for ${repoInfo.fullName || 'repository'}.`,
      issues,
      ruleChecks
    };
  }

  /**
   * Full Phase 3 Execution:
   * 1. Constructs prompt context from repoInfo & decoded artifacts.
   * 2. Calls Groq LLM API with strict JSON mode.
   * 3. Normalizes and scores the results.
   * 
   * @param {Object} repoInfo
   * @param {Array<{ path: string, category: string, label: string, content: string }>} artifacts
   * @param {Object} [options]
   * @returns {Promise<{ auditScore: number, seoScore: number, aeoScore: number, structuredDataScore: number, summary: string, issues: Array<any>, ruleChecks: Array<any>, modelUsed: string }>}
   */
  async analyze(repoInfo = {}, artifacts = [], options = {}) {
    const promptContext = this.buildPromptContext(repoInfo, artifacts);

    // If Groq API Key is not configured or in offline mode, use deterministic analyzer
    const effectiveKey = options.apiKey || this.groqClient.apiKey;
    if (!effectiveKey) {
      const fallbackResult = this.deterministicFallbackAnalysis(repoInfo, artifacts);
      return {
        ...fallbackResult,
        modelUsed: 'deterministic-rule-engine-v1'
      };
    }

    try {
      const messages = [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: `Please evaluate this repository for SEO & AEO compliance:\n\n${promptContext}` }
      ];

      const completion = await this.groqClient.chatCompletion({
        apiKey: effectiveKey,
        messages,
        model: options.model || this.groqClient.defaultModel,
        temperature: 0.1,
        maxTokens: 4000,
        jsonMode: true
      });

      const normalized = this.validateAndNormalizeOutput(completion.parsedJson, repoInfo, artifacts);

      return {
        ...normalized,
        modelUsed: completion.model || 'llama-3.3-70b-versatile',
        usage: completion.usage
      };
    } catch (err) {
      console.warn('[RankOps] Groq API analysis failed, falling back to deterministic analyzer:', err.message);
      const fallbackResult = this.deterministicFallbackAnalysis(repoInfo, artifacts);
      return {
        ...fallbackResult,
        modelUsed: 'deterministic-rule-engine-v1 (fallback)',
        warning: `Groq AI analysis degraded: ${err.message}`
      };
    }
  }
}

module.exports = {
  AIAnalyzer,
  AIAnalysisError,
  AI_CRAWLERS,
  SYSTEM_PROMPT
};
