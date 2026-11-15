import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseBing, decodeEntities } from '../lib/bing.js';
import { parseParams, HttpError } from '../lib/params.js';
import { extractFromHtml } from '../lib/google.js';
import { TTLCache } from '../lib/cache.js';

const html = readFileSync(new URL('./fixtures/bing.html', import.meta.url), 'utf8');

test('parseBing extracts SerpApi-shaped records', () => {
  const r = parseBing(html);
  assert.ok(r.length >= 3);
  r.forEach((x, i) => {
    assert.equal(x.position, i + 1);
    assert.match(x.thumbnail, /^https:\/\//);
    assert.match(x.original, /^https?:\/\//);
    assert.ok(x.original_width > 0 && x.original_height > 0, 'dimensions parsed');
    assert.equal(typeof x.title, 'string');
    assert.ok(!/[]/.test(x.title), 'highlight markers stripped');
    assert.equal(x.is_product, false);
    assert.ok(x.link && x.source && x.related_content_id);
  });
});

test('parseBing offset continues positions', () => {
  assert.equal(parseBing(html, { offset: 35 })[0].position, 36);
});

test('parseBing tolerates garbage', () => {
  assert.deepEqual(parseBing('<html>nothing</html>'), []);
  assert.deepEqual(parseBing('class="iuscp" m="{not json}"'), []);
});

test('decodeEntities', () => {
  assert.equal(decodeEntities('a &amp; b &#215; &quot;x&quot; &#x41;'), 'a & b × "x" A');
});

test('parseParams validation and defaults', () => {
  const p = parseParams({ q: ' cats ', location: 'Austin, Texas, United States' });
  assert.equal(p.q, 'cats');
  assert.equal(p.gl, 'us');
  assert.equal(p.safe, 'moderate');
  assert.equal(p.ijn, 0);
  assert.throws(() => parseParams({}), HttpError);
  assert.throws(() => parseParams({ q: 'x', ijn: '-1' }), HttpError);
  assert.throws(() => parseParams({ q: 'x', ijn: 'a' }), HttpError);
  assert.throws(() => parseParams({ q: 'x', engine: 'bing' }), HttpError);
  assert.deepEqual(parseParams({ q: 'x', tbs: 'isz:l,itp:photo,ic:gray' }).filters, { size: 'large', type: 'photo', color: 'bw' });
});

test('extractFromHtml reads Google AF_initDataCallback blobs', () => {
  const rec = ['id1', ['https://encrypted-tbn0.gstatic.com/a', 100, 150], ['https://example.com/full.jpg', 1080, 1920], null, [null, 'https://example.com/page', 'Nice picture']];
  const page = `<script>AF_initDataCallback({key: 'ds:1', hash: '2', data:[[${JSON.stringify(rec)}]], sideChannel: {}});</script>`;
  const out = extractFromHtml(page);
  assert.equal(out.length, 1);
  assert.equal(out[0].original, 'https://example.com/full.jpg');
  assert.equal(out[0].original_width, 1920);
  assert.equal(out[0].link, 'https://example.com/page');
});

test('TTLCache evicts and expires', async () => {
  const c = new TTLCache(2, 20);
  c.set('a', 1); c.set('b', 2); c.set('c', 3);
  assert.equal(c.get('a'), undefined);
  assert.equal(c.get('c'), 3);
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(c.get('c'), undefined);
});
