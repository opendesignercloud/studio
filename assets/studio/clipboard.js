/* Open Designer Cloud Studio: the Studio clipboard.
   A tray that holds several pictures and is shared by every Studio tool (and Studio Pro), so a picture can move from one tool to the next.
   - Lives only in this browser/app (IndexedDB). Nothing is uploaded. Never throws: if storage is blocked it keeps the pictures for this page only.
   - Loaded by studio.js. A tool joins in with one call:
       OCXClip.attach({ load: function (file) {...},        // open a picture in this tool ("Use here")
                        getOutput: function () {...} });      // returns this tool's current picture as a Blob (or a Promise of one, or null)
       Optional extras:  accepts: ['image', 'video', 'audio']   // what "Use here" can open (default: images)
                         loadPath: function (item) {...}        // open a video or audio item (Studio Pro: items are references to files on disk)
                         getFile: function () {...}             // path of this tool's selected clip or last export, for "Add selected clip"
                         outputKind: 'text'                    // getOutput returns a string: it is sent back to a host tool, but is never put in the picture tray or the right-click menu
                         outputLabel / fileLabel: button wording
   - Dragging a thumbnail carries the item id as 'application/x-ocx-clip'. Dropping it ANYWHERE on a page opens it in that tool exactly like "Use here" (handled here, so a tool needs no code); an item the tool cannot open shows a short message.
     A tool with its own drop zones (the Video and Audio timelines) marks them data-ocx-drop and reads the id itself, then OCXClip.list() and OCXClip.get(id).
   - API: OCXClip.add(blobOrFile, name), OCXClip.addPath(path) (Studio Pro, video or audio), list(), get(id), remove(id), clear(), onChange(fn).
   Pictures are stored in the tray (newest 20 items, about 200 MB of pictures). Video and audio files in Studio Pro are kept as REFERENCES (a path, a length and a small preview):
   nothing is copied, so a big clip costs the tray nothing, and an item whose file has moved shows "file not found". The website keeps pictures only. */
(function () {
  'use strict';
  var MAX_ITEMS = 20, MAX_BYTES = 200 * 1024 * 1024, THUMB = 200;
  var pending = (window.OCXClip && window.OCXClip._q) || [];
  var listeners = [], handlers = null, db = null, mem = { meta: [], blobs: {} }, memOnly = false;
  var chan = null; try { chan = new BroadcastChannel('ocx-studio-clipboard'); } catch (e) { /* optional */ }

  // ── Storage ───────────────────────────────────────────────────────────────
  function open() {
    if (db) return Promise.resolve(db);
    return new Promise(function (res) {
      if (memOnly || !window.indexedDB) { memOnly = true; return res(null); }
      var r; try { r = indexedDB.open('ocx-studio-clipboard', 1); } catch (e) { memOnly = true; return res(null); }
      r.onupgradeneeded = function () { r.result.createObjectStore('meta', { keyPath: 'id' }); r.result.createObjectStore('blobs'); };
      r.onsuccess = function () { db = r.result; db.onversionchange = function () { db.close(); db = null; }; res(db); };
      r.onerror = r.onblocked = function () { memOnly = true; res(null); };
    });
  }
  function tx(stores, mode, fn) {
    return open().then(function (d) {
      if (!d) return fn(null);
      return new Promise(function (res, rej) {
        var t = d.transaction(stores, mode), out; t.oncomplete = function () { res(out); }; t.onerror = t.onabort = function () { rej(t.error); };
        out = fn(t);
      });
    });
  }
  var req = function (r) { return new Promise(function (res, rej) { r.onsuccess = function () { res(r.result); }; r.onerror = function () { rej(r.error); }; }); };

  function list() {
    return open().then(function (d) {
      if (!d) return mem.meta.slice();
      return req(d.transaction('meta').objectStore('meta').getAll());
    }).then(function (a) { return (a || []).sort(function (x, y) { return y.added - x.added; }); }).catch(function () { return mem.meta.slice().sort(function (x, y) { return y.added - x.added; }); });
  }
  function get(id) {
    return open().then(function (d) {
      if (!d) return mem.blobs[id] || null;
      return req(d.transaction('blobs').objectStore('blobs').get(id));
    }).catch(function () { return mem.blobs[id] || null; });
  }
  function put(meta, blob) {
    return tx(['meta', 'blobs'], 'readwrite', function (t) {
      if (!t) { mem.meta.push(meta); if (blob) mem.blobs[meta.id] = blob; return; }
      t.objectStore('meta').put(meta); if (blob) t.objectStore('blobs').put(blob, meta.id);
    });
  }
  function remove(id) {
    return tx(['meta', 'blobs'], 'readwrite', function (t) {
      if (!t) { mem.meta = mem.meta.filter(function (m) { return m.id !== id; }); delete mem.blobs[id]; return; }
      t.objectStore('meta').delete(id); t.objectStore('blobs').delete(id);
    }).then(changed);
  }
  function clear() {
    return tx(['meta', 'blobs'], 'readwrite', function (t) {
      if (!t) { mem = { meta: [], blobs: {} }; return; }
      t.objectStore('meta').clear(); t.objectStore('blobs').clear();
    }).then(changed);
  }
  function changed(local) {
    listeners.forEach(function (f) { try { f(); } catch (e) { /* a listener must not break the others */ } });
    if (chan && local !== false) { try { chan.postMessage('change'); } catch (e) { /* ignore */ } }
  }
  if (chan) chan.onmessage = function () { changed(false); };

  // ── Adding ────────────────────────────────────────────────────────────────
  function thumbOf(bmp) {
    var s = Math.min(1, THUMB / Math.max(bmp.width, bmp.height)), c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(bmp.width * s)); c.height = Math.max(1, Math.round(bmp.height * s));
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    return new Promise(function (res) { c.toBlob(res, 'image/png'); });
  }
  // createImageBitmap cannot read an SVG blob in every browser; an <img> can, so SVG goes that way (the tray stores the vector, the thumb is a bitmap).
  function decodeBlob(blob) {
    if (!/svg/.test(blob.type || '')) return createImageBitmap(blob);
    return new Promise(function (res, rej) {
      var u = URL.createObjectURL(blob), im = new Image();
      im.onload = function () { URL.revokeObjectURL(u); var c = document.createElement('canvas'); c.width = im.naturalWidth || 512; c.height = im.naturalHeight || 512; c.getContext('2d').drawImage(im, 0, 0, c.width, c.height); res(c); };
      im.onerror = function () { URL.revokeObjectURL(u); rej(new Error('svg')); };
      im.src = u;
    });
  }
  function add(blob, name) {
    if (!blob || !/^image\//.test(blob.type || '')) return Promise.resolve({ ok: false, reason: 'That is not a picture.' });
    return decodeBlob(blob).then(function (bmp) {
      return thumbOf(bmp).then(function (th) {
        var meta = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7), name: String(name || blob.name || 'Picture').slice(0, 80), type: blob.type, w: bmp.width, h: bmp.height, size: blob.size, added: Date.now(), thumb: th };
        if (bmp.close) bmp.close();
        return put(meta, blob).then(trim).then(function (dropped) { changed(); retireHint(); return { ok: true, id: meta.id, dropped: dropped }; });
      });
    }).catch(function () { return { ok: false, reason: 'That picture could not be read.' }; });
  }
  // ── Video and audio files (Studio Pro): references, not copies ───────────────
  var proMedia = function () { return window.studioPro && window.studioPro.media ? window.studioPro : null; };
  var fmtDur = function (s) { s = Math.max(0, Math.round(s || 0)); var h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60; return (h ? h + ':' + (m < 10 ? '0' : '') + m : m) + ':' + (x < 10 ? '0' : '') + x; };
  function mediaThumb(d) {
    return new Promise(function (res) {
      var c = document.createElement('canvas'); c.width = 200; c.height = 112; var g = c.getContext('2d');
      function finish() { c.toBlob(res, 'image/png'); }
      g.fillStyle = '#0b0b0d'; g.fillRect(0, 0, 200, 112);
      if (d.kind === 'video' && d.thumb) {
        var im = new Image(); im.onload = function () { var k = Math.min(200 / im.width, 112 / im.height); g.drawImage(im, (200 - im.width * k) / 2, (112 - im.height * k) / 2, im.width * k, im.height * k); finish(); }; im.onerror = finish; im.src = 'data:image/png;base64,' + d.thumb; return;
      }
      if (d.kind === 'audio' && d.peaks && d.peaks.length) {
        var n = d.peaks.length, w = 200 / n; g.fillStyle = '#6ea0ff';
        d.peaks.forEach(function (v, i) { var h = Math.max(2, v * 84); g.fillRect(i * w, 56 - h / 2, Math.max(1, w - 1), h); });
        return finish();
      }
      g.fillStyle = '#6ea0ff'; g.font = '600 22px system-ui'; g.textAlign = 'center'; g.fillText(d.kind === 'video' ? 'VIDEO' : 'AUDIO', 100, 64); finish();
    });
  }
  function addPath(path) {
    var sp = proMedia(); if (!sp) return Promise.resolve({ ok: false, reason: 'Video and audio can be kept here in the Studio Pro app.' });
    return sp.media.describe(path).then(function (d) {
      if (!d || !d.ok) return { ok: false, reason: (d && d.error) || 'That file could not be read.' };
      return list().then(function (all) {
        var dup = all.filter(function (m) { return m.path === d.path; })[0]; if (dup) return remove(dup.id).then(function () { return d; });   // adding the same file again just moves it to the front
        return d;
      }).then(function (dd) {
        return mediaThumb(dd).then(function (th) {
          var meta = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7), kind: dd.kind, name: String(dd.name).slice(0, 80), path: dd.path, duration: dd.duration, w: dd.w || 0, h: dd.h || 0, size: 0, fileSize: dd.size, added: Date.now(), thumb: th };
          return put(meta, null).then(trim).then(function (dropped) { changed(); return { ok: true, id: meta.id, dropped: dropped, kind: dd.kind }; });
        });
      });
    }).catch(function () { return { ok: false, reason: 'That file could not be read.' }; });
  }
  var KINDS = ['image', 'video', 'audio'];
  var kindOf = function (m) { return m.kind || 'image'; };
  var accepts = function () { return (handlers && handlers.accepts) || ['image']; };
  var usable = function (m) { return accepts().indexOf(kindOf(m)) >= 0 && (kindOf(m) === 'image' ? !!(handlers && handlers.load) : !!(handlers && handlers.loadPath)); };

  function trim() {
    return list().then(function (all) {
      var total = 0, keep = [], drop = [];
      all.forEach(function (m) { if (keep.length < MAX_ITEMS && total + m.size <= MAX_BYTES || !keep.length) { keep.push(m); total += m.size; } else drop.push(m); });
      return Promise.all(drop.map(function (m) { return tx(['meta', 'blobs'], 'readwrite', function (t) { if (!t) { mem.meta = mem.meta.filter(function (x) { return x.id !== m.id; }); delete mem.blobs[m.id]; return; } t.objectStore('meta').delete(m.id); t.objectStore('blobs').delete(m.id); }); })).then(function () { return drop.length; });
    });
  }

  // ── Panel ─────────────────────────────────────────────────────────────────
  var ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V3h6v1M8.5 12.5l2.2-2.5 2.3 2.8 1.5-1.8 2 2.5M8.5 17h7"/></svg>';
  var css = '.ocx-cb-btn{position:relative;display:inline-flex;align-items:center;justify-content:center;width:36px;height:36px;border-radius:9px;border:1px solid transparent;background:transparent;color:var(--ocx-muted,#a0a0aa);cursor:pointer;padding:0}' +
    '.ocx-cb-btn:hover,.ocx-cb-btn[aria-expanded=true]{background:var(--ocx-raised,#202024);color:var(--ocx-text,#f2f2f4)}.ocx-cb-btn svg{width:21px;height:21px}' +
    '.ocx-cb-btn:focus-visible,.ocx-cb-panel button:focus-visible{outline:2px solid var(--ocx-accent-hi,#6ea0ff);outline-offset:2px}' +
    '.ocx-cb-new{display:inline-flex;align-items:center;gap:3px;margin-right:2px;color:#22c55e;font:700 .66rem/1 var(--ocx-font,system-ui);letter-spacing:.08em;pointer-events:none;animation:ocxCbNudge 1.6s ease-in-out infinite}' +
    '.ocx-cb-new svg{width:16px;height:16px}.ocx-cb-new[hidden]{display:none}' +
    '@keyframes ocxCbNudge{0%,100%{transform:translateX(0)}50%{transform:translateX(3px)}}@media (prefers-reduced-motion:reduce){.ocx-cb-new{animation:none}}@media (max-width:640px){.ocx-cb-new span{display:none}}' +
    '.ocx-cb-count{position:absolute;top:1px;right:0;min-width:16px;height:16px;padding:0 4px;border-radius:8px;background:var(--ocx-accent,#2f7bff);color:#fff;font:600 .68rem/16px var(--ocx-font,system-ui);text-align:center}' +
    '.ocx-cb-panel{position:fixed;top:60px;right:12px;z-index:200;width:min(380px,calc(100vw - 24px));max-height:calc(100vh - 80px);display:flex;flex-direction:column;border-radius:14px;background:var(--ocx-panel,#17171a);border:1px solid var(--ocx-line,#2a2a30);box-shadow:0 14px 44px rgba(0,0,0,.6);color:var(--ocx-text,#f2f2f4);font:14px/1.45 var(--ocx-font,system-ui)}' +
    '.ocx-cb-panel[hidden]{display:none}.ocx-cb-panel.is-over{outline:2px dashed var(--ocx-accent-hi,#6ea0ff);outline-offset:-6px}' +
    '.ocx-cb-head{display:flex;align-items:baseline;justify-content:space-between;padding:12px 8px 6px 14px}.ocx-cb-head b{font:600 1rem var(--ocx-display,system-ui)}.ocx-cb-head small{color:var(--ocx-dim,#7a7a84);margin-left:.5em}' +
    '.ocx-cb-head-text{display:flex;align-items:baseline;overflow:hidden}' +
    '.ocx-cb-close{flex:none;width:28px;height:28px;border-radius:8px;border:0;background:transparent;color:var(--ocx-dim,#7a7a84);font-size:1.3rem;line-height:1;cursor:pointer}.ocx-cb-close:hover{background:var(--ocx-hover,#2a2a30);color:var(--ocx-text,#f2f2f4)}' +
    '.ocx-cb-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:10px;padding:8px 14px;overflow:auto;min-height:60px}' +
    '.ocx-cb-empty{grid-column:1/-1;margin:0;padding:18px 6px;text-align:center;color:var(--ocx-muted,#a0a0aa);font-size:.88rem}' +
    '.ocx-cb-item{border:1px solid var(--ocx-line,#2a2a30);border-radius:10px;background:var(--ocx-bg,#0e0e10);overflow:hidden;display:flex;flex-direction:column}' +
    '.ocx-cb-thumb{height:92px;display:flex;align-items:center;justify-content:center;background:#0b0b0d;cursor:pointer;border:0;padding:0;width:100%}.ocx-cb-thumb img{max-width:100%;max-height:100%;object-fit:contain}' +
    '.ocx-cb-meta{padding:5px 8px 2px;font-size:.76rem;color:var(--ocx-muted,#a0a0aa);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
    '.ocx-cb-acts{display:flex;gap:2px;padding:2px 4px 5px}.ocx-cb-acts button{flex:1;padding:4px 2px;border:0;border-radius:6px;background:transparent;color:var(--ocx-accent-hi,#6ea0ff);font:500 .74rem var(--ocx-font,system-ui);cursor:pointer;white-space:nowrap}' +
    '.ocx-cb-acts button:hover{background:var(--ocx-raised,#202024)}.ocx-cb-acts .ocx-cb-del{color:var(--ocx-muted,#a0a0aa)}' +
    '.ocx-cb-foot{display:flex;flex-wrap:wrap;gap:6px;padding:10px 14px 8px;border-top:1px solid var(--ocx-line,#2a2a30)}' +
    '.ocx-cb-foot button{padding:.38rem .7rem;border-radius:8px;border:1px solid var(--ocx-line,#2a2a30);background:var(--ocx-raised,#202024);color:var(--ocx-text,#f2f2f4);font:500 .82rem var(--ocx-font,system-ui);cursor:pointer}' +
    '.ocx-cb-foot button:hover{background:var(--ocx-hover,#2a2a30)}.ocx-cb-foot button[hidden]{display:none}' +
    '.ocx-cb-item.is-off .ocx-cb-thumb img{opacity:.35}.ocx-cb-item.is-off .ocx-cb-meta{opacity:.6}.ocx-cb-item.is-missing .ocx-cb-thumb img{opacity:.25}.ocx-cb-item.is-missing .ocx-cb-meta{color:#ff7b72}' +
    '.ocx-cb-thumb{position:relative}.ocx-cb-kind{position:absolute;left:6px;top:6px;padding:1px 6px;border-radius:5px;background:rgba(0,0,0,.72);color:#fff;font:700 .62rem/1.5 var(--ocx-font,system-ui);letter-spacing:.06em}' +
    'body.ocx-cb-dragging .ocx-main{outline:2px dashed var(--ocx-accent-hi,#6ea0ff);outline-offset:-6px}' +
    '.ocx-cb-toast{position:fixed;left:50%;bottom:28px;transform:translateX(-50%);z-index:300;max-width:min(520px,calc(100vw - 32px));padding:10px 16px;border-radius:10px;background:var(--ocx-panel,#17171a);border:1px solid var(--ocx-line,#2a2a30);color:var(--ocx-text,#f2f2f4);font:500 .9rem var(--ocx-font,system-ui);box-shadow:0 10px 30px rgba(0,0,0,.5)}' +
    '.ocx-cb-ctx{position:fixed;z-index:400;display:flex;flex-direction:column;min-width:210px;padding:5px;border-radius:10px;background:var(--ocx-panel,#17171a);border:1px solid var(--ocx-line,#2a2a30);box-shadow:0 10px 30px rgba(0,0,0,.55);font:14px/1.4 var(--ocx-font,system-ui)}' +
    '.ocx-cb-ctx button{text-align:left;padding:8px 10px;border:0;border-radius:7px;background:transparent;color:var(--ocx-text,#f2f2f4);font:500 .9rem var(--ocx-font,system-ui);cursor:pointer}.ocx-cb-ctx button:hover,.ocx-cb-ctx button:focus-visible{background:var(--ocx-raised,#202024);outline:none}' +
    '.ocx-cb-ctx small{padding:4px 10px 3px;color:var(--ocx-dim,#7a7a84);font-size:.72rem}' +
    '.ocx-cb-note{margin:0;padding:0 14px 12px;min-height:1.2em;color:var(--ocx-muted,#a0a0aa);font-size:.8rem}.ocx-cb-note.is-err{color:#ff7b72}';
  var els = null, note = '', noteErr = false, newHint = null;
  function retireHint() { if (newHint) newHint.hidden = true; try { localStorage.setItem('ocx-cb-new-seen2', '1'); } catch (e) { /* ignore */ } }

  function say(t, bad) { note = t || ''; noteErr = !!bad; if (els) { els.note.textContent = note; els.note.classList.toggle('is-err', noteErr); } }
  var kb = function (n) { return n >= 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB'; };
  function download(m) {
    get(m.id).then(function (b) { if (!b) return; var a = document.createElement('a'), u = URL.createObjectURL(b), ext = (m.type.split('/')[1] || 'png').replace('jpeg', 'jpg'); a.href = u; a.download = (m.name.replace(/\.[a-z0-9]+$/i, '') || 'picture') + '.' + ext; document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(u); }, 4000); });
  }
  function useHere(m) {
    if (m.path) {                                              // a video or audio reference
      if (!usable(m)) return say(unusableWhy(m), true);
      var sp = proMedia(); var go = function (ok) { if (ok === false) return say('The file ' + m.name + ' was not found. It may have been moved or deleted.', true); close(); Promise.resolve(handlers.loadPath(m)).catch(function () { alert('This tool could not open that file.'); }); };
      return sp ? sp.media.exists([m.path]).then(function (r) { go(r[m.path]); }) : go(true);
    }
    if (!handlers || !handlers.load) return;
    get(m.id).then(function (b) {
      if (!b) return say('That picture is no longer stored.', true);
      var f; try { f = new File([b], m.name, { type: m.type }); } catch (e) { f = b; f.name = m.name; }
      close();                                                 // do not wait: some tools (Remove Background) keep working for a while after loading
      return Promise.resolve(handlers.load(f)).catch(function () { alert('This tool could not open that picture.'); });
    }).catch(function () { say('This tool could not open that picture.', true); });
  }
  function unusableWhy(m) {
    var k = kindOf(m), tool = ((document.title.split('|')[0] || '').split(':')[0] || 'This tool').trim();
    return tool + ' cannot open ' + (k === 'image' ? 'pictures' : k === 'video' ? 'video' : 'sound files') + '.';
  }
  function render() {
    if (!els) return;
    list().then(function (all) {
      var nImg = all.filter(function (m) { return kindOf(m) === 'image'; }).length, nMedia = all.length - nImg;
      els.count.textContent = all.length; els.count.hidden = !all.length;
      els.title.textContent = all.length ? all.length + (all.length === 1 ? ' item' : ' items') : 'Empty';
      els.grid.textContent = '';
      if (!all.length) { var p = document.createElement('p'); p.className = 'ocx-cb-empty'; p.textContent = proMedia() ? 'Nothing here yet. Add a picture, video or sound with the buttons below, or drop a file here.' : 'Nothing here yet. Add a picture with the buttons below, drop one here, or press Paste.'; els.grid.appendChild(p); }
      var gone = [];
      all.forEach(function (m) {
        var k = kindOf(m), ok = usable(m), it = document.createElement('div'); it.className = 'ocx-cb-item' + (ok ? '' : ' is-off'); it.dataset.path = m.path || '';
        var th = document.createElement('button'); th.type = 'button'; th.className = 'ocx-cb-thumb'; th.title = ok ? 'Open ' + m.name + ' in this tool' : unusableWhy(m);
        var im = document.createElement('img'); im.alt = m.name; im.src = URL.createObjectURL(m.thumb); im.onload = function () { URL.revokeObjectURL(im.src); }; th.appendChild(im);
        if (k !== 'image') { var bd = document.createElement('span'); bd.className = 'ocx-cb-kind'; bd.textContent = k === 'video' ? 'VIDEO' : 'AUDIO'; th.appendChild(bd); }
        th.addEventListener('click', function () { useHere(m); });
        im.draggable = true;                                         // drag a thumbnail onto a tool's timeline or canvas (the tool reads the item id)
        th.addEventListener('dragstart', function (e) { e.dataTransfer.setData('application/x-ocx-clip', m.id); e.dataTransfer.setData('text/plain', m.name); e.dataTransfer.effectAllowed = 'copy'; });
        var mt = document.createElement('div'); mt.className = 'ocx-cb-meta'; mt.title = m.name + (m.path ? '\n' + m.path : '');
        mt.textContent = k === 'image' ? m.name + '  ' + m.w + '×' + m.h + ', ' + kb(m.size) : m.name + '  ' + fmtDur(m.duration) + (m.fileSize ? ', ' + kb(m.fileSize) : '');
        var ac = document.createElement('div'); ac.className = 'ocx-cb-acts';
        function btn(t, fn, cls, label) { var b = document.createElement('button'); b.type = 'button'; b.textContent = t; b.setAttribute('aria-label', label + ' ' + m.name); if (cls) b.className = cls; b.addEventListener('click', fn); ac.appendChild(b); }
        if (ok) btn('Use here', function () { useHere(m); }, '', 'Open in this tool:');
        if (k === 'image') btn('Download', function () { download(m); }, '', 'Download');
        else btn('Show', function () { if (window.studioPro && window.studioPro.video && window.studioPro.video.reveal) window.studioPro.video.reveal(m.path); }, '', 'Show in Finder:');
        btn('Remove', function () { remove(m.id); }, 'ocx-cb-del', 'Remove');
        it.append(th, mt, ac); els.grid.appendChild(it); if (m.path) gone.push({ m: m, it: it, mt: mt });
      });
      if (gone.length && proMedia()) proMedia().media.exists(gone.map(function (g) { return g.m.path; })).then(function (r) {          // mark references whose file has moved or been deleted
        gone.forEach(function (g) { if (r[g.m.path] === false) { g.it.classList.add('is-missing'); g.mt.textContent = 'File not found: ' + g.m.name; } });
      }).catch(function () { /* checking is optional */ });
      els.clear.hidden = !all.length; els.addCur.hidden = !(handlers && handlers.getOutput && handlers.outputKind !== 'text'); els.addFile.hidden = !(handlers && handlers.getFile && proMedia());
    });
  }
  var MEDIA_EXT = /\.(mp4|m4v|mov|webm|mkv|avi|mpg|mpeg|mts|m2ts|3gp|mp3|wav|m4a|aac|flac|ogg|opus|aiff|aif|wma)$/i;
  function addFiles(files) {
    files = Array.prototype.slice.call(files || []);
    var imgs = files.filter(function (f) { return /^image\//.test(f.type); }), media = files.filter(function (f) { return !/^image\//.test(f.type) && (/^(video|audio)\//.test(f.type) || MEDIA_EXT.test(f.name || '')); });
    if (!imgs.length && !media.length) return say(proMedia() ? 'Drop or choose a picture, video or sound file.' : 'Drop or choose a picture file.', true);
    var jobs = imgs.map(function (f) { return add(f, f.name); });
    media.forEach(function (f) { var sp = proMedia(), p = sp && sp.pathForFile ? sp.pathForFile(f) : null; jobs.push(p ? addPath(p) : Promise.resolve({ ok: false, reason: 'Video and audio can be kept here in the Studio Pro app.' })); });
    Promise.all(jobs).then(function (rs) {
      var ok = rs.filter(function (r) { return r.ok; }).length, dropped = rs.reduce(function (n, r) { return n + (r.dropped || 0); }, 0);
      say(ok ? 'Added ' + ok + (ok === 1 ? ' item.' : ' items.') + (dropped ? ' The oldest ' + dropped + ' removed to stay under the limit (20 items).' : '') : (rs.filter(function (r) { return r.reason; })[0] || {}).reason || 'Nothing was added.', !ok);
    });
  }
  function pasteIn() {
    var fromNav = navigator.clipboard && navigator.clipboard.read ? navigator.clipboard.read().then(function (items) {
      var jobs = []; items.forEach(function (it) { it.types.forEach(function (t) { if (/^image\//.test(t)) jobs.push(it.getType(t)); }); });
      return Promise.all(jobs);
    }) : Promise.reject();
    fromNav.catch(function () {                                      // the app edition reads the system clipboard through its main process
      var sp = window.studioPro; return sp && sp.clipboard ? sp.clipboard.readImage().then(function (b) { return b ? [new Blob([b], { type: 'image/png' })] : []; }) : [];
    }).then(function (blobs) {
      if (!blobs.length) return say('There is no picture on the computer clipboard.', true);
      addFiles(blobs.map(function (b) { try { return new File([b], 'Pasted picture.png', { type: b.type }); } catch (e) { b.name = 'Pasted picture.png'; return b; } }));
    }).catch(function () { say('This browser would not let Studio read the clipboard. Press Cmd/Ctrl+V while this panel is open instead.', true); });
  }
  function addCurrent() {
    if (!handlers || !handlers.getOutput) return;
    Promise.resolve().then(function () { return handlers.getOutput(); }).then(function (b) {
      if (!b) return say('This tool has no picture to add yet.', true);
      return add(b, (b.name || 'From ' + (document.title.split('|')[0].trim() || 'Studio')) ).then(function (r) { say(r.ok ? 'Added the picture from this tool.' + (r.dropped ? ' The oldest was removed to stay under the limit.' : '') : r.reason, !r.ok); });
    }).catch(function () { say('Could not get the picture from this tool.', true); });
  }
  function addCurrentFile() {
    if (!handlers || !handlers.getFile) return;
    Promise.resolve().then(function () { return handlers.getFile(); }).then(function (p) {
      if (!p) return say('Select a clip first, or export something to add.', true);
      return addPath(p).then(function (r) { say(r.ok ? 'Added the file (the tray keeps its location, not a copy).' : r.reason, !r.ok); });
    }).catch(function () { say('Could not get the file from this tool.', true); });
  }
  function toggle(force) { var show = force === undefined ? els.panel.hidden : force; els.panel.hidden = !show; els.btn.setAttribute('aria-expanded', String(show)); if (show) { say(''); render(); } }
  function close() { if (els && !els.panel.hidden) toggle(false); }

  function toast(text) {
    var d = document.createElement('div'); d.className = 'ocx-cb-toast'; d.setAttribute('role', 'status'); d.textContent = text; document.body.appendChild(d); setTimeout(function () { d.remove(); }, 3600);
  }
  // ── Dropping an item from the tray anywhere on the page ───────────────────
  var trayEvent = function (e) { return !!e.dataTransfer && Array.prototype.indexOf.call(e.dataTransfer.types || [], 'application/x-ocx-clip') >= 0; };
  var ownZone = function (e) { return !!(e.target && e.target.closest && e.target.closest('[data-ocx-drop]')); };
  window.addEventListener('dragover', function (e) {
    if (!trayEvent(e) || ownZone(e)) return;
    e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; document.body.classList.add('ocx-cb-dragging');
  }, true);
  window.addEventListener('dragleave', function (e) { if (!e.relatedTarget) document.body.classList.remove('ocx-cb-dragging'); }, true);
  window.addEventListener('dragend', function () { document.body.classList.remove('ocx-cb-dragging'); }, true);
  window.addEventListener('drop', function (e) {
    if (!trayEvent(e)) return; document.body.classList.remove('ocx-cb-dragging'); if (ownZone(e)) return;
    e.preventDefault(); e.stopImmediatePropagation();                // the tool's own file-drop handler must not see a tray drag
    var id = e.dataTransfer.getData('application/x-ocx-clip');
    list().then(function (items) {
      var m = items.filter(function (i) { return i.id === id; })[0]; if (!m) return;
      if (!handlers) return toast('This page cannot take items from the clipboard.');
      if (!usable(m)) return toast(unusableWhy(m));
      useHere(m);
    });
  }, true);

  function build() {
    var top = document.querySelector('.ocx-top'); if (!top || document.querySelector('.ocx-cb-btn') || document.querySelector('.ocx-embedded')) return;
    var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
    var links = top.querySelector('.ocx-top-links');
    if (!links) { links = document.createElement('div'); links.className = 'ocx-top-links'; top.appendChild(links); }
    var b = document.createElement('button'); b.type = 'button'; b.className = 'ocx-cb-btn'; b.setAttribute('aria-expanded', 'false'); b.setAttribute('aria-haspopup', 'dialog');
    b.title = 'Studio clipboard: pictures you can move between tools'; b.setAttribute('aria-label', 'Studio clipboard'); b.innerHTML = ICON + '<span class="ocx-cb-count" hidden>0</span>';
    links.insertBefore(b, links.firstChild);
    // "NEW" hint with a green arrow pointing at the clipboard icon. It goes away for good once the clipboard has been opened.
    if (/[?&]ocx-new=1\b/.test(location.search)) { try { localStorage.removeItem('ocx-cb-new-seen2'); } catch (e) { /* ignore */ } }   // ?ocx-new=1 brings the hint back
    var seen = false; try { seen = localStorage.getItem('ocx-cb-new-seen2') === '1'; } catch (e) { /* ignore */ }
    if (!seen) {
      newHint = document.createElement('span'); newHint.className = 'ocx-cb-new'; newHint.setAttribute('aria-hidden', 'true');
      newHint.innerHTML = '<span>NEW</span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12h15M13 6l6 6-6 6"/></svg>';
      links.insertBefore(newHint, b);
    }
    var p = document.createElement('div'); p.className = 'ocx-cb-panel'; p.hidden = true; p.setAttribute('role', 'dialog'); p.setAttribute('aria-label', 'Studio clipboard');
    p.innerHTML = '<div class="ocx-cb-head"><span class="ocx-cb-head-text"><b>Studio clipboard</b><small></small></span><button type="button" class="ocx-cb-close" aria-label="Close">&times;</button></div><div class="ocx-cb-grid"></div>' +
      '<div class="ocx-cb-foot"><button type="button" data-a="cur">Add this tool’s picture</button><button type="button" data-a="curfile" hidden>Add selected clip</button><button type="button" data-a="file">Add picture…</button><button type="button" data-a="paste">Paste</button><button type="button" data-a="clear">Clear all</button></div><p class="ocx-cb-note" role="status"></p>' +
      '<input type="file" accept="image/*" multiple hidden>';
    if (proMedia()) { p.querySelector('input').setAttribute('accept', 'image/*,video/*,audio/*'); p.querySelector('[data-a=file]').textContent = 'Add file…'; }
    document.body.appendChild(p);
    els = { btn: b, panel: p, count: b.querySelector('.ocx-cb-count'), title: p.querySelector('small'), grid: p.querySelector('.ocx-cb-grid'), note: p.querySelector('.ocx-cb-note'), file: p.querySelector('input'),
      addCur: p.querySelector('[data-a=cur]'), addFile: p.querySelector('[data-a=curfile]'), clear: p.querySelector('[data-a=clear]') };
    els.addCur.hidden = true; els.addFile.hidden = true; els.clear.hidden = true;
    b.addEventListener('click', function () { toggle(); });
    p.querySelector('.ocx-cb-close').addEventListener('click', function () { close(); b.focus(); });
    p.querySelector('[data-a=file]').addEventListener('click', function () { els.file.click(); });
    els.file.addEventListener('change', function () { addFiles(els.file.files); els.file.value = ''; });
    p.querySelector('[data-a=paste]').addEventListener('click', pasteIn);
    els.addCur.addEventListener('click', addCurrent); els.addFile.addEventListener('click', addCurrentFile);
    els.clear.addEventListener('click', function () { clear().then(function () { say('Cleared.'); }); });
    ['dragenter', 'dragover'].forEach(function (ev) { [b, p].forEach(function (t) { t.addEventListener(ev, function (e) { if (e.dataTransfer && Array.prototype.indexOf.call(e.dataTransfer.types || [], 'Files') >= 0) { e.preventDefault(); p.classList.add('is-over'); if (p.hidden) toggle(true); } }); }); });
    p.addEventListener('dragleave', function (e) { if (!p.contains(e.relatedTarget)) p.classList.remove('is-over'); });
    [b, p].forEach(function (t) { t.addEventListener('drop', function (e) { e.preventDefault(); p.classList.remove('is-over'); addFiles(e.dataTransfer.files); }); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !p.hidden) { close(); b.focus(); } });
    document.addEventListener('pointerdown', function (e) { if (!p.hidden && !p.contains(e.target) && !b.contains(e.target)) close(); });
    document.addEventListener('paste', function (e) {                // Cmd/Ctrl+V while the panel is open adds the picture
      if (p.hidden || !e.clipboardData || !e.clipboardData.files.length) return; e.preventDefault(); e.stopPropagation(); addFiles(e.clipboardData.files);
    }, true);
    onChange(render); render();
  }
  function onChange(fn) { listeners.push(fn); }

  function attach(h) {
    handlers = h || null; setTimeout(openStock, 0);
    if (els) {
      els.addCur.hidden = !(handlers && handlers.getOutput); els.addCur.textContent = (handlers && handlers.outputLabel) || 'Add this tool’s picture';
      els.addFile.hidden = !(handlers && handlers.getFile && proMedia()); els.addFile.textContent = (handlers && handlers.fileLabel) || 'Add selected clip';
      render();
    }
  }

  // ── Embedded mode (?embed=1) ───────────────────────────────────────────────
  // A tool can run inside a frame in a bigger tool (Design) to do one job on a picture, then hand the result back.
  //   page -> tool:  { ocx: 'load', file: Blob, name }     opens the picture (only if the tool has a load handler)
  //   tool -> page:  { ocx: 'ready', canLoad }              the tool is ready
  //                  { ocx: 'result', blob, name }          the tool's output: a PNG (or JPEG/WebP) picture, or an SVG (blob.type image/svg+xml, name ends in .svg)
  //                  { ocx: 'result', text, name }          a text output (getOutput returned a string), e.g. recognised text or a palette as CSS
  //                  { ocx: 'cancel' }                      the user backed out
  // getOutput() may return a Blob (picture or SVG), a string (text), a Promise of either, or null when there is nothing yet.
  // Same-origin only. The chrome (top bar, menu, headings) is hidden by studio.css; a small bar at the bottom sends the result back.
  var EMBED = false; try { EMBED = window.parent !== window && /[?&]embed=1(&|$)/.test(location.search); } catch (e) { /* not embedded */ }
  function embedSetup() {
    document.documentElement.classList.add('ocx-embed');
    var to = (location.search.match(/[?&]to=([^&]*)/) || [])[1]; to = to ? decodeURIComponent(to).slice(0, 40) : 'the other tool';
    var post = function (m) { try { window.parent.postMessage(m, location.origin); } catch (e) { /* ignore */ } };
    var bar = document.createElement('div'); bar.className = 'ocx-embed-bar';
    bar.innerHTML = '<span class="ocx-embed-msg" role="status"></span><button type="button" class="ocx-btn" data-a="cancel">Cancel</button><button type="button" class="ocx-btn ocx-btn-primary" data-a="send"></button>';
    var msgEl = bar.querySelector('.ocx-embed-msg'), send = bar.querySelector('[data-a=send]'); send.textContent = 'Send back to ' + to;
    document.body.appendChild(bar);
    bar.querySelector('[data-a=cancel]').addEventListener('click', function () { post({ ocx: 'cancel' }); });
    send.addEventListener('click', function () {
      if (!handlers || !handlers.getOutput) { msgEl.textContent = 'This tool cannot send a picture back.'; return; }
      msgEl.textContent = 'Preparing...'; send.disabled = true;
      Promise.resolve().then(function () { return handlers.getOutput(); }).then(function (b) {
        send.disabled = false;
        if (!b) { msgEl.textContent = 'Nothing to send back yet. Finish the edit in this tool first.'; return; }
        var base = 'studio-' + (document.title.split('|')[0] || 'edit').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
        msgEl.textContent = '';
        if (typeof b === 'string') { post({ ocx: 'result', text: b, name: base + '.txt' }); return; }
        var t = b.type || '', ext = /svg/.test(t) ? 'svg' : /jpe?g/.test(t) ? 'jpg' : /webp/.test(t) ? 'webp' : 'png';
        post({ ocx: 'result', blob: b, name: base + '.' + ext });
      }).catch(function () { send.disabled = false; msgEl.textContent = 'Something went wrong. Try again.'; });
    });
    window.addEventListener('message', function (e) {
      if (e.origin !== location.origin || e.source !== window.parent || !e.data || e.data.ocx !== 'load') return;
      if (handlers && handlers.load) Promise.resolve(handlers.load(e.data.file)).catch(function () { msgEl.textContent = 'This tool could not open that picture.'; });
    });
    var announce = function () { post({ ocx: 'ready', canLoad: !!(handlers && handlers.load) }); };
    setTimeout(announce, 0); setTimeout(announce, 600);            // the tool may attach a moment after the page loads; the page answers only the first one
  }

  // ── Right-click: "Add to Studio clipboard" ──────────────────────────────────
  // Right-clicking a picture a tool is showing (a canvas, a blob/data image or a large drawing) offers to add it to the tray.
  // Hold Shift to get the browser's own menu instead. Pictures that belong to the page itself (logos, tiles, icons) are left alone.
  var ctxMenu = null;
  function ctxTarget(t) {
    for (var el = t; el && el !== document.body && el.nodeType === 1; el = el.parentNode) {
      if (el.closest && el.closest('.ocx-cb-panel, .ocx-top, .ocx-side, .ocx-embed-bar, .ocx-gate, nav, header, footer, button, input, select, textarea, [contenteditable]')) return null;
      var tag = el.tagName.toLowerCase();
      if (tag === 'canvas' && el.width >= 48 && el.height >= 48) return el;
      if (tag === 'img' && /^(blob:|data:image)/.test(el.currentSrc || el.src || '') && (el.naturalWidth || 0) >= 48) return el;
      if (tag === 'svg' && !el.classList.contains('ocx-ico') && el.getBoundingClientRect().width >= 96 && !el.closest('a, label')) return el;
    }
    return null;
  }
  function pngOf(canvas) { return new Promise(function (res, rej) { canvas.toBlob(function (b) { b ? res(b) : rej(); }, 'image/png'); }); }
  function blobFromTarget(el) {
    var tag = el.tagName.toLowerCase();
    if (tag === 'canvas') return pngOf(el);
    if (tag === 'img') return fetch(el.currentSrc || el.src).then(function (r) { return r.blob(); });
    var xml = new XMLSerializer().serializeToString(el), r = el.getBoundingClientRect(), k = Math.min(3, 2048 / Math.max(r.width, r.height));
    return new Promise(function (res, rej) {
      var im = new Image(); im.onload = function () { var cv = document.createElement('canvas'); cv.width = Math.round(r.width * k); cv.height = Math.round(r.height * k); cv.getContext('2d').drawImage(im, 0, 0, cv.width, cv.height); pngOf(cv).then(res, rej); };
      im.onerror = rej; im.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(xml);
    });
  }
  function closeCtx() { if (ctxMenu) { ctxMenu.remove(); ctxMenu = null; } }
  // Anywhere else in a tool's work area (not a control, not a text field) the menu still offers Paste, and Copy of the tool's current picture.
  function inWorkArea(t) {
    if (!t || !t.closest || !t.closest('.ocx-main')) return false;
    if (t.closest('.ocx-drop')) return true;           // the empty drop zone is a button or label (it opens the file chooser); it still gets the menu
    return !t.closest('.ocx-cb-panel, .ocx-top, .ocx-side, .ocx-embed-bar, .ocx-gate, nav, header, footer, button, input, select, textarea, a, label, summary, [contenteditable], [role=dialog], dialog');
  }
  function asPng(blob) {
    if (blob.type === 'image/png') return Promise.resolve(blob);
    return createImageBitmap(blob).then(function (bmp) { var cv = document.createElement('canvas'); cv.width = bmp.width; cv.height = bmp.height; cv.getContext('2d').drawImage(bmp, 0, 0); return pngOf(cv); });
  }
  function copyPicture(blob) {                                       // the picture goes to the system clipboard, ready to paste into any app
    return asPng(blob).then(function (png) { return navigator.clipboard.write([new ClipboardItem({ 'image/png': png })]); })
      .then(function () { toast('Copied.'); }).catch(function () { toast('The browser did not allow copying. Use Add to Studio clipboard instead.'); });
  }
  function pastePicture() {                                          // a picture on the system clipboard opens in this tool, like Ctrl+V
    if (!handlers || !handlers.load) return;
    navigator.clipboard.read().then(function (items) {
      for (var i = 0; i < items.length; i++) {
        var t = items[i].types.filter(function (x) { return /^image\//.test(x); })[0];
        if (t) return items[i].getType(t).then(function (b) { return Promise.resolve(handlers.load(new File([b], 'Pasted picture.' + (b.type.split('/')[1] || 'png').replace('jpeg', 'jpg'), { type: b.type }))); });
      }
      toast('There is no picture on the clipboard.');
    }).catch(function () { toast('The browser did not allow reading the clipboard. Press Ctrl+V (Cmd+V on a Mac) to paste instead.'); });
  }
  document.addEventListener('contextmenu', function (e) {
    closeCtx(); if (e.shiftKey || e.defaultPrevented) return;
    var el = ctxTarget(e.target), area = !el && inWorkArea(e.target);
    var canPaste = !!(handlers && handlers.load), canGet = !!(handlers && handlers.getOutput && handlers.outputKind !== 'text');
    if (!el && !(area && (canPaste || canGet))) return;
    var source = function () { return el ? blobFromTarget(el) : Promise.resolve(handlers.getOutput()); };
    var name = el ? (el.getAttribute('aria-label') || el.getAttribute('alt') || (document.title.split('|')[0] || 'Picture')).trim().slice(0, 60) : (document.title.split('|')[0] || 'Picture').trim().slice(0, 60);
    var m = ctxMenu = document.createElement('div'); m.className = 'ocx-cb-ctx'; m.setAttribute('role', 'menu');
    function item(label, fn) { var b = document.createElement('button'); b.type = 'button'; b.setAttribute('role', 'menuitem'); b.textContent = label; b.addEventListener('click', function () { closeCtx(); fn(); }); m.appendChild(b); }
    if (el || canGet) item(el ? 'Copy picture' : 'Copy result', function () { source().then(function (b) { if (!b) { toast('There is nothing to copy yet.'); return; } return copyPicture(b); }).catch(function () { toast('That picture could not be copied.'); }); });
    if (canPaste) item('Paste picture', pastePicture);
    var hr = document.createElement('hr'); m.appendChild(hr);
    if (el || canGet) item('Add to Studio clipboard', function () {
      source().then(function (b) { if (!b) { toast('There is nothing to add yet.'); return null; } return add(b, name); })
        .then(function (r) { if (r) toast(r.ok ? 'Added to the Studio clipboard.' : (r.reason || 'That picture could not be added.')); }).catch(function () { toast('That picture could not be added.'); });
    });
    if (!hr.nextSibling) hr.remove();
    var sm = document.createElement('small'); sm.textContent = 'Shift + right-click for the browser menu'; m.appendChild(sm);
    e.preventDefault(); document.body.appendChild(m);
    var w = m.offsetWidth, h = m.offsetHeight; m.style.left = Math.max(4, Math.min(e.clientX, innerWidth - w - 4)) + 'px'; m.style.top = Math.max(4, Math.min(e.clientY, innerHeight - h - 4)) + 'px';
    m.querySelector('button').focus();
  });
  ['pointerdown', 'scroll', 'resize', 'blur'].forEach(function (ev) { window.addEventListener(ev, function (e) { if (ctxMenu && !(e.target && e.target.nodeType === 1 && ctxMenu.contains(e.target))) closeCtx(); }, true); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeCtx(); });

  // ── Open a Stock item (?stock=<id>) ─────────────────────────────────────────
  // The "Edit" button on the Stock pages links to a tool with ?stock=<id>. The tool opens that item exactly like "Use here".
  var stockId = (location.search.match(/[?&]stock=(\d{1,9})(&|$)/) || [])[1], stockDone = false;
  function openStock() {
    if (!stockId || stockDone || !handlers) return;
    if (!handlers.load) return;
    stockDone = true;
    fetch('/britewire/stock-search.php?id=' + stockId).then(function (r) { return r.json(); }).then(function (d) {
      var it = d && d.item; if (!it) throw 0;
      return fetch(it.file).then(function (r) { if (!r.ok) throw 0; return r.blob(); }).then(function (b) {
        var ext = (it.file.match(/\.([a-z0-9]+)$/i) || [0, 'png'])[1].toLowerCase();
        var f; try { f = new File([b], (it.title || 'stock').replace(/[^\w.\- ]+/g, '').slice(0, 60) + '.' + ext, { type: b.type || it.mime }); } catch (e) { f = b; f.name = 'stock.' + ext; }
        return handlers.load(f);
      });
    }).catch(function () { toast('That Stock item could not be opened here.'); });
  }
  if (stockId) setTimeout(function () { if (!stockDone && !(handlers && handlers.load)) toast('This tool cannot open Stock items yet.'); }, 2500);
  window.OCXClip = { add: add, addPath: addPath, close: close, list: list, get: get, remove: remove, clear: clear, onChange: onChange, attach: attach, _q: null };
  pending.forEach(attach);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build); else build();
  if (EMBED) { if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', embedSetup); else embedSetup(); }
})();
