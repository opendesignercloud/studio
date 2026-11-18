/* Open Designer Cloud Studio: shared shell.
   - renders the side navigation from window.OCX_TOOLS (tools.js)
   - exposes OCX.access, a promise for the access check (see /britewire/studio-access.php)
   - shows a sign-in screen when the site is switched to "login" mode */
(function () {
  'use strict';
  // The Studio clipboard (a shared multi-picture tray) lives in clipboard.js. Tools call OCXClip.attach({ load, getOutput }); calls made before it has loaded are queued.
  window.OCXClip = window.OCXClip || { _q: [], attach: function (o) { this._q.push(o); } };
  (function () { var s = document.createElement('script'); s.src = '/assets/studio/clipboard.js?v=17'; s.defer = true; (document.head || document.documentElement).appendChild(s); })();
  var icons = window.OCX_ICONS || {};
  // ai = true wraps the icon so CSS can badge it with the blue AI star (any tool that runs a model).
  function svg(name, ai) {
    var i = '<svg class="ocx-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (icons[name] || '') + '</svg>';
    return ai ? '<span class="ocx-ico-ai" title="Uses AI">' + i + '</span>' : i;
  }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  // ── Side navigation ───────────────────────────────────────────────────────
  // Optional edition settings (Studio Pro sets window.OCX_NAV; the website does not):
  //   toolsLabel: heading above the tool list    sections: [{ id, name, url, icon }] links placed under Home
  //   footer: [{ id, name, url, icon }] links pinned to the bottom of the menu    brandTag: top bar tag text    version: small note after the tag
  var cfg = window.OCX_NAV || {};
  // Top bar: Studio Pro relabels the tag and adds a small version note after it (window.OCX_NAV.brandTag / .version).
  (function () {
    var brand = document.querySelector('.ocx-brand'); if (!brand || !(cfg.brandTag || cfg.version)) return;
    var tag = brand.querySelector('.ocx-tag'); if (tag && cfg.brandTag) tag.textContent = cfg.brandTag;
    if (cfg.version) { var v = document.createElement('span'); v.className = 'ocx-ver'; v.textContent = cfg.version; brand.appendChild(v); }
  })();
  var nav = document.querySelector('[data-ocx-nav]');
  function proNav() {
    return (cfg.sections || []).map(function (x) {
      return '<a class="ocx-nav' + (active === x.id ? ' is-active' : '') + '" href="' + esc(x.url) + '"' +
        (active === x.id ? ' aria-current="page"' : '') + '>' + svg(x.icon, x.ai) + '<span>' + esc(x.name) + '</span>' + (x.badge ? '<em>' + esc(x.badge) + '</em>' : '') + '</a>';
    }).join('');
  }
  if (nav) {
    var active = nav.getAttribute('data-active') || '';
    var html = '<nav aria-label="Studio tools"><a class="ocx-nav' + (active === 'home' ? ' is-active' : '') + '" href="/studio"' +
      (active === 'home' ? ' aria-current="page"' : '') + '>' + svg('home') + '<span>Home</span></a>' +
      proNav() + '<p class="ocx-nav-sec">' + esc(cfg.toolsLabel || 'Make and edit') + '</p>';
    (window.OCX_TOOLS || []).forEach(function (t) {
      if (t.status === 'live') {
        html += '<a class="ocx-nav' + (active === t.id ? ' is-active' : '') + '" href="' + esc(t.url) + '"' +
          (active === t.id ? ' aria-current="page"' : '') + '>' + svg(t.icon, t.ai) + '<span>' + esc(t.name) + '</span></a>';
      } else {
        html += '<span class="ocx-nav is-soon" aria-disabled="true">' + svg(t.icon, t.ai) + '<span>' + esc(t.name) + '</span><em>Soon</em></span>';
      }
    });
    html += '<p class="ocx-nav-sec">Explore</p>';
    (window.OCX_LINKS || []).forEach(function (l) {
      html += '<a class="ocx-nav" href="' + esc(l.url) + '">' + svg(l.icon) + '<span>' + esc(l.name) + '</span></a>';
    });
    html += '</nav><p class="ocx-side-note">Your files are processed on your device and are never uploaded.</p>';
    if ((cfg.footer || []).length) {
      html += '<nav class="ocx-side-foot" aria-label="Settings">' + cfg.footer.map(function (x) {
        return '<a class="ocx-nav' + (active === x.id ? ' is-active' : '') + '" href="' + esc(x.url) + '"' +
          (active === x.id ? ' aria-current="page"' : '') + '>' + svg(x.icon) + '<span>' + esc(x.name) + '</span></a>';
      }).join('') + '</nav>';
    }
    nav.innerHTML = html;

    // Collapse the menu to icons only to give the tool more room; the choice is remembered
    var app = nav.closest('.ocx-app'), key = 'ocx-side-collapsed';
    Array.prototype.forEach.call(nav.querySelectorAll('a.ocx-nav, span.ocx-nav'), function (a) { var s = a.querySelector('span'); if (s) a.setAttribute('title', s.textContent); });
    var btn = document.createElement('button');
    btn.type = 'button'; btn.className = 'ocx-collapse';
    btn.innerHTML = '<svg class="ocx-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M13 17l-5-5 5-5M19 17l-5-5 5-5"/></svg><span>Collapse menu</span>';
    nav.insertBefore(btn, nav.firstChild);
    function setCollapsed(on, save) {
      if (app) app.classList.toggle('is-collapsed', on);
      btn.setAttribute('aria-expanded', on ? 'false' : 'true'); btn.setAttribute('aria-label', on ? 'Expand menu' : 'Collapse menu'); btn.title = on ? 'Expand menu' : 'Collapse menu';
      if (save) { try { localStorage.setItem(key, on ? '1' : '0'); } catch (e) {} }
      try { window.dispatchEvent(new Event('resize')); } catch (e) {}
    }
    var was = false; try { was = localStorage.getItem(key) === '1'; } catch (e) {}
    setCollapsed(was, false);
    btn.addEventListener('click', function () { setCollapsed(!(app && app.classList.contains('is-collapsed')), true); });
  }

  // ── Adjustable picture area ───────────────────────────────────────────────
  // Tools with a picture preview get a grip on the bottom edge of the stage. Dragging it sets the stage height (and so how tall the picture
  // can be); the height is remembered per tool. Phones keep their own layouts.
  (function () {
    var stage = document.getElementById('stage');
    if (!stage || !stage.classList.contains('ocx-stage') || !stage.querySelector('.ocx-view, .ocx-preview')) return;
    var key = 'ocx-stage-h:' + location.pathname.replace(/\/+$/, ''), wide = window.matchMedia('(min-width: 901px)');
    var grip = document.createElement('div');
    grip.className = 'ocx-grip'; grip.setAttribute('role', 'separator'); grip.setAttribute('aria-orientation', 'horizontal'); grip.tabIndex = 0;
    grip.setAttribute('aria-label', 'Drag to change the picture height'); grip.title = 'Drag to change the height. Double-click to reset.'; grip.innerHTML = '<i></i>';
    stage.appendChild(grip);
    function setH(h, save) {
      if (h == null) { stage.style.removeProperty('--ocx-stage-h'); stage.style.removeProperty('--ocx-view-h'); return; }
      h = Math.round(Math.min(Math.max(380, h), Math.max(600, window.innerHeight * 3)));
      stage.style.setProperty('--ocx-stage-h', h + 'px'); stage.style.setProperty('--ocx-view-h', (h - 28) + 'px');
      if (save) { try { localStorage.setItem(key, String(h)); } catch (e) {} }
    }
    try { var v = +localStorage.getItem(key); if (v >= 380 && wide.matches) setH(v, false); } catch (e) {}
    grip.addEventListener('pointerdown', function (e) {
      e.preventDefault(); grip.setPointerCapture(e.pointerId); grip.classList.add('is-drag');
      var y0 = e.clientY, h0 = stage.getBoundingClientRect().height;
      function go(ev) { setH(h0 + ev.clientY - y0, true); }
      function up() { grip.classList.remove('is-drag'); grip.removeEventListener('pointermove', go); grip.removeEventListener('pointerup', up); grip.removeEventListener('pointercancel', up); }
      grip.addEventListener('pointermove', go); grip.addEventListener('pointerup', up); grip.addEventListener('pointercancel', up);
    });
    grip.addEventListener('dblclick', function () { setH(null); try { localStorage.removeItem(key); } catch (e) {} });
    grip.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); setH(stage.getBoundingClientRect().height + (e.key === 'ArrowDown' ? 40 : -40), true); }
    });
  })();

  // ── Landing tiles follow the registry ──────────────────────────────────────
  // A tile's tool id is taken from its image name (tile-<tool-id>.jpg), and its Live / Coming soon state, link and
  // badge follow window.OCX_TOOLS (tools.js). Making a tool live there updates its tile with no page edit.
  Array.prototype.forEach.call(document.querySelectorAll('.ocx-badge.is-live'), function (b) { b.parentNode.removeChild(b); });
  Array.prototype.forEach.call(document.querySelectorAll('.ocx-tile'), function (t) {
    var img = t.querySelector('img'), m = img && /tile-([a-z0-9-]+)[.]jpg/.exec(img.getAttribute('src') || '');
    var tool = m && (window.OCX_TOOLS || []).filter(function (x) { return x.id === m[1]; })[0];
    if (!tool) return;
    var live = tool.status === 'live';
    if (live === (t.tagName === 'A')) return;
    var n = document.createElement(live ? 'a' : 'div');
    n.className = 'ocx-tile' + (live ? '' : ' is-soon');
    n.innerHTML = t.innerHTML;
    if (live) n.setAttribute('href', tool.url); else { n.setAttribute('role', 'group'); n.setAttribute('aria-label', tool.name + ', coming soon'); }
    var badge = n.querySelector('.ocx-badge');
    if (badge) { if (live) badge.parentNode.removeChild(badge); else badge.textContent = 'Coming soon'; }
    t.parentNode.replaceChild(n, t);
  });

  // ── Usage events ──────────────────────────────────────────────────────────
  // OCX.track('use' | 'download' | 'copy', { tool, model, ok, ms, mp, gpu, fb, fmt })
  // Sends a tiny anonymous event to /britewire/studio-event.php (no images, file names or personal data).
  // Reported in the CORE admin under "Studio usage". Never throws and never blocks a tool.
  var OCX = window.OCX = window.OCX || {};
  OCX.track = function (event, props) {
    try {
      var body = JSON.stringify(Object.assign({ event: event }, props || {}));
      var url = '/britewire/studio-event.php';
      if (navigator.sendBeacon && navigator.sendBeacon(url, new Blob([body], { type: 'application/json' }))) return;
      fetch(url, { method: 'POST', body: body, headers: { 'Content-Type': 'application/json' }, keepalive: true }).catch(function () {});
    } catch (e) { /* telemetry must never break a tool */ }
  };

  // ── Access (the "flip a switch" hook) ─────────────────────────────────────
  // Mode lives in admin/data/studio.json and is served by /britewire/studio-access.php.
  // "public": everyone may use the tools. "login": the tools show a sign-in screen instead.
  // Fails open, so an outage of this one endpoint can't take the tools offline.
  OCX.access = fetch('/britewire/studio-access.php', { cache: 'no-store', credentials: 'same-origin' })
    .then(function (r) { return r.ok ? r.json() : { allowed: true, mode: 'public' }; })
    .catch(function () { return { allowed: true, mode: 'public' }; });
  OCX.access.then(function (a) {
    if (a && a.allowed === false) showGate(a);
  });
  // Preview the blocked screens without touching any server setting:
  //   ?ocx-preview=gate   sign-in required        ?ocx-preview=limit   sample "limit reached" wording
  var pv = (location.search.match(/[?&]ocx-preview=(gate|limit)\b/) || [])[1];
  if (pv) showGate({ preview: pv, login_url: '/login' });
  function showGate(a) {
    var host = document.querySelector('.ocx-main');
    if (!host || document.querySelector('.ocx-gate')) return;
    var g = document.createElement('div');
    g.className = 'ocx-gate'; g.setAttribute('role', 'alertdialog'); g.setAttribute('aria-label', 'Sign in required');
    var limit = a.preview === 'limit';
    g.innerHTML = '<div class="ocx-gate-card">' +
      (a.preview ? '<p class="ocx-gate-preview">Preview only. Nothing is blocked for real visitors.</p>' : '') +
      (limit ? '<h2>You have reached your limit</h2><p>You have used today\u2019s allowance. It resets tomorrow, or you can sign in to keep going.</p>'
             : '<h2>Sign in to use Studio</h2><p>These tools are now available to registered members.</p>') +
      '<a class="ocx-btn ocx-btn-primary" href="' + esc(a.login_url || '/login') + '">Sign in</a></div>';
    host.appendChild(g);
  }
})();
