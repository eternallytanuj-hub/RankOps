/**
 * RankOps — Automated Test Suite for UI Progress Loader and Submit Button
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

function runUITests() {
  console.log('=== Starting RankOps UI Progress Loader & Button Tests ===\n');
  let passed = 0;
  let failed = 0;

  function it(desc, fn) {
    try {
      fn();
      console.log(`  ✓ ${desc}`);
      passed++;
    } catch (err) {
      console.error(`  ✗ ${desc}`);
      console.error(`    ${err.message}`);
      failed++;
    }
  }

  const htmlPath = path.join(__dirname, '..', 'index.html');
  const html = fs.readFileSync(htmlPath, 'utf8');

  const cssPath = path.join(__dirname, '..', 'styles', 'main.css');
  const css = fs.readFileSync(cssPath, 'utf8');

  const jsPath = path.join(__dirname, '..', 'scripts', 'modals.js');
  const js = fs.readFileSync(jsPath, 'utf8');

  it('index.html contains accessible .audit-progress-container with ARIA attributes', () => {
    assert.ok(html.includes('class="audit-progress-container"'));
    assert.ok(html.includes('role="progressbar"'));
    assert.ok(html.includes('class="audit-progress-step-text"'));
    assert.ok(html.includes('class="audit-progress-pct"'));
    assert.ok(html.includes('class="audit-progress-bar"'));
  });

  it('index.html contains minimal clean diff viewer and results summary card', () => {
    assert.ok(html.includes('class="audit-diff-container"'));
    assert.ok(html.includes('class="diff-header-bar"'));
    assert.ok(html.includes('class="diff-window-dots"'));
    assert.ok(html.includes('class="diff-stat-badge diff-stat-added"'));
    assert.ok(html.includes('class="audit-results-summary"'));
    assert.ok(html.includes('class="summary-metric"'));
  });

  it('index.html uses disambiguated .audit-submit-btn to avoid click hijacking', () => {
    assert.ok(html.includes('<button type="submit" class="audit-submit-btn">'));
    assert.ok(!html.includes('<button type="submit" class="submit-btn connect-btn"'));
  });

  it('styles/main.css defines minimal, clean progress loader and diff styling', () => {
    assert.ok(css.includes('.audit-progress-container'));
    assert.ok(css.includes('.audit-progress-bar'));
    assert.ok(css.includes('.diff-header-bar'));
    assert.ok(css.includes('.diff-line.is-added'));
    assert.ok(css.includes('.diff-line.is-deleted'));
    assert.ok(css.includes('.diff-line-gutter'));
    assert.ok(css.includes('.audit-submit-btn'));
    assert.ok(css.includes('.audit-btn-spinner'));
  });

  it('scripts/modals.js excludes modal-internal buttons and renders clean diff lines', () => {
    assert.ok(js.includes("if (btn.closest('.connect-modal')) return;"));
    assert.ok(js.includes('updateProgress('));
    assert.ok(js.includes('is-added'));
    assert.ok(js.includes('is-deleted'));
    assert.ok(js.includes('diff-line-gutter'));
  });

  console.log(`\n===================================`);
  console.log(`Total Tests: ${passed + failed} | Passed: ${passed} | Failed: ${failed}`);
  console.log(`===================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runUITests();
