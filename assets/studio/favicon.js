/* Open Designer Cloud Studio: favicon generator.
   Turns one image into a complete favicon set: favicon.ico (16, 32 and 48 px), PNG icons, an Apple touch icon, Android icons,
   a web app manifest and the HTML to paste into your page head. Everything is made in the browser (ICO and ZIP files are
   written here, no library) and the image is never uploaded. */
const TOOL = 'favicon-generator';
const MAX_BYTES = 30 * 1024 * 1024, KEEP_SIDE = 4096;
const NL = String.fromCharCode(10);
const $ = (id) => document.getElementById(id);
const el = {
  work: $('work'), stage: $('stage'), drop: $('drop'), file: $('file'), preview: $('preview'), pvLight: $('pvLight'), pvDark: $('pvDark'),
  panel: $('panel'), fitSeg: $('fitSeg'), shapeSeg: $('shapeSeg'), pad: $('pad'), padOut: $('padOut'), bg: $('bg'), transp: $('transp'),
  siteName: $('siteName'), theme: $('theme'), zip: $('zip'), ico: $('ico'), copy: $('copy'), again: $('again'), info: $('info'), status: $('status')
};
const state = { src: null, name: 'favicons', fit: 'fit', shape: 'rounded', timer: 0, firstTracked: false };
const track = (event, props) => { if (window.OCX && window.OCX.track) window.OCX.track(event, Object.assign({ tool: TOOL }, props)); };
function say(msg, isError) { el.status.textContent = msg || ''; el.status.classList.toggle('is-error', !!isError); }
const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
const toBlob = (canvas, mime) => new Promise((res) => canvas.toBlob(res, mime));

async function decode(file) {
  if (!(file.type === 'image/svg+xml' || /[.]svg$/i.test(file.name))) { try { return await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch (e) { /* use <img> */ } }
  return await new Promise((res, rej) => { const u = URL.createObjectURL(file), im = new Image(); im.onload = () => { URL.revokeObjectURL(u); res(im); }; im.onerror = () => { URL.revokeObjectURL(u); rej(new Error('decode')); }; im.src = u; });
}
async function loadFile(file) {
  if (!file) return;
  const access = await (window.OCX && window.OCX.access); if (access && access.allowed === false) return;
  if (/hei[cf]/i.test((file.type || '') + ' ' + file.name)) return say('HEIC photos are not supported by browsers yet. Export the photo as JPG or PNG first.', true);
  if (!/^image\//.test(file.type) && !/[.](png|jpe?g|webp|avif|gif|bmp|svg)$/i.test(file.name)) return say('Please choose a PNG, JPG, SVG or WebP image.', true);
  if (file.size > MAX_BYTES) return say('That file is larger than ' + Math.round(MAX_BYTES / 1048576) + ' MB.', true);
  let bmp; try { bmp = await decode(file); } catch (e) { return say('That image could not be opened. It may be damaged or in an unsupported format.', true); }
  let w0 = bmp.width || bmp.naturalWidth || 1024, h0 = bmp.height || bmp.naturalHeight || 1024;
  if (/svg/i.test(file.type) || /[.]svg$/i.test(file.name)) { const k = 1024 / Math.max(w0, h0); w0 = Math.round(w0 * k); h0 = Math.round(h0 * k); }   // vectors are drawn large so small icons stay sharp
  const s = Math.min(1, KEEP_SIDE / Math.max(w0, h0)), c = mk(Math.max(1, Math.round(w0 * s)), Math.max(1, Math.round(h0 * s)));
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height); if (bmp.close) bmp.close();
  if (state.src) state.src.width = state.src.height = 0;
  state.src = c; state.firstTracked = false;
  const base = (file.name || 'favicons').replace(/[.][^.]+$/, '').replace(/[^\w. -]+/g, '').trim();
  if (!el.siteName.value || el.siteName.dataset.auto === '1') { el.siteName.value = base ? base.replace(/[-_]+/g, ' ') : 'My site'; el.siteName.dataset.auto = '1'; }
  say(''); show(true); refresh(0);
}
function show(on) { el.work.dataset.state = on ? 'ready' : 'empty'; el.drop.hidden = on; el.preview.hidden = !on; el.panel.hidden = !on; el.stage.classList.toggle('has-editor', on); }
function setSeg(seg, key, val) { Array.prototype.forEach.call(seg.querySelectorAll('button'), (b) => b.setAttribute('aria-pressed', b.dataset[key] === val ? 'true' : 'false')); }

// ── drawing ────────────────────────────────────────────────────────────────
// Shrink in steps of at most half, so a large picture still looks crisp at 16 px.
function scaled(src, w, h) {
  let cur = src, cw = src.width, ch = src.height;
  while (cw / 2 > w && ch / 2 > h) {
    const nw = Math.max(1, Math.round(cw / 2)), nh = Math.max(1, Math.round(ch / 2)), t = mk(nw, nh), g = t.getContext('2d');
    g.imageSmoothingQuality = 'high'; g.drawImage(cur, 0, 0, nw, nh); if (cur !== src) cur.width = cur.height = 0; cur = t; cw = nw; ch = nh;
  }
  return cur;
}
// opts.apple: opaque square for iOS (it adds its own rounded corners); opts.shape overrides the chosen shape.
function renderIcon(size, opts) {
  opts = opts || {};
  const c = mk(size, size), g = c.getContext('2d'), shape = opts.apple ? 'square' : state.shape;
  const bgOn = !el.transp.checked || opts.apple, bgCol = el.transp.checked ? '#ffffff' : el.bg.value;
  g.save();
  if (shape === 'circle') { g.beginPath(); g.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2); g.clip(); }
  else if (shape === 'rounded') { const r = size * 0.22; g.beginPath(); g.moveTo(r, 0); g.arcTo(size, 0, size, size, r); g.arcTo(size, size, 0, size, r); g.arcTo(0, size, 0, 0, r); g.arcTo(0, 0, size, 0, r); g.closePath(); g.clip(); }
  if (bgOn) { g.fillStyle = bgCol; g.fillRect(0, 0, size, size); }
  const pad = +el.pad.value / 100, box = size * (1 - 2 * pad), S = state.src;
  let sx = 0, sy = 0, sw = S.width, sh = S.height, dw, dh;
  if (state.fit === 'fill') { const side = Math.min(S.width, S.height); sx = (S.width - side) / 2; sy = (S.height - side) / 2; sw = sh = side; dw = dh = box; }
  else { const k = box / Math.max(S.width, S.height); dw = S.width * k; dh = S.height * k; }
  const dx = (size - dw) / 2, dy = (size - dh) / 2;
  const pre = scaled(sw === S.width && sh === S.height ? S : (() => { const t = mk(Math.round(sw), Math.round(sh)); t.getContext('2d').drawImage(S, sx, sy, sw, sh, 0, 0, t.width, t.height); return t; })(), Math.max(1, Math.round(dw)), Math.max(1, Math.round(dh)));
  g.imageSmoothingQuality = 'high'; g.drawImage(pre, dx, dy, dw, dh);
  g.restore(); return c;
}

// ── preview ────────────────────────────────────────────────────────────────
const PV_SIZES = [180, 64, 48, 32, 16];
function paintPanel(host, dark) {
  host.textContent = '';
  const name = (el.siteName.value || 'My site').trim();
  const tab = document.createElement('div'); tab.className = 'fav-tab'; tab.dataset.dark = dark ? '1' : '0';
  const ti = new Image(); ti.width = ti.height = 16; ti.alt = ''; ti.src = renderIcon(16).toDataURL('image/png');
  const tn = document.createElement('span'); tn.textContent = name; tab.append(ti, tn); host.appendChild(tab);
  const row = document.createElement('div'); row.className = 'fav-sizes';
  PV_SIZES.forEach((s) => {
    const f = document.createElement('figure'); const im = new Image(); im.width = im.height = s; im.alt = s + ' pixel icon'; im.src = renderIcon(s).toDataURL('image/png');
    const cap = document.createElement('figcaption'); cap.textContent = s + ' px'; f.append(im, cap); row.appendChild(f);
  });
  host.appendChild(row);
}
function refresh(delay) { clearTimeout(state.timer); if (!state.src) return; state.timer = setTimeout(paint, delay == null ? 120 : delay); }
function paint() {
  if (!state.src) return;
  const t0 = performance.now();
  paintPanel(el.pvLight, false); paintPanel(el.pvDark, true);
  el.padOut.textContent = el.pad.value + '%'; el.bg.disabled = el.transp.checked;
  el.info.textContent = '9 files: favicon.ico, 5 PNG icons, a manifest and the HTML snippet.';
  if (!state.firstTracked) { state.firstTracked = true; track('use', { ok: 1, fmt: 'png', ms: Math.round(performance.now() - t0), mp: +(state.src.width * state.src.height / 1e6).toFixed(2) }); }
}

// ── files ──────────────────────────────────────────────────────────────────
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

// ICO: a small directory followed by PNG images (supported by every current browser and by Windows).
async function makeIco(sizes) {
  const blobs = [];
  for (const s of sizes) blobs.push(new Uint8Array(await (await toBlob(renderIcon(s), 'image/png')).arrayBuffer()));
  const head = new DataView(new ArrayBuffer(6 + 16 * sizes.length));
  head.setUint16(0, 0, true); head.setUint16(2, 1, true); head.setUint16(4, sizes.length, true);
  let offset = 6 + 16 * sizes.length;
  sizes.forEach((s, i) => {
    const o = 6 + 16 * i;
    head.setUint8(o, s >= 256 ? 0 : s); head.setUint8(o + 1, s >= 256 ? 0 : s); head.setUint8(o + 2, 0); head.setUint8(o + 3, 0);
    head.setUint16(o + 4, 1, true); head.setUint16(o + 6, 32, true); head.setUint32(o + 8, blobs[i].length, true); head.setUint32(o + 12, offset, true);
    offset += blobs[i].length;
  });
  return new Blob([head.buffer, ...blobs], { type: 'image/x-icon' });
}
function themeColour() { return el.theme.value || '#ffffff'; }
function snippet() {
  return [
    '<link rel="icon" href="/favicon.ico" sizes="48x48">',
    '<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png">',
    '<link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png">',
    '<link rel="apple-touch-icon" href="/apple-touch-icon.png">',
    '<link rel="manifest" href="/site.webmanifest">',
    '<meta name="theme-color" content="' + themeColour() + '">'
  ].join(NL) + NL;
}
function manifest() {
  const name = (el.siteName.value || 'My site').trim();
  return JSON.stringify({
    name, short_name: name.length > 12 ? name.slice(0, 12).trim() : name,
    icons: [{ src: '/android-chrome-192x192.png', sizes: '192x192', type: 'image/png' }, { src: '/android-chrome-512x512.png', sizes: '512x512', type: 'image/png' }],
    theme_color: themeColour(), background_color: el.transp.checked ? '#ffffff' : el.bg.value, display: 'standalone'
  }, null, 2) + NL;
}
function saveBlob(blob, name) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
async function downloadZip() {
  if (!state.src) return;
  const access = await (window.OCX && window.OCX.access); if (access && access.allowed === false) return;
  el.zip.disabled = true;
  try {
    const png = async (s, o) => toBlob(renderIcon(s, o), 'image/png');
    const entries = [
      { name: 'favicon.ico', blob: await makeIco([16, 32, 48]) },
      { name: 'favicon-16x16.png', blob: await png(16) }, { name: 'favicon-32x32.png', blob: await png(32) },
      { name: 'apple-touch-icon.png', blob: await png(180, { apple: true }) },
      { name: 'android-chrome-192x192.png', blob: await png(192) }, { name: 'android-chrome-512x512.png', blob: await png(512) },
      { name: 'site.webmanifest', blob: new Blob([manifest()], { type: 'application/manifest+json' }) },
      { name: 'head-snippet.html', blob: new Blob([snippet()], { type: 'text/html' }) }
    ];
    saveBlob(await makeZip(entries), 'favicons.zip'); track('download', { fmt: 'png' }); say('');
  } catch (e) { console.error(e); track('use', { ok: 0, fmt: 'png' }); say('The icons could not be created. Try a smaller image.', true); }
  finally { el.zip.disabled = false; }
}
async function downloadIco() {
  if (!state.src) return;
  try { saveBlob(await makeIco([16, 32, 48]), 'favicon.ico'); track('download', { fmt: 'png' }); say(''); } catch (e) { console.error(e); say('The icon could not be created.', true); }
}
async function copySnippet() {
  try { await navigator.clipboard.writeText(snippet()); say('HTML copied to your clipboard.'); track('copy', {}); }
  catch (e) { say('Your browser blocked copying. Download the ZIP instead: it includes head-snippet.html.', true); }
}

// ── controls ───────────────────────────────────────────────────────────────
function init() {
  el.siteName.dataset.auto = '1';   // the starter name is replaced by the file name until the visitor types their own
  el.drop.addEventListener('click', () => el.file.click());
  el.file.addEventListener('change', () => { loadFile(el.file.files[0]); el.file.value = ''; });
  ['dragenter', 'dragover'].forEach((t) => el.stage.addEventListener(t, (e) => { e.preventDefault(); el.stage.classList.add('is-over'); }));
  ['dragleave', 'drop'].forEach((t) => el.stage.addEventListener(t, (e) => { e.preventDefault(); el.stage.classList.remove('is-over'); }));
  el.stage.addEventListener('drop', (e) => loadFile(e.dataTransfer && e.dataTransfer.files[0]));
  window.addEventListener('paste', (e) => { const f = e.clipboardData && e.clipboardData.files[0]; if (f) loadFile(f); });
  document.addEventListener('dragover', (e) => e.preventDefault()); document.addEventListener('drop', (e) => e.preventDefault());
  el.fitSeg.addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; state.fit = b.dataset.fit; setSeg(el.fitSeg, 'fit', state.fit); refresh(0); });
  el.shapeSeg.addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; state.shape = b.dataset.shape; setSeg(el.shapeSeg, 'shape', state.shape); refresh(0); });
  [el.pad, el.bg, el.theme].forEach((r) => r.addEventListener('input', () => refresh()));
  el.siteName.addEventListener('input', () => { el.siteName.dataset.auto = '0'; refresh(); });
  el.transp.addEventListener('change', () => refresh(0));
  el.zip.addEventListener('click', downloadZip); el.ico.addEventListener('click', downloadIco); el.copy.addEventListener('click', copySnippet);
  el.again.addEventListener('click', () => { clearTimeout(state.timer); state.src = null; el.pvLight.textContent = el.pvDark.textContent = ''; say(''); show(false); el.file.click(); });
  show(false); document.documentElement.dataset.ocxReady = '1';
}
init();

// Studio clipboard: Use here opens a picture.
if (window.OCXClip) window.OCXClip.attach({ load: (f) => loadFile(f) });
