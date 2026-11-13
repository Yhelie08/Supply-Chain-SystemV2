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
    var EXTRA = '.hc-added, .hc-mod';
    var head = table.tHead.rows[0], cols = [].filter.call(head.cells, function (c) { return !c.classList.contains('hc-added') && !c.classList.contains('hc-mod'); });
    if (cols.length < 3) return;
    var body = [].slice.call(table.tBodies[0] ? table.tBodies[0].rows : []);
    body.forEach(function (r) { [].forEach.call(r.cells, function (c) { if (!c.classList.contains('hc-nw') && /^[A-Z]{2,6}-[A-Z0-9-]{2,}$/.test(c.textContent.trim())) c.classList.add('hc-nw'); }); });
    var hide = [], hasAdded = false, hasMod = false;
    cols.forEach(function (c, i) {
      var t = label(c);
      if (/^next step/i.test(t) || /^rec\. supplier/i.test(t)) hide.push(i); // hidden for now
      if (/^(added time|petsa nadagdag)/i.test(t)) hasAdded = true;
      if (/^(last )?(modified|updated)/i.test(t)) hasMod = true;
    });
    // the page's own column can appear after ours (a language switch renames its header): then ours goes
    if (hasAdded) [].forEach.call(table.querySelectorAll('.hc-added'), function (n) { n.parentNode.removeChild(n); });
    if (hasMod) [].forEach.call(table.querySelectorAll('.hc-mod'), function (n) { n.parentNode.removeChild(n); });
    hide.forEach(function (ni) {
      cols[ni].classList.add('hc-hide');
      body.forEach(function (r) { if (r.cells.length - r.querySelectorAll(EXTRA).length === cols.length && r.cells[ni]) r.cells[ni].classList.add('hc-hide'); });
    });
    if (!body.length) return;
    // Adds one timestamp column (Added Time / Last Modified) to every row of the list, read from the matched record.
    function addCol(cls, title, field) {
      if (!head.querySelector('.' + cls)) {
        var th = document.createElement('th'); th.className = cls; th.textContent = title;
        head.appendChild(th);
      }
      body.forEach(function (r) {
        if (r.querySelector('.' + cls) || r.cells.length - r.querySelectorAll(EXTRA).length !== cols.length) return;
        var rec = match(r), td = document.createElement('td');
        var f = rec ? fmt(rec[field]) : ['—', ''];
        td.className = cls; td.textContent = f[0];
        if (f[1]) { var sub = document.createElement('div'); sub.className = 'hc-added-t'; sub.textContent = f[1]; td.appendChild(sub); }
        r.appendChild(td);
      });
    }
    // A list that already has its own Added Time / Modified column (most Fulfillment lists) shows "Nov 9, 2026 15:07" on one
    // line; it is rewritten into the same two-line "date / 12-hour time" look as the columns added above.
    var NATIVE = /^([A-Z][a-z]{2} \d{1,2}, \d{4}),? (\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)?$/;
    cols.forEach(function (c, i) {
      var t = label(c);
      if (!/^added time/i.test(t) && !/^(last )?(modified|updated)/i.test(t)) return;
      c.classList.add('hc-dt');
      body.forEach(function (r) {
        var td = r.cells[i];
        if (!td || r.cells.length - r.querySelectorAll(EXTRA).length !== cols.length || td.classList.contains('hc-dt') || td.children.length) return;
        var m = NATIVE.exec(td.textContent.trim());
        if (!m) return;
        var h = +m[2], ap = (m[4] || '').toUpperCase();
        if (!ap) { ap = h >= 12 ? 'PM' : 'AM'; h = h % 12 || 12; }
        td.classList.add('hc-dt');
        td.textContent = m[1];
        var sub = document.createElement('div'); sub.className = 'hc-added-t'; sub.textContent = h + ':' + m[3] + ' ' + ap;
        td.appendChild(sub);
      });
    });
    if (!hasAdded) addCol('hc-added', 'Added Time', 'Added_Time');
    if (!hasMod) addCol('hc-mod', 'Last Modified', 'Modified_Time');
    // A fixed-layout table with a <colgroup> (the group cards) gives the two new columns no width at all and they spill out of the card:
    // give them a share of the table and take the same share off the others.
    var added = head.querySelectorAll('.hc-added, .hc-mod').length, cg = table.querySelector(':scope > colgroup');
    if (cg && added && !cg.getAttribute('data-hc-fit') && cg.children.length === cols.length) {
      cg.setAttribute('data-hc-fit', '1');
      var cs = [].slice.call(cg.children), each = 9, pct = cs.every(function (c) { return /%$/.test(c.style.width); });
      if (pct) { var k = (100 - each * added) / 100; cs.forEach(function (c) { c.style.width = (parseFloat(c.style.width) * k).toFixed(2) + '%'; }); }
      for (var q = 0; q < added; q++) { var col = document.createElement('col'); col.style.width = pct ? each + '%' : '140px'; cg.appendChild(col); }
    }
  }

  var queued = false;
  function scan() { queued = false; [].forEach.call(document.querySelectorAll('table'), tidy); }
  function queue() { if (!queued) { queued = true; setTimeout(scan, 120); } }
  // Tabs often just toggle display on an already-rendered table, so watch class/style flips too (but not our own table edits).
  function start() {
    scan();
    new MutationObserver(function (recs) {
      for (var i = 0; i < recs.length; i++) {
        var r = recs[i];
        if (r.type === 'childList' || !/^(TABLE|THEAD|TBODY|TR|TH|TD)$/.test(r.target.tagName)) { queue(); return; }
      }
    }).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style', 'hidden'] });
  }
  if (document.body) start(); else document.addEventListener('DOMContentLoaded', start);
})();

// Delivery: a long form opens as a full page (see views.css), so it gets the same "Back" button at the top as a record does.
// It just presses the form's own Cancel, so the widget's code is untouched.
(function () {
  function addBack() {
    var modals = document.querySelectorAll('.modal.on');
    for (var i = 0; i < modals.length; i++) {
      var m = modals[i], h = m.querySelector(':scope > header');
      // big data-entry forms (New / Edit: five or more fields) open as a page; small action dialogs (Approve, Reschedule ...) stay pop-outs
      if (m.querySelector('.form-sec') && m.querySelectorAll('.field').length >= 5) m.classList.add('hc-page');
      if (!m.classList.contains('hc-page') || !h || h.querySelector('.hc-form-back')) continue;
      var cancel = m.querySelector('[data-cancel]') || m.querySelector('.m-foot .btn:not(.primary)');
      if (!cancel) continue;
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'hc-form-back'; b.textContent = '\u2190 Back';
      b.addEventListener('click', (function (c) { return function () { c.click(); }; })(cancel));
      h.insertBefore(b, h.firstChild);
    }
  }
  function start() {
    if (document.documentElement.getAttribute('data-hc-kit') !== 'dms') return;
    new MutationObserver(addBack).observe(document.body, { childList: true, subtree: true });
  }
  if (document.body) start(); else document.addEventListener('DOMContentLoaded', start);
})();

// Liquid glass: every button is glass. A button that has a plain (white / grey) fill becomes clear glass; one that has a colour fill
// (orange, green, red, blue) becomes tinted glass in that same colour. The widgets' own classes and code are untouched: this only reads the
// colour the button already has and tags it (data-glass), and liquid.css does the painting.
(function () {
  if (document.documentElement.getAttribute('data-hc-skin') !== 'liquid') return;
  var SEL = 'button, .btn, input[type="button"], input[type="submit"], [role="button"]';
  var SKIP = '.hc-menu, [data-glass="off"]';
  var queued = [], timer = 0;

  function classify(el) {
    if (el.closest(SKIP)) return;
    el.removeAttribute('data-glass'); el.style.removeProperty('--hc-btn-rgb');
    var cs = getComputedStyle(el);
    if (cs.display === 'none') return;
    var m = cs.backgroundColor.match(/[\d.]+/g);
    if (!m || m.length < 3) return;
    var r = +m[0], g = +m[1], b = +m[2], a = m[3] === undefined ? 1 : +m[3];
    if (a < 0.3) return; // see-through already (icon buttons, plain tabs): leave them
    if (Math.max(r, g, b) - Math.min(r, g, b) > 45) { el.setAttribute('data-glass', 'tint'); el.style.setProperty('--hc-btn-rgb', r + ',' + g + ',' + b); }
    else {
      el.setAttribute('data-glass', 'clear');
      // On dark glass a grey label (the light-mode ink) is hard to read: lift it to the full ink. Coloured labels (red, orange ...) keep their colour.
      el.removeAttribute('data-glass-fg');
      var t = cs.color.match(/[\d.]+/g) || [], tr = +t[0], tg = +t[1], tb = +t[2], plain = t.length >= 3 && Math.max(tr, tg, tb) - Math.min(tr, tg, tb) < 60;
      if (document.documentElement.getAttribute('data-theme') !== 'light') { if (plain) el.setAttribute('data-glass-fg', 'ink'); }
      // On light glass a white label (a disabled "Save" that is white on a pale grey) disappears: use the dark ink instead.
      else if (plain && (tr + tg + tb) / 3 > 190) el.setAttribute('data-glass-fg', 'dark');
    }
  }
  function flush() {
    timer = 0;
    var list = queued; queued = [];
    for (var i = 0; i < list.length; i++) { if (list[i].isConnected) classify(list[i]); }
  }
  function queue(el) { queued.push(el); if (!timer) timer = setTimeout(flush, 60); }
  function scan(root) {
    if (root.nodeType !== 1) return;
    if (root.matches && root.matches(SEL)) queue(root);
    var found = root.querySelectorAll ? root.querySelectorAll(SEL) : [];
    for (var i = 0; i < found.length; i++) queue(found[i]);
  }
  function start() {
    scan(document.body);
    new MutationObserver(function (recs) {
      for (var i = 0; i < recs.length; i++) {
        var r = recs[i];
        if (r.type === 'childList') { for (var j = 0; j < r.addedNodes.length; j++) scan(r.addedNodes[j]); }
        else if (r.target.matches && r.target.matches(SEL)) queue(r.target);
      }
    }).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'disabled', 'aria-pressed'] });
    window.addEventListener('load', function () { scan(document.body); });
    // light <-> dark changes the labels' colours: look at every button again
    new MutationObserver(function () { scan(document.body); }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  }
  if (document.body) start(); else document.addEventListener('DOMContentLoaded', start);
})();

// Dark mode: some widgets paint their text with a fixed dark colour of their own (a #334155 label, a slate caption ...). On the dark glass
// that text is invisible. Any text that is dark AND sits on a dark surface is lifted to the theme's grey (data-hc-lt, see views.css).
// Text on a light or coloured fill (a white input, an orange button, a pale chip) is left alone, and so is text that has a colour of its own.
(function () {
  var root = document.documentElement;
  function lum(r, g, b) { var f = function (v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); }
  function rgba(s) { var m = String(s).match(/[\d.]+/g) || []; return [+m[0] || 0, +m[1] || 0, +m[2] || 0, m[3] === undefined ? 1 : +m[3]]; }
  function surfaceLum(el) {
    var col = [14, 18, 28], chain = [];
    for (var e = el; e && e.nodeType === 1; e = e.parentElement) chain.push(e);
    for (var i = chain.length - 1; i >= 0; i--) {
      var c = rgba(getComputedStyle(chain[i]).backgroundColor);
      if (c[3] > 0.02) col = [c[0] * c[3] + col[0] * (1 - c[3]), c[1] * c[3] + col[1] * (1 - c[3]), c[2] * c[3] + col[2] * (1 - c[3])];
    }
    return lum(col[0], col[1], col[2]);
  }
  function check(el) {
    if (el.closest('[data-glass="tint"], script, style, svg')) return;
    el.removeAttribute('data-hc-lt'); // read the colour the widget gave it, not the lifted one (otherwise a second pass would undo the first)
    var cs = getComputedStyle(el), c = rgba(cs.color);
    if (c[3] < 0.2 || Math.max(c[0], c[1], c[2]) - Math.min(c[0], c[1], c[2]) > 70) return;
    if (lum(c[0], c[1], c[2]) < 0.3 && surfaceLum(el) < 0.18) el.setAttribute('data-hc-lt', '1');
  }
  function scan(node) {
    if (root.getAttribute('data-theme') === 'light') return;
    var base = node.nodeType === 1 ? node : node.parentElement; if (!base) return;
    var w = document.createTreeWalker(base, NodeFilter.SHOW_TEXT), t, seen = [];
    while ((t = w.nextNode())) { if (t.nodeValue.trim().length > 1 && t.parentElement && seen.indexOf(t.parentElement) < 0) { seen.push(t.parentElement); check(t.parentElement); } }
  }
  function clearAll() { var l = document.querySelectorAll('[data-hc-lt]'); for (var i = 0; i < l.length; i++) l[i].removeAttribute('data-hc-lt'); }
  var queued = [], timer = 0;
  function queue(n) { queued.push(n); if (!timer) timer = setTimeout(function () { timer = 0; var q = queued; queued = []; for (var i = 0; i < q.length; i++) if (q[i].isConnected) scan(q[i]); }, 220); }
  function start() {
    queue(document.body);
    new MutationObserver(function (recs) { for (var i = 0; i < recs.length; i++) for (var j = 0; j < recs[i].addedNodes.length; j++) { var n = recs[i].addedNodes[j]; if (n.nodeType === 1 || n.nodeType === 3) queue(n); } })
      .observe(document.body, { childList: true, subtree: true });
    new MutationObserver(function () { clearAll(); queue(document.body); }).observe(root, { attributes: true, attributeFilter: ['data-theme'] });
    window.addEventListener('load', function () { queue(document.body); });
  }
  if (document.body) start(); else document.addEventListener('DOMContentLoaded', start);
})();
