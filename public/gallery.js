/* Shared masonry gallery + lightbox used by Image Search and the AI Agent. */
(function () {
  const css = document.createElement('style');
  css.textContent = '.tile.fixed img{height:100%;object-fit:cover}';
  document.head.appendChild(css);

  const lb = document.createElement('div');
  lb.className = 'lb';
  lb.setAttribute('role', 'dialog');
  lb.setAttribute('aria-modal', 'true');
  lb.setAttribute('aria-label', 'Image viewer');
  lb.innerHTML = `<button class="x" aria-label="Close">&times;</button>
    <button class="nav prev" aria-label="Previous">&#8249;</button><button class="nav next" aria-label="Next">&#8250;</button>
    <div class="stage"><div class="spin"></div><img alt=""></div>
    <div class="cap"><h4></h4><div class="meta"></div><div class="row"></div></div>`;
  document.body.appendChild(lb);
  const q = (s) => lb.querySelector(s);
  const imgEl = q('.stage img'), spin = q('.spin');
  let list = [], cur = -1, onSimilar = null, token = 0, lastFocus = null;

  function show(n) {
    if (n < 0 || n >= list.length) return;
    cur = n;
    const i = list[n], t = ++token;
    imgEl.classList.add('loading');
    spin.style.display = '';
    imgEl.onload = () => { if (t === token) { imgEl.classList.remove('loading'); spin.style.display = 'none'; } };
    imgEl.onerror = () => {
      if (t !== token) return;
      if (imgEl.src !== i.thumbnail) imgEl.src = i.thumbnail; // some sites block hotlinking: fall back to the preview
      else { spin.style.display = 'none'; imgEl.classList.remove('loading'); }
    };
    imgEl.referrerPolicy = 'no-referrer';
    imgEl.src = i.original || i.thumbnail;
    imgEl.alt = i.title || '';
    q('h4').textContent = i.title || i.source || 'Image';
    const dim = i.original_width && i.original_height ? `${i.original_width}×${i.original_height} · ` : '';
    q('.meta').innerHTML = `${dim}${esc(i.source)}${i.score != null ? ` · <b style="color:#d4f14f">${i.score}% match</b>` : ''}${i.why ? `<br>${esc(i.why)}` : ''}`;
    const fav = Favs.has(i.original);
    q('.row').innerHTML = `
      <button class="btn sm" data-a="fav">${I.heart}${fav ? 'Saved' : 'Save'}</button>
      <button class="btn sm ghost" data-a="dl">${I.down}Download</button>
      <a class="btn sm ghost" href="${esc(i.link || i.original)}" target="_blank" rel="noopener">${I.ext}Source page</a>
      <button class="btn sm ghost" data-a="copy">${I.copy}Copy URL</button>
      ${onSimilar ? `<button class="btn sm ghost" data-a="sim">${I.search}Find similar</button>` : ''}`;
    q('.prev').style.display = n > 0 ? '' : 'none';
    q('.next').style.display = n < list.length - 1 ? '' : 'none';
    // warm the neighbours
    for (const k of [n + 1, n - 1]) if (list[k]) new Image().src = list[k].thumbnail;
  }
  function open(items, n, similar) {
    list = items; onSimilar = similar || null; lastFocus = document.activeElement;
    lb.classList.add('open'); document.documentElement.style.overflow = 'hidden';
    show(n); q('.x').focus();
  }
  function close() {
    lb.classList.remove('open'); document.documentElement.style.overflow = '';
    token++; imgEl.removeAttribute('src'); cur = -1; lastFocus?.focus?.();
  }
  async function download(i) {
    try {
      const r = await fetch(i.original, { referrerPolicy: 'no-referrer' });
      if (!r.ok) throw 0;
      const b = await r.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(b);
      a.download = (i.title || 'image').replace(/[^\w\- ]+/g, '').trim().slice(0, 60).replace(/\s+/g, '-') + '.' + ((b.type.split('/')[1] || 'jpg').replace('jpeg', 'jpg').split('+')[0]);
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      toast('Download started');
    } catch {
      window.open(i.original, '_blank', 'noopener');
      toast('Opened the original (site blocks direct download)');
    }
  }
  q('.x').onclick = close;
  q('.prev').onclick = () => show(cur - 1);
  q('.next').onclick = () => show(cur + 1);
  lb.addEventListener('click', (e) => { if (e.target === lb || e.target.classList.contains('stage')) close(); });
  q('.row').addEventListener('click', (e) => {
    const b = e.target.closest('[data-a]');
    if (!b) return;
    const i = list[cur];
    if (b.dataset.a === 'fav') { toast(Favs.toggle(i) ? 'Saved to favorites' : 'Removed from favorites'); show(cur); document.dispatchEvent(new CustomEvent('favs-changed')); }
    else if (b.dataset.a === 'dl') download(i);
    else if (b.dataset.a === 'copy') copyText(i.original, 'Image URL copied');
    else if (b.dataset.a === 'sim') { const fn = onSimilar; close(); fn(i); }
  });
  document.addEventListener('keydown', (e) => {
    if (cur < 0) return;
    if (e.key === 'Escape') close();
    else if (e.key === 'ArrowLeft') show(cur - 1);
    else if (e.key === 'ArrowRight') show(cur + 1);
  });
  let sx = 0;
  lb.addEventListener('touchstart', (e) => { sx = e.touches[0].clientX; }, { passive: true });
  lb.addEventListener('touchend', (e) => { const d = e.changedTouches[0].clientX - sx; if (Math.abs(d) > 60) show(cur + (d < 0 ? 1 : -1)); }, { passive: true });

  /** Build a gallery inside `el`. */
  window.createGallery = function (el, { onSimilar: sim } = {}) {
    const g = { items: [], el };
    const tile = (i, n, delay) => {
      const ratio = i.original_width && i.original_height ? Math.min(2.2, Math.max(0.5, i.original_width / i.original_height)) : 0;
      const fav = Favs.has(i.original);
      return `<figure class="tile${ratio ? ' fixed' : ''}" data-n="${n}" tabindex="0" style="animation-delay:${delay}ms${ratio ? `;aspect-ratio:${ratio.toFixed(3)}` : ''}">
        <img loading="lazy" decoding="async" referrerpolicy="no-referrer" src="${esc(i.thumbnail)}" alt="${esc(i.title || i.source)}">
        ${i.score != null ? `<span class="score">${i.score}%</span>` : ''}
        <div class="acts"><button class="ibtn fav${fav ? ' on' : ''}" data-a="fav" aria-label="Save">${I.heart}</button><button class="ibtn" data-a="open" aria-label="Open source page">${I.ext}</button></div>
        <figcaption class="ov"><span class="t">${esc(i.title || i.source)}</span><span class="s">${esc(i.source)}${i.original_width ? ` · ${i.original_width}×${i.original_height}` : ''}</span>${i.why ? `<span class="why">${esc(i.why)}</span>` : ''}</figcaption></figure>`;
    };
    g.skeleton = (n = 12) => {
      el.innerHTML = Array.from({ length: n }, (_, k) => `<div class="skeltile skel" style="height:${150 + ((k * 67) % 150)}px;animation-delay:${k * 40}ms"></div>`).join('');
      g.items = [];
    };
    g.clear = () => { el.innerHTML = ''; g.items = []; };
    g.append = (items) => {
      const base = g.items.length;
      g.items = g.items.concat(items);
      el.insertAdjacentHTML('beforeend', items.map((i, k) => tile(i, base + k, Math.min(k, 14) * 45)).join(''));
    };
    g.set = (items) => { g.clear(); g.append(items); };
    el.addEventListener('load', (e) => { if (e.target.tagName === 'IMG') e.target.classList.add('ld'); }, true);
    el.addEventListener('error', (e) => {
      if (e.target.tagName !== 'IMG') return;
      const t = e.target.closest('.tile');
      if (t) { t.remove(); el.dispatchEvent(new CustomEvent('tile-removed')); } // dead image: never show broken tiles
    }, true);
    const openAt = (t) => { const vis = [...el.querySelectorAll('.tile')]; const items = vis.map((x) => g.items[+x.dataset.n]); lbOpen(items, vis.indexOf(t)); };
    const lbOpen = (items, idx) => open(items, idx, sim);
    el.addEventListener('click', (e) => {
      const t = e.target.closest('.tile');
      if (!t) return;
      const i = g.items[+t.dataset.n];
      const a = e.target.closest('[data-a]');
      if (a?.dataset.a === 'fav') {
        e.stopPropagation();
        const on = Favs.toggle(i);
        a.classList.toggle('on', on);
        toast(on ? 'Saved to favorites' : 'Removed from favorites');
        document.dispatchEvent(new CustomEvent('favs-changed'));
      } else if (a?.dataset.a === 'open') window.open(i.link || i.original, '_blank', 'noopener');
      else openAt(t);
    });
    el.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.classList?.contains('tile')) openAt(e.target); });
    return g;
  };
})();
