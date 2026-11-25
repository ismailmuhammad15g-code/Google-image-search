$('agentEndpoint').textContent = `${BASE}/api/agent`;
let aLast = null, aUrl = '';
const aParams = () => {
  const p = { q: $('aq').value.trim(), limit: $('alimit').value, min_score: $('amin').value, format: $('afmt').value };
  if ($('agif').checked) p.gif = 'true';
  if ($('aplan').checked) p.plan_only = 'true';
  if ($('athink').checked) p.thinking = 'true';
  return p;
};
const aBuild = () => { const u = new URL('/api/agent', BASE); for (const [k, v] of Object.entries(aParams())) if (v) u.searchParams.set(k, v); return u.toString(); };

$('aform').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('ago').disabled = true;
  $('astatus').className = '';
  $('astatus').textContent = 'The agent is thinking, searching and ranking… (about 6-20 s)';
  $('agrid').innerHTML = '';
  const t0 = Date.now();
  aUrl = aBuild();
  try {
    const res = await fetch(aUrl);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    aLast = data;
    const imgs = data.images_results || [];
    const m = data.agent_metadata;
    $('astatus').textContent = $('aplan').checked ? `Plan ready in ${m.total_time_taken}s` : `${imgs.length} images (of ${m.matches_total ?? 0} matches, ${m.candidates_considered} candidates) in ${m.total_time_taken}s${m.ai_used ? '' : ' · AI unavailable, keyword fallback'}`;
    $('agrid').innerHTML = imgs.map((i) => `<div class="item"><img class="th" loading="lazy" referrerpolicy="no-referrer" src="${esc(i.thumbnail)}" alt="${esc(i.title)}" onerror="this.closest('.item').remove()"><div class="t">${i.score != null ? i.score + '% · ' : ''}${esc(i.title)}</div><div class="s">${esc(i.why || i.source)}</div></div>`).join('');
    $('ajson').textContent = JSON.stringify(data, null, 2);
  } catch (err) {
    $('astatus').className = 'err';
    $('astatus').textContent = err.message;
  } finally {
    $('ago').disabled = false;
  }
});
$('acopyUrl').onclick = () => copyText(aUrl || aBuild(), 'URL copied');
$('acopyCurl').onclick = () => copyText(`curl "${aUrl || aBuild()}"`, 'cURL copied');
$('acopyJson').onclick = () => aLast ? copyText(JSON.stringify(aLast, null, 2), 'JSON copied') : toast('Run the agent first');
