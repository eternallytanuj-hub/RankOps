/**
 * Vercel Serverless Function
 * POST /api/audit/parse-repo
 */

const { GitHubClient, GitHubApiError } = require('../../lib/github-client');
const { GitHubParserError } = require('../../lib/github-parser');

module.exports = async function handler(req, res) {
  // CORS Preflight
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

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

  // Parse Body (handles string or object)
  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (e) { body = {}; }
  }
  const { url } = body || {};

  if (!url || typeof url !== 'string') {
    res.setHeader('Content-Type', 'application/problem+json');
    return res.status(400).json({
      type: 'https://rankops.dev/errors/invalid-request-body',
      title: 'Bad Request',
      status: 400,
      detail: 'Missing required field "url" in JSON request body.'
    });
  }

  // Forward optional client authorization token
  const authHeader = req.headers['authorization'];
  const userToken = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
  const client = new GitHubClient({ token: userToken });

  try {
    const data = await client.resolveRepository(url);
    res.setHeader('Content-Type', 'application/json');
    return res.status(200).json({
      success: true,
      data
    });
  } catch (err) {
    res.setHeader('Content-Type', 'application/problem+json');

    if (err instanceof GitHubParserError) {
      return res.status(400).json({
        type: 'https://rankops.dev/errors/invalid-github-url',
        title: err.title || 'Invalid GitHub URL',
        status: 400,
        code: err.code,
        detail: err.message,
        details: err.details
      });
    }

    if (err instanceof GitHubApiError) {
      return res.status(err.statusCode || 500).json({
        type: `https://rankops.dev/errors/${(err.code || 'error').toLowerCase().replace(/_/g, '-')}`,
        title: err.title || 'GitHub API Error',
        status: err.statusCode || 500,
        code: err.code,
        detail: err.message,
        details: err.details
      });
    }

    console.error('[Vercel Serverless Error - parse-repo]:', err);
    return res.status(500).json({
      type: 'https://rankops.dev/errors/internal-server-error',
      title: 'Internal Server Error',
      status: 500,
      detail: 'An unexpected error occurred while resolving the repository.'
    });
  }
};
