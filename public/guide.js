/* Developer guide: loads /guide.md, renders it with a TOC, per-section copy buttons and "copy whole page". */
const slug = (t) => t.toLowerCase().replace(/^\d+\.\s*/, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

function inline(s) {
  return esc(s)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
    .replace(/\[([^\]]+)\]\((\/[^)\s]*|https?:\/\/[^)\s]+)\)/g, '<a href="$2">$1</a>');
}

function render(md) {
  const out = [];
  const lines = md.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (l.startsWith('```')) {
      const lang = l.slice(3).trim();
      const buf = [];
      for (i++; i < lines.length && !lines[i].startsWith('```'); i++) buf.push(lines[i]);
      out.push(`<div class="codeblock"><span class="lang">${esc(lang)}</span><button class="copy" type="button">Copy</button><pre>${esc(buf.join('\n'))}</pre></div>`);
    } else if (l.startsWith('### ')) out.push(`<h3>${inline(l.slice(4))}</h3>`);
    else if (l.startsWith('|')) {
      const rows = [];
      for (; i < lines.length && lines[i].startsWith('|'); i++) rows.push(lines[i]);
      i--;
      const cells = (r) => r.split('|').slice(1, -1).map((c) => c.trim());
      const [head, , ...body] = rows;
      out.push(`<div class="tablewrap"><table><tr>${cells(head).map((c) => `<th>${inline(c)}</th>`).join('')}</tr>${body.map((r) => `<tr>${cells(r).map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`).join('')}</table></div>`);
    } else if (l.startsWith('- ')) {
      const items = [];
      for (; i < lines.length && lines[i].startsWith('- '); i++) items.push(lines[i].slice(2));
      i--;
      out.push(`<ul>${items.map((x) => `<li>${inline(x)}</li>`).join('')}</ul>`);
    } else if (l.trim()) out.push(`<p>${inline(l)}</p>`);
  }
  return out.join('\n');
}

(async function init() {
  let src;
  try {
    src = (await fetch('/guide.md').then((r) => { if (!r.ok) throw 0; return r.text(); })).replaceAll('{{BASE}}', BASE).trim();
  } catch {
    $('doc').innerHTML = '<p>Could not load the guide. Please refresh.</p>';
    return;
  }
  // split into "## " sections
  const sections = src.split(/\n(?=## )/).map((raw) => {
    const [first, ...rest] = raw.split('\n');
    const title = first.replace(/^##\s*/, '');
    return { title, id: slug(title), raw, body: rest.join('\n') };
  });
  $('toc').innerHTML = sections.map((s) => `<a href="#${s.id}">${esc(s.title)}</a>`).join('');
  $('doc').innerHTML = sections.map((s) => `<section class="gsec" id="${s.id}" data-id="${s.id}">
      <div class="gh"><h2>${inline(s.title)}</h2><button class="btn sm ghost seccopy" type="button" data-id="${s.id}">${I.copy}Copy section</button></div>
      ${render(s.body)}</section>`).join('');

  $('doc').addEventListener('click', (e) => {
    const c = e.target.closest('.copy');
    if (c) return copyText(c.parentElement.querySelector('pre').textContent, 'Code copied');
    const sc = e.target.closest('.seccopy');
    if (sc) copyText(sections.find((s) => s.id === sc.dataset.id).raw + '\n', 'Section copied');
  });
  const FULL = `# Lemon Lens - Image Search & AI Agent API (Developer Guide)\n\nBase URL: ${BASE}\nFree, unlimited. OpenAPI spec: ${BASE}/openapi.json\n\n${src}\n`;
  $('copyPage').addEventListener('click', () => copyText(FULL, 'Whole guide copied!'));
  $('copyOpenapi').addEventListener('click', async () => {
    try { copyText(JSON.stringify(await fetch('/openapi.json').then((r) => r.json()), null, 2), 'OpenAPI spec copied'); } catch { toast('Could not load the spec'); }
  });

  // highlight the current section in the TOC
  const links = [...$('toc').querySelectorAll('a')];
  const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) links.forEach((a) => a.classList.toggle('on', a.getAttribute('href') === '#' + e.target.id)); }), { rootMargin: '-20% 0px -70% 0px' });
  document.querySelectorAll('.gsec').forEach((s) => io.observe(s));
  if (location.hash) document.getElementById(location.hash.slice(1))?.scrollIntoView();
})();
