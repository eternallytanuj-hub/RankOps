/**
 * Next.js App Router Route Handler: POST /api/audit/report
 * 
 * Generates C-Level Executive Audit Brief in Markdown or standalone Printable HTML format.
 */

import { NextResponse } from 'next/server';
const { ReportGenerator } = require('../../../../../lib/report-generator');

export async function POST(request) {
  try {
    let body = {};
    try {
      body = await request.json();
    } catch (e) {
      body = {};
    }

    const { repoInfo = {}, analysis = {}, patches = [], format = 'markdown' } = body;

    if (format === 'html' || format === 'pdf') {
      const html = ReportGenerator.generateExecutiveHtmlReport(repoInfo, analysis, patches);
      return new NextResponse(html, {
        status: 200,
        headers: { 'Content-Type': 'text/html; charset=utf-8' }
      });
    }

    const markdown = ReportGenerator.generateExecutiveMarkdownReport(repoInfo, analysis, patches);
    const pillars = ReportGenerator.calculateFourPillars(analysis, patches);

    return NextResponse.json({
      success: true,
      data: {
        repoInfo,
        format: 'markdown',
        markdown,
        pillars,
        fileName: `${repoInfo.repo || 'repository'}-RankOps-Executive-Report.md`
      }
    }, { status: 200 });
  } catch (err) {
    console.error('[API Route Error - report]:', err);
    return NextResponse.json({
      type: 'https://rankops.dev/errors/internal-server-error',
      title: 'Internal Server Error',
      status: 500,
      detail: err.message || 'An unexpected error occurred during executive report generation.'
    }, { status: 500, headers: { 'Content-Type': 'application/problem+json' } });
  }
}
