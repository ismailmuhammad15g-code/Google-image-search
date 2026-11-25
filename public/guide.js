const MD = `
## 1. Quick start

No signup and no API key. Send a GET request:

\`\`\`bash
curl "{{BASE}}/api/search?engine=google_images&q=coffee"
\`\`\`

The response is JSON. The images are in \`images_results\`.

## 2. Endpoint

- **URL:** \`{{BASE}}/api/search\`
- **Method:** \`GET\`
- **CORS:** enabled, so you can call it straight from a browser
- **Auth:** none
- **Limits:** none

## 3. Parameters

| Parameter | Required | Description |
|---|---|---|
| q | yes | What to search for. |
| engine | no | Always \`google_images\` (default). |
| ijn | no | Page number starting at 0 (max 50). |
| location | no | Location name, for example \`Austin, Texas, United States\`. List: \`{{BASE}}/api/locations\`. |
| gl / hl | no | Country code (\`us\`) and language code (\`en\`). |
| safe | no | \`moderate\` (default), \`active\` (strict) or \`off\`. |
| imgsz | no | Size: \`l\` large, \`m\` medium, \`i\` icon. |
| image_type | no | \`photo\`, \`clipart\`, \`lineart\`, \`animated\`, \`face\`. |
| image_color | no | \`color\` or \`gray\`. |

## 4. JavaScript example

\`\`\`js
const res = await fetch("{{BASE}}/api/search?engine=google_images&q=" + encodeURIComponent("red car"));
const data = await res.json();
for (const img of data.images_results) {
  console.log(img.title, img.original);
}
\`\`\`

## 5. Python example

\`\`\`python
import requests

r = requests.get("{{BASE}}/api/search", params={"engine": "google_images", "q": "red car"}, timeout=30)
r.raise_for_status()
for img in r.json()["images_results"]:
    print(img["title"], img["original"])
\`\`\`

## 6. Response

\`\`\`json
{
  "search_metadata": { "status": "Success", "total_time_taken": 0.64 },
  "search_parameters": { "engine": "google_images", "q": "coffee", "hl": "en", "gl": "us" },
  "images_results": [
    {
      "position": 1,
      "thumbnail": "https://...small image...",
      "original": "https://...full size image...",
      "original_width": 1920,
      "original_height": 1080,
      "title": "Image title",
      "source": "example.com",
      "source_logo": "https://...favicon...",
      "link": "https://example.com/page-with-the-image",
      "related_content_id": "ABC123",
      "is_product": false
    }
  ]
}
\`\`\`

| Field | Meaning |
|---|---|
| thumbnail | Small preview image, fast to load. |
| original | Full size image URL. Some sites block hotlinking, so fall back to \`thumbnail\` if it fails. |
| link | The web page where the image was found. |
| source | The website the image comes from. |

## 7. Errors

Errors return an HTTP status and JSON like \`{ "error": "Missing query \`q\` parameter." }\`.

| Status | Meaning |
|---|---|
| 400 | Bad or missing parameter. |
| 502 / 503 | The upstream search engine failed or rate limited. Wait a moment and retry. |

## 8. Engines

By default the API queries Bing and DuckDuckGo in parallel, merges, de-duplicates and ranks the results. Force one with \`&backend=bing\` or \`&backend=ddg\`. \`search_metadata.backend\` tells you which answered.

## 9. Tips

- Results are cached for 5 minutes, so repeating a search is instant.
- Use \`encodeURIComponent\` / \`params=\` so special characters in \`q\` are escaped.
- Paging with \`ijn\` can return repeated images, so de-duplicate on \`original\`.
- Be kind: add a short delay between rapid bulk requests so the service stays fast for everybody.
`;

const src = MD.replaceAll('{{BASE}}', BASE).trim();

function inline(s) {
  return esc(s).replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
}

function render(md) {
  const out = [];
  const lines = md.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (l.startsWith('```')) {
      const buf = [];
      for (i++; i < lines.length && !lines[i].startsWith('```'); i++) buf.push(lines[i]);
      out.push(`<div class="codeblock"><button class="copy" type="button">Copy</button><pre>${esc(buf.join('\n'))}</pre></div>`);
    } else if (l.startsWith('## ')) out.push(`<h2>${inline(l.slice(3))}</h2>`);
    else if (l.startsWith('|')) {
      const rows = [];
      for (; i < lines.length && lines[i].startsWith('|'); i++) rows.push(lines[i]);
      i--;
      const cells = (r) => r.split('|').slice(1, -1).map((c) => c.trim());
      const [head, , ...body] = rows;
      out.push(`<table><tr>${cells(head).map((c) => `<th>${inline(c)}</th>`).join('')}</tr>${body.map((r) => `<tr>${cells(r).map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`).join('')}</table>`);
    } else if (l.startsWith('- ')) {
      const items = [];
      for (; i < lines.length && lines[i].startsWith('- '); i++) items.push(lines[i].slice(2));
      i--;
      out.push(`<ul>${items.map((x) => `<li>${inline(x)}</li>`).join('')}</ul>`);
    } else if (l.trim()) out.push(`<p>${inline(l)}</p>`);
  }
  return out.join('\n');
}

$('doc').innerHTML = render(src);
$('doc').addEventListener('click', (e) => {
  const b = e.target.closest('.copy');
  if (b) copyText(b.parentElement.querySelector('pre').textContent, 'Code copied');
});
const FULL = `# Image Search API – Developer Guide\n\nBase URL: ${BASE}\nFree, unlimited, no API key.\n\n${src}\n`;
$('copyPage').addEventListener('click', () => copyText(FULL, 'Guide copied!'));
