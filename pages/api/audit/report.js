/**
 * Next.js Pages Router API Route: POST /api/audit/report
 * 
 * Generates C-Level Executive Audit Brief in Markdown or standalone Printable HTML format.
 */

const { ReportGenerator } = require('../../../lib/report-generator');

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({
      type: 'https://rankops.dev/errors/method-not-allowed',
      title: 'Method Not Allowed',
      status: 405,
      detail: `HTTP method ${req.method} is not supported. Use POST.`
    });
  }

  try {
    const { repoInfo = {}, analysis = {}, patches = [], format = 'markdown' } = req.body || {};

    if (format === 'html' || format === 'pdf') {
      const html = ReportGenerator.generateExecutiveHtmlReport(repoInfo, analysis, patches);
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.status(200).send(html);
    }

    const markdown = ReportGenerator.generateExecutiveMarkdownReport(repoInfo, analysis, patches);
    const pillars = ReportGenerator.calculateFourPillars(analysis, patches);

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
    console.error('[API Error - report]:', err);
    return res.status(500).json({
      type: 'https://rankops.dev/errors/internal-server-error',
      title: 'Internal Server Error',
      status: 500,
      detail: err.message || 'An unexpected error occurred during executive report generation.'
    });
  }
}
