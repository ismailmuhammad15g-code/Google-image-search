// Small built-in location list: name -> Google-style country (gl) and language (hl).
export const LOCATIONS = [
  ['Austin, Texas, United States', 'us', 'en'],
  ['New York, New York, United States', 'us', 'en'],
  ['Los Angeles, California, United States', 'us', 'en'],
  ['London, England, United Kingdom', 'gb', 'en'],
  ['Toronto, Ontario, Canada', 'ca', 'en'],
  ['Sydney, New South Wales, Australia', 'au', 'en'],
  ['Dublin, Ireland', 'ie', 'en'],
  ['Mumbai, Maharashtra, India', 'in', 'en'],
  ['Singapore', 'sg', 'en'],
  ['Cairo, Egypt', 'eg', 'ar'],
  ['Riyadh, Saudi Arabia', 'sa', 'ar'],
  ['Dubai, United Arab Emirates', 'ae', 'ar'],
  ['Paris, France', 'fr', 'fr'],
  ['Berlin, Germany', 'de', 'de'],
  ['Madrid, Spain', 'es', 'es'],
  ['Mexico City, Mexico', 'mx', 'es'],
  ['Sao Paulo, Brazil', 'br', 'pt'],
  ['Rome, Italy', 'it', 'it'],
  ['Tokyo, Japan', 'jp', 'ja'],
  ['Istanbul, Turkey', 'tr', 'tr'],
].map(([name, gl, hl]) => ({ name, gl, hl }));

export function findLocation(text) {
  if (!text) return null;
  const t = String(text).trim().toLowerCase();
  return (
    LOCATIONS.find((l) => l.name.toLowerCase() === t) ||
    LOCATIONS.find((l) => l.name.toLowerCase().startsWith(t)) ||
    LOCATIONS.find((l) => l.name.toLowerCase().includes(t)) ||
    null
  );
}
