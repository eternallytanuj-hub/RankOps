/**
 * Vercel Serverless Function
 * POST /api/audit/analyze
 */

const { AIAnalyzer, AIAnalysisError } = require('../../lib/ai-analyzer');
const { GroqClient, GroqApiError } = require('../../lib/groq-client');

module.exports = async function handler(req, res) {
  // CORS Preflight
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Groq-Api-Key');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  // Enforce HTTP Method
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    res.setHeader('Content-Type', 'application/problem+json');
    return res.status(405).json({
      type: 'https://rankops.dev/errors/method-not-allowed',
      title: 'Method Not Allowed',
      status: 405,
      detail: `HTTP method ${req.method} is not supported. Use POST.`
    });
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (e) { body = {}; }
  }
  const { repoInfo, artifacts } = body || {};

  if (!repoInfo || !Array.isArray(artifacts)) {
    res.setHeader('Content-Type', 'application/problem+json');
    return res.status(400).json({
      type: 'https://rankops.dev/errors/invalid-request-body',
      title: 'Bad Request',
      status: 400,
      detail: 'Missing required parameters (repoInfo, artifacts) in JSON request body.'
    });
  }

  const customGroqKey = req.headers['x-groq-api-key'] || null;
  const groqClient = new GroqClient({ apiKey: customGroqKey });
  const analyzer = new AIAnalyzer({ groqClient });

  try {
    const result = await analyzer.analyze(repoInfo, artifacts);
    res.setHeader('Content-Type', 'application/json');
    return res.status(200).json({
      success: true,
      data: result
    });
  } catch (err) {
    res.setHeader('Content-Type', 'application/problem+json');

    if (err instanceof AIAnalysisError || err instanceof GroqApiError) {
      return res.status(err.statusCode || 500).json({
        type: `https://rankops.dev/errors/${(err.code || 'error').toLowerCase().replace(/_/g, '-')}`,
        title: err.title || 'Analysis Error',
        status: err.statusCode || 500,
        code: err.code,
        detail: err.message,
        details: err.details
      });
    }

    console.error('[Vercel Serverless Error - analyze]:', err);
    return res.status(500).json({
      type: 'https://rankops.dev/errors/internal-server-error',
      title: 'Internal Server Error',
      status: 500,
      detail: 'An unexpected error occurred during AI analysis orchestration.'
    });
  }
};
