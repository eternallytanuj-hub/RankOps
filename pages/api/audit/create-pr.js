/**
 * Next.js API Route (Pages Router)
 * POST /api/audit/create-pr
 */

const { GitHubPRCreator, GitHubPRError } = require('../../../lib/github-pr-creator');
const { statsAggregator } = require('../../../lib/stats-aggregator');

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

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

  const { owner, repo, baseBranch, patches, analysis } = req.body || {};

  if (!owner || !repo || !Array.isArray(patches)) {
    res.setHeader('Content-Type', 'application/problem+json');
    return res.status(400).json({
      type: 'https://rankops.dev/errors/invalid-request-body',
      title: 'Bad Request',
      status: 400,
      detail: 'Missing required fields (owner, repo, patches) in request body.'
    });
  }

  const authHeader = req.headers['authorization'];
  const userToken = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;

  const creator = new GitHubPRCreator({ token: userToken });

  try {
    const result = await creator.createPullRequest({
      owner,
      repo,
      baseBranch: baseBranch || 'main',
      patches,
      analysis: analysis || {}
    });

    // Record audit in global stats
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

    console.error('[RankOps Create PR Error]:', err);
    return res.status(500).json({
      type: 'https://rankops.dev/errors/internal-server-error',
      title: 'Internal Server Error',
      status: 500,
      detail: 'An unexpected error occurred while opening the Pull Request.'
    });
  }
}
