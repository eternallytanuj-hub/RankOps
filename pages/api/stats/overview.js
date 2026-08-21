/**
 * Next.js API Route (Pages Router)
 * GET /api/stats/overview
 */

const { statsAggregator } = require('../../../lib/stats-aggregator');

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    res.setHeader('Content-Type', 'application/problem+json');
    return res.status(405).json({
      type: 'https://rankops.dev/errors/method-not-allowed',
      title: 'Method Not Allowed',
      status: 405,
      detail: `HTTP method ${req.method} is not supported. Use GET.`
    });
  }

  const data = statsAggregator.getOverview();
  res.setHeader('Content-Type', 'application/json');
  return res.status(200).json(data);
}
