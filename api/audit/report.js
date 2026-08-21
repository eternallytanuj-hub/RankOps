/**
 * Vercel Serverless Function
 * POST /api/audit/report
 */

const { ReportGenerator } = require('../../lib/report-generator');

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

  try {
    let body = req.body;
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch (e) { body = {}; }
    }
    const { repoInfo = {}, analysis = {}, patches = [], format = 'markdown' } = body || {};

    if (format === 'html' || format === 'pdf') {
      const html = ReportGenerator.generateExecutiveHtmlReport(repoInfo, analysis, patches);
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.status(200).send(html);
    }

    const markdown = ReportGenerator.generateExecutiveMarkdownReport(repoInfo, analysis, patches);
    const pillars = ReportGenerator.calculateFourPillars(analysis, patches);

    res.setHeader('Content-Type', 'application/json');
    return res.status(200).json({
      success: true,
      data: {
        repoInfo,
        format: 'markdown',
        markdown,
        pillars,
        fileName: `${repoInfo.repo || 'repository'}-RankOps-Executive-Report.md`
      }
    });
  } catch (err) {
    console.error('[Vercel Serverless Error - report]:', err);
    res.setHeader('Content-Type', 'application/problem+json');
    return res.status(500).json({
      type: 'https://rankops.dev/errors/internal-server-error',
      title: 'Internal Server Error',
      status: 500,
      detail: err.message || 'An unexpected error occurred during executive report generation.'
    });
  }
};
