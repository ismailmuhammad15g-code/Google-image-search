// Merge + de-duplicate + relevance-rank results coming from several engines.

const STOP = new Set(['a', 'an', 'the', 'of', 'in', 'on', 'at', 'for', 'and', 'or', 'with', 'to', 'is', 'photo', 'image', 'images', 'picture', 'pictures', 'hd']);

export const tokens = (s) =>
  String(s || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .split(/[^\p{L}\p{N}]+/u)
    .filter((t) => t.length > 1 && !STOP.has(t));

/** Canonical key for duplicate detection (same picture on http/https, with/without query noise). */
export function dedupeKey(url) {
  try {
    const u = new URL(url);
    return (u.hostname.replace(/^www\./, '') + u.pathname).toLowerCase();
  } catch {
    return String(url || '').toLowerCase();
  }
}

/** Fraction (0..1) of the query tokens that appear in the title / source / url. */
export function relevance(query, img) {
  const q = tokens(query);
  if (!q.length) return 0;
  const hay = `${img.title} ${img.source} ${img.link} ${img.original}`.toLowerCase();
  let hit = 0;
  for (const t of q) if (hay.includes(t)) hit++;
  return hit / q.length;
}

/**
 * Round-robin interleave the engines' lists (so no single engine dominates), drop duplicates and
 * tiny images, then nudge better textual matches up. Stable for equal scores.
 */
export function mergeResults(lists, query) {
  const seen = new Set();
  const merged = [];
  const longest = Math.max(0, ...lists.map((l) => l.length));
  for (let i = 0; i < longest; i++) {
    for (const list of lists) {
      const img = list[i];
      if (!img) continue;
      const key = dedupeKey(img.original);
      if (seen.has(key)) continue;
      if (img.original_width && img.original_height && (img.original_width < 120 || img.original_height < 120)) continue;
      seen.add(key);
      merged.push(img);
    }
  }
  const scored = merged.map((img, idx) => ({ img, idx, score: idx - relevance(query, img) * 12 }));
  scored.sort((a, b) => a.score - b.score || a.idx - b.idx);
  return scored.map((s, n) => ({ ...s.img, position: n + 1 }));
}
