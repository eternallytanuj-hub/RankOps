/**
 * Next.js App Router Route Handler
 * POST /api/audit/create-pr
 */

import { NextResponse } from 'next/server';
const { GitHubPRCreator, GitHubPRError } = require('../../../../lib/github-pr-creator');
const { statsAggregator } = require('../../../../lib/stats-aggregator');

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    }
  });
}

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch (e) {
    return NextResponse.json({
      type: 'https://rankops.dev/errors/invalid-json',
      title: 'Bad Request',
      status: 400,
      detail: 'Malformed JSON in request body.'
    }, { status: 400 });
  }

  const { owner, repo, baseBranch, patches, analysis } = body || {};

  if (!owner || !repo || !Array.isArray(patches)) {
    return NextResponse.json({
      type: 'https://rankops.dev/errors/invalid-request-body',
      title: 'Bad Request',
      status: 400,
      detail: 'Missing required fields (owner, repo, patches) in request body.'
    }, { status: 400 });
  }

  const authHeader = request.headers.get('authorization');
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

    statsAggregator.recordAudit({
      repo: `${owner}/${repo}`,
      defaultBranch: baseBranch || 'main',
      filesScanned: patches.length,
      scoreBefore: analysis?.baselineScore || 50,
      scoreAfter: analysis?.projectedScore || 92,
      scoreDelta: analysis?.scoreDelta || '+42 pts'
    });

    return NextResponse.json({
      success: true,
      data: result
    }, { status: 200 });
  } catch (err) {
    if (err instanceof GitHubPRError) {
      return NextResponse.json({
        type: `https://rankops.dev/errors/${(err.code || 'error').toLowerCase().replace(/_/g, '-')}`,
        title: err.title || 'Pull Request Error',
        status: err.statusCode || 500,
        code: err.code,
        detail: err.message,
        details: err.details
      }, { status: err.statusCode || 500 });
    }

    console.error('[RankOps App Route Create PR Error]:', err);
    return NextResponse.json({
      type: 'https://rankops.dev/errors/internal-server-error',
      title: 'Internal Server Error',
      status: 500,
      detail: 'An unexpected error occurred while opening the Pull Request.'
    }, { status: 500 });
  }
}
