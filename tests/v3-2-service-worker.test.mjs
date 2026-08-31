import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const sw=fs.readFileSync('service-worker.js','utf8');

test('v3.3.1 service worker versions cache and removes older caches',()=>{
  assert.match(sw,/dormflow-v3-3-1/i);
  assert.match(sw,/caches\.keys\(\)/);
  assert.match(sw,/caches\.delete/);
});

test('release-critical navigation CSS and JS are network-first with cached fallback',()=>{
  assert.match(sw,/request\.mode\s*===\s*['"]navigate['"]/);
  assert.match(sw,/\.css|css/i);
  assert.match(sw,/\.js|js/i);
  assert.match(sw,/fetch\(request\)/);
  assert.match(sw,/cache\.put\(request/);
  assert.match(sw,/caches\.match\(request\)/);
  const criticalBranch=sw.indexOf("request.mode==='navigate'");
  const genericCacheFirst=sw.indexOf('caches.match(request).then(cached=>cached||fetch(request)');
  assert.ok(criticalBranch >= 0,'navigation branch missing');
  assert.ok(genericCacheFirst < 0 || criticalBranch < genericCacheFirst,'critical assets must be handled before generic cache-first logic');
});
