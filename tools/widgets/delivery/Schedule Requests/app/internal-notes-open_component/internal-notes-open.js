/* ══════════════════════════════════════════════════════════════════════════
   INTERNAL CONVERSATION COMPONENT — OPEN ACCESS variant
   Forked from UI/complaint-form/app/internal-notes_component/internal-notes.js
   2026-08-28, for the CMS <-> Supply Chain App Schedule Request cross-app
   chat (see docs/superpowers/specs/2026-08-28-schedule-request-supply-chain-
   connection-design.md). Real differences from the gated original:
     - No roleMap/mentionableMap. ANY resolved (email, displayName) pair gets
       access — this module is deliberately open to anyone with module access,
       not restricted to a fixed named list (explicit user decision).
     - Field key is Sender_Name (a real display name), not Sender_Role (a
       role label from a fixed map).
     - Mention autocomplete is built from distinct Sender_Name values already
       seen in this.rows (this thread's own history) instead of a fixed
       mentionableMap — there's no fixed list to draw one from here.
     - The whole per-record "mention grants access" mechanism is removed —
       moot when everyone already has access.

   Public API (window.InternalNotesOpen):
     .init(config) -> instance   { mountId, appName, formName, reportName,
                                    parentField, currentUserEmail,
                                    currentUserName, title, emptyText, pollMs,
                                    onSend }
       currentUserEmail/currentUserName: functions returning the resolved
         identity. If either returns blank, the whole card stays hidden
         (same fail-safe as the gated original) — hosts are expected to
         always resolve SOMETHING (real login, or a typed-name fallback
         remembered in localStorage), see README.md.
       onSend({message, name, parent}) — optional, called right after a
         message saves successfully.
     instance.open(parentValue)
     instance.refresh()
     instance.close()
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
    return d.getDate() + ' ' + TL_MONTHS[d.getMonth()] + ' ' + h12 + ':' + String(d.getMinutes()).padStart(2, '0') + ' ' + ap;
  }
  function timeOf(e){
    var d = parseWhen(val(e.Sent_On));
    return d ? d.getTime() : 0;
  }
  // FIXED live 2026-08-28 — DMS_Schedule_Request_Messages.Sent_On rejected
  // the dd-MMM-yyyy HH:mm:ss format proven everywhere else in this project
  // (code 3002, "Enter a valid date format for Sent_On"). Real cause: this
  // freshly-created Date-Time field's own "Initial value" placeholder in
  // Console read "yyyy-MM-dd hh:mm:ss A" — a genuinely different expected
  // write format than the older Sent_On fields (Complaint_Internal_Messages,
  // SOF_Internal_Messages) the original dd-MMM-yyyy format was proven
  // against. Not a global constant after all — a newly-created field can
  // default to a different format than an older one. Confirmed via the
  // field's own Console placeholder, not guessed.
  function fmtDateTimeWrite(d){
    var pad = function(n){ return String(n).padStart(2, '0'); };
    var h = d.getHours();
    var ap = h >= 12 ? 'PM' : 'AM';
    var h12 = h % 12; if (h12 === 0) h12 = 12;
    return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate())
         +' '+pad(h12)+':'+pad(d.getMinutes())+':'+pad(d.getSeconds())+' '+ap;
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
      mountId:   'incMount',
      title:     'Internal Conversation',
      emptyText: 'No messages yet — start the conversation.',
      pollMs:    5000
    }, cfg);
    this.currentParent = '';
    this.rows = [];
    this.lastSig = '';
    this.pollTimer = null;
    this.collapsed = true;
    this._mentionState = null;
    this._mentionMatches = null;
    this._mentionActiveIdx = 0;
    this._build();
  }

  Instance.prototype._appName = function(){
    return typeof this.cfg.appName === 'function' ? this.cfg.appName() : this.cfg.appName;
  };
  Instance.prototype._zohoOk = function(method){
    return typeof ZOHO !== 'undefined' && ZOHO.CREATOR && ZOHO.CREATOR.DATA && typeof ZOHO.CREATOR.DATA[method] === 'function';
  };
  Instance.prototype._currentEmail = function(){
    var raw = typeof this.cfg.currentUserEmail === 'function' ? this.cfg.currentUserEmail() : this.cfg.currentUserEmail;
    return String(raw || '').trim().toLowerCase();
  };
  /* Open access — anyone with a resolved (email, name) pair gets to use this
     card. Returns null (hides the card entirely) only if the host genuinely
     couldn't resolve ANY identity — hosts are expected to always fall back
     to something (see README.md). */
  Instance.prototype._identity = function(){
    var email = this._currentEmail();
    if(!email) return null;
    var raw = typeof this.cfg.currentUserName === 'function' ? this.cfg.currentUserName() : this.cfg.currentUserName;
    var name = String(raw || '').trim();
    return name || email;
  };
  /* Mentionable names — everyone who's already posted in THIS thread, minus
     the current viewer. No fixed list to draw from, per design. */
  Instance.prototype._mentionableNames = function(){
    var mine = this._identity();
    var seen = {};
    var names = [];
    (this.rows || []).forEach(function(m){
      var n = val(m.Sender_Name);
      if(n && n !== mine && !seen[n]){ seen[n] = true; names.push(n); }
    });
    return names;
  };
  Instance.prototype._otherNames = function(){
    return this._mentionableNames().join(', ');
  };

  Instance.prototype._build = function(){
    var mount = document.getElementById(this.cfg.mountId);
    if(!mount){ console.warn('[InternalNotesOpen] mount element #' + this.cfg.mountId + ' not found'); return; }
    mount.innerHTML =
        '<div class="inc-wrap" style="display:none">'
      +   '<div class="inc-card">'
      +     '<div class="inc-header">'
      +       '<div class="inc-header-top">'
      +         '<span class="inc-title">' + escapeHtml(this.cfg.title) + '</span>'
      +         '<button type="button" class="inc-toggle-btn"></button>'
      +       '</div>'
      +       '<span class="inc-sub"></span>'
      +     '</div>'
      +     '<div class="inc-body">'
      +       '<div class="inc-msgs"></div>'
      +       '<div class="inc-inputbar">'
      +         '<div class="inc-mention-popup" style="display:none"></div>'
      +         '<textarea rows="1" placeholder="Message… (@ to mention)"></textarea>'
      +         '<button type="button" class="inc-send-btn" disabled>Send</button>'
      +       '</div>'
      +     '</div>'
      +   '</div>'
      + '</div>';
    this.el = {
      wrap:         mount.querySelector('.inc-wrap'),
      sub:          mount.querySelector('.inc-sub'),
      toggleBtn:    mount.querySelector('.inc-toggle-btn'),
      body:         mount.querySelector('.inc-body'),
      msgs:         mount.querySelector('.inc-msgs'),
      input:        mount.querySelector('.inc-inputbar textarea'),
      sendBtn:      mount.querySelector('.inc-send-btn'),
      mentionPopup: mount.querySelector('.inc-mention-popup')
    };
    var self = this;
    this.el.toggleBtn.addEventListener('click', function(){
      self.collapsed = !self.collapsed;
      self._applyCollapsedUI();
      if(!self.collapsed) self._startPolling(); else self._stopPolling();
    });
    this.el.sendBtn.addEventListener('click', function(){ self._send(); });
    this.el.input.addEventListener('input', function(){
      self.el.sendBtn.disabled = !this.value.trim();
      self._updateMentionPopup();
    });
    this.el.input.addEventListener('keydown', function(e){
      if(self._mentionMatches && self._mentionMatches.length){
        if(e.key === 'ArrowDown'){ e.preventDefault(); self._moveMentionActive(1); return; }
        if(e.key === 'ArrowUp'){ e.preventDefault(); self._moveMentionActive(-1); return; }
        if(e.key === 'Enter' || e.key === 'Tab'){ e.preventDefault(); self._applyMention(self._mentionMatches[self._mentionActiveIdx]); return; }
        if(e.key === 'Escape'){ e.preventDefault(); self._closeMentionPopup(); return; }
      }
      if(e.key === 'Enter' && !e.shiftKey){ e.preventDefault(); self._send(); }
    });
    this.el.mentionPopup.addEventListener('mousedown', function(e){
      e.preventDefault();
      var item = e.target.closest('.inc-mention-item');
      if(!item) return;
      var i = parseInt(item.getAttribute('data-i'), 10);
      if(self._mentionMatches && self._mentionMatches[i] !== undefined) self._applyMention(self._mentionMatches[i]);
    });
    document.addEventListener('mousedown', function(e){
      if(!self.el || !self._mentionMatches) return;
      if(e.target !== self.el.input && !self.el.mentionPopup.contains(e.target)) self._closeMentionPopup();
    });
    this._applyCollapsedUI();
  };

  function findMentionQuery(text, cursorPos){
    var upTo = text.slice(0, cursorPos);
    var at = upTo.lastIndexOf('@');
    if(at === -1) return null;
    if(at > 0 && !/\s/.test(upTo[at-1])) return null;
    var query = upTo.slice(at+1);
    if(query.indexOf('\n') > -1) return null;
    return { start: at, query: query };
  }

  Instance.prototype._matchingMentions = function(query){
    var q = String(query||'').trim().toLowerCase();
    return this._mentionableNames().filter(function(name){
      return q === '' || name.toLowerCase().indexOf(q) === 0;
    });
  };

  Instance.prototype._updateMentionPopup = function(){
    var ta = this.el.input;
    var state = findMentionQuery(ta.value, ta.selectionStart);
    var matches = state ? this._matchingMentions(state.query) : [];
    if(!state || !matches.length){ this._closeMentionPopup(); return; }
    this._mentionState = state;
    this._mentionMatches = matches;
    this._mentionActiveIdx = 0;
    this._renderMentionPopup();
    this.el.mentionPopup.style.display = '';
  };

  Instance.prototype._renderMentionPopup = function(){
    var activeIdx = this._mentionActiveIdx;
    this.el.mentionPopup.innerHTML = this._mentionMatches.map(function(name, i){
      return '<div class="inc-mention-item' + (i===activeIdx?' active':'') + '" data-i="' + i + '">' + escapeHtml(name) + '</div>';
    }).join('');
  };

  Instance.prototype._moveMentionActive = function(delta){
    if(!this._mentionMatches || !this._mentionMatches.length) return;
    var n = this._mentionMatches.length;
    this._mentionActiveIdx = (this._mentionActiveIdx + delta + n) % n;
    this._renderMentionPopup();
  };

  Instance.prototype._closeMentionPopup = function(){
    this._mentionState = null;
    this._mentionMatches = null;
    this._mentionActiveIdx = 0;
    if(this.el && this.el.mentionPopup) this.el.mentionPopup.style.display = 'none';
  };

  Instance.prototype._applyMention = function(name){
    var ta = this.el.input;
    var state = this._mentionState;
    if(!state) return;
    var before = ta.value.slice(0, state.start);
    var after = ta.value.slice(ta.selectionStart);
    var inserted = '@' + name + ' ';
    ta.value = before + inserted + after;
    var newPos = (before + inserted).length;
    ta.setSelectionRange(newPos, newPos);
    ta.focus();
    this._closeMentionPopup();
    this.el.sendBtn.disabled = !ta.value.trim();
  };

  Instance.prototype._applyVisibility = function(){
    if(!this.el) return;
    var identity = this._identity();
    this.el.wrap.style.display = identity ? '' : 'none';
    var others = this._otherNames();
    this.el.sub.textContent = identity ? (others ? ('with ' + others) : 'no one else has posted yet') : '';
  };

  Instance.prototype._applyCollapsedUI = function(){
    if(!this.el) return;
    this.el.body.style.display = this.collapsed ? 'none' : '';
    this.el.toggleBtn.textContent = this.collapsed ? 'Show' : 'Hide';
  };

  Instance.prototype._stopPolling = function(){
    if(this.pollTimer){ clearInterval(this.pollTimer); this.pollTimer = null; }
  };
  Instance.prototype._startPolling = function(){
    if(!this.currentParent || !this._identity()) return;
    this.lastSig = '';
    this._load();
    this._stopPolling();
    var self = this;
    this.pollTimer = setInterval(function(){ self._load(); }, this.cfg.pollMs);
  };

  Instance.prototype._render = function(){
    if(!this.el) return;
    var mine = this._identity();
    if(!this.rows.length){
      this.el.msgs.innerHTML = '<div class="inc-empty">' + escapeHtml(this.cfg.emptyText) + '</div>';
      return;
    }
    var wasNearBottom = (this.el.msgs.scrollHeight - this.el.msgs.scrollTop - this.el.msgs.clientHeight) < 60;
    this.el.msgs.innerHTML = this.rows.map(function(m){
      var isMine = val(m.Sender_Name) === mine;
      return '<div class="inc-bubble ' + (isMine ? 'mine' : 'theirs') + '">'
        + '<div class="inc-meta">' + escapeHtml(val(m.Sender_Name) || 'Unknown') + '</div>'
        + escapeHtml(val(m.Message))
        + '<div class="inc-time">' + escapeHtml(fmtWhen(val(m.Sent_On))) + '</div>'
        + '</div>';
    }).join('');
    if(wasNearBottom) this.el.msgs.scrollTop = this.el.msgs.scrollHeight;
  };

  Instance.prototype._load = async function(){
    var parent = this.currentParent;
    if(!parent || !this._zohoOk('getRecords')) return;
    try{
      var criteria = this.cfg.parentField + '=="' + parent.replace(/"/g, '\\"') + '"';
      var resp = await Promise.race([
        ZOHO.CREATOR.DATA.getRecords({ app_name: this._appName(), report_name: this.cfg.reportName, criteria: criteria, max_records: 500 }),
        new Promise(function(_, reject){ setTimeout(function(){ reject(new Error('InternalNotesOpen getRecords timed out')); }, 10000); })
      ]);
      if(parent !== this.currentParent) return;
      var rows = (resp && resp.code === 3000 && Array.isArray(resp.data)) ? resp.data : [];
      rows.sort(function(a,b){ return timeOf(a) - timeOf(b); });
      var sig = rows.length + '|' + (rows.length ? val(rows[rows.length-1].ID) : '');
      if(sig === this.lastSig) return;
      this.lastSig = sig;
      this.rows = rows;
      this._render();
      this._applyVisibility();
    } catch(err){
      if(parent !== this.currentParent) return;
      var ec = errCode(err);
      if(ec !== 9220 && ec !== 9280){
        console.error('[InternalNotesOpen] load failed, raw response:', (err && err.responseText) || err);
      }
      this.rows = [];
      this._render();
    }
  };

  Instance.prototype._send = async function(){
    var identity = this._identity();
    var msg = this.el.input.value.trim();
    if(!msg || !this.currentParent || !identity) return;
    if(!this._zohoOk('addRecords')) return;
    this.el.sendBtn.disabled = true;
    try{
      var payload = {};
      payload[this.cfg.parentField] = this.currentParent;
      payload.Sender_Email = typeof this.cfg.currentUserEmail === 'function' ? this.cfg.currentUserEmail() : this.cfg.currentUserEmail;
      payload.Sender_Name  = identity;
      payload.Message      = msg;
      payload.Sent_On      = fmtDateTimeWrite(new Date());
      var resp = await ZOHO.CREATOR.DATA.addRecords({ app_name: this._appName(), form_name: this.cfg.formName, payload: { data: payload } });
      if(resp && resp.code === 3000){
        this.el.input.value = '';
        this.lastSig = '';
        this._load();
        if(typeof this.cfg.onSend === 'function'){
          // sentOn is the SAME already-computed value used for the local
          // write above — hosts reuse it for the cross-app push instead of
          // needing their own copy of fmtDateTimeWrite (real bug hit live
          // 2026-08-28: both hosts were sending sentOn:'' since onSend
          // never exposed a timestamp before this).
          this.cfg.onSend({ message: msg, name: identity, parent: this.currentParent, sentOn: payload.Sent_On });
        }
      } else {
        console.warn('[InternalNotesOpen] write rejected:', resp);
      }
    } catch(err){
      console.warn('[InternalNotesOpen] write failed:', err);
    } finally {
      this.el.sendBtn.disabled = !this.el.input.value.trim();
    }
  };

  Instance.prototype.open = function(parentValue){
    this.currentParent = String(parentValue || '');
    this._applyVisibility();
    this._stopPolling();
    this.collapsed = true;
    this._applyCollapsedUI();
    this._closeMentionPopup();
  };

  Instance.prototype.refresh = function(){
    this._applyVisibility();
  };

  Instance.prototype.close = function(){
    this._stopPolling();
    this.collapsed = true;
    this._applyCollapsedUI();
    this._closeMentionPopup();
    this.currentParent = '';
  };

  global.InternalNotesOpen = {
    init: function(cfg){ return new Instance(cfg); }
  };
})(window);
