/* Open Designer Cloud Studio: image converter.
   Converts PNG, JPG, WebP, AVIF, GIF, BMP and SVG images to PNG, JPG, WebP or AVIF entirely in the browser.
   Nothing is uploaded. Batch conversion, quality, a size limit and a ZIP download (built here, no library). */
const TOOL = 'convert-image';
const MAX_FILES = 40;
const MAX_BYTES = 60 * 1024 * 1024;   // per file
const HARD_MAX_SIDE = 8192;           // browsers cap canvas size; keep well inside it
const SVG_SIDE = 2048;                // vector images are rasterised at this longest side (unless limited)
const FORMATS = {
  png:  { mime: 'image/png',  ext: 'png',  lossy: false, hint: 'Lossless and keeps transparency. Best for graphics, logos and screenshots.' },
  jpg:  { mime: 'image/jpeg', ext: 'jpg',  lossy: true,  hint: 'Smallest for photos and works everywhere. No transparency: transparent areas are filled with the background colour.' },
  webp: { mime: 'image/webp', ext: 'webp', lossy: true,  hint: 'Smaller than JPG and PNG and keeps transparency. Supported by all modern browsers.' },
  avif: { mime: 'image/avif', ext: 'avif', lossy: true,  hint: 'The smallest files, with transparency. A newer format, so some apps cannot open it yet.' }
};
const BG = [['#ffffff', 'White'], ['#000000', 'Black'], ['#8758c1', 'Purple'], ['#f5c542', 'Yellow']];

const $ = (id) => document.getElementById(id);
const el = {
  work: $('work'), stage: $('stage'), drop: $('drop'), file: $('file'), files: $('files'), list: $('list'), summary: $('summary'),
  addMore: $('addMore'), clear: $('clear'), panel: $('panel'), seg: $('formatSeg'), hint: $('formatHint'),
  qField: $('qField'), quality: $('quality'), qOut: $('qOut'), maxSide: $('maxSide'), bgField: $('bgField'), swatches: $('swatches'),
  zip: $('zip'), status: $('status')
};
const state = { format: 'webp', quality: 85, maxSide: 0, bg: '#ffffff', items: [], run: 0, timer: 0, nextId: 1, supported: {} };
const track = (event, props) => { if (window.OCX && window.OCX.track) window.OCX.track(event, Object.assign({ tool: TOOL }, props)); };

// ── helpers ────────────────────────────────────────────────────────────────
function say(msg, isError) { el.status.textContent = msg || ''; el.status.classList.toggle('is-error', !!isError); }
const fmtBytes = (n) => n >= 1048576 ? (n / 1048576).toFixed(n >= 10485760 ? 0 : 1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB';
function canEncode(mime) {
  if (mime === 'image/png' || mime === 'image/jpeg') return true;
  const c = document.createElement('canvas'); c.width = c.height = 2;
  return c.toDataURL(mime).indexOf('data:' + mime) === 0;
}
const isSvg = (f) => f.type === 'image/svg+xml' || /\.svg$/i.test(f.name);
const baseName = (n) => (n || 'image').replace(/\.[^.]+$/, '').replace(/[^\w\-. ]+/g, '').trim().replace(/\s+/g, '-') || 'image';
const toBlob = (canvas, mime, q) => new Promise((res) => canvas.toBlob(res, mime, q));

async function decode(file) {
  if (!isSvg(file)) {
    try { return await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch (e) { /* fall through to <img> */ }
  }
  return await new Promise((res, rej) => {
    const u = URL.createObjectURL(file), im = new Image();
    im.onload = () => { URL.revokeObjectURL(u); res(im); };
    im.onerror = () => { URL.revokeObjectURL(u); rej(new Error('decode')); };
    im.src = u;
  });
}

// ── one conversion ─────────────────────────────────────────────────────────
async function convertOne(item, o) {
  const t0 = performance.now();
  const f = FORMATS[o.format];
  const src = await decode(item.file);
  let w = src.width || src.naturalWidth, h = src.height || src.naturalHeight;
  if (!w || !h) { w = 1024; h = 1024; }
  const limit = Math.min(o.maxSide || Infinity, HARD_MAX_SIDE);
  let scale = isSvg(item.file) ? SVG_SIDE / Math.max(w, h) : 1;
  if (Math.max(w, h) * scale > limit) scale = limit / Math.max(w, h);
  const cw = Math.max(1, Math.round(w * scale)), ch = Math.max(1, Math.round(h * scale));
  const c = document.createElement('canvas'); c.width = cw; c.height = ch;
  const g = c.getContext('2d');
  if (o.format === 'jpg') { g.fillStyle = o.bg; g.fillRect(0, 0, cw, ch); }
  g.imageSmoothingQuality = 'high';
  g.drawImage(src, 0, 0, cw, ch);
  // small preview, made from the same canvas before it is released
  const tc = document.createElement('canvas'); tc.width = tc.height = 112;
  const side = Math.min(cw, ch);
  tc.getContext('2d').drawImage(c, (cw - side) / 2, (ch - side) / 2, side, side, 0, 0, 112, 112);
  const thumb = tc.toDataURL('image/png');
  const blob = await toBlob(c, f.mime, f.lossy ? o.quality / 100 : undefined);
  c.width = c.height = 0;
  if (src.close) src.close();
  if (!blob || blob.type !== f.mime) throw new Error('encode');
  return { blob, thumb, w: cw, h: ch, srcMP: +(w * h / 1e6).toFixed(2), ms: Math.round(performance.now() - t0) };
}

// ── list UI ────────────────────────────────────────────────────────────────
function rowFor(it) {
  if (it.row) return it.row;
  const li = document.createElement('li'); li.className = 'ocx-file';
  li.innerHTML = '<img class="ocx-file-thumb" alt="" width="56" height="56"><div class="ocx-file-main"><div class="ocx-file-name"></div><div class="ocx-file-meta"></div></div>' +
    '<div class="ocx-file-actions"><button type="button" class="ocx-btn ocx-dl" hidden>Download</button><button type="button" class="ocx-x" aria-label="Remove"></button></div>';
  li.querySelector('.ocx-x').textContent = '×';
  li.querySelector('.ocx-x').onclick = () => removeItem(it);
  li.querySelector('.ocx-dl').onclick = () => download(it);
  return (it.row = li);
}
function paint(it) {
  const li = rowFor(it), meta = li.querySelector('.ocx-file-meta'), dl = li.querySelector('.ocx-dl'), th = li.querySelector('.ocx-file-thumb');
  li.classList.toggle('is-error', it.status === 'error');
  li.querySelector('.ocx-file-name').textContent = it.status === 'done' ? it.outName : it.file.name;
  if (it.thumb) th.src = it.thumb;
  dl.hidden = it.status !== 'done';
  meta.textContent = '';
  if (it.status === 'queued') meta.textContent = 'Waiting…';
  else if (it.status === 'working') { const s = document.createElement('span'); s.className = 'ocx-spin'; meta.append(s, 'Converting…'); }
  else if (it.status === 'error') meta.textContent = it.error;
  else {
    const diff = Math.round((1 - it.out.blob.size / it.file.size) * 100);
    meta.append(fmtBytes(it.file.size) + ' → ' + fmtBytes(it.out.blob.size) + '  ');
    const b = document.createElement('b'); b.className = diff >= 0 ? 'save' : 'grow'; b.textContent = diff >= 0 ? '−' + diff + '%' : '+' + Math.abs(diff) + '%'; meta.append(b);
    meta.append('  ·  ' + it.out.w + ' × ' + it.out.h + ' px');
  }
}
function summarize() {
  const done = state.items.filter((i) => i.status === 'done');
  const before = done.reduce((a, i) => a + i.file.size, 0), after = done.reduce((a, i) => a + i.out.blob.size, 0);
  const n = state.items.length;
  let s = n + (n === 1 ? ' image' : ' images');
  if (done.length) { const d = Math.round((1 - after / before) * 100); s += '  ·  ' + fmtBytes(before) + ' → ' + fmtBytes(after) + (d >= 0 ? ' (−' + d + '%)' : ' (+' + Math.abs(d) + '%)'); }
  el.summary.textContent = s;
  el.zip.hidden = done.length < 2;
  el.zip.textContent = 'Download all (' + done.length + ') as ZIP';
}
function setView() {
  const has = state.items.length > 0;
  el.work.dataset.state = has ? 'ready' : 'empty';
  el.drop.hidden = has; el.files.hidden = !has; el.panel.hidden = !has;
  el.stage.classList.toggle('has-files', has);
}
function removeItem(it) {
  state.items = state.items.filter((x) => x !== it);
  if (it.row) it.row.remove();
  setView(); summarize();
  if (!state.items.length) { state.run++; say(''); }
}

// ── queue ──────────────────────────────────────────────────────────────────
function addFiles(fileList) {
  const files = [...fileList];
  if (!files.length) return;
  (async () => {
    const access = await (window.OCX && window.OCX.access);
    if (access && access.allowed === false) return;
    let added = 0, notes = [];
    for (const f of files) {
      const label = (f.type || '') + ' ' + f.name;
      if (state.items.length >= MAX_FILES) { notes.push('Only ' + MAX_FILES + ' images can be converted at a time.'); break; }
      if (/hei[cf]/i.test(label)) { notes.push('HEIC photos are not supported by browsers yet. Export them as JPG or PNG first.'); continue; }
      if (!/^image\//.test(f.type) && !/\.(png|jpe?g|webp|avif|gif|bmp|svg)$/i.test(f.name)) { notes.push('"' + f.name + '" is not an image.'); continue; }
      if (f.size > MAX_BYTES) { notes.push('"' + f.name + '" is larger than ' + fmtBytes(MAX_BYTES) + '.'); continue; }
      const it = { id: state.nextId++, file: f, status: 'queued', tracked: false };
      state.items.push(it); el.list.appendChild(rowFor(it)); paint(it); added++;
    }
    say(notes.length ? notes[0] + (notes.length > 1 ? ' (+' + (notes.length - 1) + ' more messages)' : '') : '', notes.length > 0 && !added);
    setView(); summarize();
    if (added) schedule(0);
  })();
}
function schedule(delay) { clearTimeout(state.timer); state.timer = setTimeout(convertAll, delay); }
async function convertAll() {
  const my = ++state.run;
  const o = { format: state.format, quality: state.quality, maxSide: state.maxSide, bg: state.bg };
  for (const it of state.items) { it.status = 'queued'; paint(it); }
  for (const it of state.items.slice()) {
    if (my !== state.run) return;
    if (!state.items.includes(it)) continue;
    it.status = 'working'; paint(it);
    try {
      it.out = await convertOne(it, o);
      if (my !== state.run) return;
      it.thumb = it.out.thumb; it.outName = baseName(it.file.name) + '.' + FORMATS[o.format].ext; it.status = 'done';
      if (!it.tracked) { it.tracked = true; track('use', { ok: 1, ms: it.out.ms, mp: it.out.srcMP, fmt: o.format }); }
    } catch (e) {
      if (my !== state.run) return;
      console.warn(e);
      it.status = 'error';
      it.error = e && e.message === 'encode' ? 'This browser cannot create ' + FORMATS[o.format].ext.toUpperCase() + ' files. Pick another format.' : 'This image could not be opened. It may be damaged or in an unsupported format.';
      if (!it.tracked) { it.tracked = true; track('use', { ok: 0, fmt: o.format }); }
    }
    paint(it); summarize();
  }
}

// ── downloads ──────────────────────────────────────────────────────────────
function saveBlob(blob, name) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
function download(it) { if (it.status === 'done') { saveBlob(it.out.blob, it.outName); track('download', { fmt: state.format }); } }

const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(u8) { let c = 0xFFFFFFFF; for (let i = 0; i < u8.length; i++) c = CRC[(c ^ u8[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
async function makeZip(entries) {   // store-only ZIP: images are already compressed
  const enc = new TextEncoder(), parts = [], central = [];
  let offset = 0;
  const d = new Date();
  const dosTime = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
  const dosDate = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  for (const e of entries) {
    const data = new Uint8Array(await e.blob.arrayBuffer()), name = enc.encode(e.name), crc = crc32(data);
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(8, 0, true);
    lh.setUint16(10, dosTime, true); lh.setUint16(12, dosDate, true); lh.setUint32(14, crc, true);
    lh.setUint32(18, data.length, true); lh.setUint32(22, data.length, true); lh.setUint16(26, name.length, true); lh.setUint16(28, 0, true);
    parts.push(lh.buffer, name, data);
    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true); ch.setUint16(10, 0, true);
    ch.setUint16(12, dosTime, true); ch.setUint16(14, dosDate, true); ch.setUint32(16, crc, true);
    ch.setUint32(20, data.length, true); ch.setUint32(24, data.length, true); ch.setUint16(28, name.length, true);
    ch.setUint32(42, offset, true);
    central.push(ch.buffer, name);
    offset += 30 + name.length + data.length;
  }
  const cdSize = central.reduce((a, b) => a + b.byteLength, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, entries.length, true); end.setUint16(10, entries.length, true);
  end.setUint32(12, cdSize, true); end.setUint32(16, offset, true);
  return new Blob([...parts, ...central, end.buffer], { type: 'application/zip' });
}
async function downloadZip() {
  const done = state.items.filter((i) => i.status === 'done');
  if (done.length < 2) return;
  const used = new Map(), entries = done.map((i) => {
    let name = i.outName; const n = used.get(name) || 0; used.set(name, n + 1);
    if (n) name = name.replace(/(\.[^.]+)$/, '-' + (n + 1) + '$1');
    return { name, blob: i.out.blob };
  });
  el.zip.disabled = true;
  try { saveBlob(await makeZip(entries), 'converted-images.zip'); track('download', { fmt: state.format }); }
  finally { el.zip.disabled = false; }
}

// ── controls ───────────────────────────────────────────────────────────────
function applyFormatUI() {
  const f = FORMATS[state.format];
  [...el.seg.children].forEach((b) => b.setAttribute('aria-pressed', b.dataset.format === state.format));
  el.hint.textContent = f.hint;
  el.qField.hidden = !f.lossy;
  el.bgField.hidden = state.format !== 'jpg';
}
function buildSwatches() {
  const all = [];
  const mk = (cls, label) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'ocx-swatch ' + cls; b.setAttribute('aria-label', label); b.title = label; all.push(b); el.swatches.appendChild(b); return b; };
  const pick = (c, btn) => { state.bg = c; all.forEach((b) => b.setAttribute('aria-pressed', b === btn)); if (state.format === 'jpg' && state.items.length) schedule(150); };
  BG.forEach(([c, n]) => { const b = mk('', n); b.style.setProperty('--sw', c); b.setAttribute('aria-pressed', c === state.bg); b.onclick = () => pick(c, b); });
  const custom = mk('is-custom', 'Custom colour'); custom.setAttribute('aria-pressed', 'false');
  const inp = document.createElement('input'); inp.type = 'color'; inp.value = '#8758c1'; inp.setAttribute('aria-label', 'Pick a custom background colour');
  inp.oninput = () => pick(inp.value, custom); inp.onclick = (e) => e.stopPropagation(); custom.appendChild(inp);
}
function init() {
  for (const k of Object.keys(FORMATS)) state.supported[k] = canEncode(FORMATS[k].mime);
  [...el.seg.children].forEach((b) => {
    const k = b.dataset.format;
    if (!state.supported[k]) { b.disabled = true; b.title = 'This browser cannot create ' + k.toUpperCase() + ' files.'; }
    b.onclick = () => { if (b.disabled || state.format === k) return; state.format = k; applyFormatUI(); if (state.items.length) schedule(0); };
  });
  if (!state.supported[state.format]) state.format = 'jpg';
  buildSwatches(); applyFormatUI();

  el.drop.addEventListener('click', () => el.file.click());
  el.addMore.addEventListener('click', () => el.file.click());
  el.file.addEventListener('change', () => { addFiles(el.file.files); el.file.value = ''; });
  ['dragenter', 'dragover'].forEach((t) => el.stage.addEventListener(t, (e) => { e.preventDefault(); el.stage.classList.add('is-over'); }));
  ['dragleave', 'drop'].forEach((t) => el.stage.addEventListener(t, (e) => { e.preventDefault(); el.stage.classList.remove('is-over'); }));
  el.stage.addEventListener('drop', (e) => addFiles((e.dataTransfer && e.dataTransfer.files) || []));
  window.addEventListener('paste', (e) => addFiles(e.clipboardData ? e.clipboardData.files : []));
  document.addEventListener('dragover', (e) => e.preventDefault()); document.addEventListener('drop', (e) => e.preventDefault());

  el.quality.addEventListener('input', () => { state.quality = +el.quality.value; el.qOut.textContent = state.quality; if (state.items.length) schedule(450); });
  el.maxSide.addEventListener('change', () => { state.maxSide = +el.maxSide.value; if (state.items.length) schedule(0); });
  el.clear.addEventListener('click', () => { state.run++; state.items.forEach((i) => i.row && i.row.remove()); state.items = []; say(''); setView(); summarize(); el.drop.focus(); });
  el.zip.addEventListener('click', downloadZip);
  setView(); summarize();
  document.documentElement.dataset.ocxReady = '1';
}
init();

// Studio clipboard: Use here adds a picture to convert.
if (window.OCXClip) window.OCXClip.attach({ load: (f) => addFiles([f]) });
