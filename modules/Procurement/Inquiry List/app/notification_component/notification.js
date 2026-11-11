/* ══════════════════════════════════════════════════════════════════════════
   NOTIFICATION SYSTEM COMPONENT — engine
   Drop-in bottom-right notification bell, for any widget in this app family.
   Unlike timeline_history_component/internal-notes_component, this one is NOT
   scoped to a parent record — every widget's instance reads the SAME shared,
   app-wide report (see README.md), so a notification created from any form
   (or Supplier Portal) shows up no matter which widget the viewer has open.
   Starts polling immediately on init() and keeps running for the widget's
   whole lifetime — there's no .open()/.close() per record like the other two
   components, since this bell isn't tied to any one record being viewed.

   Must be embedded directly in each widget's own document (copy this folder
   in, same as the other two) rather than uploaded as its own separate Zoho
   Creator widget — a separate widget lives in its own iframe, so its
   position:fixed bell can only float within ITS OWN boxed panel on the page,
   not over the host widget's content. Confirmed live (2026-07-31): placing it
   as a second widget on the same page rendered as a separate blank panel
   with the bell pinned to that panel's own corner, not the page's.

   Public API (window.NotificationSystem):
     .init(config) -> instance   { mountId, appName, reportName,
                                    currentUserEmail, pollMs, title, emptyText }
       instance.refresh()  // re-check/re-poll immediately — call this once if
                            // currentUserEmail() resolves AFTER init() already
                            // ran (async SDK init race, same as InternalNotes)
   ══════════════════════════════════════════════════════════════════════════ */
(function(global){
  'use strict';

  var TL_MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  function escapeHtml(v){
    return String(v == null ? '' : v)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');
  }
  /* Same AM/PM-aware round-trip parsing as timeline_history_component/internal-notes_component's
     own copies — duplicated rather than shared on purpose, see their own comments for why
     (each component must stay independently copyable into a widget that only wants one). */
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
  /* Relative "5m ago"/"3h ago" display — a bell/popover reads better with relative time than
     the absolute timestamps Timeline History/Internal Conversation use, since this panel is
     meant for a quick glance rather than a historical record. */
  function fmtRelative(s){
    var d = parseWhen(s);
    if(!d || isNaN(d.getTime())) return String(s || '');
    var diffMs = Date.now() - d.getTime();
    var mins = Math.round(diffMs / 60000);
    if(mins < 1) return 'just now';
    if(mins < 60) return mins + 'm ago';
    var hrs = Math.round(mins / 60);
    if(hrs < 24) return hrs + 'h ago';
    var days = Math.round(hrs / 24);
    if(days < 7) return days + 'd ago';
    return d.getDate() + ' ' + TL_MONTHS[d.getMonth()];
  }
  /* Collapses visually-identical rows down to one — for a full-access viewer (HC
     Systems), the same event can legitimately produce more than one real row (one per
     Recipient_Email, e.g. leftover from before the "PR added" Deluge script was trimmed
     to a single insert) that a non-full-access viewer would never see more than one of,
     since their own criteria only ever matches their own address. Keeps the FIRST
     occurrence of each Notification_Type+Message pair, so call this AFTER sorting
     newest-first — that keeps the newest copy, not an arbitrary one. Simplification:
     keys purely on Notification_Type+Message text, not Source_Record_ID (not read by
     this component today — see README) — good enough to clean up the known
     one-event/two-recipients-inserted-two-rows case, but would also incorrectly hide a
     genuine second event that happens to render identical message text. */
  function dedupeByMessage(rows){
    var seen = {};
    return rows.filter(function(n){
      var key = n.Notification_Type + '|' + n.Message;
      if(seen[key]) return false;
      seen[key] = true;
      return true;
    });
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
      mountId:   'notifMount',
      title:     'Notifications',
      emptyText: 'No notifications yet.',
      pollMs:    5000,
      roleMap:   {},
      fullAccessRoles: []
    }, cfg);
    this.notifications = [];   /* [{ID, Notification_Type, Message, Created_On, Read}] */
    this.pollTimer = null;
    this._build();
    this._start();
  }

  Instance.prototype._appName = function(){
    return typeof this.cfg.appName === 'function' ? this.cfg.appName() : this.cfg.appName;
  };
  Instance.prototype._currentEmail = function(){
    var raw = typeof this.cfg.currentUserEmail === 'function' ? this.cfg.currentUserEmail() : this.cfg.currentUserEmail;
    return String(raw || '').trim().toLowerCase();
  };
  /* Same gating concept as internal-notes_component's roleMap — a hardcoded allowlist of
     who this feature is even for, per user request ("filter it and show it to the
     dedicated users which in this case is HC Systems"). Returns the display label (e.g.
     "HC Systems") for a recognized viewer, or null for anyone else. */
  Instance.prototype._role = function(){
    var email = this._currentEmail();
    return (email && this.cfg.roleMap[email]) || null;
  };
  /* Per user request (2026-07-31): "HC Systems has all access to the notif system just
     like internal conversations" — a role listed in fullAccessRoles sees every row on
     the report, not just ones addressed to it, same "solo account with access to
     everything by default" status HC Systems already has in internal-notes_component's
     own roleMap comment elsewhere in this file family. */
  Instance.prototype._seesAll = function(){
    var role = this._role();
    return !!(role && this.cfg.fullAccessRoles.indexOf(role) > -1);
  };
  Instance.prototype._zohoOk = function(method){
    return typeof ZOHO !== 'undefined' && ZOHO.CREATOR && ZOHO.CREATOR.DATA && typeof ZOHO.CREATOR.DATA[method] === 'function';
  };
  /* Same isProd test as the host widget's own creatorRecordUrl() (index.html) — a
     "development" environment app only exists on the creatorapp.zoho.com builder
     domain under an explicit /environment/<env>/ segment; the published app lives on
     plain creator.zoho.com with no environment segment at all. cfg.environment defaults
     to unset -> treated as prod, matching that same file's `!ZC_ENV` fallback. */
  Instance.prototype._isProd = function(){
    var env = typeof this.cfg.environment === 'function' ? this.cfg.environment() : this.cfg.environment;
    return !env || String(env).toLowerCase() === 'production';
  };
  /* Demo/prototype rows (see _loadDemo()) carry BOTH a dev and a real (production) URL
     since we don't have Deluge-authored rows yet to source this from live — picks
     whichever matches the CURRENT environment via _isProd(). Real rows from
     App_Notifications only ever carry a single Target_URL, because whatever Deluge
     workflow writes that row only ever runs in one environment at a time and can bake
     in the correct URL itself — no dev/prod split needed once that exists. */
  Instance.prototype._resolvedUrl = function(n){
    if(n.Target_URL_Dev || n.Target_URL_Prod) return this._isProd() ? (n.Target_URL_Prod || '') : (n.Target_URL_Dev || '');
    return this._normalizeProdUrl(n.Target_URL || '');
  };
  /* Real App_Notifications rows only ever store a single Target_URL (see _load()) — no
     Dev/Prod split, no environment check. If whatever wrote that row baked in a
     creatorapp.zoho.com/<owner>/environment/<env>/... link (dev builder URL) instead of the
     published creator.zoho.com/<owner>/... link, this rewrites it to the production
     equivalent UNCONDITIONALLY — deliberately NOT gated on _isProd(), per explicit
     requirement that notification click-through must always land on production
     regardless of what ZOHO.CREATOR.init() reports the widget's own environment to be
     (that report reflects the HOST app's publish stage on the Zoho platform, which can
     still say "development" even when the intent is always-production navigation). */
  Instance.prototype._normalizeProdUrl = function(url){
    if(!url) return url;
    var m = /^https:\/\/creatorapp\.zoho\.com\/([^\/]+)\/environment\/[^\/]+\/([^\/#?]+)(.*)$/.exec(url);
    if(!m) return url;
    return 'https://creator.zoho.com/' + m[1] + '/' + m[2] + m[3];
  };

  Instance.prototype._build = function(){
    var mount = document.getElementById(this.cfg.mountId);
    if(!mount){ console.warn('[NotificationSystem] mount element #' + this.cfg.mountId + ' not found'); return; }
    this.mountEl = mount;
    /* Bell/panel are position:fixed, so where this mount div sits in the DOM doesn't affect
       layout — unlike Timeline History/Internal Conversation, it doesn't need to live inside
       any particular card/rail. */
    mount.innerHTML =
        '<button type="button" class="nsys-bell" title="' + escapeHtml(this.cfg.title) + '">'
      +   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>'
      +   '<span class="nsys-badge"></span>'
      + '</button>'
      + '<div class="nsys-panel">'
      +   '<div class="nsys-hdr">'
      +     '<span class="nsys-title">' + escapeHtml(this.cfg.title) + '</span>'
      +     '<div class="nsys-hdr-actions">'
      +       '<button type="button" class="nsys-refresh-btn" title="Refresh"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M23 4v6h-6"/><path d="M1 20v-6h6"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg></button>'
      +       '<button type="button" class="nsys-mark-all">Mark all read</button>'
      +     '</div>'
      +   '</div>'
      +   '<div class="nsys-list"></div>'
      + '</div>';
    this.el = {
      bell:       mount.querySelector('.nsys-bell'),
      badge:      mount.querySelector('.nsys-badge'),
      panel:      mount.querySelector('.nsys-panel'),
      list:       mount.querySelector('.nsys-list'),
      markAll:    mount.querySelector('.nsys-mark-all'),
      refreshBtn: mount.querySelector('.nsys-refresh-btn')
    };
    var self = this;
    this.el.bell.addEventListener('click', function(){ self.el.panel.classList.toggle('open'); });
    this.el.markAll.addEventListener('click', function(){ self._markAllRead(); });
    /* Manual refresh — bypasses the pollMs wait so a viewer can force-check right after
       expecting a new row (e.g. right after submitting something elsewhere). Spins the
       icon for the duration of the fetch as feedback since polling itself is silent. */
    this.el.refreshBtn.addEventListener('click', function(){
      self.el.refreshBtn.classList.add('spinning');
      self._load().then(function(){ self.el.refreshBtn.classList.remove('spinning'); });
    });
    this.el.list.addEventListener('click', function(e){
      var item = e.target.closest('.nsys-item');
      if(!item) return;
      var id = item.getAttribute('data-id');
      self._markRead(id);   /* no-ops if already read — navigation below still runs regardless */
      var n = self.notifications.find(function(x){ return String(x.ID) === String(id); });
      if(n){ var url = self._resolvedUrl(n); if(url) self._navigate(url); }
    });
    document.addEventListener('mousedown', function(e){
      if(!self.el.panel.classList.contains('open')) return;
      if(!self.el.panel.contains(e.target) && !self.el.bell.contains(e.target)) self.el.panel.classList.remove('open');
    });
    this._applyVisibility();
  };

  /* Dormant for anyone not in roleMap, same stance as internal-notes_component — the
     whole bell/panel stays display:none for an unrecognized viewer rather than showing
     an empty inbox to everyone. */
  Instance.prototype._applyVisibility = function(){
    if(!this.mountEl) return;
    this.mountEl.style.display = this._role() ? '' : 'none';
  };

  Instance.prototype._unreadCount = function(){
    return this.notifications.filter(function(n){ return !n.Read; }).length;
  };

  Instance.prototype._render = function(){
    if(!this.el) return;
    var count = this._unreadCount();
    this.el.badge.textContent = count > 9 ? '9+' : String(count);
    this.el.badge.classList.toggle('show', count > 0);
    this.el.markAll.disabled = count === 0;

    if(!this.notifications.length){
      this.el.list.innerHTML = '<div class="nsys-empty">' + escapeHtml(this.cfg.emptyText) + '</div>';
      return;
    }
    this.el.list.innerHTML = this.notifications.map(function(n){
      return '<div class="nsys-item' + (n.Read ? ' read' : '') + '" data-id="' + escapeHtml(n.ID) + '">'
        + '<span class="nsys-dot"></span>'
        + '<div class="nsys-body">'
        +   '<div class="nsys-type">' + escapeHtml(n.Notification_Type) + '</div>'
        +   '<div class="nsys-msg">' + escapeHtml(n.Message) + '</div>'
        +   '<div class="nsys-time">' + escapeHtml(fmtRelative(n.Created_On)) + '</div>'
        + '</div>'
      + '</div>';
    }).join('');
  };

  /* Best-effort remote write — silently ignored for local-only demo rows (ID like 'demo-1',
     see _loadDemo()) or if the SDK/report isn't available. */
  Instance.prototype._persistRead = function(id){
    if(!this._zohoOk('updateRecordById') || /^demo-/.test(String(id))) return;
    ZOHO.CREATOR.DATA.updateRecordById({ app_name: this._appName(), report_name: this.cfg.reportName, id: id, payload: { data: { Read: true } } }).catch(function(){});
  };
  Instance.prototype._markRead = function(id){
    var n = this.notifications.find(function(x){ return String(x.ID) === String(id); });
    if(!n || n.Read) return;
    n.Read = true;
    this._render();
    this._persistRead(id);
  };
  Instance.prototype._markAllRead = function(){
    var self = this;
    this.notifications.forEach(function(n){
      if(n.Read) return;
      n.Read = true;
      self._persistRead(n.ID);
    });
    this._render();
  };

  /* Stand-in list matching the notification matrix this component was built from (New Inquiry
     added, PR added, Shipment/Receiving conditions, etc.) — shown whenever the real report
     isn't reachable yet, so the bell is still previewable/clickable before App_Notifications
     and its Deluge workflows exist. See README.md for the form template to replace this.
     Only Target_URL_Prod is set (real page permalinks confirmed live, 2026-07-31, homecartel
     account, supply-chain-app) — no dev counterpart, so these rows never resolve to a
     builder/dev URL; when _isProd() is false they simply don't navigate (see _resolvedUrl()).
     The Inquiry item deliberately has neither, since a notification about the page you're
     already viewing shouldn't navigate anywhere. */
  Instance.prototype._loadDemo = function(){
    var now = Date.now();
    this.notifications = [
      {ID:'demo-1', Notification_Type:'Purchase Request added', Message:'PR-00042 was added for INQ-00007.', Created_On: new Date(now - 5*60000).toISOString().replace('T',' ').slice(0,19), Read:false,
        Target_URL_Prod:'https://creator.zoho.com/homecartel/supply-chain-app/#Page:Purchase_Request'},
      {ID:'demo-2', Notification_Type:'Shipment', Message:'Shipment SHP-00019 has 10 days left on its timeline.', Created_On: new Date(now - 47*60000).toISOString().replace('T',' ').slice(0,19), Read:false,
        Target_URL_Prod:'https://creator.zoho.com/homecartel/supply-chain-app/#Page:Shipments1'},
      {ID:'demo-3', Notification_Type:'Receiving', Message:'Received quantity for PO-00031 does not match expected quantity.', Created_On: new Date(now - 5*3600000).toISOString().replace('T',' ').slice(0,19), Read:false,
        Target_URL_Prod:'https://creator.zoho.com/homecartel/supply-chain-app/#Page:Receiving1'},
      {ID:'demo-4', Notification_Type:'Inquiry', Message:'Supplier responded to INQ-00012.', Created_On: new Date(now - 2*86400000).toISOString().replace('T',' ').slice(0,19), Read:true}
    ];
    this._render();
  };

  /* Gated on _role() first (unrecognized viewers never fetch at all, same as
     internal-notes_component's _startPolling guard), and criteria goes through
     _seesAll(): a full-access role (HC Systems) gets every row with no Recipient_Email
     filter, anyone else only gets rows addressed to them. (PRs' copy of this file was
     briefly unfiltered while debugging the getRecords max_records=50 bug — that was
     temporary and specific to that debugging session, not carried over here.) Logs the
     raw response/error to console. */
  Instance.prototype._load = async function(){
    this._applyVisibility();
    if(!this._role()) return;
    if(!this._zohoOk('getRecords')){
      if(!this.notifications.length) this._loadDemo();
      return;
    }
    try{
      var email = this._currentEmail();
      var criteria = this._seesAll() ? '' : (email ? 'Recipient_Email=="' + email.replace(/"/g, '\\"') + '"' : '');
      var resp = await ZOHO.CREATOR.DATA.getRecords({ app_name: this._appName(), report_name: this.cfg.reportName, criteria: criteria || undefined, max_records: 200 });
      console.log('[NotificationSystem] getRecords response:', resp);
      if(resp && resp.code === 3000 && Array.isArray(resp.data)){
        this.notifications = resp.data.map(function(r){
          return { ID:r.ID, Notification_Type:r.Notification_Type, Message:r.Message, Created_On:r.Created_On, Read: !!(r.Read === true || r.Read === 'true'), Target_URL:r.Target_URL || '' };
        });
        this.notifications.sort(function(a,b){ var ta=parseWhen(a.Created_On), tb=parseWhen(b.Created_On); return (tb?tb.getTime():0) - (ta?ta.getTime():0); });
        this.notifications = dedupeByMessage(this.notifications);
        this._render();
        return;
      }
    } catch(err){
      console.warn('[NotificationSystem] getRecords failed:', err);
      /* 9220/9280 = "no records match" (see internal-notes_component's own copy of this
         comment) — the report exists and is genuinely empty, so render a real empty
         state, NOT demo data. Any other failure falls through to the demo fallback below. */
      var ec = errCode(err);
      if(ec === 9220 || ec === 9280){ this.notifications = []; this._render(); return; }
    }
    if(!this.notifications.length) this._loadDemo();
  };

  Instance.prototype._start = function(){
    this._load();
    if(this.pollTimer) clearInterval(this.pollTimer);
    var self = this;
    this.pollTimer = setInterval(function(){ self._load(); }, this.cfg.pollMs);
  };

  /* Re-check immediately — for when currentUserEmail() resolves asynchronously AFTER init()
     already ran (a real race: SDK init is a promise). Same purpose as InternalNotes.refresh(). */
  Instance.prototype.refresh = function(){ this._applyVisibility(); this._load(); };

  /* Click-through navigation — this widget runs inside a Zoho Creator iframe, so a plain
     `window.location = url` would only redirect the iframe itself, not the actual browser
     tab/page the viewer is looking at. ZOHO.CREATOR.UTIL.navigateParentURL() is Zoho's own
     API for navigating the PARENT page from inside a widget (action:'open', window:'same' =
     a real redirect in the current tab, not a new one). Falls back to a plain same-tab
     redirect when the SDK isn't available at all (standalone/local file preview — see
     _loadDemo()'s Target_URL values, which point at sibling widget folders on disk for
     exactly this case). In production, Target_URL should be each target page's real Zoho
     Creator page URL — this only gets you to the right PAGE, not a specific record on it;
     deep-linking to one record within the target widget isn't implemented here. */
  Instance.prototype._navigate = function(url){
    if(!url) return;
    if(typeof ZOHO !== 'undefined' && ZOHO.CREATOR && ZOHO.CREATOR.UTIL && typeof ZOHO.CREATOR.UTIL.navigateParentURL === 'function'){
      ZOHO.CREATOR.UTIL.navigateParentURL({ action:'open', url:url, window:'same' });
      return;
    }
    window.location.href = url;
  };

  global.NotificationSystem = {
    init: function(cfg){ return new Instance(cfg); }
  };
})(window);
