/**
 * Vercel Serverless Function
 * POST /api/audit/create-pr
 */

const { GitHubPRCreator, GitHubPRError } = require('../../lib/github-pr-creator');
const { statsAggregator } = require('../../lib/stats-aggregator');

module.exports = async function handler(req, res) {
  // CORS Preflight
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-GitHub-Token');

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
  const { owner, repo, baseBranch, patches, analysis, customToken: bodyToken } = body || {};

  if (!owner || !repo || !Array.isArray(patches)) {
    res.setHeader('Content-Type', 'application/problem+json');
    return res.status(400).json({
      type: 'https://rankops.dev/errors/invalid-request-body',
      title: 'Bad Request',
      status: 400,
      detail: 'Missing required parameters (owner, repo, patches) in JSON request body.'
    });
  }

  const authHeader = req.headers['authorization'] || req.headers['x-github-token'];
  const userToken = bodyToken || (authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : authHeader) || null;
  const creator = new GitHubPRCreator({ token: userToken });

  try {
    const result = await creator.createPullRequest({
      owner,
      repo,
      baseBranch: baseBranch || 'main',
      patches,
      analysis: analysis || {},
      customToken: userToken
    });

    // Record in live stats
    statsAggregator.recordAudit({
      repo: `${owner}/${repo}`,
      defaultBranch: baseBranch || 'main',
      filesScanned: patches.length,
      scoreBefore: analysis?.baselineScore || 50,
      scoreAfter: analysis?.projectedScore || 92,
      scoreDelta: analysis?.scoreDelta || '+42 pts'
    });

    res.setHeader('Content-Type', 'application/json');
    return res.status(200).json({
      success: true,
      data: result
    });
  } catch (err) {
    res.setHeader('Content-Type', 'application/problem+json');

    if (err instanceof GitHubPRError) {
      return res.status(err.statusCode || 500).json({
        type: `https://rankops.dev/errors/${(err.code || 'error').toLowerCase().replace(/_/g, '-')}`,
        title: err.title || 'Pull Request Error',
        status: err.statusCode || 500,
        code: err.code,
        detail: err.message,
        details: err.details
      });
    }

    console.error('[Vercel Serverless Error - create-pr]:', err);
    return res.status(500).json({
      type: 'https://rankops.dev/errors/internal-server-error',
      title: 'Internal Server Error',
      status: 500,
      detail: 'An unexpected error occurred while creating the Pull Request.'
    });
  }
};
