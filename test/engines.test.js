import test from 'node:test';
import assert from 'node:assert/strict';
import { parseDdg, parseVqd } from '../lib/ddg.js';
import { mergeResults, dedupeKey, relevance } from '../lib/rank.js';

test('parseVqd finds the token', () => {
  assert.equal(parseVqd(`x vqd="4-123456789012345678901234567890123456" y`), '4-123456789012345678901234567890123456');
  assert.equal(parseVqd(`...&vqd=4-99&foo`), '4-99');
  assert.equal(parseVqd('nothing'), null);
});

test('parseDdg maps i.js results', () => {
  const out = parseDdg({ results: [
    { image: 'https://a.com/x.jpg', thumbnail: 'https://t/1', title: ' Red  car ', url: 'https://www.a.com/p', width: 800, height: 600 },
    { image: '', thumbnail: 'x' },
  ] });
  assert.equal(out.length, 1);
  assert.equal(out[0].source, 'a.com');
  assert.equal(out[0].title, 'Red car');
  assert.equal(out[0].original_width, 800);
  assert.equal(out[0].position, 1);
});

const img = (o, t, w = 800, h = 600) => ({ original: o, title: t, source: 'x.com', link: '', thumbnail: 't', original_width: w, original_height: h });

test('mergeResults interleaves, dedupes and drops tiny images', () => {
  const a = [img('https://a.com/1.jpg', 'red car'), img('https://a.com/2.jpg', 'blue sky'), img('https://a.com/tiny.jpg', 'red car', 50, 50)];
  const b = [img('http://www.a.com/1.jpg', 'red car'), img('https://b.com/3.jpg', 'red car on road')];
  const out = mergeResults([a, b], 'red car');
  assert.equal(new Set(out.map((i) => dedupeKey(i.original))).size, out.length);
  assert.ok(!out.some((i) => i.original.includes('tiny')));
  assert.equal(out.length, 3);
  assert.equal(out[0].title.includes('red car'), true);
  assert.deepEqual(out.map((i) => i.position), [1, 2, 3]);
});

test('relevance counts matching query words', () => {
  assert.equal(relevance('red car', img('u', 'A red car')), 1);
  assert.equal(relevance('red car', img('u', 'blue boat')), 0);
});
