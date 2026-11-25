# Google Images API (self-hosted, SerpApi-style)

`GET /api/search?engine=google_images&q=Angry` returns the same JSON shape as
[SerpApi's Google Images API](https://serpapi.com/google-images-api): `search_metadata`,
`search_parameters`, `search_information`, `images_results[]` (`position, thumbnail,
related_content_id, source, source_logo, title, link, original, original_height,
original_width, is_product`). 

## Site pages
`/` home · `/images` image search (infinite scroll, filters, favorites, lightbox) · `/agent` AI image agent ·
`/playground` API playground · `/guide` developer guide.

### AI agent
`/agent` calls Groq (`openai/gpt-oss-120b`) **from the browser**; the key lives in `public/config.js`
(test setup, intentionally public). The agent streams its thinking, writes 3-5 search queries, searches in
parallel, then ranks candidates by metadata with match scores. If the AI is unreachable it falls back to a plain
keyword search. Rotate the key and move it server-side before any real launch.
The loading animation is `public/assets/ai-loading.json` (Lottie, `public/vendor/lottie.min.js`).

## Deploy on Vercel (free plan)
1. Import the repo in Vercel (or run `npx vercel`). No build step, no env vars required.
2. Open the URL. Done.

## Run locally
```bash
npm install
npm start          # http://localhost:3000
npm test
```

## Parameters
`q` (required) · `location` (see `/api/locations`) · `gl` · `hl` · `ijn` (page, 0-50) ·
`safe` (`moderate` default, `active`, `off`) · `imgsz` (`l|m|i`) · `image_type`
(`photo|clipart|lineart|animated|face`) · `image_color` (`color|gray`) · `tbs=isz:l,itp:photo,ic:gray` ·
`api_key` (only if `API_KEYS` is set).

## Environment variables (all optional)
| Var | Purpose |
|---|---|
| `API_KEYS` | Comma list. If set, requests need `?api_key=`. Empty = open/unlimited. |
| `PROXY_URL` | `http://user:pass@host:port` (comma-separated = rotation). Enables the Google engine in `auto` mode and is used for Bing too. |
| `CHROMIUM_PACK_URL` | Needed for the Google engine on Vercel (downloads Chromium at runtime), e.g. the `chromium-v131.0.1-pack.tar` release asset of `@sparticuz/chromium`. |
| `DEFAULT_BACKEND` | `auto` (default), `bing`, `google`. Per request: `&backend=bing`. |

## Engines and honest limitations
- **Default (`auto`)**: Bing + DuckDuckGo queried in parallel, merged, de-duplicated and relevance-ranked (`&backend=bing|ddg|google` to force one). The DuckDuckGo engine is unit-tested on fixtures but not verified live from this sandbox.
- **Bing**: plain HTTP, ~0.3-1s, works on Vercel free with no setup. The response's
  `search_metadata.backend` says which engine answered.
- **Google**: Google requires JavaScript (plain HTTP returns an "enable JS" page) and sends
  datacenter IPs (including Vercel's and this dev sandbox) to a CAPTCHA. The Google engine
  uses headless Chromium and **only works behind a residential/unblocker proxy** (`PROXY_URL`).
  It is implemented but **has not been verified against live Google results**, because that was
  impossible from a blocked IP; the parser is unit-tested on a synthetic blob only.
- From datacenter IPs Bing may serve a reduced/cached result set that ignores `ijn` paging and
  type/size filters. Behind a normal/residential proxy these are honoured. Verify on your deployment.
- `source` is the site domain (not a pretty site name). `serpapi_related_content_link` points to a
  new search by the image title, not Google's "related content" panel.
- Results are cached in-memory per warm instance and by the Vercel CDN (`s-maxage=300`).
