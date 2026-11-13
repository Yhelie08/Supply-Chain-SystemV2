// Detail pages: a minimize button on every "Conversation" card. Layout only: the widget's own chat code is untouched.
// The choice is kept in localStorage (hc-conv-min), so a record opened later starts the way you left it.
(function () {
  var KEY = 'hc-conv-min';
  var CARDS = '.side-card, .section-card, .sec-card, .chat-panel, .card';
  var HEADS = ':scope > .side-hdr, :scope > .section-title, :scope > .sec-header, :scope > .card-header, :scope > .card-header-row';
  var ICON = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>';

  function wanted() { try { return localStorage.getItem(KEY) === '1'; } catch (e) { return false; } }
  function remember(v) { try { localStorage.setItem(KEY, v ? '1' : '0'); } catch (e) {} }

  function label(card, min) {
    var b = card.querySelector(':scope > .hc-conv-hdr > .hc-min-btn');
    if (!b) return;
    b.setAttribute('aria-expanded', String(!min));
    b.title = min ? 'Expand conversation' : 'Minimize conversation';
    b.setAttribute('aria-label', b.title);
  }

  function setup(card) {
    var head = card.querySelector(HEADS);
    if (!head || card.firstElementChild !== head) return;
    var text = (head.firstChild && head.firstChild.nodeType === 3 ? head.firstChild.textContent : head.textContent).trim();
    if (!/^((internal )?conversation|对话)$/i.test(text)) return;
    if (head.querySelector('.hc-min-btn')) return;
    card.classList.add('hc-conv');
    head.classList.add('hc-conv-hdr');
    var b = document.createElement('button');
    b.type = 'button'; b.className = 'hc-min-btn'; b.innerHTML = ICON;
    b.addEventListener('click', function (e) {
      e.stopPropagation();
      var min = !card.classList.contains('hc-min');
      card.classList.toggle('hc-min', min);
      remember(min); label(card, min);
    });
    head.appendChild(b);
    var min = wanted();
    card.classList.toggle('hc-min', min);
    label(card, min);
  }

  var queued = false;
  function scan() {
    queued = false;
    var cards = document.querySelectorAll(CARDS);
    for (var i = 0; i < cards.length; i++) setup(cards[i]);
  }
  function queue() { if (!queued) { queued = true; (window.requestAnimationFrame || setTimeout)(scan); } }

  function start() {
    scan();
    new MutationObserver(queue).observe(document.body, { childList: true, subtree: true });
  }
  if (document.body) start(); else document.addEventListener('DOMContentLoaded', start);
})();

// Dropdown fields: the browser's own popup (a plain white OS list) is replaced by a themed menu.
// The <select> itself stays where it is, so its value, events, disabled state and the widget's code are untouched;
// only the moment it would open its native list is intercepted.
(function () {
  var menu = null, owner = null, items = [], active = -1, typed = '', typedAt = 0;

  function eligible(el) {
    return el && el.tagName === 'SELECT' && !el.multiple && !(el.size > 1) && !el.disabled && !el.hasAttribute('readonly') && el.options.length;
  }

  function build(sel) {
    var ul = document.createElement('ul');
    ul.className = 'hc-menu'; ul.setAttribute('role', 'listbox');
    items = [];
    function add(opt, indent) {
      if (opt.hidden) return;
      var li = document.createElement('li');
      li.setAttribute('role', 'option');
      var t = (opt.textContent || '').trim();
      li.textContent = t || ' ';
      if (opt.selected) li.classList.add('sel');
      if (opt.disabled) li.classList.add('dis');
      if (indent) li.classList.add('ind');
      li._opt = opt; li._i = items.length; items.push(li); ul.appendChild(li);
    }
    Array.prototype.forEach.call(sel.children, function (c) {
      if (c.tagName === 'OPTGROUP') {
        var g = document.createElement('li'); g.className = 'grp'; g.textContent = c.label; ul.appendChild(g);
        Array.prototype.forEach.call(c.children, function (o) { if (o.tagName === 'OPTION') add(o, true); });
      } else if (c.tagName === 'OPTION') add(c, false);
    });
    return ul;
  }

  function mark(i, scroll) {
    if (items[active]) items[active].classList.remove('act');
    active = i;
    if (items[i]) { items[i].classList.add('act'); if (scroll) items[i].scrollIntoView({ block: 'nearest' }); }
  }

  function step(dir) {
    var i = active, n = items.length;
    for (var k = 0; k < n; k++) { i = (i + dir + n) % n; if (!items[i]._opt.disabled) return mark(i, true); }
  }

  function place(sel) {
    var r = sel.getBoundingClientRect(), vw = window.innerWidth, vh = window.innerHeight, gap = 4;
    menu.style.minWidth = Math.max(r.width, 120) + 'px';
    menu.style.maxHeight = '300px';
    var h = menu.offsetHeight, w = menu.offsetWidth;
    var below = vh - r.bottom - 8, above = r.top - 8, up = h > below && above > below;
    var maxH = Math.max(120, Math.min(300, up ? above - gap : below - gap));
    menu.style.maxHeight = maxH + 'px';
    h = Math.min(h, maxH);
    menu.style.top = (up ? r.top - h - gap : r.bottom + gap) + 'px';
    menu.style.left = Math.max(8, Math.min(r.left, vw - w - 8)) + 'px';
    menu.classList.toggle('up', up);
  }

  function open(sel) {
    close();
    owner = sel; menu = build(sel);
    document.body.appendChild(menu);
    place(sel);
    var cur = -1;
    items.forEach(function (li, i) { if (li._opt.selected) cur = i; });
    mark(cur >= 0 ? cur : 0, true);
    sel.setAttribute('aria-expanded', 'true');
    requestAnimationFrame(function () { if (menu) menu.classList.add('on'); });
  }

  function close() {
    if (!menu) return;
    var m = menu; menu = null;
    if (owner) owner.removeAttribute('aria-expanded');
    owner = null; items = []; active = -1;
    m.classList.remove('on');
    setTimeout(function () { if (m.parentNode) m.parentNode.removeChild(m); }, 160);
  }

  function choose(i) {
    var li = items[i]; if (!li || li._opt.disabled || !owner) return;
    var sel = owner, opt = li._opt, changed = !opt.selected;
    close();
    opt.selected = true;
    if (changed) {
      sel.dispatchEvent(new Event('input', { bubbles: true }));
      sel.dispatchEvent(new Event('change', { bubbles: true }));
    }
    try { sel.focus({ preventScroll: true }); } catch (e) {}
  }

  document.addEventListener('mousedown', function (e) {
    var t = e.target;
    if (menu && menu.contains(t)) { e.preventDefault(); return; }
    var sel = t.closest && t.closest('select');
    if (eligible(sel)) {
      e.preventDefault();
      try { sel.focus({ preventScroll: true }); } catch (x) {}
      if (menu && owner === sel) close(); else open(sel);
      return;
    }
    close();
  }, true);

  document.addEventListener('click', function (e) {
    if (!menu) return;
    var li = e.target.closest && e.target.closest('.hc-menu li');
    if (li && li._opt) { e.preventDefault(); e.stopPropagation(); choose(li._i); }
  }, true);

  document.addEventListener('mousemove', function (e) {
    if (!menu) return;
    var li = e.target.closest && e.target.closest('.hc-menu li');
    if (li && li._opt && !li._opt.disabled && li._i !== active) mark(li._i, false);
  }, true);

  document.addEventListener('keydown', function (e) {
    var t = e.target;
    if (!menu) {
      if (eligible(t) && (e.key === ' ' || e.key === 'F4' || (e.altKey && (e.key === 'ArrowDown' || e.key === 'ArrowUp')))) { e.preventDefault(); open(t); }
      return;
    }
    var k = e.key;
    if (k === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
    else if (k === 'Tab') close();
    else if (k === 'ArrowDown') { e.preventDefault(); step(1); }
    else if (k === 'ArrowUp') { e.preventDefault(); step(-1); }
    else if (k === 'Home') { e.preventDefault(); mark(0, true); }
    else if (k === 'End') { e.preventDefault(); mark(items.length - 1, true); }
    else if (k === 'Enter' || k === ' ') { e.preventDefault(); e.stopPropagation(); choose(active); }
    else if (k.length === 1 && !e.ctrlKey && !e.metaKey) {
      var now = Date.now(); typed = (now - typedAt > 700 ? '' : typed) + k.toLowerCase(); typedAt = now;
      for (var i = 0; i < items.length; i++) if (!items[i]._opt.disabled && items[i].textContent.trim().toLowerCase().indexOf(typed) === 0) { mark(i, true); break; }
    }
  }, true);

  window.addEventListener('resize', close);
  window.addEventListener('blur', close);
  document.addEventListener('scroll', function (e) { if (menu && !menu.contains(e.target)) close(); }, true);
})();

// List pages: the "Next step" column moves inside the record (the detail page already says what the next step is),
// and every list gets an "Added Time" column. The widget code is untouched: the rows are matched to the records the page
// loaded (window.__hcRecs, kept by the SDK stand-in) by the values they show.
(function () {
  var DETAIL = '#view-detail, #detail-view, #detailView, .detail-page, .rr-detail-page, .detail-body, .modal, .modal-overlay, .drawer, [role="dialog"], .hc-menu';
  var SKIP = { ID: 1, Added_Time: 1, Modified_Time: 1, Added_User: 1 };
  var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  function fmt(s) {
    var m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)?/i.exec(String(s || ''));
    if (!m) return [s ? String(s) : '—', ''];
    var h = +m[4], ap = (m[6] || '').toUpperCase();
    if (!ap) { ap = h >= 12 ? 'PM' : 'AM'; h = h % 12 || 12; }
    return [MON[+m[2] - 1] + ' ' + (+m[3]) + ', ' + m[1], h + ':' + m[5] + ' ' + ap];
  }

  function values(rec) {
    if (rec._hcv) return rec._hcv;
    var out = [];
    Object.keys(rec).forEach(function (k) {
      if (SKIP[k]) return;
      var v = rec[k];
      if (v && typeof v === 'object' && !Array.isArray(v)) v = v.display_value || v.zc_display_value || '';
      if (typeof v === 'number') v = String(v);
      if (typeof v !== 'string') return;
      v = v.trim();
      if (v.length >= 4 && v.length <= 60) out.push(v);
    });
    try { Object.defineProperty(rec, '_hcv', { value: out, enumerable: false }); } catch (e) {}
    return out;
  }

  function match(row) {
    var text = row.textContent, store = window.__hcRecs || {}, ids = {}, best = null, bestScore = 0;
    (row.outerHTML.match(/\d{10,}/g) || []).forEach(function (d) { ids[d] = 1; });
    Object.keys(store).forEach(function (report) {
      var list = store[report] || [];
      for (var i = 0; i < list.length; i++) {
        var rec = list[i], vals = values(rec), score = ids[rec.ID] ? 3 : 0;
        for (var j = 0; j < vals.length; j++) if (text.indexOf(vals[j]) >= 0) score++;
        if (score > bestScore) { bestScore = score; best = rec; }
      }
    });
    return bestScore >= 2 ? best : null;
  }

  function label(c) { return (c.textContent || '').replace(/[↑↓↕▲▼]/g, '').trim(); }

  function tidy(table) {
    if (table.closest(DETAIL) || !table.tHead || !table.tHead.rows.length || !table.offsetParent) return;
    table.classList.add('hc-list');
    var c0 = table.tBodies[0] && table.tBodies[0].rows[0] && table.tBodies[0].rows[0].cells[0];
    if (c0 && parseFloat(getComputedStyle(c0).fontSize) < 12.9) table.classList.add('hc-grow');
    var head = table.tHead.rows[0], cols = [].filter.call(head.cells, function (c) { return !c.classList.contains('hc-added'); });
    if (cols.length < 3) return;
    var body = [].slice.call(table.tBodies[0] ? table.tBodies[0].rows : []);
    body.forEach(function (r) { [].forEach.call(r.cells, function (c) { if (!c.classList.contains('hc-nw') && /^[A-Z]{2,6}-[A-Z0-9-]{2,}$/.test(c.textContent.trim())) c.classList.add('hc-nw'); }); });
    var ni = -1, hasAdded = false;
    cols.forEach(function (c, i) {
      var t = label(c);
      if (/^next step/i.test(t)) ni = i;
      if (/^added time/i.test(t)) hasAdded = true;
    });
    if (ni >= 0) {
      cols[ni].classList.add('hc-hide');
      body.forEach(function (r) { if (r.cells.length - r.querySelectorAll('.hc-added').length === cols.length && r.cells[ni]) r.cells[ni].classList.add('hc-hide'); });
    }
    if (hasAdded || !body.length) return;
    if (!head.querySelector('.hc-added')) {
      var th = document.createElement('th'); th.className = 'hc-added'; th.textContent = 'Added Time';
      head.appendChild(th);
    }
    body.forEach(function (r) {
      if (r.querySelector('.hc-added') || r.cells.length !== cols.length) return;
      var rec = match(r), td = document.createElement('td');
      var f = rec ? fmt(rec.Added_Time) : ['—', ''];
      td.className = 'hc-added'; td.textContent = f[0];
      if (f[1]) { var sub = document.createElement('div'); sub.className = 'hc-added-t'; sub.textContent = f[1]; td.appendChild(sub); }
      r.appendChild(td);
    });
  }

  var queued = false;
  function scan() { queued = false; [].forEach.call(document.querySelectorAll('table'), tidy); }
  function queue() { if (!queued) { queued = true; setTimeout(scan, 120); } }
  function start() { scan(); new MutationObserver(queue).observe(document.body, { childList: true, subtree: true }); }
  if (document.body) start(); else document.addEventListener('DOMContentLoaded', start);
})();
