/* Open Designer Cloud Studio: QR code generator.
   Static QR codes (the data is inside the code, so they never expire and nothing is tracked), made entirely in the
   browser. Encoder: qrcode-generator (MIT, Kazuhiko Arase). Every shape is built as one SVG path that is used for both
   the on-screen/PNG canvas and the SVG download, so the two always match. */
const TOOL = 'qr-code';
const $ = (id) => document.getElementById(id);
const el = {
  typeSeg: $('typeSeg'), text: $('text'), linkHint: $('linkHint'),
  ssid: $('ssid'), wpass: $('wpass'), wsec: $('wsec'), whidden: $('whidden'),
  eto: $('eto'), esub: $('esub'), ebody: $('ebody'), phone: $('phone'),
  canvas: $('qr'), empty: $('empty'), info: $('info'), status: $('status'), warn: $('warn'),
  fgSw: $('fgSw'), bgSw: $('bgSw'), styleSeg: $('styleSeg'), ecc: $('ecc'), size: $('size'), margin: $('margin'),
  logoBtn: $('logoBtn'), logoFile: $('logoFile'), logoRm: $('logoRm'), logoName: $('logoName'),
  dlPng: $('dlPng'), dlSvg: $('dlSvg'), copy: $('copy'), preview: $('preview')
};
const state = { type: 'link', fg: '#000000', bg: '#ffffff', style: 'square', logo: null, build: null, timer: 0 };
const track = (event, props) => { if (window.OCX && window.OCX.track) window.OCX.track(event, Object.assign({ tool: TOOL }, props)); };
const qrcode = window.qrcode;
if (qrcode && qrcode.stringToBytesFuncs) qrcode.stringToBytes = qrcode.stringToBytesFuncs['UTF-8'];   // emoji and accents

function say(msg, isError) { el.status.textContent = msg || ''; el.status.classList.toggle('is-error', !!isError); }

// ── what goes into the code ────────────────────────────────────────────────
const BS = String.fromCharCode(92);   // a backslash; Wi-Fi codes escape  \ ; , : "  with one
const wifiEsc = (s) => Array.from(s, (ch) => (ch === BS || ';,:"'.includes(ch)) ? BS + ch : ch).join('');
function payload() {
  switch (state.type) {
    case 'wifi': {
      const ssid = el.ssid.value; if (!ssid) return '';
      const sec = el.wsec.value, hid = el.whidden.checked ? 'true' : 'false';
      return sec === 'nopass' ? 'WIFI:T:nopass;S:' + wifiEsc(ssid) + ';H:' + hid + ';;'
                              : 'WIFI:T:' + sec + ';S:' + wifiEsc(ssid) + ';P:' + wifiEsc(el.wpass.value) + ';H:' + hid + ';;';
    }
    case 'email': {
      const to = el.eto.value.trim(); if (!to) return '';
      const q = []; if (el.esub.value) q.push('subject=' + encodeURIComponent(el.esub.value)); if (el.ebody.value) q.push('body=' + encodeURIComponent(el.ebody.value));
      return 'mailto:' + to + (q.length ? '?' + q.join('&') : '');
    }
    case 'phone': { const n = el.phone.value.replace(/[^\d+*#]/g, ''); return n ? 'tel:' + n : ''; }
    default: return el.text.value.trim();
  }
}

// ── geometry: one SVG path in module units ─────────────────────────────────
const f = (n) => +n.toFixed(3);
function rrect(x, y, w, h, r) {           // rounded rectangle as an SVG path
  r = Math.min(r, w / 2, h / 2);
  if (r <= 0) return 'M' + x + ' ' + y + 'h' + w + 'v' + h + 'h' + (-w) + 'z';
  return 'M' + f(x + r) + ' ' + y + 'h' + f(w - 2 * r) + 'a' + r + ' ' + r + ' 0 0 1 ' + r + ' ' + r + 'v' + f(h - 2 * r) +
    'a' + r + ' ' + r + ' 0 0 1 ' + (-r) + ' ' + r + 'h' + f(-(w - 2 * r)) + 'a' + r + ' ' + r + ' 0 0 1 ' + (-r) + ' ' + (-r) +
    'v' + f(-(h - 2 * r)) + 'a' + r + ' ' + r + ' 0 0 1 ' + r + ' ' + (-r) + 'z';
}
function circle(cx, cy, r) { return 'M' + f(cx + r) + ' ' + cy + 'a' + r + ' ' + r + ' 0 1 0 ' + f(-2 * r) + ' 0a' + r + ' ' + r + ' 0 1 0 ' + f(2 * r) + ' 0z'; }

function buildCode(text, ecc, style, hasLogo) {
  const qr = qrcode(0, hasLogo ? 'H' : ecc);
  qr.addData(text, 'Byte'); qr.make();
  const n = qr.getModuleCount();
  const inFinder = (r, c) => (r < 7 && c < 7) || (r < 7 && c >= n - 7) || (r >= n - 7 && c < 7);
  const logoMods = hasLogo ? Math.max(3, Math.round(n * 0.17)) | 0 : 0;     // logo plate, in modules (about 3% of the area)
  const lo = hasLogo ? Math.floor((n - logoMods) / 2) : 0, hi = lo + logoMods;
  let d = '';
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
    if (!qr.isDark(r, c) || inFinder(r, c)) continue;
    if (hasLogo && r >= lo - 1 && r <= hi && c >= lo - 1 && c <= hi) continue;   // keep the plate area clear
    d += style === 'dots' ? circle(c + 0.5, r + 0.5, 0.46) : style === 'rounded' ? rrect(c + 0.04, r + 0.04, 0.92, 0.92, 0.32) : 'M' + c + ' ' + r + 'h1v1h-1z';
  }
  const ro = 0, ri = 0;   // the three corner squares stay square in every style: rounded ones are measurably harder for scanners to find
  for (const [fr, fc] of [[0, 0], [0, n - 7], [n - 7, 0]]) {     // finder patterns: ring + hole + eye, painted with the even-odd rule
    d += rrect(fc, fr, 7, 7, ro) + rrect(fc + 1, fr + 1, 5, 5, Math.max(0, ro - 1)) + rrect(fc + 2, fr + 2, 3, 3, ri);
  }
  return { n, d, version: (n - 17) / 4, logo: hasLogo ? { x: lo, y: lo, size: logoMods } : null };
}

// ── drawing (canvas) and exporting (SVG) from the same geometry ────────────
function metrics(b) {
  const m = +el.margin.value, want = +el.size.value, total = b.n + 2 * m;
  const cell = Math.max(1, Math.floor(want / total));
  return { m, cell, total, px: cell * total };
}
function render() {
  const text = payload();
  if (!text) { state.build = null; el.canvas.hidden = true; el.empty.hidden = false; el.info.textContent = ''; warn(''); setExport(false); return; }
  let b;
  try { b = buildCode(text, el.ecc.value, state.style, !!state.logo); }
  catch (e) { state.build = null; el.canvas.hidden = true; el.empty.hidden = false; el.info.textContent = ''; setExport(false);
    say('That is too much for one QR code. Shorten the text, or choose a lower error-correction level.', true); return; }
  say(''); state.build = b;
  const { m, cell, px } = metrics(b);
  const c = el.canvas; c.width = px; c.height = px;
  const g = c.getContext('2d');
  g.clearRect(0, 0, px, px);
  if (state.bg) { g.fillStyle = state.bg; g.fillRect(0, 0, px, px); }
  g.save(); g.translate(m * cell, m * cell); g.scale(cell, cell);
  g.fillStyle = state.fg; g.fill(new Path2D(b.d), 'evenodd'); g.restore();
  if (b.logo) drawLogo(g, b, m, cell);
  c.hidden = false; el.empty.hidden = true;
  el.preview.style.background = state.bg ? '' : '';
  el.info.textContent = 'Version ' + b.version + '  ·  ' + b.n + ' × ' + b.n + ' modules  ·  ' + px + ' × ' + px + ' px' + (state.logo ? '  ·  logo, error correction set to High' : '');
  warn(checkContrast()); setExport(true);
}
function drawLogo(g, b, m, cell) {
  const L = b.logo, x = (m + L.x) * cell, y = (m + L.y) * cell, s = L.size * cell, pad = cell * 0.3;
  g.fillStyle = state.bg || '#ffffff'; roundRect(g, x - pad, y - pad, s + 2 * pad, s + 2 * pad, cell * 0.8); g.fill();
  const im = state.logo.bitmap, k = Math.min(s / im.width, s / im.height), w = im.width * k, h = im.height * k;
  g.imageSmoothingQuality = 'high'; g.drawImage(im, x + (s - w) / 2, y + (s - h) / 2, w, h);
}
function roundRect(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
function svgMarkup() {
  const b = state.build, { m, total } = metrics(b);
  const bg = state.bg ? '<rect width="' + total + '" height="' + total + '" fill="' + state.bg + '"/>' : '';
  let logo = '';
  if (b.logo && state.logo) {
    const L = b.logo, x = m + L.x, y = m + L.y, s = L.size, pad = 0.3, im = state.logo.bitmap, k = Math.min(s / im.width, s / im.height), w = im.width * k, h = im.height * k;
    logo = '<rect x="' + f(x - pad) + '" y="' + f(y - pad) + '" width="' + f(s + 2 * pad) + '" height="' + f(s + 2 * pad) + '" rx="0.8" fill="' + (state.bg || '#ffffff') + '"/>' +
           '<image x="' + f(x + (s - w) / 2) + '" y="' + f(y + (s - h) / 2) + '" width="' + f(w) + '" height="' + f(h) + '" href="' + state.logo.dataUrl + '"/>';
  }
  return '<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + total + ' ' + total + '" width="' + (total * 10) + '" height="' + (total * 10) + '" shape-rendering="crispEdges">' +
    bg + '<path transform="translate(' + m + ' ' + m + ')" fill="' + state.fg + '" fill-rule="evenodd" d="' + b.d + '"/>' + logo + '</svg>\n';
}

// ── scanning advice ────────────────────────────────────────────────────────
function lum(hex) { const v = [1, 3, 5].map((i) => parseInt(hex.substr(i, 2), 16) / 255).map((c) => c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)); return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]; }
function checkContrast() {
  if (!state.bg) return 'The background is transparent. Place the code on a light, plain background so it can be scanned.';
  const a = lum(state.fg), b = lum(state.bg), ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  if (ratio < 3) return 'Low contrast (' + ratio.toFixed(1) + ':1). Many scanners will struggle to read this. Use a much darker code on a lighter background.';
  if (a > b) return 'Light code on a dark background. Some scanners cannot read inverted codes, so test it before you print.';
  return '';
}
function warn(msg) { el.warn.textContent = msg; el.warn.hidden = !msg; }
function setExport(on) { el.dlPng.disabled = el.dlSvg.disabled = el.copy.disabled = !on; }
function linkTip() {
  const t = el.text.value.trim();
  el.linkHint.textContent = /^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(t) ? 'Tip: start with https:// so phones open this as a link.' : 'A web address, a message, or any text.';
}

// ── exports ────────────────────────────────────────────────────────────────
function save(blob, name) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); }
const pngBlob = () => new Promise((res) => el.canvas.toBlob(res, 'image/png'));
async function ready() { const a = await (window.OCX && window.OCX.access); return !(a && a.allowed === false); }
el.dlPng.onclick = async () => { if (!state.build || !(await ready())) return; save(await pngBlob(), 'qr-code.png'); track('use', { ok: 1, fmt: 'png', mp: +(el.canvas.width * el.canvas.height / 1e6).toFixed(2) }); track('download', { fmt: 'png' }); };
el.dlSvg.onclick = async () => { if (!state.build || !(await ready())) return; save(new Blob([svgMarkup()], { type: 'image/svg+xml' }), 'qr-code.svg'); track('use', { ok: 1, fmt: 'svg' }); track('download', { fmt: 'svg' }); };
el.copy.onclick = async () => {
  if (!state.build || !(await ready())) return;
  try { await navigator.clipboard.write([new ClipboardItem({ 'image/png': await pngBlob() })]); say('Copied to your clipboard.'); track('use', { ok: 1, fmt: 'png' }); track('copy', {}); }
  catch (e) { say('Your browser blocked copying. Use Download instead.', true); }
};
if (!(navigator.clipboard && window.ClipboardItem)) el.copy.hidden = true;

// ── logo ───────────────────────────────────────────────────────────────────
el.logoBtn.onclick = () => el.logoFile.click();
el.logoRm.onclick = () => { state.logo = null; el.logoName.textContent = 'No logo'; el.logoRm.hidden = true; el.logoFile.value = ''; schedule(); };
el.logoFile.onchange = async () => {
  const file = el.logoFile.files[0]; if (!file) return;
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const k = Math.min(1, 256 / Math.max(bmp.width, bmp.height)), c = document.createElement('canvas'); c.width = Math.max(1, Math.round(bmp.width * k)); c.height = Math.max(1, Math.round(bmp.height * k));
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    state.logo = { bitmap: await createImageBitmap(c), dataUrl: c.toDataURL('image/png') };
    el.logoName.textContent = file.name; el.logoRm.hidden = false; say(''); schedule();
  } catch (e) { say('That image could not be used as a logo. Try a PNG or JPG.', true); }
};

// ── controls ───────────────────────────────────────────────────────────────
function schedule() { clearTimeout(state.timer); state.timer = setTimeout(render, 120); }
function swatches(host, list, key, allowClear) {
  const all = [];
  const mk = (cls, label) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'ocx-swatch ' + cls; b.setAttribute('aria-label', label); b.title = label; all.push(b); host.appendChild(b); return b; };
  const pick = (c, btn) => { state[key] = c; all.forEach((b) => b.setAttribute('aria-pressed', b === btn)); schedule(); };
  list.forEach(([c, n]) => { const b = mk('', n); b.style.setProperty('--sw', c); b.setAttribute('aria-pressed', c === state[key]); b.onclick = () => pick(c, b); });
  if (allowClear) { const b = mk('is-clear', 'Transparent'); b.setAttribute('aria-pressed', 'false'); b.onclick = () => pick(null, b); }
  const custom = mk('is-custom', 'Custom colour'); custom.setAttribute('aria-pressed', 'false');
  const inp = document.createElement('input'); inp.type = 'color'; inp.value = state[key] || '#ffffff'; inp.setAttribute('aria-label', 'Pick a custom colour');
  inp.oninput = () => pick(inp.value, custom); inp.onclick = (e) => e.stopPropagation(); custom.appendChild(inp);
}
function setType(t) {
  state.type = t;
  [...el.typeSeg.children].forEach((b) => b.setAttribute('aria-pressed', b.dataset.value === t));
  for (const k of ['link', 'wifi', 'email', 'phone']) $('f-' + k).hidden = k !== t;
  schedule();
}
function init() {
  if (!qrcode) { say('The QR engine could not be loaded. Please reload the page.', true); return; }
  swatches(el.fgSw, [['#000000', 'Black'], ['#0b3d91', 'Dark blue'], ['#0f5132', 'Dark green'], ['#7a1f1f', 'Dark red']], 'fg', false);
  swatches(el.bgSw, [['#ffffff', 'White'], ['#f1f1f3', 'Light grey']], 'bg', true);
  [...el.typeSeg.children].forEach((b) => b.addEventListener('click', () => setType(b.dataset.value)));
  [...el.styleSeg.children].forEach((b) => b.addEventListener('click', () => { state.style = b.dataset.value; [...el.styleSeg.children].forEach((x) => x.setAttribute('aria-pressed', x === b)); schedule(); }));
  for (const k of ['text', 'ssid', 'wpass', 'wsec', 'whidden', 'eto', 'esub', 'ebody', 'phone', 'ecc', 'size', 'margin']) { el[k].addEventListener('input', schedule); el[k].addEventListener('change', schedule); }
  el.text.addEventListener('input', linkTip);
  linkTip(); setExport(false); el.canvas.hidden = true;
  document.documentElement.dataset.ocxReady = '1';
}
init();

// Studio clipboard: no input picture; Add sends the QR code.
if (window.OCXClip) window.OCXClip.attach({ getOutput: () => (state.build ? new Blob([svgMarkup()], { type: 'image/svg+xml' }) : null) });   // vector: Design keeps it editable, other tools rasterise it
