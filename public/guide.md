## 1. Overview

Lemon Lens is a **free, unlimited** image service with two APIs. No signup. No API key (unless the owner turns keys on, see section 11).

| Endpoint | What it does | Speed |
|---|---|---|
| `GET {{BASE}}/api/search` | Plain image search. Merges Bing and DuckDuckGo, de-duplicates, ranks. SerpApi-style JSON. | about 1 s |
| `GET` or `POST {{BASE}}/api/agent` | **AI agent.** Understands a description in any language, writes several searches, searches many pages, then scores every candidate and returns the best. Supports GIFs and refinements. | about 6-20 s |
| `GET {{BASE}}/api/locations` | Location names for the `location` parameter. | instant |
| `GET {{BASE}}/api/health` | Health check. | instant |
| `GET {{BASE}}/openapi.json` | OpenAPI 3 spec of everything on this page. | instant |

All responses are JSON, UTF-8, with **CORS enabled** (call them straight from a browser, a mobile app or a server).

## 2. Quick start

Plain search:

```bash
curl "{{BASE}}/api/search?q=red+sports+car"
```

AI agent (describe the image like you would to a person):

```bash
curl "{{BASE}}/api/agent?q=a+lone+red+fishing+boat+on+calm+water+at+sunrise&limit=12"
```

AI agent that returns GIFs only:

```bash
curl "{{BASE}}/api/agent?q=happy+dog+dancing&format=gif&limit=10"
```

The images are always in `images_results`. Use `original` for the full size picture and `thumbnail` for a fast preview.

## 3. Image Search API

**URL:** `{{BASE}}/api/search`  ·  **Method:** `GET`  ·  **Auth:** none  ·  **Cache:** 5 minutes

| Parameter | Required | Description |
|---|---|---|
| q | yes | What to search for (max 500 characters). |
| ijn | no | Page number starting at 0 (max 50). Paging can repeat images, so de-duplicate on `original`. |
| imgsz | no | Size: `l` large, `m` medium, `i` icon. |
| image_type | no | `photo`, `clipart`, `lineart`, `animated` (GIF), `face`. |
| image_color | no | `color` or `gray` (black and white). |
| safe | no | `moderate` (default), `active` (strict) or `off`. |
| gl / hl | no | Country (`us`) and language (`en`) codes. |
| location | no | A name from `{{BASE}}/api/locations`. |
| backend | no | `auto` (default: Bing + DuckDuckGo together), `bing`, `ddg` or `google` (needs a proxy on the server). |

### Response

```json
{
  "search_metadata": { "status": "Success", "backend": "bing+ddg", "cached": false, "total_time_taken": 0.64 },
  "search_parameters": { "engine": "google_images", "q": "coffee", "hl": "en", "gl": "us", "safe": "moderate", "ijn": "0" },
  "images_results": [
    {
      "position": 1,
      "title": "Cup of coffee on a wooden table",
      "source": "example.com",
      "source_logo": "https://www.google.com/s2/favicons?domain=example.com&sz=64",
      "link": "https://example.com/page-with-the-image",
      "thumbnail": "https://...small preview...",
      "original": "https://...full size image...",
      "original_width": 1920,
      "original_height": 1080,
      "related_content_id": "ABC123",
      "is_product": false
    }
  ]
}
```

| Field | Meaning |
|---|---|
| thumbnail | Small preview. Fast and reliable. |
| original | Full size image. Some sites block hotlinking, so fall back to `thumbnail` if it fails to load. |
| link | The web page where the image was found. Link to it to credit the source. |
| source | The website the image comes from. |
| original_width / original_height | Pixel size. Can be `0` when the engine did not report it. |

## 4. AI Agent API

The agent does what a careful person would do:

1. **Understand.** Works out the subject, the details that must show, what to avoid, the format (photo, GIF, illustration) and filters like size or black and white.
2. **Plan.** Writes 4-6 different search queries.
3. **Search.** Runs them across pages and engines in parallel (and animated variants if you want GIFs). Up to 180 unique candidates.
4. **Rank.** The AI scores every candidate from 0 to 100 against your description, in batches, and explains why.
5. **Return.** The best matches above `min_score`, sorted best first.

**URL:** `{{BASE}}/api/agent`  ·  **Methods:** `GET` or `POST` (JSON body)  ·  **Time:** about 6-20 seconds, so set a client timeout of at least 45 s.

### Parameters

Send them as a query string (GET) or as JSON fields (POST). Both can be mixed.

| Parameter | Required | Description |
|---|---|---|
| q | yes | Describe the image in any language, up to 600 characters. Long and specific is better than short and vague. |
| limit | no | How many images to return, 1 to 60 (default `24`). |
| min_score | no | Drop matches below this AI score, 0 to 100 (default `50`). Use `70` for strict results, `0` to keep everything. |
| gif | no | `true` to include GIFs alongside photos. Words like "gif", "animated" or "moving" in `q` do the same. |
| format | no | Return only this kind: `photo`, `gif` or `any` (default). |
| previous | no | The previous request, so `q` can be a refinement (section 7). |
| safe | no | `moderate` (default), `active` or `off`. |
| thinking | no | `true` to include the AI reasoning text in the response. |
| plan_only | no | `true` to return only the understanding and queries (about 1-3 s). Nothing is searched. |
| stream | no | `true` for live progress as Server-Sent Events (section 5). |
| gl / hl | no | Country and language codes passed to the engines. |
| api_key | no | Only if the server owner enabled keys. Or send `Authorization: Bearer KEY`. |

### Response

```json
{
  "agent_metadata": {
    "id": "9f2c1b7a4e8d4f0c8a1b3c5d",
    "status": "Success",
    "ai_used": true,
    "model": "openai/gpt-oss-120b",
    "steps": [
      { "name": "understand", "status": "done", "seconds": 2.1 },
      { "name": "search", "status": "done", "seconds": 3.4 },
      { "name": "rank", "status": "done", "seconds": 5.2 }
    ],
    "notes": [],
    "candidates_considered": 143,
    "searches_run": 14,
    "matches_total": 38,
    "returned": 12,
    "total_time_taken": 10.8
  },
  "search_parameters": { "q": "a lone red fishing boat ...", "gif": false, "limit": 12, "min_score": 50, "safe": "moderate" },
  "understanding": {
    "intent": "A single red fishing boat on calm water at sunrise",
    "subject": "red fishing boat",
    "details": ["calm water", "sunrise light", "single boat"],
    "avoid": ["cartoon", "logo", "stock watermark"],
    "format": "photo",
    "queries": ["red fishing boat sunrise calm water", "lone red boat dawn sea", "wooden red fishing boat morning mist"],
    "filters": { "size": "", "image_type": "photo", "image_color": "" },
    "summary": "Looking for a single red fishing boat at sunrise."
  },
  "summary": "Found 38 strong matches; the top ones show a lone red boat in golden light.",
  "images_results": [
    {
      "position": 1,
      "score": 96,
      "why": "red boat, sunrise, calm water in title",
      "is_gif": false,
      "title": "Red fishing boat at sunrise",
      "source": "example.com",
      "source_logo": "https://...favicon...",
      "link": "https://example.com/page",
      "thumbnail": "https://...",
      "original": "https://...",
      "original_width": 2400,
      "original_height": 1600
    }
  ]
}
```

| Field | Meaning |
|---|---|
| images_results[].score | AI match score 0-100. It is `null` in keyword fallback mode (see `ai_used`). |
| images_results[].why | Short reason the agent picked it. |
| images_results[].is_gif | `true` for animated GIFs. |
| understanding | What the agent understood. Show it to users, or reuse `queries` yourself. |
| agent_metadata.ai_used | `false` means the AI was unavailable and results are ordered by keyword match. Check `notes` for why. |
| agent_metadata.matches_total | How many matches passed `min_score` before `limit` was applied. |
| thinking | Only present when you pass `thinking=true`. |

### POST example

```bash
curl -X POST "{{BASE}}/api/agent" \
  -H "Content-Type: application/json" \
  -d '{"q":"minimalist living room, beige sofa, big window, plants","limit":20,"min_score":70}'
```

### Plan only (fast preview)

```bash
curl "{{BASE}}/api/agent?q=cute+puppy+in+a+raincoat&plan_only=true"
```

Returns `understanding` with an empty `images_results`. Useful to show "here is what I will look for" instantly, then call again for the full result.

## 5. Streaming progress (Server-Sent Events)

Add `stream=true` to get live events instead of waiting for one big response. Perfect for a progress bar or a "thinking" UI.

| Event | Data |
|---|---|
| status | `{ "step": "understand | search | rank", "status": "running | done | failed" }` |
| thinking | `{ "text": "..." }` AI reasoning chunks. Only sent when `thinking=true`. |
| understanding | The `understanding` object. |
| candidates | `{ "count": 143, "searches": 14 }` |
| result | The complete final JSON (same as the non-streaming response). |
| done | `{}` The stream ends. |
| error | `{ "error": "...", "agent_metadata": {...} }` The stream ends. |

### Browser (EventSource)

```js
const url = "{{BASE}}/api/agent?stream=true&thinking=true&q=" + encodeURIComponent("red boat at sunrise");
const es = new EventSource(url);
es.addEventListener("status", (e) => console.log("status", JSON.parse(e.data)));
es.addEventListener("thinking", (e) => process_thinking(JSON.parse(e.data).text));
es.addEventListener("understanding", (e) => console.log("plan", JSON.parse(e.data)));
es.addEventListener("result", (e) => { render(JSON.parse(e.data).images_results); });
es.addEventListener("done", () => es.close());
es.addEventListener("error", () => es.close()); // network error or server "error" event
```

### Any language (POST + stream)

```js
const res = await fetch("{{BASE}}/api/agent", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ q: "red boat at sunrise", stream: true })
});
const reader = res.body.getReader(), dec = new TextDecoder();
let buf = "";
for (;;) {
  const { value, done } = await reader.read();
  if (done) break;
  buf += dec.decode(value, { stream: true });
  const frames = buf.split("\n\n"); buf = frames.pop();
  for (const f of frames) {
    const event = /^event: (.+)$/m.exec(f)?.[1], data = /^data: (.+)$/m.exec(f)?.[1];
    if (event && data) console.log(event, JSON.parse(data));
  }
}
```

## 6. Code examples

### JavaScript / Node 18+ / TypeScript

```js
async function findImages(description, opts = {}) {
  const params = new URLSearchParams({ q: description, limit: "24", ...opts });
  const res = await fetch("{{BASE}}/api/agent?" + params, { signal: AbortSignal.timeout(60000) });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "HTTP " + res.status);
  return data; // data.images_results[0].original is the best image
}

const data = await findImages("black and white photo of a lighthouse in a storm", { min_score: "70" });
console.log(data.understanding.intent);
for (const img of data.images_results) console.log(img.score, img.title, img.original);
```

### Python (requests)

```python
import requests

r = requests.get(
    "{{BASE}}/api/agent",
    params={"q": "golden retriever puppy wearing a yellow raincoat", "limit": 12, "min_score": 70},
    timeout=60,
)
r.raise_for_status()
data = r.json()
print(data["understanding"]["intent"])
for img in data["images_results"]:
    print(img["score"], img["title"], img["original"])
```

### Python (stream)

```python
import json, requests

with requests.get("{{BASE}}/api/agent", params={"q": "red boat sunrise", "stream": "true"}, stream=True, timeout=60) as r:
    event = None
    for line in r.iter_lines(decode_unicode=True):
        if line.startswith("event:"):
            event = line[6:].strip()
        elif line.startswith("data:") and event:
            payload = json.loads(line[5:])
            print(event, payload if event != "result" else "(final result received)")
```

### PHP

```php
<?php
$url = "{{BASE}}/api/agent?" . http_build_query(["q" => "vintage 80s neon city poster", "limit" => 12]);
$ctx = stream_context_create(["http" => ["timeout" => 60]]);
$data = json_decode(file_get_contents($url, false, $ctx), true);
foreach ($data["images_results"] as $img) {
    echo $img["score"] . " " . $img["original"] . "\n";
}
```

### cURL with jq

```bash
curl -s "{{BASE}}/api/agent?q=steaming+ramen+top+down&limit=5" | jq -r '.images_results[] | "\(.score)  \(.original)"'
```

### Android (Kotlin, OkHttp) and iOS (Swift)

```kotlin
val client = OkHttpClient.Builder().readTimeout(60, TimeUnit.SECONDS).build()
val url = "{{BASE}}/api/agent".toHttpUrl().newBuilder().addQueryParameter("q", "red boat at sunrise").build()
client.newCall(Request.Builder().url(url).build()).execute().use { println(it.body!!.string()) }
```

```swift
var c = URLComponents(string: "{{BASE}}/api/agent")!
c.queryItems = [URLQueryItem(name: "q", value: "red boat at sunrise")]
var req = URLRequest(url: c.url!); req.timeoutInterval = 60
let (data, _) = try await URLSession.shared.data(for: req)
```

## 7. Refinements and GIFs

Pass the earlier request as `previous` and describe only the change in `q`. The agent keeps what still applies.

```bash
# First search
curl "{{BASE}}/api/agent?q=sports+car+on+a+mountain+road"

# Refine it
curl -G "{{BASE}}/api/agent" \
  --data-urlencode "previous=sports car on a mountain road" \
  --data-urlencode "q=same but black and white and closer view"
```

GIFs: add `gif=true` to mix GIFs into the results, or `format=gif` to return only GIFs. Saying "gif" or "animated" in `q` also works. Check `is_gif` on each image. Static `thumbnail` for a GIF is a still frame, and `original` is the animation.

## 8. Use the agent as a tool for another AI

Give your own LLM (OpenAI, Claude, Groq, Gemini...) this function so it can fetch images on demand. Your code calls `/api/agent` when the model asks for it and returns the result.

```json
{
  "type": "function",
  "function": {
    "name": "find_images",
    "description": "Find the most accurate images (and GIFs) for a description. Returns image URLs with a 0-100 match score.",
    "parameters": {
      "type": "object",
      "properties": {
        "q": { "type": "string", "description": "Detailed description of the wanted image, any language." },
        "limit": { "type": "integer", "description": "How many images, 1-60. Default 12." },
        "format": { "type": "string", "enum": ["any", "photo", "gif"] },
        "min_score": { "type": "integer", "description": "0-100. Use 70 for strict results." }
      },
      "required": ["q"]
    }
  }
}
```

Your handler is one request: `GET {{BASE}}/api/agent?q=...&limit=...&format=...&min_score=...` and then return `images_results` (or only `original`, `title`, `score`) to the model.

## 9. Errors

Errors return an HTTP status and JSON like `{ "error": "Missing q parameter.", "agent_metadata": { "status": "Error" } }`. In streaming mode they arrive as an `error` event.

| Status | Meaning | What to do |
|---|---|---|
| 400 | Bad or missing parameter. | Fix the request. The message says which one. |
| 401 | API key required or wrong (only if the owner enabled keys). | Send `api_key` or `Authorization: Bearer KEY`. |
| 405 | Wrong HTTP method. | Use GET or POST. |
| 413 | POST body too large. | Keep the JSON under 20 KB. |
| 502 / 503 | A search engine failed or rate limited. | Wait a few seconds and retry with backoff. |
| 504 | The hosting platform timed out (very slow request). | Retry, lower `limit`, or use `stream=true`. |

If the AI part is down the agent does **not** fail. It falls back to a keyword search, returns `"ai_used": false` and explains in `notes`. Scores are then `null`.

## 10. Limits, speed and best practices

- **No quotas.** Please be kind: avoid hammering the service in tight loops, add a short delay in bulk jobs.
- **Agent timing:** about 6-20 s. Use `stream=true` or `plan_only=true` first so users see progress at once. Use a client timeout of 45-60 s.
- **Caching:** searches are cached 5 minutes, so repeating a request is faster. Agent responses are not cached.
- **Hotlinking:** some `original` URLs reject being embedded. Always handle load errors and fall back to `thumbnail`. When downloading server-side, send no `Referer` header.
- **De-duplicate** on `original` if you merge several pages.
- **Quality tips for `q`:** include the subject, colors, setting, style, mood and angle ("top-down photo of ramen, dark background"). Add what you do NOT want in words ("no text, no logo").
- **Strictness:** `min_score=70` gives fewer, better results. `min_score=0` returns everything the agent found.
- **Attribution:** link to `link` (the source page) when you display an image, and respect the image owner's license. This service finds images, it does not grant rights to use them.
- **Safe search** is `moderate` by default. Use `safe=active` for kids or workplace apps.

## 11. Server setup (for the owner)

Everything works out of the box on Vercel. These optional environment variables change behavior:

| Variable | Purpose |
|---|---|
| GROQ_API_KEY | Key for the AI agent. If unset the server reads `public/config.js`. With no key the agent runs in keyword fallback mode. |
| GROQ_BASE_URL | Default `https://api.groq.com/openai/v1`. Any OpenAI-compatible endpoint works. |
| GROQ_MODEL | Default `openai/gpt-oss-120b`. |
| API_KEYS | Comma list. If set, every API call needs `?api_key=` or `Authorization: Bearer`. Empty means open. |
| PROXY_URL | Residential proxy. Enables the Google engine and is used for Bing and DuckDuckGo. |
| DEFAULT_BACKEND | `auto`, `bing`, `ddg` or `google`. |

For production, set `GROQ_API_KEY` as an environment variable and remove the key from `public/config.js`, because anything in `public/` is readable by everyone. Turn on `API_KEYS` if you want to stop strangers from using your AI quota. Vercel's free plan allows functions up to 60 s, which is why the agent is tuned to finish in about 6-20 s.

## 12. OpenAPI and discovery

- OpenAPI 3 spec: `{{BASE}}/openapi.json` (import it into Postman, Insomnia, Swagger UI, or an AI tool builder).
- Health: `{{BASE}}/api/health` returns `{ "status": "ok" }`.
- Interactive tester: open the [API Playground](/playground).

## 13. Ready-made prompt for an AI coding assistant

Copy this into ChatGPT, Claude or Cursor to have it integrate the API for you:

```text
Integrate this image API into my app. Base URL: {{BASE}}. No auth.
- GET /api/search?q=... returns { images_results: [{ title, source, link, thumbnail, original, original_width, original_height }] }.
- GET or POST /api/agent is an AI agent. Params: q (required, describe the image), limit (1-60), min_score (0-100, default 50), gif (bool), format (any|photo|gif), previous (earlier request, for refinements), safe, thinking, plan_only, stream (SSE).
  It returns { agent_metadata, understanding, summary, images_results: [{ position, score, why, is_gif, title, source, link, thumbnail, original, original_width, original_height }] }.
  It takes 6-20 s, so use a 60 s timeout and show progress, ideally with stream=true (events: status, thinking, understanding, candidates, result, done, error).
- Always fall back to thumbnail if original fails to load. Credit the source with link. De-duplicate on original.
- Errors are JSON { error }. Retry 502/503 with backoff.
Build a search box that calls /api/agent, shows the understanding.summary while loading, then a responsive grid of images with their score.
```

## 14. Troubleshooting

| Problem | Fix |
|---|---|
| `ai_used` is `false` | The AI key is missing or invalid, or the AI service was busy. See `agent_metadata.notes`. Results still return by keyword match. |
| Empty `images_results` from the agent | `min_score` too high for a vague query. Lower it, or describe the image in more detail. |
| 502 "Search failed" | Both search engines refused the request (rate limit). Retry in a few seconds, or set `PROXY_URL` on the server. |
| Images do not load in my page | The source site blocks hotlinking. Use `thumbnail`, or add `referrerpolicy="no-referrer"` to the `<img>`. |
| Browser blocks the request | CORS is enabled. Make sure you call the full URL (`{{BASE}}/api/...`) and use HTTPS from HTTPS pages. |
| Request times out | Use `stream=true`, lower `limit`, or retry. The hosting limit is 60 s. |
