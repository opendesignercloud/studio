/* Open Designer Cloud Studio: image to PDF.
   Turns a set of images into one PDF, one image per page, entirely in the browser (nothing is uploaded).
   The PDF is written here with no library. JPEGs are embedded untouched when "Keep original" is chosen,
   so there is no quality loss; other formats are drawn to a canvas and saved as high-quality JPEG. */
const TOOL = 'image-to-pdf';
const MAX_FILES = 60, MAX_BYTES = 60 * 1024 * 1024, MAX_TOTAL = 600 * 1024 * 1024;
const HARD_MAX_SIDE = 8192, SVG_SIDE = 2048;
const PAGES = { a4: [595.28, 841.89], letter: [612, 792] };
const MARGINS = { none: 0, small: 18, medium: 36 };
const QUALITY = {
  original: { q: 0.92, max: HARD_MAX_SIDE, keepJpeg: true },
  high:     { q: 0.85, max: 3000, keepJpeg: false },
  medium:   { q: 0.70, max: 2000, keepJpeg: false },
  small:    { q: 0.55, max: 1400, keepJpeg: false }
};
const $ = (id) => document.getElementById(id);
const el = {
  work: $('work'), stage: $('stage'), drop: $('drop'), file: $('file'), files: $('files'), list: $('list'), summary: $('summary'),
  addMore: $('addMore'), sortName: $('sortName'), clear: $('clear'), panel: $('panel'), sizeSeg: $('sizeSeg'), orientField: $('orientField'),
  orientSeg: $('orientSeg'), margin: $('margin'), quality: $('quality'), create: $('create'), result: $('result'), resultInfo: $('resultInfo'),
  download: $('download'), status: $('status')
};
const state = { size: 'a4', orient: 'auto', items: [], pdf: null, building: false, nextId: 1 };
const track = (event, props) => { if (window.OCX && window.OCX.track) window.OCX.track(event, Object.assign({ tool: TOOL }, props)); };
const enc = new TextEncoder();

function say(msg, isError) { el.status.textContent = msg || ''; el.status.classList.toggle('is-error', !!isError); }
const fmtBytes = (n) => n >= 1048576 ? (n / 1048576).toFixed(n >= 10485760 ? 0 : 1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB';
const isSvg = (f) => f.type === 'image/svg+xml' || /\.svg$/i.test(f.name);
const isJpeg = (f, u8) => (f.type === 'image/jpeg' || /\.jpe?g$/i.test(f.name)) && u8[0] === 0xFF && u8[1] === 0xD8;
const toBlob = (c, mime, q) => new Promise((res) => c.toBlob(res, mime, q));

async function decode(file) {
  if (!isSvg(file)) { try { return await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch (e) { /* fall back to <img> */ } }
  return await new Promise((res, rej) => {
    const u = URL.createObjectURL(file), im = new Image();
    im.onload = () => { URL.revokeObjectURL(u); res(im); };
    im.onerror = () => { URL.revokeObjectURL(u); rej(new Error('decode')); };
    im.src = u;
  });
}

// ── JPEG header reader: size, colour model and EXIF orientation ────────────
function exifOrientation(u8, start, len) {
  try {
    const dv = new DataView(u8.buffer, u8.byteOffset + start, len), le = dv.getUint16(0) === 0x4949;
    const ifd = dv.getUint32(4, le), n = dv.getUint16(ifd, le);
    for (let k = 0; k < n; k++) { const e = ifd + 2 + k * 12; if (dv.getUint16(e, le) === 0x0112) return dv.getUint16(e + 8, le); }
  } catch (e) { /* malformed EXIF: treat as no rotation */ }
  return 1;
}
function jpegInfo(u8) {
  if (u8[0] !== 0xFF || u8[1] !== 0xD8) return null;
  let i = 2, orient = 1, info = null;
  while (i + 4 < u8.length) {
    if (u8[i] !== 0xFF) { i++; continue; }
    const m = u8[i + 1];
    if (m === 0xFF) { i++; continue; }
    if (m === 0xD8 || m === 0x01 || (m >= 0xD0 && m <= 0xD7)) { i += 2; continue; }
    if (m === 0xD9 || m === 0xDA) break;
    const len = (u8[i + 2] << 8) | u8[i + 3];
    if (m === 0xE1 && u8[i + 4] === 0x45 && u8[i + 5] === 0x78 && u8[i + 6] === 0x69 && u8[i + 7] === 0x66) orient = exifOrientation(u8, i + 10, len - 8);
    if (m === 0xC0 || m === 0xC1 || m === 0xC2) info = { bits: u8[i + 4], h: (u8[i + 5] << 8) | u8[i + 6], w: (u8[i + 7] << 8) | u8[i + 8], comps: u8[i + 9] };
    i += 2 + len;
  }
  return info ? Object.assign(info, { orient }) : null;
}

// ── One page worth of image data ───────────────────────────────────────────
async function prepare(item, preset) {
  const raw = new Uint8Array(await item.file.arrayBuffer());
  if (preset.keepJpeg && isJpeg(item.file, raw)) {
    const j = jpegInfo(raw);
    if (j && j.bits === 8 && (j.comps === 1 || j.comps === 3) && j.orient <= 1) {
      return { bytes: raw, w: j.w, h: j.h, cs: j.comps === 1 ? 'DeviceGray' : 'DeviceRGB', mp: j.w * j.h / 1e6, kept: true };
    }   // rotated, CMYK or unusual JPEGs fall through and are redrawn so they come out right
  }
  const src = await decode(item.file);
  let w = src.width || src.naturalWidth || 1024, h = src.height || src.naturalHeight || 1024;
  let scale = isSvg(item.file) ? SVG_SIDE / Math.max(w, h) : 1;
  const limit = Math.min(preset.max, HARD_MAX_SIDE);
  if (Math.max(w, h) * scale > limit) scale = limit / Math.max(w, h);
  const cw = Math.max(1, Math.round(w * scale)), ch = Math.max(1, Math.round(h * scale));
  const c = document.createElement('canvas'); c.width = cw; c.height = ch;
  const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, cw, ch);   // PDFs get a white page behind transparent images
  g.imageSmoothingQuality = 'high'; g.drawImage(src, 0, 0, cw, ch);
  if (src.close) src.close();
  const blob = await toBlob(c, 'image/jpeg', preset.q);
  c.width = c.height = 0;
  if (!blob) throw new Error('encode');
  return { bytes: new Uint8Array(await blob.arrayBuffer()), w: cw, h: ch, cs: 'DeviceRGB', mp: w * h / 1e6, kept: false };
}

// ── Page geometry (PDF units are points, 1/72 inch) ────────────────────────
function layout(iw, ih) {
  const m = MARGINS[el.margin.value] || 0;
  if (state.size === 'fit') {
    let w = iw * 0.75, h = ih * 0.75; const s = Math.min(1, 14400 / Math.max(w, h)); w *= s; h *= s;
    return { pw: w + 2 * m, ph: h + 2 * m, dw: w, dh: h, x: m, y: m };
  }
  const [a, b] = PAGES[state.size];
  const landscape = state.orient === 'landscape' || (state.orient === 'auto' && iw > ih);
  const pw = landscape ? b : a, ph = landscape ? a : b;
  const s = Math.min((pw - 2 * m) / iw, (ph - 2 * m) / ih);
  const dw = iw * s, dh = ih * s;
  return { pw, ph, dw, dh, x: (pw - dw) / 2, y: (ph - dh) / 2 };
}

// ── PDF writer ─────────────────────────────────────────────────────────────
async function makePdf(items, preset, onProgress) {
  const parts = [], offs = []; let len = 0, mp = 0;
  const add = (d) => { const u = typeof d === 'string' ? enc.encode(d) : d; parts.push(u); len += u.length; };
  const obj = (id, body) => { offs[id] = len; add(id + ' 0 obj\n' + body + '\nendobj\n'); };
  const f = (n) => n.toFixed(2);
  const n = items.length;
  add(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2D, 0x31, 0x2E, 0x34, 0x0A, 0x25, 0xE2, 0xE3, 0xCF, 0xD3, 0x0A]));   // "%PDF-1.4" + binary marker
  obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
  obj(2, '<< /Type /Pages /Kids [' + items.map((_, i) => (3 + 3 * i) + ' 0 R').join(' ') + '] /Count ' + n + ' >>');
  for (let i = 0; i < n; i++) {
    onProgress(i + 1, n);
    const im = await prepare(items[i], preset); mp += im.mp;
    const L = layout(im.w, im.h), page = 3 + 3 * i, cont = 4 + 3 * i, img = 5 + 3 * i;
    obj(page, '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + f(L.pw) + ' ' + f(L.ph) + '] /Resources << /XObject << /Im0 ' + img + ' 0 R >> >> /Contents ' + cont + ' 0 R >>');
    const content = 'q ' + f(L.dw) + ' 0 0 ' + f(L.dh) + ' ' + f(L.x) + ' ' + f(L.y) + ' cm /Im0 Do Q';
    obj(cont, '<< /Length ' + content.length + ' >>\nstream\n' + content + '\nendstream');
    offs[img] = len;
    add(img + ' 0 obj\n<< /Type /XObject /Subtype /Image /Width ' + im.w + ' /Height ' + im.h + ' /ColorSpace /' + im.cs + ' /BitsPerComponent 8 /Filter /DCTDecode /Length ' + im.bytes.length + ' >>\nstream\n');
    add(im.bytes); add('\nendstream\nendobj\n');
  }
  const d = new Date(), p2 = (x) => String(x).padStart(2, '0');
  const info = 3 + 3 * n;
  obj(info, '<< /Producer (Open Designer Cloud Studio) /CreationDate (D:' + d.getFullYear() + p2(d.getMonth() + 1) + p2(d.getDate()) + p2(d.getHours()) + p2(d.getMinutes()) + p2(d.getSeconds()) + ') >>');
  const xref = len; let x = 'xref\n0 ' + (info + 1) + '\n0000000000 65535 f \n';
  for (let id = 1; id <= info; id++) x += String(offs[id]).padStart(10, '0') + ' 00000 n \n';
  add(x + 'trailer\n<< /Size ' + (info + 1) + ' /Root 1 0 R /Info ' + info + ' 0 R >>\nstartxref\n' + xref + '\n%%EOF\n');
  return { blob: new Blob(parts, { type: 'application/pdf' }), mp };
}

// ── list UI ────────────────────────────────────────────────────────────────
function rowFor(it) {
  if (it.row) return it.row;
  const li = document.createElement('li'); li.className = 'ocx-file';
  li.innerHTML = '<img class="ocx-file-thumb" alt="" width="56" height="56"><div class="ocx-file-main"><div class="ocx-file-name"></div><div class="ocx-file-meta"></div></div>' +
    '<div class="ocx-file-actions"><button type="button" class="ocx-x ocx-up" aria-label="Move up"></button><button type="button" class="ocx-x ocx-down" aria-label="Move down"></button><button type="button" class="ocx-x ocx-rm" aria-label="Remove"></button></div>';
  li.querySelector('.ocx-up').textContent = '↑'; li.querySelector('.ocx-down').textContent = '↓'; li.querySelector('.ocx-rm').textContent = '×';
  li.querySelector('.ocx-up').onclick = () => move(it, -1);
  li.querySelector('.ocx-down').onclick = () => move(it, 1);
  li.querySelector('.ocx-rm').onclick = () => removeItem(it);
  return (it.row = li);
}
function paint(it, index) {
  const li = rowFor(it);
  li.querySelector('.ocx-file-name').textContent = (index + 1) + '.  ' + it.file.name;
  const meta = li.querySelector('.ocx-file-meta');
  meta.textContent = it.error ? it.error : (it.w ? fmtBytes(it.file.size) + '  ·  ' + it.w + ' × ' + it.h + ' px' : 'Reading…');
  li.classList.toggle('is-error', !!it.error);
  if (it.thumb) li.querySelector('.ocx-file-thumb').src = it.thumb;
  li.querySelector('.ocx-up').disabled = index === 0;
  li.querySelector('.ocx-down').disabled = index === state.items.length - 1;
}
function refresh() {
  state.items.forEach((it, i) => { paint(it, i); el.list.appendChild(rowFor(it)); });   // appendChild re-orders existing rows
  const has = state.items.length > 0, n = state.items.length;
  el.work.dataset.state = has ? 'ready' : 'empty';
  el.drop.hidden = has; el.files.hidden = !has; el.panel.hidden = !has; el.stage.classList.toggle('has-files', has);
  el.summary.textContent = n + (n === 1 ? ' page' : ' pages') + '  ·  ' + fmtBytes(state.items.reduce((a, i) => a + i.file.size, 0));
  el.create.disabled = !has || state.building || state.items.some((i) => i.error);
  el.sortName.hidden = n < 2;
  invalidate();
}
function invalidate() { state.pdf = null; el.result.hidden = true; el.create.hidden = false; }
function move(it, d) {
  const i = state.items.indexOf(it), j = i + d;
  if (j < 0 || j >= state.items.length) return;
  [state.items[i], state.items[j]] = [state.items[j], state.items[i]]; refresh();
}
function removeItem(it) { state.items = state.items.filter((x) => x !== it); if (it.row) it.row.remove(); refresh(); if (!state.items.length) say(''); }

async function thumbFor(it) {
  try {
    const bmp = await decode(it.file), w = bmp.width || bmp.naturalWidth, h = bmp.height || bmp.naturalHeight;
    const c = document.createElement('canvas'); c.width = c.height = 112;
    const s = Math.min(w, h); c.getContext('2d').drawImage(bmp, (w - s) / 2, (h - s) / 2, s, s, 0, 0, 112, 112);
    if (bmp.close) bmp.close();
    it.w = w; it.h = h; it.thumb = c.toDataURL('image/jpeg', 0.7);
  } catch (e) { it.error = 'This image could not be opened. Remove it to continue.'; }
}
function addFiles(fileList) {
  const files = [...fileList]; if (!files.length) return;
  (async () => {
    const access = await (window.OCX && window.OCX.access);
    if (access && access.allowed === false) return;
    let total = state.items.reduce((a, i) => a + i.file.size, 0), notes = [], fresh = [];
    for (const f of files) {
      const label = (f.type || '') + ' ' + f.name;
      if (state.items.length + fresh.length >= MAX_FILES) { notes.push('A PDF can hold up to ' + MAX_FILES + ' images here.'); break; }
      if (/hei[cf]/i.test(label)) { notes.push('HEIC photos are not supported by browsers yet. Export them as JPG or PNG first.'); continue; }
      if (!/^image\//.test(f.type) && !/\.(png|jpe?g|webp|avif|gif|bmp|svg)$/i.test(f.name)) { notes.push('"' + f.name + '" is not an image.'); continue; }
      if (f.size > MAX_BYTES) { notes.push('"' + f.name + '" is larger than ' + fmtBytes(MAX_BYTES) + '.'); continue; }
      if (total + f.size > MAX_TOTAL) { notes.push('That is more than ' + fmtBytes(MAX_TOTAL) + ' of images in total.'); break; }
      total += f.size; const it = { id: state.nextId++, file: f }; fresh.push(it); state.items.push(it);
    }
    say(notes.length ? notes[0] + (notes.length > 1 ? ' (+' + (notes.length - 1) + ' more messages)' : '') : '', notes.length > 0 && !fresh.length);
    refresh();
    for (const it of fresh) { await thumbFor(it); if (state.items.includes(it)) { paint(it, state.items.indexOf(it)); refresh(); } }
  })();
}

// ── create and download ────────────────────────────────────────────────────
async function create() {
  if (state.building || !state.items.length) return;
  state.building = true; el.create.disabled = true; say('');
  const preset = QUALITY[el.quality.value] || QUALITY.original, t0 = performance.now();
  try {
    const { blob, mp } = await makePdf(state.items.slice(), preset, (i, n) => { el.create.textContent = 'Adding page ' + i + ' of ' + n + '…'; });
    state.pdf = { blob, pages: state.items.length };
    el.resultInfo.textContent = state.pdf.pages + (state.pdf.pages === 1 ? ' page' : ' pages') + '  ·  ' + fmtBytes(blob.size);
    el.result.hidden = false; el.create.hidden = true;
    track('use', { ok: 1, ms: Math.round(performance.now() - t0), mp: +mp.toFixed(2), fmt: 'pdf' });
  } catch (e) {
    console.error(e);
    say('The PDF could not be created. ' + (/memory|alloc/i.test(String(e)) ? 'Your device ran out of memory: try fewer images or a smaller quality setting.' : 'Please try again.'), true);
    track('use', { ok: 0, fmt: 'pdf' });
  } finally { state.building = false; el.create.textContent = 'Create PDF'; el.create.disabled = !state.items.length || state.items.some((i) => i.error); }
}
function download() {
  if (!state.pdf) return;
  const a = document.createElement('a'); a.href = URL.createObjectURL(state.pdf.blob); a.download = (state.items.length === 1 ? state.items[0].file.name.replace(/\.[^.]+$/, '').replace(/[^\w\-. ]+/g, '').trim().replace(/\s+/g, '-') || 'images' : 'images') + '.pdf';
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  track('download', { fmt: 'pdf' });
}

// ── wiring ─────────────────────────────────────────────────────────────────
function seg(container, key, after) {
  [...container.children].forEach((b) => b.addEventListener('click', () => {
    state[key] = b.dataset.value; [...container.children].forEach((x) => x.setAttribute('aria-pressed', x === b)); if (after) after(); invalidate();
  }));
}
function init() {
  seg(el.sizeSeg, 'size', () => { el.orientField.hidden = state.size === 'fit'; });
  seg(el.orientSeg, 'orient');
  el.margin.addEventListener('change', invalidate); el.quality.addEventListener('change', invalidate);
  el.drop.addEventListener('click', () => el.file.click());
  el.addMore.addEventListener('click', () => el.file.click());
  el.file.addEventListener('change', () => { addFiles(el.file.files); el.file.value = ''; });
  ['dragenter', 'dragover'].forEach((t) => el.stage.addEventListener(t, (e) => { e.preventDefault(); el.stage.classList.add('is-over'); }));
  ['dragleave', 'drop'].forEach((t) => el.stage.addEventListener(t, (e) => { e.preventDefault(); el.stage.classList.remove('is-over'); }));
  el.stage.addEventListener('drop', (e) => addFiles((e.dataTransfer && e.dataTransfer.files) || []));
  window.addEventListener('paste', (e) => addFiles(e.clipboardData ? e.clipboardData.files : []));
  document.addEventListener('dragover', (e) => e.preventDefault()); document.addEventListener('drop', (e) => e.preventDefault());
  el.sortName.addEventListener('click', () => { state.items.sort((a, b) => a.file.name.localeCompare(b.file.name, undefined, { numeric: true })); refresh(); });
  el.clear.addEventListener('click', () => { state.items.forEach((i) => i.row && i.row.remove()); state.items = []; say(''); refresh(); el.drop.focus(); });
  el.create.addEventListener('click', create); el.download.addEventListener('click', download);
  refresh(); el.result.hidden = true;
  document.documentElement.dataset.ocxReady = '1';
}
init();

// Studio clipboard: Use here adds a picture to the PDF.
if (window.OCXClip) window.OCXClip.attach({ load: (f) => addFiles([f]) });
