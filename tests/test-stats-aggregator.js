/**
 * RankOps — Automated Test Suite for Stats Aggregator
 */

const assert = require('assert');
const { StatsAggregator } = require('../lib/stats-aggregator');

function runTests() {
  console.log('=== Starting RankOps Stats Aggregator Test Suite ===\n');
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

  const aggregator = new StatsAggregator();

  it('Loads initial stats overview with required numeric metrics', () => {
    const overview = aggregator.getOverview();
    assert.strictEqual(overview.success, true);
    assert.ok(typeof overview.data.totalAudits === 'number' && overview.data.totalAudits > 0);
    assert.ok(typeof overview.data.totalFilesScanned === 'number' && overview.data.totalFilesScanned > 0);
    assert.ok(typeof overview.data.avgScoreImprovement === 'number');
    assert.ok(Array.isArray(overview.data.recentAudits));
  });

  it('Records an audit, increments cumulative counters, and prepends to recent activity', () => {
    const before = aggregator.getOverview().data.totalAudits;
    const filesBefore = aggregator.getOverview().data.totalFilesScanned;

    const result = aggregator.recordAudit({
      repo: 'test-org/super-app',
      defaultBranch: 'main',
      filesScanned: 50,
      scoreBefore: 40,
      scoreAfter: 95,
      scoreDelta: '+55 pts'
    });

    assert.strictEqual(result.data.totalAudits, before + 1);
    assert.strictEqual(result.data.totalFilesScanned, filesBefore + 50);
    assert.strictEqual(result.data.recentAudits[0].repo, 'test-org/super-app');
    assert.strictEqual(result.data.recentAudits[0].scoreDelta, '+55 pts');
  });

  console.log(`\n===================================`);
  console.log(`Total Tests: ${passed + failed} | Passed: ${passed} | Failed: ${failed}`);
  console.log(`===================================\n`);

  if (failed > 0) process.exit(1);
}

runTests();
