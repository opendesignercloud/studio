/* Open Designer Cloud Studio: Merge PDF.
   Runs entirely in the visitor's browser; the PDFs are never uploaded. Thumbnails come from PDF.js (Apache 2.0) and the merged file is
   written by pdf-lib (MIT); both are in /assets/studio/vendor/. */
const MAX_FILES = 20, MAX_BYTES = 100 * 1024 * 1024, MAX_PAGES = 1000, THUMB_W = 180;

const $ = (id) => document.getElementById(id);
const el = { work: $('work'), stage: $('stage'), drop: $('drop'), file: $('file'), busy: $('busy'), busyText: $('busyText'), busySub: $('busySub'), bar: $('bar'), grid: $('grid'), panel: $('panel'),
  count: $('count'), files: $('files'), add: $('add'), clear: $('clear'), reverse: $('reverse'), name: $('name'), download: $('download'), status: $('status'), meta: $('meta') };
const track = (event, props) => { if (window.OCX && window.OCX.track) window.OCX.track(event, Object.assign({ tool: 'merge-pdf' }, props)); };
const state = { files: [], pages: [], busy: false, nextId: 1 };
let dragFrom = -1, thumbQueue = [], thumbActive = 0;

function say(msg, isError) { el.status.textContent = msg || ''; el.status.classList.toggle('is-error', !!isError); }
function setState(s) { el.work.dataset.state = s; el.drop.hidden = s !== 'empty'; el.grid.hidden = s === 'empty'; el.panel.hidden = s !== 'ready'; el.busy.hidden = s !== 'working'; }
function setBusy(text, sub, progress) {
  el.busyText.textContent = text; el.busySub.textContent = sub || '';
  const ind = progress == null; el.bar.classList.toggle('is-indeterminate', ind); el.bar.firstElementChild.style.width = ind ? '' : Math.round(progress * 100) + '%';
}
const tick = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
const fmtMB = (n) => (n >= 10 ? Math.round(n) : n.toFixed(1)) + ' MB';
const plural = (n, w) => n + ' ' + w + (n === 1 ? '' : 's');
const fileOf = (id) => state.files.find((f) => f.id === id);

// ── Thumbnails (rendered a few at a time, only when scrolled into view) ─────
const seen = typeof IntersectionObserver === 'function' ? new IntersectionObserver((entries) => entries.forEach((e) => { if (e.isIntersecting) { seen.unobserve(e.target); queueThumb(e.target); } }), { rootMargin: '300px' }) : null;
function queueThumb(card) { thumbQueue.push(card); pump(); }
function pump() {
  while (thumbActive < 2 && thumbQueue.length) {
    const card = thumbQueue.shift(); if (!card.isConnected) continue;
    thumbActive++; drawThumb(card).catch(() => {}).then(() => { thumbActive--; pump(); });
  }
}
async function drawThumb(card) {
  const pg = state.pages[+card.dataset.i]; if (!pg || card.dataset.drawn) return;
  const f = fileOf(pg.file), page = await f.doc.getPage(pg.index + 1), v1 = page.getViewport({ scale: 1 }), scale = THUMB_W * (window.devicePixelRatio > 1 ? 2 : 1) / v1.width, vp = page.getViewport({ scale });
  const c = card.querySelector('canvas'); c.width = Math.round(vp.width); c.height = Math.round(vp.height);
  card.querySelector('.mp-thumb').style.aspectRatio = v1.width + ' / ' + v1.height; pg.w = v1.width; pg.h = v1.height;
  await page.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise; card.dataset.drawn = '1'; pg.thumb = c; page.cleanup();
}

// ── Page grid ──────────────────────────────────────────────────────────────
function btn(label, text, cls, fn) { const b = document.createElement('button'); b.type = 'button'; b.className = 'mp-b ' + (cls || ''); b.setAttribute('aria-label', label); b.title = label; b.textContent = text; b.onclick = (e) => { e.stopPropagation(); fn(); }; return b; }
function render() {
  thumbQueue = [];
  const n = state.pages.length;
  el.grid.replaceChildren(...state.pages.map((pg, i) => {
    const f = fileOf(pg.file), card = document.createElement('div'); card.className = 'mp-card'; card.dataset.i = i; card.draggable = true;
    card.innerHTML = '<div class="mp-thumb"><canvas width="2" height="2"></canvas></div><div class="mp-info"><span class="mp-num"></span><span class="mp-src"></span></div><div class="mp-tools"></div>';
    card.querySelector('.mp-num').textContent = i + 1;
    const src = card.querySelector('.mp-src'); src.textContent = f.name + ' · p' + (pg.index + 1); src.title = f.name + ', page ' + (pg.index + 1);
    if (pg.thumb) { const old = card.querySelector('canvas'); old.replaceWith(pg.thumb); card.dataset.drawn = '1'; if (pg.w) card.querySelector('.mp-thumb').style.aspectRatio = pg.w + ' / ' + pg.h; }
    card.querySelector('canvas').style.transform = 'rotate(' + pg.rot + 'deg)';
    const t = card.querySelector('.mp-tools');
    t.append(btn('Move earlier', '←', '', () => move(i, i - 1)), btn('Rotate', '↻', '', () => { pg.rot = (pg.rot + 90) % 360; render(); }), btn('Remove page', '✕', 'mp-x', () => removePage(i)), btn('Move later', '→', '', () => move(i, i + 1)));
    t.children[0].disabled = i === 0; t.children[3].disabled = i === n - 1;
    card.addEventListener('dragstart', (e) => { dragFrom = i; card.classList.add('is-drag'); try { e.dataTransfer.setData('text/plain', 'page'); e.dataTransfer.effectAllowed = 'move'; } catch (x) {} });
    card.addEventListener('dragend', () => { dragFrom = -1; card.classList.remove('is-drag'); el.grid.querySelectorAll('.is-target').forEach((c) => c.classList.remove('is-target')); });
    card.addEventListener('dragover', (e) => { if (dragFrom < 0) return; e.preventDefault(); card.classList.add('is-target'); });
    card.addEventListener('dragleave', () => card.classList.remove('is-target'));
    card.addEventListener('drop', (e) => { if (dragFrom < 0) return; e.preventDefault(); e.stopPropagation(); const from = dragFrom; dragFrom = -1; move(from, i); });
    if (card.dataset.drawn) return card;
    if (seen) seen.observe(card); else queueThumb(card);
    return card;
  }));
  const used = new Set(state.pages.map((p) => p.file));
  el.count.textContent = plural(n, 'page') + ' from ' + plural(used.size, 'file');
  el.files.replaceChildren(...state.files.filter((f) => used.has(f.id) || true).map((f) => {
    const li = document.createElement('li'), c = state.pages.filter((p) => p.file === f.id).length;
    const s = document.createElement('span'); s.textContent = f.name; s.title = f.name; const m = document.createElement('small'); m.textContent = c + ' of ' + f.pageCount + ' pages';
    const rm = btn('Remove ' + f.name, '✕', 'mp-x', () => removeFile(f.id)); li.append(s, m, rm); return li;
  }));
  el.download.disabled = !n; el.reverse.disabled = n < 2;
}
function move(from, to) {
  if (to < 0 || to >= state.pages.length || from === to) return;
  const [p] = state.pages.splice(from, 1); state.pages.splice(to, 0, p); render();
}
function removePage(i) { state.pages.splice(i, 1); afterRemove(); }
function removeFile(id) { state.pages = state.pages.filter((p) => p.file !== id); const f = fileOf(id); if (f && f.doc) f.doc.destroy(); state.files = state.files.filter((x) => x.id !== id); afterRemove(); }
function afterRemove() { if (!state.pages.length) startOver(); else render(); }
function startOver() { state.files.forEach((f) => f.doc && f.doc.destroy()); state.files = []; state.pages = []; thumbQueue = []; el.file.value = ''; say(''); setState('empty'); el.drop.focus(); }

// ── Loading PDFs ───────────────────────────────────────────────────────────
async function addFiles(list) {
  const incoming = [...(list || [])]; if (!incoming.length || state.busy) return;
  const access = await (window.OCX && window.OCX.access); if (access && access.allowed === false) return;
  if (!window.pdfjsLib || !window.PDFLib) return say('The PDF tools are still loading. Please try again in a moment.', true);
  state.busy = true; say(''); const first = !state.files.length;
  if (first) setState('working'); setBusy('Reading your PDFs', '', null); el.busy.hidden = false; await tick();
  const problems = []; let total = state.pages.length;
  for (const file of incoming) {
    if (!/pdf/i.test(file.type) && !/\.pdf$/i.test(file.name)) { problems.push(file.name + ' (not a PDF)'); continue; }
    if (file.size > MAX_BYTES) { problems.push(file.name + ' (' + fmtMB(file.size / 1048576) + ' is over the ' + fmtMB(MAX_BYTES / 1048576) + ' limit)'); continue; }
    if (state.files.length >= MAX_FILES) { problems.push(file.name + ' (only ' + MAX_FILES + ' PDFs at a time)'); continue; }
    try {
      setBusy('Reading your PDFs', file.name, null); await tick();
      const bytes = await file.arrayBuffer(), doc = await pdfjsLib.getDocument({ data: bytes.slice(0) }).promise;
      if (total + doc.numPages > MAX_PAGES) { doc.destroy(); problems.push(file.name + ' (that would be over ' + MAX_PAGES + ' pages in total)'); continue; }
      const f = { id: state.nextId++, name: file.name, bytes, doc, pageCount: doc.numPages }; state.files.push(f);
      for (let i = 0; i < doc.numPages; i++) state.pages.push({ file: f.id, index: i, rot: 0 });
      total += doc.numPages;
    } catch (e) {
      problems.push(file.name + (e && e.name === 'PasswordException' ? ' (password-protected PDFs are not supported)' : ' (could not be opened)'));
    }
  }
  state.busy = false;
  if (!state.pages.length) { setState('empty'); say(problems.length ? 'Nothing could be opened: ' + problems.join('; ') + '.' : '', true); return; }
  setState('ready'); render();
  if (problems.length) say('Skipped: ' + problems.join('; ') + '.', true);
  else if (first) say('Drag pages to reorder them, or use the arrow buttons. Remove any page you do not want.');
}

// ── Merging ────────────────────────────────────────────────────────────────
function saveBlob(blob, name) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); }
const outName = () => ((el.name.value || 'merged').replace(/\.pdf$/i, '').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-') || 'merged') + '.pdf';
async function merge() {
  if (state.busy || !state.pages.length) return;
  state.busy = true; setState('working'); setBusy('Merging your PDFs', '', 0); await tick();
  const t0 = performance.now();
  try {
    const { PDFDocument, degrees } = PDFLib, out = await PDFDocument.create(), srcs = new Map();
    for (const f of state.files) { if (state.pages.some((p) => p.file === f.id)) srcs.set(f.id, await PDFDocument.load(f.bytes.slice(0), { ignoreEncryption: false, updateMetadata: false })); }
    for (let i = 0; i < state.pages.length; i++) {
      const pg = state.pages[i], [copy] = await out.copyPages(srcs.get(pg.file), [pg.index]);
      if (pg.rot) copy.setRotation(degrees((copy.getRotation().angle + pg.rot) % 360));
      out.addPage(copy);
      if (i % 5 === 4) { setBusy('Merging your PDFs', 'Page ' + (i + 1) + ' of ' + state.pages.length + '.', (i + 1) / state.pages.length); await tick(); }
    }
    out.setProducer('Open Designer Cloud Studio'); out.setCreator('Open Designer Cloud Studio');
    const bytes = await out.save(), blob = new Blob([bytes], { type: 'application/pdf' }), name = outName();
    saveBlob(blob, name); say('Saved ' + name + ' (' + plural(state.pages.length, 'page') + ', ' + fmtMB(blob.size / 1048576) + ').');
    track('use', { ok: 1, ms: Math.round(performance.now() - t0) }); track('download', { fmt: 'pdf' });
  } catch (e) {
    console.error(e); track('use', { ok: 0 });
    say(/memory|alloc/i.test(String(e)) ? 'Your device ran out of memory. Try fewer or smaller PDFs.' : 'The PDFs could not be merged. One of them may be damaged or protected.', true);
  } finally { state.busy = false; setState('ready'); render(); }
}

// ── Setup ──────────────────────────────────────────────────────────────────
function init() {
  if (window.pdfjsLib) pdfjsLib.GlobalWorkerOptions.workerSrc = '/assets/studio/vendor/pdf.worker.min.js';
  el.drop.addEventListener('click', () => el.file.click()); el.add.addEventListener('click', () => el.file.click());
  el.file.addEventListener('change', () => { addFiles(el.file.files); el.file.value = ''; });
  ['dragenter', 'dragover'].forEach((t) => el.stage.addEventListener(t, (e) => { if (dragFrom < 0) { e.preventDefault(); el.stage.classList.add('is-over'); } }));
  ['dragleave', 'drop'].forEach((t) => el.stage.addEventListener(t, (e) => { el.stage.classList.remove('is-over'); }));
  el.stage.addEventListener('drop', (e) => { if (dragFrom >= 0) return; e.preventDefault(); addFiles(e.dataTransfer && e.dataTransfer.files); });
  document.addEventListener('dragover', (e) => e.preventDefault()); document.addEventListener('drop', (e) => e.preventDefault());
  el.clear.onclick = startOver; el.download.onclick = merge;
  el.reverse.onclick = () => { state.pages.reverse(); render(); };
  setState('empty'); document.documentElement.dataset.ocxReady = '1';
}
init();
