import { findLocation } from './locations.js';

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const SIZES = { l: 'large', m: 'medium', i: 'small' };
const TYPES = { photo: 'photo', clipart: 'clipart', lineart: 'linedrawing', animated: 'animatedgif', face: 'portrait' };
const COLORS = { color: 'color', gray: 'bw', mono: 'bw' };

/** Parse the shared `tbs` (e.g. "isz:l,itp:photo,ic:gray") into filters. */
function parseTbs(tbs) {
  const out = {};
  for (const part of String(tbs || '').split(',')) {
    const [k, v] = part.split(':');
    if (k && v) out[k] = v;
  }
  return out;
}

/**
 * Validate and normalise query parameters (SerpApi-compatible names).
 * Supports: q, location, gl, hl, google_domain, ijn, safe, tbs, imgsz, image_color, image_type, num.
 */
export function parseParams(query) {
  const q = String(query.q ?? '').trim();
  if (!q) throw new HttpError(400, 'Missing query `q` parameter.');
  if (q.length > 500) throw new HttpError(400, 'Query `q` is too long (max 500 characters).');

  const engine = String(query.engine || 'google_images');
  if (engine !== 'google_images') throw new HttpError(400, `Unsupported engine \`${engine}\`. Use engine=google_images.`);

  const ijn = query.ijn === undefined || query.ijn === '' ? 0 : Number(query.ijn);
  if (!Number.isInteger(ijn) || ijn < 0 || ijn > 50) throw new HttpError(400, '`ijn` must be an integer between 0 and 50.');

  const loc = findLocation(query.location);
  if (query.location && !loc) throw new HttpError(400, `Unsupported location \`${query.location}\`. See /api/locations.`);

  const gl = String(query.gl || loc?.gl || 'us').toLowerCase();
  const hl = String(query.hl || loc?.hl || 'en').toLowerCase();
  if (!/^[a-z]{2}$/.test(gl)) throw new HttpError(400, '`gl` must be a 2-letter country code.');
  if (!/^[a-z]{2}(-[a-z]{2,4})?$/.test(hl)) throw new HttpError(400, '`hl` must be a language code like `en`.');

  const safe = query.safe ? String(query.safe).toLowerCase() : 'moderate';
  if (!['active', 'off', 'moderate'].includes(safe)) throw new HttpError(400, '`safe` must be `active`, `moderate` or `off` (default: moderate).');

  const tbs = parseTbs(query.tbs);
  const imgsz = String(query.imgsz || tbs.isz || '').toLowerCase();
  const imageType = String(query.image_type || tbs.itp || '').toLowerCase();
  const imageColor = String(query.image_color || tbs.ic || '').toLowerCase();
  if (imgsz && !SIZES[imgsz]) throw new HttpError(400, '`imgsz` must be one of: l, m, i.');
  if (imageType && !TYPES[imageType]) throw new HttpError(400, `\`image_type\` must be one of: ${Object.keys(TYPES).join(', ')}.`);
  if (imageColor && !COLORS[imageColor]) throw new HttpError(400, '`image_color` must be one of: color, gray, mono.');

  return {
    engine,
    q,
    ijn,
    gl,
    hl,
    safe,
    googleDomain: String(query.google_domain || 'google.com'),
    locationRequested: query.location ? String(query.location) : undefined,
    locationUsed: loc?.name,
    filters: {
      size: imgsz ? SIZES[imgsz] : undefined,
      type: imageType ? TYPES[imageType] : undefined,
      color: imageColor ? COLORS[imageColor] : undefined,
    },
    backend: String(query.backend || process.env.DEFAULT_BACKEND || 'auto').toLowerCase(),
    raw: { imgsz, imageType, imageColor },
  };
}
