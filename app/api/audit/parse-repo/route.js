/**
 * Next.js App Router Route Handler
 * POST /api/audit/parse-repo
 */

import { NextResponse } from 'next/server';
const { GitHubClient, GitHubApiError } = require('../../../../lib/github-client');
const { GitHubParserError } = require('../../../../lib/github-parser');

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

  const { url } = body || {};
  if (!url || typeof url !== 'string') {
    return NextResponse.json({
      type: 'https://rankops.dev/errors/invalid-request-body',
      title: 'Bad Request',
      status: 400,
      detail: 'Missing required field "url" in JSON request body.'
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

  try {
    const data = await client.resolveRepository(url);
    return NextResponse.json({
      success: true,
      data
    }, {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  } catch (err) {
    if (err instanceof GitHubParserError) {
      return NextResponse.json({
        type: 'https://rankops.dev/errors/invalid-github-url',
        title: 'Invalid GitHub URL',
        status: 400,
        code: err.code,
        detail: err.message
      }, {
        status: 400,
        headers: {
          'Content-Type': 'application/problem+json',
          'Access-Control-Allow-Origin': '*'
        }
      });
    }

    if (err instanceof GitHubApiError) {
      return NextResponse.json({
        type: `https://rankops.dev/errors/${err.code.toLowerCase().replace(/_/g, '-')}`,
        title: err.title || 'GitHub API Error',
        status: err.statusCode,
        code: err.code,
        detail: err.message,
        details: err.details
      }, {
        status: err.statusCode,
        headers: {
          'Content-Type': 'application/problem+json',
          'Access-Control-Allow-Origin': '*'
        }
      });
    }

    console.error('[RankOps App Route Error]:', err);
    return NextResponse.json({
      type: 'https://rankops.dev/errors/internal-server-error',
      title: 'Internal Server Error',
      status: 500,
      detail: 'An unexpected error occurred while resolving the repository.'
    }, {
      status: 500,
      headers: {
        'Content-Type': 'application/problem+json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }
}
