/**
 * Next.js App Router Route Handler
 * GET /api/stats/overview
 */

import { NextResponse } from 'next/server';
const { statsAggregator } = require('../../../../lib/stats-aggregator');

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    }
  });
}

export async function GET() {
  const data = statsAggregator.getOverview();
  return NextResponse.json(data, { status: 200 });
}
