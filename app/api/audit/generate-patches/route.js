/**
 * Next.js App Router Route Handler
 * POST /api/audit/generate-patches
 */

import { NextResponse } from 'next/server';
const { AISurgeon, AISurgeonError } = require('../../../../lib/ai-surgeon');

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

  const { repoInfo, artifacts, analysis } = body || {};
  if (!repoInfo || !Array.isArray(artifacts)) {
    return NextResponse.json({
      type: 'https://rankops.dev/errors/invalid-request-body',
      title: 'Bad Request',
      status: 400,
      detail: 'Missing required parameters (repoInfo, artifacts) in JSON request body.'
    }, {
      status: 400,
      headers: {
        'Content-Type': 'application/problem+json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }

  const surgeon = new AISurgeon();

  try {
    const result = await surgeon.generatePatches(repoInfo, artifacts, analysis || {});
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
    if (err instanceof AISurgeonError) {
      return NextResponse.json({
        type: `https://rankops.dev/errors/${(err.code || 'error').toLowerCase().replace(/_/g, '-')}`,
        title: err.title || 'AI Surgeon Error',
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

    console.error('[RankOps App Route Generate Patches Error]:', err);
    return NextResponse.json({
      type: 'https://rankops.dev/errors/internal-server-error',
      title: 'Internal Server Error',
      status: 500,
      detail: 'An unexpected error occurred during AI Surgeon patch generation.'
    }, {
      status: 500,
      headers: {
        'Content-Type': 'application/problem+json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }
}
