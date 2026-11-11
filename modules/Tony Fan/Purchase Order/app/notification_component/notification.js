/* ══════════════════════════════════════════════════════════════════════════
   TONY NOTIFICATION COMPONENT — engine
   Drop-in bottom-right notification bell for Tony's own supplier portal widgets.
   NOT the same component as the internal notification_component (Procurement/*) or
   Fenteng's own copy (Suppliers/Fenteng-*) — built purpose-specific and simpler on
   purpose, mirroring Fenteng's exact same design:
     - Reads Tony_Notifications, a form that's exclusively Tony's own data (nothing
       else writes to it) — so unlike the internal component, there's no
       roleMap/_role()/_seesAll() gating for "which of several viewers is this,
       Purchasing vs Systems." Anyone with access to a Tony-* widget sees every row,
       no per-viewer filtering.
     - No currentUserEmail needed for the same reason — nothing here is scoped by who's
       logged in.
   Copy this folder into any other Tony-* widget the same way (Tony-Inquiries, Tony-PR,
   Tony-RR, Tony-Shipment) — same "independently copyable" philosophy as every other
   component in this app family.
   Starts polling immediately on init() and keeps running for the widget's whole
   lifetime, same as the internal version.

   Public API (window.TonyNotifications):
     .init(config) -> instance   { mountId, appName, reportName, pollMs, title, emptyText }
   ══════════════════════════════════════════════════════════════════════════ */
(function(global){
  'use strict';

  var TL_MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  function escapeHtml(v){
    return String(v == null ? '' : v)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');
  }
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
  /* Same reasoning as the internal component's own copy — collapses rows sharing the
     same Notification_Type+Source_Record_ID (falls back to message text for rows
     without one) down to one, newest kept. Defensive here even though nothing should
     realistically double-insert for Tony today. */
  function dedupeByMessage(rows){
    var seen = {};
    return rows.filter(function(n){
      var key = n.Notification_Type + '|' + (n.Source_Record_ID || n.Message);
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
      mountId:   'tonyNotifMount',
      title:     'Notifications',
      emptyText: 'No notifications yet.',
      pollMs:    5000
    }, cfg);
    this.notifications = [];
    this.pollTimer = null;
    this._build();
    this._start();
  }

  Instance.prototype._appName = function(){
    return typeof this.cfg.appName === 'function' ? this.cfg.appName() : this.cfg.appName;
  };
  Instance.prototype._zohoOk = function(method){
    return typeof ZOHO !== 'undefined' && ZOHO.CREATOR && ZOHO.CREATOR.DATA && typeof ZOHO.CREATOR.DATA[method] === 'function';
  };
  Instance.prototype._isProd = function(){
    var env = typeof this.cfg.environment === 'function' ? this.cfg.environment() : this.cfg.environment;
    return !env || String(env).toLowerCase() === 'production';
  };
  Instance.prototype._resolvedUrl = function(n){
    if(n.Target_URL_Dev || n.Target_URL_Prod) return this._isProd() ? (n.Target_URL_Prod || '') : (n.Target_URL_Dev || '');
    return n.Target_URL || '';
  };

  Instance.prototype._build = function(){
    var mount = document.getElementById(this.cfg.mountId);
    if(!mount){ console.warn('[TonyNotifications] mount element #' + this.cfg.mountId + ' not found'); return; }
    this.mountEl = mount;
    mount.innerHTML =
        '<button type="button" class="tnn-bell" title="' + escapeHtml(this.cfg.title) + '">'
      +   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>'
      +   '<span class="tnn-badge"></span>'
      + '</button>'
      + '<div class="tnn-panel">'
      +   '<div class="tnn-hdr">'
      +     '<span class="tnn-title">' + escapeHtml(this.cfg.title) + '</span>'
      +     '<div class="tnn-hdr-actions">'
      +       '<button type="button" class="tnn-refresh-btn" title="Refresh"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M23 4v6h-6"/><path d="M1 20v-6h6"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg></button>'
      +       '<button type="button" class="tnn-mark-all">Mark all read</button>'
      +     '</div>'
      +   '</div>'
      +   '<div class="tnn-list"></div>'
      + '</div>';
    this.el = {
      bell:       mount.querySelector('.tnn-bell'),
      badge:      mount.querySelector('.tnn-badge'),
      panel:      mount.querySelector('.tnn-panel'),
      list:       mount.querySelector('.tnn-list'),
      markAll:    mount.querySelector('.tnn-mark-all'),
      refreshBtn: mount.querySelector('.tnn-refresh-btn')
    };
    var self = this;
    this.el.bell.addEventListener('click', function(){ self.el.panel.classList.toggle('open'); });
    this.el.markAll.addEventListener('click', function(){ self._markAllRead(); });
    this.el.refreshBtn.addEventListener('click', function(){
      self.el.refreshBtn.classList.add('spinning');
      self._load().then(function(){ self.el.refreshBtn.classList.remove('spinning'); });
    });
    this.el.list.addEventListener('click', function(e){
      var item = e.target.closest('.tnn-item');
      if(!item) return;
      var id = item.getAttribute('data-id');
      self._markRead(id);
      var n = self.notifications.find(function(x){ return String(x.ID) === String(id); });
      if(!n) return;
      /* ADDED — lets the host widget handle a notification LOCALLY (e.g. calling its
         own openDetail(id) directly) instead of navigating away via Target_URL, for
         whichever notification type(s) this specific widget already has a detail view
         for. cfg.onNotificationClick returning true means "handled, don't also
         navigate"; false/undefined falls through to the normal Target_URL navigation,
         for notification types this widget doesn't have its own view for. Same
         pattern as Fenteng's own copy of this component. */
      if(typeof self.cfg.onNotificationClick === 'function' && self.cfg.onNotificationClick(n) === true) return;
      var url = self._resolvedUrl(n);
      if(url) self._navigate(url);
    });
    document.addEventListener('mousedown', function(e){
      if(!self.el.panel.classList.contains('open')) return;
      if(!self.el.panel.contains(e.target) && !self.el.bell.contains(e.target)) self.el.panel.classList.remove('open');
    });
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
      this.el.list.innerHTML = '<div class="tnn-empty">' + escapeHtml(this.cfg.emptyText) + '</div>';
      return;
    }
    this.el.list.innerHTML = this.notifications.map(function(n){
      return '<div class="tnn-item' + (n.Read ? ' read' : '') + '" data-id="' + escapeHtml(n.ID) + '">'
        + '<span class="tnn-dot"></span>'
        + '<div class="tnn-body">'
        +   '<div class="tnn-type">' + escapeHtml(n.Notification_Type) + '</div>'
        +   '<div class="tnn-msg">' + escapeHtml(n.Message) + '</div>'
        +   '<div class="tnn-time">' + escapeHtml(fmtRelative(n.Created_On)) + '</div>'
        + '</div>'
      + '</div>';
    }).join('');
  };

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

  /* Stand-in list matching the "Supplier Portal" rows from the notification matrix
     (New Inquiry added, PR added, PO added, Shipment added, RR added) — shown whenever
     Tony_Notifications isn't reachable yet, so the bell stays previewable before
     that form/its workflows exist. See README.md. */
  Instance.prototype._loadDemo = function(){
    var now = Date.now();
    this.notifications = [
      {ID:'demo-1', Notification_Type:'New Inquiry added', Message:'A new inquiry INQ-00042 was added.', Created_On: new Date(now - 5*60000).toISOString().replace('T',' ').slice(0,19), Read:false, Target_URL:''},
      {ID:'demo-2', Notification_Type:'Purchase Request added', Message:'A new purchase request PR-00019 was added.', Created_On: new Date(now - 47*60000).toISOString().replace('T',' ').slice(0,19), Read:false, Target_URL:''},
      {ID:'demo-3', Notification_Type:'Purchase Order added', Message:'Purchase Order PO-00007 was added.', Created_On: new Date(now - 5*3600000).toISOString().replace('T',' ').slice(0,19), Read:true, Target_URL:''}
    ];
    this._render();
  };

  Instance.prototype._load = async function(){
    if(!this._zohoOk('getRecords')){
      if(!this.notifications.length) this._loadDemo();
      return;
    }
    try{
      var resp = await ZOHO.CREATOR.DATA.getRecords({ app_name: this._appName(), report_name: this.cfg.reportName, max_records: 200 });
      console.log('[TonyNotifications] getRecords response:', resp);
      if(resp && resp.code === 3000 && Array.isArray(resp.data)){
        this.notifications = resp.data.map(function(r){
          return { ID:r.ID, Notification_Type:r.Notification_Type, Message:r.Message, Created_On:r.Created_On, Read: !!(r.Read === true || r.Read === 'true'), Target_URL:r.Target_URL || '', Source_Record_ID:r.Source_Record_ID || '', Source_Record_No:r.Source_Record_No || '' };
        });
        this.notifications.sort(function(a,b){ var ta=parseWhen(a.Created_On), tb=parseWhen(b.Created_On); return (tb?tb.getTime():0) - (ta?ta.getTime():0); });
        this.notifications = dedupeByMessage(this.notifications);
        this._render();
        return;
      }
    } catch(err){
      console.warn('[TonyNotifications] getRecords failed:', err);
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

  Instance.prototype.refresh = function(){ this._load(); };

  Instance.prototype._navigate = function(url){
    if(!url) return;
    if(typeof ZOHO !== 'undefined' && ZOHO.CREATOR && ZOHO.CREATOR.UTIL && typeof ZOHO.CREATOR.UTIL.navigateParentURL === 'function'){
      ZOHO.CREATOR.UTIL.navigateParentURL({ action:'open', url:url, window:'same' });
      return;
    }
    window.location.href = url;
  };

  global.TonyNotifications = {
    init: function(cfg){ return new Instance(cfg); }
  };
})(window);
