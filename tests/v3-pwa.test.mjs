import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const manifestPath='manifest.webmanifest';
const manifest=fs.existsSync(manifestPath)?JSON.parse(fs.readFileSync(manifestPath,'utf8')):{};
const sw=fs.existsSync('service-worker.js')?fs.readFileSync('service-worker.js','utf8'):'';
const html=fs.readFileSync('index.html','utf8');

test('manifest installs DormFlow standalone with custom standard and maskable icons',()=>{assert.equal(manifest.name,'DormFlow');assert.equal(manifest.display,'standalone');assert.equal(manifest.start_url,'/');assert.ok(manifest.icons?.some(x=>x.sizes==='192x192'));assert.ok(manifest.icons?.some(x=>String(x.purpose).includes('maskable')));});
test('service worker caches shell but never durably caches Supabase/api financial responses',()=>{assert.match(sw,/STATIC_ASSETS/);assert.match(sw,/offline\.html/);assert.match(sw,/request\.method !== 'GET'|request\.method!==['"]GET['"]/);assert.match(sw,/\/api\/|supabase/i);assert.doesNotMatch(sw,/cache\.put\([^\n]+\/api\//i);});
test('service worker handles push and notification click',()=>{assert.match(sw,/addEventListener\(['"]push/);assert.match(sw,/showNotification/);assert.match(sw,/notificationclick/);});
test('index includes PWA and iOS metadata',()=>{assert.match(html,/manifest\.webmanifest/);assert.match(html,/apple-mobile-web-app-capable/);assert.match(html,/apple-touch-icon/);});
test('custom DormFlow mark is original geometry, not stock icon text',()=>{const svg=fs.readFileSync('assets/brand/dormflow-mark.svg','utf8');assert.match(svg,/<path/);assert.match(svg,/176B55/i);assert.match(svg,/AA8A52/i);assert.doesNotMatch(svg,/<text|font-awesome|material-icons|<circle[^>]+>\s*D/i);});
