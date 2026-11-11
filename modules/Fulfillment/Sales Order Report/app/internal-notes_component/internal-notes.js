/* ══════════════════════════════════════════════════════════════════════════
   INTERNAL CONVERSATION COMPONENT — engine
   Drop-in per-record private chat between exactly 2 hardcoded accounts/roles —
   a stand-in for a real roles/permissions system (per user, 2026-07-30: "for now
   on internal conversation they should able to talk only between them"). Self-
   contained: no dependency on the host widget's own helpers (escapeHtml/val/
   etc.) — everything it needs is reimplemented locally, same "copy this folder
   into a new widget wholesale" philosophy as timeline_history_component, whose
   collapsed-by-default card/header/toggle-button shape this component mirrors
   exactly (per user request — same look when collapsed, just a chat instead of
   an activity log underneath). See README.md for the Zoho form template and
   integration steps.

   Public API (window.InternalNotes):
     .init(config) -> instance   { mountId, appName, formName, reportName,
                                    parentField, roleMap, currentUserEmail,
                                    title, emptyText, pollMs, mentionableMap }
       instance.open(parentValue)   // new record opened — resets to collapsed,
                                     // re-checks whether this viewer even gets
                                     // to see the feature at all
       instance.refresh()           // re-check visibility without resetting
                                     // collapsed state — call this once if
                                     // currentUserEmail() resolves AFTER open()
                                     // already ran (async SDK init)
       instance.close()             // leaving the detail view entirely — stops
                                     // polling, collapses, clears scope
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
  /* Same AM/PM-aware Date-Time round-trip parsing as timeline_history_component's
     own parseWhen/fmtWhen (see that file's comment for the full "silently turns
     every PM entry into its AM hour" gotcha this guards against). Duplicated
     rather than shared on purpose — these two components must stay independently
     copyable into a widget that only wants one of them. */
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
  function fmtDateTimeWrite(d){
    var pad = function(n){ return String(n).padStart(2, '0'); };
    return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate())
         +' '+pad(d.getHours())+':'+pad(d.getMinutes())+':'+pad(d.getSeconds());
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
      mountId:        'incMount',
      title:          'Internal Conversation',
      emptyText:      'No messages yet — start the conversation.',
      pollMs:         5000,
      roleMap:        {},
      mentionableMap: {}
    }, cfg);
    this.currentParent = '';
    this.rows = [];
    this.lastSig = '';
    this.pollTimer = null;
    /* Collapsed by default, same as timeline_history_component's own card — the
       header (title/sub-label/toggle) always stays visible; only the body (the
       actual chat) hides. Reset to collapsed on every .open() too, not just on
       first build — see open(). */
    this.collapsed = true;
    /* @-mention popup state — see _updateMentionPopup()/_applyMention(). Typing
       "@Name " inserts plain text, same as before — but per user request
       (2026-07-30), being @-mentioned in ANY message of a record's thread now
       ALSO grants that person real access to that specific record's conversation
       (see _checkMentionAccess()/_role()), not just a text reference. Set once
       that check succeeds for the current record; reset on every .open(). */
    this._mentionState = null;
    this._mentionMatches = null;
    this._mentionActiveIdx = 0;
    this._mentionGrantedEmail = null;
    this._mentionGrantedRole = null;
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
  /* Who's viewing, and who the OTHER recognized participant(s) are — recomputed on
     every call (not cached at init) since currentUserEmail() may resolve
     asynchronously well after this instance was constructed (SDK init race, see
     README.md). roleMap isn't limited to exactly 2 entries — it's just "every
     email allowed to see/use this card, and what name/label to show for them".
     Adding a 3rd, 4th, etc. participant is just another roleMap entry; nothing
     else here assumes a fixed count.
     Falls back to a per-record mention grant if the email isn't in roleMap at
     all — see _checkMentionAccess(). That grant only applies to the SAME
     record it was earned on (this.currentParent), matched by email, so it can't
     leak into a different record this same viewer opens next. */
  Instance.prototype._role = function(){
    var email = this._currentEmail();
    if(email && this.cfg.roleMap[email]) return this.cfg.roleMap[email];
    if(email && email === this._mentionGrantedEmail) return this._mentionGrantedRole;
    return null;
  };
  /* mentionableMap names that have ACTUALLY earned access to the current record —
     i.e. their "@Name" appears in an already-loaded, already-sent message, same
     signal _checkMentionAccess() itself uses. Deliberately checks this.rows (the
     server's own message history), never the live draft text still sitting in
     the input box — per user request (2026-07-30), someone merely typing
     "@HC Damage Officer" in an unsent message must NOT make them show up
     anywhere as if they already had access; only a message that's actually been
     sent (and therefore already ran through _checkMentionAccess()'s own logic
     for that person) counts. */
  Instance.prototype._grantedMentionNames = function(){
    var map = this.cfg.mentionableMap || {};
    var rows = this.rows || [];
    return Object.keys(map).map(function(k){ return map[k]; }).filter(function(name){
      return rows.some(function(m){ return val(m.Message).indexOf('@' + name) > -1; });
    });
  };

  /* Comma-joined names of every OTHER participant this viewer should see credited
     in the header — every roleMap member PLUS any mentionableMap person who's
     actually earned access to this record (see _grantedMentionNames()), minus
     whoever's currently viewing. With just the 2 original roleMap entries and no
     granted mentions yet, this is the one other roleMap member's name, same as
     the old _otherRole() this method replaces; it grows to include a mentioned
     person only once their access is genuinely confirmed. */
  Instance.prototype._otherNames = function(){
    var mine = this._role();
    var roleMap = this.cfg.roleMap;
    var names = Object.keys(roleMap).map(function(k){ return roleMap[k]; });
    this._grantedMentionNames().forEach(function(n){ if(names.indexOf(n) === -1) names.push(n); });
    return names.filter(function(name){ return name !== mine; }).join(', ');
  };

  Instance.prototype._build = function(){
    var mount = document.getElementById(this.cfg.mountId);
    if(!mount){ console.warn('[InternalNotes] mount element #' + this.cfg.mountId + ' not found'); return; }
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
    /* mousedown (not click) + preventDefault so the textarea never loses focus
       before the selection registers — a plain click would blur the textarea
       first, which (depending on browser) can fire before the click handler and
       lose the mention state. */
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

  /* Finds an "@query" fragment ending at the cursor, if any — must start at the
     beginning of the text or right after whitespace (so a mid-word "@" inside an
     email-looking string doesn't trigger it). The query itself can contain spaces
     (so "@HC Da" matches "HC Damage Officer" as the user keeps typing), ending
     only at a newline or the cursor position. */
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
    var names = Object.keys(this.cfg.mentionableMap||{}).map((function(map){ return function(k){ return map[k]; }; })(this.cfg.mentionableMap));
    return names.filter(function(name){
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

  /* Inserts "@Name " at the mention's start position, replacing the partial
     "@query" the user had typed — plain text insertion only, same as typing it
     out by hand. Doesn't touch roleMap/access, doesn't send anything. */
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

  /* Shows/hides the ENTIRE card based on whether this viewer resolves to one of
     the 2 recognized roles — an unrecognized viewer never sees so much as the
     collapsed header, since the whole point of this feature is that it's
     exclusively between those 2 accounts. Also keeps the header's "with <role>"
     sub-label current, since role resolution can happen after the card already
     built (see README.md's async SDK init race). */
  Instance.prototype._applyVisibility = function(){
    if(!this.el) return;
    var role = this._role();
    this.el.wrap.style.display = role ? '' : 'none';
    var others = this._otherNames();
    this.el.sub.textContent = role ? (others ? ('with ' + others) : 'no one else has access yet') : '';
  };

  /* Applies this.collapsed to the DOM — independent of _render()'s own innerHTML
     rebuild, mirroring timeline_history_component's own split for the same reason:
     a message arriving mid-poll should never silently re-expand or re-collapse
     a card the user already toggled. */
  Instance.prototype._applyCollapsedUI = function(){
    if(!this.el) return;
    this.el.body.style.display = this.collapsed ? 'none' : '';
    this.el.toggleBtn.textContent = this.collapsed ? 'Show' : 'Hide';
  };

  Instance.prototype._stopPolling = function(){
    if(this.pollTimer){ clearInterval(this.pollTimer); this.pollTimer = null; }
  };
  Instance.prototype._startPolling = function(){
    if(!this.currentParent || !this._role()) return;
    this.lastSig = '';
    this._load();
    this._stopPolling();
    var self = this;
    this.pollTimer = setInterval(function(){ self._load(); }, this.cfg.pollMs);
  };

  Instance.prototype._render = function(){
    if(!this.el) return;
    var mine = this._role();
    if(!this.rows.length){
      this.el.msgs.innerHTML = '<div class="inc-empty">' + escapeHtml(this.cfg.emptyText) + '</div>';
      return;
    }
    var wasNearBottom = (this.el.msgs.scrollHeight - this.el.msgs.scrollTop - this.el.msgs.clientHeight) < 60;
    this.el.msgs.innerHTML = this.rows.map(function(m){
      var isMine = val(m.Sender_Role) === mine;
      return '<div class="inc-bubble ' + (isMine ? 'mine' : 'theirs') + '">'
        + '<div class="inc-meta">' + escapeHtml(val(m.Sender_Role) || 'Unknown') + '</div>'
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
        new Promise(function(_, reject){ setTimeout(function(){ reject(new Error('InternalNotes getRecords timed out')); }, 10000); })
      ]);
      if(parent !== this.currentParent) return;
      var rows = (resp && resp.code === 3000 && Array.isArray(resp.data)) ? resp.data : [];
      rows.sort(function(a,b){ return timeOf(a) - timeOf(b); });
      var sig = rows.length + '|' + (rows.length ? val(rows[rows.length-1].ID) : '');
      if(sig === this.lastSig) return;
      this.lastSig = sig;
      this.rows = rows;
      this._render();
      /* Refresh the header's "with <names>" sub-label too — a newly-loaded
         message can be the first one that ever mentions a mentionableMap
         person, which _otherNames() needs to reflect for roleMap viewers (who
         never go through _checkMentionAccess() themselves, so this is the only
         place their header would otherwise pick up a freshly-granted mention). */
      this._applyVisibility();
    } catch(err){
      if(parent !== this.currentParent) return;
      /* 9220 / 9280 both mean "no records match" — the form/report is fine, this
         parent just has no messages yet. Confirmed live elsewhere in this app family
         (see timeline_history_component's own copy of this comment, Exception app,
         2026-07-29): a brand-new, still-empty report can return 9280 ("No records
         found matching...criteria. Try using a different search criteria.") instead
         of 9220 for the exact same criteria-produced-zero-rows case. Whichever code
         Zoho actually returns for "empty", both are benign here. */
      var ec = errCode(err);
      if(ec !== 9220 && ec !== 9280) console.warn('[InternalNotes] load failed:', err);
      this.rows = [];
      this._render();
    }
  };

  Instance.prototype._send = async function(){
    var role = this._role();
    var msg = this.el.input.value.trim();
    if(!msg || !this.currentParent || !role) return;
    if(!this._zohoOk('addRecords')) return;
    this.el.sendBtn.disabled = true;
    try{
      var payload = {};
      payload[this.cfg.parentField] = this.currentParent;
      payload.Sender_Email = typeof this.cfg.currentUserEmail === 'function' ? this.cfg.currentUserEmail() : this.cfg.currentUserEmail;
      payload.Sender_Role  = role;
      payload.Message      = msg;
      payload.Sent_On      = fmtDateTimeWrite(new Date());
      /* Optional per-widget tag, added 2026-08-25 -- 2+ widgets can now share the
         SAME form/report (e.g. UI/FF Widget/SO + UI/FF Widget/PreOrderReport both
         writing into SOF_Internal_Messages), threaded by record ID (globally
         unique across the app, confirmed via observed ID patterns), so cross-
         module collisions are not a risk -- but a human browsing the shared
         report natively in Zoho Creator has no other way to tell which widget a
         row came from. Only written when the host widget sets cfg.sourceLabel;
         every existing widget that doesn't set it keeps writing exactly as
         before, no schema change required on their own dedicated forms. */
      if(this.cfg.sourceLabel) payload.From = this.cfg.sourceLabel;
      var resp = await ZOHO.CREATOR.DATA.addRecords({ app_name: this._appName(), form_name: this.cfg.formName, payload: { data: payload } });
      if(resp && resp.code === 3000){
        this.el.input.value = '';
        this.lastSig = '';
        this._load();
      } else {
        console.warn('[InternalNotes] write rejected:', resp);
      }
    } catch(err){
      console.warn('[InternalNotes] write failed:', err);
    } finally {
      this.el.sendBtn.disabled = !this.el.input.value.trim();
    }
  };

  /* New record opened — always lands collapsed (same "don't leak the previous
     record's expanded state onto a new one" reset as the host's own Conversation
     panel / timeline_history_component's own open()), and re-checks visibility
     since this is the natural point a host calls it (right alongside its own
     per-record chat/timeline resets). */
  Instance.prototype.open = function(parentValue){
    this.currentParent = String(parentValue || '');
    this._mentionGrantedEmail = null;
    this._mentionGrantedRole = null;
    this._applyVisibility();
    this._stopPolling();
    this.collapsed = true;
    this._applyCollapsedUI();
    this._closeMentionPopup();
    this._checkMentionAccess();
  };

  /* Grants access for THIS record only if the current viewer isn't in roleMap
     but IS in mentionableMap, and their name appears as an "@Name" mention
     somewhere in this record's own message history — per user request
     (2026-07-30): being @-mentioned should actually grant access, not just be a
     text reference. Runs unconditionally on every .open(), independent of
     collapsed/expanded state, since visibility itself depends on the answer.
     Skipped entirely for roleMap members (the common case) — this only ever
     costs an extra request for someone who ISN'T already a normal participant.
     SECURITY NOTE: this means any existing participant can grant a mentionable
     person access to a specific record's thread just by mentioning them once in
     a message — there's no separate "approve" step, and since messages are
     never edited/deleted from this widget, the grant is effectively permanent
     once made. That's the deliberately simple, self-service model asked for; a
     stricter design would need an explicit approval step instead. */
  Instance.prototype._checkMentionAccess = async function(){
    var email = this._currentEmail();
    if(!email || this.cfg.roleMap[email]) return; // already resolved, or no identity yet
    var name = (this.cfg.mentionableMap||{})[email];
    if(!name || !this.currentParent || !this._zohoOk('getRecords')) return;
    var parent = this.currentParent;
    try{
      var criteria = this.cfg.parentField + '=="' + parent.replace(/"/g, '\\"') + '"';
      var resp = await ZOHO.CREATOR.DATA.getRecords({ app_name: this._appName(), report_name: this.cfg.reportName, criteria: criteria, max_records: 500 });
      if(parent !== this.currentParent) return; // navigated to a different record while this was in flight
      var rows = (resp && resp.code === 3000 && Array.isArray(resp.data)) ? resp.data : [];
      var mentioned = rows.some(function(m){ return val(m.Message).indexOf('@' + name) > -1; });
      if(!mentioned) return;
      this._mentionGrantedEmail = email;
      this._mentionGrantedRole = name;
      /* Reuse what was already fetched instead of firing a second identical
         request the moment the card reveals itself and _load() runs. */
      rows.sort(function(a,b){ return timeOf(a) - timeOf(b); });
      this.rows = rows;
      this.lastSig = rows.length + '|' + (rows.length ? val(rows[rows.length-1].ID) : '');
      this._applyVisibility();
    } catch(err){
      /* 9220/9280 = no messages yet for this record — nothing to be mentioned in,
         not an error. Any other failure just means access isn't granted this
         time; _role() safely falls back to null either way. */
    }
  };

  /* Re-check visibility (and the header's "with <role>" sub-label) without
     resetting collapsed state — for when currentUserEmail() resolves
     asynchronously AFTER open() already ran (a real race: SDK init is a
     promise, detail views can open before it settles). Also retries the mention
     grant check, since that was skipped in .open() too if no email was known yet. */
  Instance.prototype.refresh = function(){
    this._applyVisibility();
    this._checkMentionAccess();
  };

  /* Leaving the detail view entirely (not just switching records) — stop polling,
     collapse, and drop the scope so any in-flight _load() bails via the
     parent-mismatch guard above. */
  Instance.prototype.close = function(){
    this._stopPolling();
    this.collapsed = true;
    this._applyCollapsedUI();
    this._closeMentionPopup();
    this.currentParent = '';
  };

  global.InternalNotes = {
    init: function(cfg){ return new Instance(cfg); }
  };
})(window);
