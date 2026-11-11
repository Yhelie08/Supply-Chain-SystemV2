/* ══════════════════════════════════════════════════════════════════════════
   TIMELINE HISTORY COMPONENT — engine
   Drop-in per-record activity log for any Zoho Creator widget in this app
   family. Self-contained: no dependency on the host widget's own helpers
   (val/escapeHtml/etc.) — everything it needs is reimplemented locally so it
   can be copied into a new widget folder wholesale. See README.md for the
   Zoho form template and integration steps.

   Public API (window.TimelineHistory):
     .init(config) -> instance   { mountId, appName, formName, reportName,
                                    parentField, actor, title, emptyText,
                                    maxVisible, maxHeight }
       instance.open(parentValue)
       instance.log(parentValue, action, type, changes) -> Promise
       instance.seed(parentValue, entries)   // standalone/demo preview only
       instance.load()                        // re-fetch (no UI refresh button —
                                                // open()/log() already call this)
     .diffFlat(before, payload, fieldLabels, skipFields, numericFields, blankDefaults)
     .titleFor(changes, fallback)
     .changed(from, to, blankDefaults)
     .norm(v) / .normNumeric(v) / .val(v)
   ══════════════════════════════════════════════════════════════════════════ */
(function(global){
  'use strict';

  var TL_MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  function escapeHtml(v){
    return String(v == null ? '' : v)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');
  }
  function val(v){
    if(v == null) return '';
    if(typeof v === 'object') return v.display_value || v.zc_display_value || v.value || v.ID || '';
    return String(v);
  }
  function norm(v){
    if(v === true) return 'Yes';
    if(v === false) return 'No';
    var s = val(v).trim();
    if(s === 'true' || s === 'True') return 'Yes';
    if(s === 'false' || s === 'False') return 'No';
    return s;
  }
  function normNumeric(v){
    var n = parseFloat(val(v));
    return isNaN(n) ? '' : String(n);
  }
  /* A value the record never had, now saved as one of the caller's own defaults, isn't a
     real edit — it's the form writing into a column Zoho had left blank. blankDefaults lets
     each call site define what "blank" means for its own fields (e.g. a Stage picklist's
     "Not Selected"), defaulting to the generic set below. */
  function changed(from, to, blankDefaults){
    if(from === to) return false;
    var blanks = blankDefaults || ['', 'No', '0'];
    if(!from && blanks.indexOf(to) > -1) return false;
    return true;
  }
  function trunc(s, n){
    s = String(s == null ? '' : s);
    return s.length > n ? s.slice(0, n) + '…' : s;
  }
  function formatChanges(changes){
    if(!changes || !changes.length) return '';
    return changes.map(function(c){
      var head = c.label ? c.label + ': ' : '';
      return c.from ? (head + trunc(c.from, 80) + ' → ' + trunc(c.to, 80)) : (head + trunc(c.to, 80));
    }).join('\n');
  }
  function parseChanges(text){
    return String(text || '').split('\n').map(function(line){
      line = line.trim();
      if(!line) return null;
      var i = line.indexOf(': ');
      var label = i > -1 ? line.slice(0, i) : '';
      var rest  = i > -1 ? line.slice(i + 2) : line;
      var parts = rest.split(' → ');
      return parts.length > 1
        ? { label:label, from:parts[0], to:parts.slice(1).join(' → ') }
        : { label:label, to:rest };
    }).filter(Boolean);
  }
  /* Logged_On round-trips through two shapes depending on where it's read from: the
     "YYYY-MM-DD HH:MM:SS" 24-hour format this component writes itself, or Creator's own
     "DD-MMM-YYYY hh:mm:ss AM/PM" display format when its report renders the same Date-Time
     field back out using its configured column format. Both can carry a trailing AM/PM
     marker — an earlier version of this parser ignored it and read the raw hour as 24-hour,
     which silently turned every PM entry into its AM hour on reload (1:32 PM parsed as
     01:32, i.e. displayed back as 1:32 AM). Fixed by detecting AM/PM first and converting
     to 24-hour before building the Date. */
  function parseWhen(s){
    s = String(s || '').trim();
    if(!s) return null;
    var ap = null;
    var apM = s.match(/\s*(AM|PM)\s*$/i);
    if(apM){ ap = apM[1].toUpperCase(); s = s.slice(0, apM.index).trim(); }
    function to24(h){ if(!ap) return h; if(ap === 'AM') return h === 12 ? 0 : h; return h === 12 ? 12 : h + 12; }
    var m = s.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?$/);
    if(m) return new Date(+m[1], +m[2]-1, +m[3], to24(+m[4]), +m[5], +(m[6]||0));
    var m2 = s.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
    if(m2){
      var mon = TL_MONTHS.indexOf(m2[2].charAt(0).toUpperCase() + m2[2].slice(1, 3).toLowerCase());
      if(mon > -1) return new Date(+m2[3], mon, +m2[1], to24(+m2[4]), +m2[5], +(m2[6]||0));
    }
    return null;
  }
  function fmtWhen(s){
    var d = parseWhen(s);
    if(!d || isNaN(d.getTime())) return String(s || '');
    var h = d.getHours(), ap = h >= 12 ? 'PM' : 'AM', h12 = (h % 12) || 12;
    return d.getDate() + ' ' + TL_MONTHS[d.getMonth()] + ' ' + d.getFullYear()
         + ' · ' + h12 + ':' + String(d.getMinutes()).padStart(2, '0') + ' ' + ap;
  }
  function timeOf(e){
    var d = parseWhen(val(e.Logged_On));
    return d ? d.getTime() : 0;
  }
  function fmtDateTimeWrite(d){
    var pad = function(n){ return String(n).padStart(2, '0'); };
    return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate())
         +' '+pad(d.getHours())+':'+pad(d.getMinutes())+':'+pad(d.getSeconds());
  }
  function typeKey(t){
    var s = String(t || '').toLowerCase().replace(/[^a-z]/g, '');
    return /created/.test(s) ? 'created' : /approv/.test(s) ? 'approval'
         : /estimate/.test(s) ? 'estimate' : /delete/.test(s) ? 'deleted'
         : /message/.test(s) ? 'message' : 'updated';
  }
  function errCode(e){
    try{
      if(e && e.responseText) return JSON.parse(e.responseText).code;
      var s = (e && e.message) ? e.message : (typeof e === 'string' ? e : JSON.stringify(e));
      return JSON.parse(JSON.parse(s).responseText || s).code;
    } catch(_){ return null; }
  }

  function Instance(cfg){
    this.cfg = Object.assign({
      mountId:    'tlhcMount',
      title:      'Timeline History',
      emptyText:  'No activity logged yet.',
      maxVisible: 5,
      maxHeight:  420,
      actor:      'User'
    }, cfg);
    this.currentParent = '';
    this.serverRows = [];
    this.localRows = {};
    this.seededRows = {};
    this.storageOk = true;
    /* Collapsed by default (per user request) — the header (title/count/toggle)
       always stays visible; only the body (the actual entry list, which can get
       tall) hides. Reset to collapsed on every .open() too, not just on first
       build — see open(). */
    this.collapsed = true;
    this._build();
  }

  Instance.prototype._appName = function(){
    return typeof this.cfg.appName === 'function' ? this.cfg.appName() : this.cfg.appName;
  };
  Instance.prototype._actor = function(){
    return typeof this.cfg.actor === 'function' ? this.cfg.actor() : (this.cfg.actor || 'User');
  };
  Instance.prototype._zohoOk = function(method){
    return typeof ZOHO !== 'undefined' && ZOHO.CREATOR && ZOHO.CREATOR.DATA && typeof ZOHO.CREATOR.DATA[method] === 'function';
  };

  Instance.prototype._build = function(){
    var mount = document.getElementById(this.cfg.mountId);
    if(!mount){ console.warn('[TimelineHistory] mount element #' + this.cfg.mountId + ' not found'); return; }
    mount.innerHTML =
        '<div class="tlhc-card">'
      +   '<div class="tlhc-header">'
      +     '<span class="tlhc-title">' + escapeHtml(this.cfg.title) + '</span>'
      +     '<div class="tlhc-header-right">'
      +       '<span class="tlhc-count"></span>'
      +       '<button type="button" class="tlhc-toggle-btn"></button>'
      +     '</div>'
      +   '</div>'
      +   '<div class="tlhc-body"></div>'
      + '</div>';
    this.el = {
      card:       mount.querySelector('.tlhc-card'),
      count:      mount.querySelector('.tlhc-count'),
      body:       mount.querySelector('.tlhc-body'),
      toggleBtn:  mount.querySelector('.tlhc-toggle-btn')
    };
    var self = this;
    this.el.toggleBtn.addEventListener('click', function(){
      self.collapsed = !self.collapsed;
      self._applyCollapsedUI();
      if(!self.collapsed && !self._loaded){
        self.el.body.innerHTML = '<div class="tlhc-empty" style="color:var(--gray-400)">Loading timeline…</div>';
        self.load();
      }
    });
    this._applyCollapsedUI();
    this.render();
  };

  /* Applies this.collapsed to the DOM — independent of render()'s own innerHTML
     rebuild, so re-rendering (a new entry arriving, a reload) never silently
     re-expands a card the user intentionally collapsed, or vice versa. */
  Instance.prototype._applyCollapsedUI = function(){
    if(!this.el) return;
    this.el.body.style.display = this.collapsed ? 'none' : '';
    this.el.toggleBtn.textContent = this.collapsed ? 'Show' : 'Hide';
  };

  Instance.prototype._entries = function(){
    var base = this._zohoOk('getRecords') ? this.serverRows : (this.seededRows[this.currentParent] || []);
    var pending = this.localRows[this.currentParent] || [];
    return base.concat(pending).sort(function(a, b){
      var d = timeOf(b) - timeOf(a);
      return d !== 0 ? d : String(val(b.ID)).localeCompare(String(val(a.ID)));
    });
  };

  Instance.prototype.render = function(){
    if(!this.el) return;
    this._applyCollapsedUI();
    var entries = this._entries();
    this.el.count.textContent = entries.length ? (entries.length + (entries.length === 1 ? ' entry' : ' entries')) : '';
    var showNote = this._zohoOk('getRecords') && !this.storageOk;
    var note = showNote
      ? '<div class="tlhc-note">Couldn\'t reach <b>' + escapeHtml(this.cfg.reportName || this.cfg.formName || 'the timeline report') + '</b> — showing this session\'s activity only.</div>'
      : '';
    this.el.body.style.maxHeight = '';
    this.el.body.style.overflowY = '';
    if(!entries.length){
      this.el.body.innerHTML = note + '<div class="tlhc-empty">' + escapeHtml(this.cfg.emptyText) + '</div>';
      return;
    }
    this.el.body.innerHTML = note + '<div class="tlhc-list">' + entries.map(function(e){
      var chips = parseChanges(val(e.Changes)).map(function(c){
        return '<span class="tlhc-chip">'
          + (c.label ? '<b>' + escapeHtml(c.label) + '</b>' : '')
          + (c.from ? '<span class="tlhc-old">' + escapeHtml(c.from) + '</span><span class="tlhc-arrow">→</span>' : '')
          + '<span class="tlhc-new">' + escapeHtml(c.to || '—') + '</span>'
          + '</span>';
      }).join('');
      return '<div class="tlhc-item t-' + typeKey(val(e.Action_Type)) + '">'
        + '<div class="tlhc-dot"></div>'
        + '<div class="tlhc-title-line">' + escapeHtml(val(e.Action_Title) || 'Activity') + '</div>'
        + '<div class="tlhc-meta">'
          + '<span class="tlhc-actor">' + escapeHtml(val(e.Actor) || 'Unknown') + '</span>'
          + '<span class="tlhc-sep">·</span>'
          + '<span class="tlhc-time">' + escapeHtml(fmtWhen(val(e.Logged_On))) + '</span>'
          + (e._local ? '<span class="tlhc-pending">unsaved</span>' : '')
        + '</div>'
        + (chips ? '<div class="tlhc-chips">' + chips + '</div>' : '')
        + '</div>';
    }).join('') + '</div>';

    /* Scroll trigger is the SMALLER of two caps, whichever bites first:
       - cfg.maxVisible entries in — measured against the actual rendered DOM rather
         than a fixed pixel guess, since chip counts (and therefore entry height) vary
         a lot between e.g. a plain "SRP approved" and a 6-field edit.
       - cfg.maxHeight outright — a handful of multi-field entries (several chips
         each) can blow past the card's available space well before hitting
         maxVisible's entry count, so count alone isn't sufficient on its own.
       FIXED — collapsed-by-default (see _applyCollapsedUI) meant this measurement
       often ran while .tlhc-body was display:none, where getBoundingClientRect()
       always reports zero — silently skipping the cap forever, even after the card
       was later expanded (maxHeight/overflowY are only ever computed here, in
       render(), never re-checked on expand). Temporarily reveal the body for the
       measurement if it's currently hidden, then restore — the computed
       maxHeight/overflowY are plain inline styles, so they take effect immediately
       the moment the card is actually expanded, no re-measurement needed then. */
    var listEl = this.el.body.querySelector('.tlhc-list');
    if(listEl){
      var wasHidden = this.el.body.style.display === 'none';
      if(wasHidden) this.el.body.style.display = '';
      var items = listEl.querySelectorAll('.tlhc-item');
      var bodyTop = this.el.body.getBoundingClientRect().top;
      var caps = [];
      if(items.length > this.cfg.maxVisible){
        var nth = items[this.cfg.maxVisible - 1];
        caps.push(Math.ceil(nth.getBoundingClientRect().bottom - bodyTop) + 8);
      }
      if(this.cfg.maxHeight) caps.push(this.cfg.maxHeight);
      if(caps.length){
        var cap = Math.min.apply(Math, caps);
        var totalHeight = listEl.getBoundingClientRect().bottom - bodyTop;
        if(totalHeight > cap){
          this.el.body.style.maxHeight = cap + 'px';
          this.el.body.style.overflowY = 'auto';
        }
      }
      if(wasHidden) this.el.body.style.display = 'none';
    }
  };

  Instance.prototype.open = function(parentValue){
    this.currentParent = String(parentValue || '');
    this.serverRows = [];
    this.collapsed = true;
    this._loaded = false;
    this.render();
  };

  Instance.prototype.load = async function(){
    this._loaded = true;
    var parent = this.currentParent;
    if(!parent || !this._zohoOk('getRecords')){ this.render(); return; }
    try{
      var criteria = this.cfg.parentField + '=="' + parent.replace(/"/g, '\\"') + '"';
      /* getRecords() can hang forever with no live Zoho Creator parent (its internal
         readiness promise waits on a postMessage handshake that standalone/no-parent
         contexts never send) — a bare await here would leave this.render() never
         called. Race it against a timeout, same pattern as the host widget's own
         loadFromCreator() watchdog. */
      var resp = await Promise.race([
        ZOHO.CREATOR.DATA.getRecords({ app_name: this._appName(), report_name: this.cfg.reportName, criteria: criteria, max_records: 200 }),
        new Promise(function(_, reject){ setTimeout(function(){ reject(new Error('TimelineHistory getRecords timed out')); }, 10000); })
      ]);
      if(parent !== this.currentParent) return; /* a different record opened while this was in flight */
      this.serverRows = (resp && resp.code === 3000 && Array.isArray(resp.data)) ? resp.data : [];
      this.storageOk = true;
      /* DEBUG — Action_Title has been observed reading back blank (falls back to
         "Activity" in render()) while Changes/Actor/Logged_On round-trip fine. That
         shape matches a form-field link-name mismatch (see README.md's "Action is
         reserved" gotcha), not a bug in this write/read code. Log the raw row so it's
         easy to check the report's actual field key for the Action headline text. */
      if(this.serverRows.length) console.log('[TimelineHistory] raw entry sample:', JSON.stringify(this.serverRows[0]));
    } catch(err){
      if(parent !== this.currentParent) return;
      this.serverRows = [];
      /* 9220 is "no records match" — the form/report is fine, this parent just has no history yet. */
      if(errCode(err) === 9220) this.storageOk = true;
      else { this.storageOk = false; console.warn('[TimelineHistory] load failed:', err); }
    }
    this.render();
  };

  /* Standalone/demo preview only — seeded rows are ignored the moment a real Creator
     connection exists, so this never masks real data. */
  Instance.prototype.seed = function(parentValue, entries){
    this.seededRows[String(parentValue || '')] = entries || [];
    if(String(parentValue || '') === this.currentParent) this.render();
  };

  /* The single entry point every logged action goes through. Never throws and never
     blocks its caller — a timeline write failing must not fail the record save that
     produced it. Shows immediately from memory (tagged "unsaved" until confirmed). */
  Instance.prototype.log = async function(parentValue, action, type, changes){
    var parent = String(parentValue || '');
    if(!parent || !action) return;
    var entry = {};
    entry[this.cfg.parentField] = parent;
    entry.Action_Title = action;
    entry.Action_Type  = type || 'Updated';
    entry.Changes      = formatChanges(changes);
    entry.Actor        = this._actor();
    entry.Logged_On    = fmtDateTimeWrite(new Date());

    var pending = Object.assign({ _local:true }, entry);
    (this.localRows[parent] = this.localRows[parent] || []).push(pending);
    if(parent === this.currentParent) this.render();

    if(!this._zohoOk('addRecords')) return;
    try{
      var resp = await ZOHO.CREATOR.DATA.addRecords({ app_name: this._appName(), form_name: this.cfg.formName, payload: { data: entry } });
      if(resp && resp.code === 3000){
        var arr = this.localRows[parent] || [];
        var i = arr.indexOf(pending);
        if(i > -1) arr.splice(i, 1);
        this.storageOk = true;
        if(parent === this.currentParent) this.serverRows.push(entry);
      } else {
        this.storageOk = false;
        console.warn('[TimelineHistory] write rejected:', resp);
      }
    } catch(err){
      this.storageOk = false;
      console.warn('[TimelineHistory] write failed:', err);
    }
    if(parent === this.currentParent) this.render();
  };

  global.TimelineHistory = {
    init: function(cfg){ return new Instance(cfg); },
    diffFlat: function(before, payload, fieldLabels, skipFields, numericFields, blankDefaults){
      var out = [];
      Object.keys(payload).forEach(function(k){
        if(skipFields && skipFields[k]) return;
        var label = fieldLabels && fieldLabels[k];
        if(!label) return; /* unlabeled keys are internal — not worth a timeline line */
        var isNum = numericFields && numericFields[k];
        var f = isNum ? normNumeric(before ? before[k] : '') : norm(before ? before[k] : '');
        var t = isNum ? normNumeric(payload[k]) : norm(payload[k]);
        if(changed(f, t, blankDefaults)) out.push({ label:label, from:f, to:t });
      });
      return out;
    },
    titleFor: function(changes, fallback){
      if(!changes || !changes.length) return fallback;
      if(changes.length === 1 && changes[0].label){
        var c = changes[0];
        return (c.from ? 'Updated ' : 'Added ') + c.label;
      }
      return 'Updated ' + changes.length + ' fields';
    },
    changed: changed,
    norm: norm,
    normNumeric: normNumeric,
    val: val
  };
})(window);
