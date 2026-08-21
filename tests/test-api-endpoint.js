/**
 * RankOps — Integration test for /api/audit/parse-repo endpoint
 */

const assert = require('assert');
const http = require('http');

function postJson(path, payload) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(payload);
    const req = http.request({
      hostname: 'localhost',
      port: 3333,
      path: path,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, headers: res.headers, body: JSON.parse(data) });
        } catch(e) {
          resolve({ status: res.statusCode, headers: res.headers, rawBody: data });
        }
      });
    });

    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

async function testEndpoint() {
  console.log('Testing /api/audit/parse-repo endpoint on localhost:3333...');

  // 1. Missing URL body
  const res1 = await postJson('/api/audit/parse-repo', {});
  assert.strictEqual(res1.status, 400);
  assert.strictEqual(res1.body.title, 'Bad Request');
  console.log('✓ Missing body handled with 400');

  // 2. Invalid host
  const res2 = await postJson('/api/audit/parse-repo', { url: 'https://evilgithub.com/hacker/malware' });
  assert.strictEqual(res2.status, 400);
  assert.strictEqual(res2.body.code, 'INVALID_HOST');
  console.log('✓ Invalid host rejected with 400 INVALID_HOST');

  // 3. Disallowed scheme
  const res3 = await postJson('/api/audit/parse-repo', { url: 'file:///etc/passwd' });
  assert.strictEqual(res3.status, 400);
  assert.strictEqual(res3.body.code, 'DISALLOWED_PROTOCOL');
  console.log('✓ Disallowed scheme rejected with 400 DISALLOWED_PROTOCOL');

  console.log('\nAll API endpoint integration tests passed successfully!');
}

testEndpoint().catch(err => {
  console.error('Integration test failed:', err);
  process.exit(1);
});
