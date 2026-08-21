/**
 * Next.js App Router Route Handler
 * POST /api/audit/map-filter-fetch
 */

import { NextResponse } from 'next/server';
const { MapFilterFetchPipeline, MapFilterFetchError } = require('../../../../lib/map-filter-fetch');
const { GitHubClient, GitHubApiError } = require('../../../../lib/github-client');

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
      detail: 'Malformed JSON payload in request body.'
    }, {
      status: 400,
      headers: {
        'Content-Type': 'application/problem+json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }

  const { owner, repo, treeSha, enabledCategories } = body || {};
  if (!owner || !repo || !treeSha) {
    return NextResponse.json({
      type: 'https://rankops.dev/errors/invalid-request-body',
      title: 'Bad Request',
      status: 400,
      detail: 'Missing required parameters (owner, repo, treeSha) in JSON request body.'
    }, {
      status: 400,
      headers: {
        'Content-Type': 'application/problem+json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }

  // Forward optional client authorization token
  const authHeader = request.headers.get('authorization');
  const userToken = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
  const client = new GitHubClient({ token: userToken });
  const pipeline = new MapFilterFetchPipeline({ client });

  try {
    const result = await pipeline.execute(owner, repo, treeSha, { enabledCategories });
    return NextResponse.json({
      success: true,
      data: result
    }, {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  } catch (err) {
    if (err instanceof MapFilterFetchError || err instanceof GitHubApiError) {
      return NextResponse.json({
        type: `https://rankops.dev/errors/${(err.code || 'error').toLowerCase().replace(/_/g, '-')}`,
        title: err.title || 'Pipeline Error',
        status: err.statusCode || 500,
        code: err.code,
        detail: err.message,
        details: err.details
      }, {
        status: err.statusCode || 500,
        headers: {
          'Content-Type': 'application/problem+json',
          'Access-Control-Allow-Origin': '*'
        }
      });
    }

    console.error('[RankOps App Route Pipeline Error]:', err);
    return NextResponse.json({
      type: 'https://rankops.dev/errors/internal-server-error',
      title: 'Internal Server Error',
      status: 500,
      detail: 'An unexpected error occurred during the Map-Filter-Fetch pipeline.'
    }, {
      status: 500,
      headers: {
        'Content-Type': 'application/problem+json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }
}
