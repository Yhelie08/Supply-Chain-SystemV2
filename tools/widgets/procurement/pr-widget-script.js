
/* ════════════════════════════════
   DATA
════════════════════════════════ */
/* ════════════════════════════════
   CREATOR CONFIG
════════════════════════════════ */
const REPORT_NAME = 'All_Purchase_Request';
const FORM_NAME   = 'Purchase_Request1';
/* No login/user-identity tracking existed anywhere in this widget before this merge
   (checked: no CURRENT_USER, no getInitParams user field) — 'Buyer' is a static
   placeholder actor until this app gains real user identity. */
var prTimeline = TimelineHistory.init({
  mountId: 'tlhcMount',
  appName: function(){ return REAL_APP_NAME; },
  formName: 'PR_Timeline',
  reportName: 'PR_Timeline_Report',
  parentField: 'PR_No',
  actor: 'Buyer',
  title: 'Timeline History'
});
/* ADDED 2026-07-15 — live Load Balancing recompute (see openDetailView/
   computeLiveLoadBalancing). Same report POs/PO.html already reads PO_Line_Items/
   PO_Status from successfully, no field_config needed (proven working there). */
const REPORT_PO_LIVE = 'All_Purchase_Orders';
let REAL_APP_NAME = 'supply-chain-app';
const CHAT_REPORT = 'All_PR_Messages'; /* form 'PR_Messages' — see startChatPolling() NOTES */
let ACCOUNT_OWNER = 'homecartel';
/* Same dev/prod URL-switching signal as INQsv2's own ZC_ENV — this widget never
   tracked environment before notification_component needed it (see that
   component's _isProd()). Updated in resolveCurrentUserEmail() below, same call
   sites that already resolve CURRENT_USER_EMAIL — both come off the same
   getInitParams()/init() params object. */
let ZC_ENV = 'development';

/* Internal Conversation (merged 2026-08-01, per user request: "merge with current
   only the timeline history and the internal conversation and the notification")
   — engine lives in internal-notes_component/, this is just the host-side identity
   resolution + instance config. Runs as early as possible, before the user ever
   opens a PR — see resolveCurrentUserEmail()'s call sites near the getInitParams()
   flow below. roleMap/mentionableMap mirrored from PRs (1)'s own already-configured
   cross-app account list (2026-07-30/31), not re-guessed. */
let CURRENT_USER_EMAIL = '';
function resolveCurrentUserEmail(params){
  if(!params) return;
  if(params.environment || params.env) ZC_ENV = params.environment || params.env; /* updates on every call, not just the first */
  if(CURRENT_USER_EMAIL) return; // first successful email resolution wins
  var email = params.loginUser || params.login_user || params.userEmail || params.user_email || params.user || '';
  email = String(email||'').trim().toLowerCase();
  if(email){
    CURRENT_USER_EMAIL = email;
    console.log('[InternalNotes] Resolved user email:', CURRENT_USER_EMAIL);
    internalNotes.refresh();
    notifications.refresh();
  }
}
var internalNotes = InternalNotes.init({
  mountId:          'incMount',
  appName:          function(){ return REAL_APP_NAME; },
  formName:         'PR_Internal_Messages',
  reportName:       'PR_Internal_Messages_Report',
  parentField:      'PR_No',
  currentUserEmail: function(){ return CURRENT_USER_EMAIL; },
  /* Actual Zoho account names, not generic role labels — nothing downstream cares
     whether a roleMap value is a department label or a real name, and it isn't
     limited to exactly 2 entries (see _otherNames() in internal-notes.js). To grant
     a 3rd/4th/etc. person access, add another entry here — no other code change
     needed. 'hcinvanalyst@gmail.com' (HC Systems) has access on every module by
     default (solo, no one to talk to) except where explicitly paired with someone —
     PRs pairs it with HC Sales. */
  roleMap:          { 'homecartelpacker@gmail.com':'HC Purchasing', 'hcinvanalyst@gmail.com':'HC Systems', 'homecartelsales@gmail.com':'HC Sales' },
  /* Mentioning someone actually grants them access to that record's thread, not just
     a text reference — see internal-notes.js's _checkMentionAccess() and its own
     README section 5 for the mechanics/security note. Every known account EXCLUDING
     whoever's already in this module's own roleMap (they already have access —
     mentionableMap is only for growing access, not re-granting it). */
  mentionableMap:   { 'hcdamageofficer@gmail.com':'HC Damage Officer', 'homecartelff@gmail.com':'HC Pack & Fulfill' },
  title:            'Internal Conversation'
});

/* Notification System — bottom-right bell, not scoped to this (or any) record; see
   notification_component/README.md. Same shared App_Notifications form the rest of
   this app family uses (one report, every widget's own instance filters by
   Recipient_Email). fullAccessRoles means HC Systems sees every row on the report,
   not just ones addressed to it (same all-access stand-in status as internalNotes'
   own roleMap above). */
var notifications = NotificationSystem.init({
  mountId:          'notifMount',
  appName:          function(){ return REAL_APP_NAME; },
  reportName:       'App_Notifications_Report',
  currentUserEmail: function(){ return CURRENT_USER_EMAIL; },
  environment:      function(){ return ZC_ENV; },
  roleMap:          { 'homecartelpacker@gmail.com':'HC Purchasing', 'hcinvanalyst@gmail.com':'HC Systems' },
  fullAccessRoles:  ['HC Systems'],
  title:            'Notifications'
});

/* ════════════════════════════════
   FILE HELPERS — Product Image + Attachments
   Ported from the sibling Inquiry widget (Inq.html), which already has this confirmed
   working against the same Zoho account/app. Same field-shape handling, same upload
   fallback chain, same image-bridge download trick.
════════════════════════════════ */
function escapeHtml(v){
  return String(v==null?'':v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');
}
/* Description text may carry the "|||NL|||" line-break token (written by so_to_pr.txt's
   description sanitizer in place of a raw newline character — a raw newline in a string
   passed to zoho.creator.v2_1.createRecord/updateRecordById breaks Deluge's own JSON
   serialization, confirmed live SO-16531 "JSON_PARSE_ERROR"). Widget-side edits save real
   newlines directly through the Creator SDK's own JSON.stringify (a different, safe code
   path), so this decode is a no-op on that format — same function handles both. */
function decodePRDesc(v){ return (v==null?'':String(v)).split('|||NL|||').join('\n'); }
function descToDisplayHtml(v){ return escapeHtml(decodePRDesc(v)).replace(/\n/g,'<br>'); }
function imgSrc(v){
  if(v==null||v==='') return '';
  if(typeof v==='string') return v.startsWith('http') ? v : '';
  if(typeof v==='object'){
    var candidates=[v.url,v.download_url,v.href,v.display_value,v.zc_display_value,v.value];
    for(var i=0;i<candidates.length;i++){ if(candidates[i]&&typeof candidates[i]==='string'&&candidates[i].startsWith('http')) return candidates[i]; }
  }
  return '';
}
const IMAGE_CACHE = {};

function applyCreatorImage(imgEl, rawValue, onDone){
  if(!imgEl||rawValue==null||rawValue==='') return;

  var cacheKey = (typeof rawValue==='object') ? (rawValue.url||rawValue.download_url||rawValue.value||rawValue.display_value||JSON.stringify(rawValue)) : String(rawValue);
  if(IMAGE_CACHE[cacheKey]){
    imgEl.src = IMAGE_CACHE[cacheKey];
    if(typeof onDone==='function') onDone(IMAGE_CACHE[cacheKey]);
    return;
  }

  var directUrl = (typeof rawValue==='string' && rawValue.startsWith('http')) ? rawValue : imgSrc(rawValue);
  if(directUrl){
    IMAGE_CACHE[cacheKey] = directUrl;
    imgEl.src = directUrl;
    if(typeof onDone==='function') onDone(directUrl);
    return;
  }

  if(typeof ZOHO!=='undefined'&&ZOHO.CREATOR&&ZOHO.CREATOR.UTIL&&typeof ZOHO.CREATOR.UTIL.setImageData==='function'){
    ZOHO.CREATOR.UTIL.setImageData(imgEl, rawValue, function(resp){
      if(imgEl.src){
        IMAGE_CACHE[cacheKey] = imgEl.src;
      }
      if(typeof onDone==='function') onDone(imgEl.src);
    });
  } else {
    var url = imgSrc(rawValue);
    if(url){
      IMAGE_CACHE[cacheKey] = url;
      imgEl.src = url;
      if(typeof onDone==='function') onDone(url);
    }
  }
}
function attachRawToString(raw){
  if(!raw) return '';
  if(typeof raw==='object') return raw.url||raw.download_url||raw.value||raw.filepath||raw.filePath||'';
  return String(raw);
}
function attachFileName(raw){
  if(raw&&typeof raw==='object'&&(raw.file_name||raw.name)) return raw.file_name||raw.name;
  var s = attachRawToString(raw);
  if(!s) return 'Attachment';
  var m = s.match(/[?&]filepath=([^&]+)/);
  if(m){ var name=decodeURIComponent(m[1]); return name.replace(/^\d+_/,''); }
  return s.split('/').pop().split('?')[0] || 'Attachment';
}
function isImageFile(name){ return /\.(jpe?g|png|gif|webp|svg|bmp|tiff?)$/i.test(name||''); }
function base64ToBlob(b64, mime){
  try{
    var byteChars = atob(b64);
    var bytes = new Uint8Array(byteChars.length);
    for(var i=0;i<byteChars.length;i++) bytes[i]=byteChars.charCodeAt(i);
    return new Blob([bytes], {type: mime||'application/octet-stream'});
  } catch(e){ return null; }
}
/* Confirmed-working download trick: ZOHO.CREATOR.UTIL.setImageData is the one mechanism that
   reliably renders these thumbnails with no CORS failure, unlike raw fetch(). Once the image's
   src is a data:/blob: URL set by the SDK, reading it back is local (not cross-origin), so we
   parse the data: URL's base64 payload directly — fetch()ing it is blocked by this page's CSP
   ("connect-src" — confirmed live), even though it's a purely local read. */
function downloadViaImageBridge(url, filename){
  return new Promise(function(resolve){
    if(!(typeof ZOHO!=='undefined'&&ZOHO.CREATOR&&ZOHO.CREATOR.UTIL&&typeof ZOHO.CREATOR.UTIL.setImageData==='function')){ resolve(false); return; }
    var img = new Image();
    var done = false;
    var finish = function(ok){ if(done) return; done=true; resolve(ok); };
    var timer = setTimeout(function(){ finish(false); }, 15000);
    img.onload = function(){
      clearTimeout(timer);
      try{
        var src = img.src, blob = null;
        if(src.indexOf('data:')===0){
          var commaIdx = src.indexOf(',');
          var meta = src.slice(5, commaIdx);
          var mime = meta.split(';')[0] || 'application/octet-stream';
          var payload = src.slice(commaIdx+1);
          blob = meta.indexOf('base64')!==-1 ? base64ToBlob(payload, mime) : new Blob([decodeURIComponent(payload)], {type: mime});
        }
        if(!blob){ finish(false); return; }
        var dlUrl = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = dlUrl; a.download = filename||'download';
        document.body.appendChild(a); a.click();
        URL.revokeObjectURL(dlUrl); a.remove();
        finish(true);
      } catch(e){ finish(false); }
    };
    img.onerror = function(){ clearTimeout(timer); finish(false); };
    ZOHO.CREATOR.UTIL.setImageData(img, url, function(){});
  });
}
async function downloadCreatorFile(fieldName, url, filename){
  if(await downloadViaImageBridge(url, filename)){ showToast('Downloaded.'); return; }
  showToast('Could not download — open the record in Zoho Creator directly.');
}
function loadAttachImage(imgEl, raw, fieldName){
  function showPlaceholder(){
    imgEl.style.display='none';
    var ph = imgEl.parentElement;
    if(ph && !ph.querySelector('.attach-ph')) ph.insertAdjacentHTML('beforeend','<div class="attach-ph" style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:var(--gray-50);color:var(--gray-300);font-size:22px">&#128444;</div>');
  }
  if(raw && typeof ZOHO!=='undefined'&&ZOHO.CREATOR&&ZOHO.CREATOR.UTIL&&ZOHO.CREATOR.UTIL.setImageData){
    /* Pass the raw field value straight through, same reasoning as applyCreatorImage —
       pre-extracting a URL string first can silently reject a valid shape that just doesn't
       carry one of the guessed key names. */
    ZOHO.CREATOR.UTIL.setImageData(imgEl, raw, function(){});
    imgEl.onerror = showPlaceholder;
  } else { showPlaceholder(); }
}
/* Upload chain: tries SDK → alt SDK namespace → REST → base64, in order, first success wins */
async function uploadFilesTo(recordId, fieldName, files){
  var allOk = true;
  for(var i=0;i<files.length;i++){
    var file = files[i], ok = false;
    if(!ok && typeof ZOHO!=='undefined'&&ZOHO.CREATOR&&ZOHO.CREATOR.FILE&&typeof ZOHO.CREATOR.FILE.uploadFile==='function'){
      try{
        var r1 = await ZOHO.CREATOR.FILE.uploadFile({ app_name:REAL_APP_NAME, report_name:REPORT_NAME, id:String(recordId), field_name:fieldName, file:file });
        ok = (r1 && r1.code===3000);
      } catch(e){ console.warn('[Upload-1 SDK] failed:', e.message||e); }
    }
    if(!ok && typeof ZOHO!=='undefined'&&ZOHO.CREATOR&&ZOHO.CREATOR.UTIL&&typeof ZOHO.CREATOR.UTIL.uploadFile==='function'){
      try{
        var r2 = await ZOHO.CREATOR.UTIL.uploadFile({ app_name:REAL_APP_NAME, report_name:REPORT_NAME, id:String(recordId), field_name:fieldName, file:file });
        ok = (r2 && r2.code===3000);
      } catch(e){ console.warn('[Upload-2 UTIL] failed:', e.message||e); }
    }
    if(!ok){
      try{
        var fd = new FormData(); fd.append(fieldName, file, file.name);
        var url = 'https://creator.zoho.com/api/v2/'+ACCOUNT_OWNER+'/'+REAL_APP_NAME+'/report/'+REPORT_NAME+'/'+String(recordId)+'/'+fieldName+'/upload';
        var r3 = await fetch(url, { method:'POST', body:fd, credentials:'include' });
        var d3 = await r3.json();
        ok = (d3 && d3.code===3000);
      } catch(e){ console.warn('[Upload-3 REST] failed:', e.message||e); }
    }
    if(!ok){
      try{
        var b64 = await new Promise(function(res,rej){ var rd=new FileReader(); rd.onload=function(e){res(e.target.result);}; rd.onerror=rej; rd.readAsDataURL(file); });
        var p4={}; p4[fieldName]=b64;
        var r4 = await ZOHO.CREATOR.DATA.updateRecordById({ app_name:REAL_APP_NAME, report_name:REPORT_NAME, id:String(recordId), payload:{ data:p4 } });
        ok = (r4 && r4.code===3000);
      } catch(e){ console.warn('[Upload-4 B64] failed:', e.message||e); }
    }
    if(!ok){ console.error('[Upload] All methods failed for', fieldName, file.name); allOk = false; }
  }
  return allOk;
}
function openLightbox(src){
  if(!src) return;
  $('lightboxImg').src = src;
  $('lightboxOverlay').classList.add('open');
}
function closeLightbox(){
  $('lightboxOverlay').classList.remove('open');
  $('lightboxImg').src = '';
}

/* ════════════════════════════════
   DATA — loaded from Creator
════════════════════════════════ */
let READY_PR = [];
let ALL_PR   = [];
let creatorLoaded = false;

/* REMOVED 2026-07-15, per user ("still mock datas") — was a 5-fake-supplier hardcoded
   array (GlobalParts/Acme/TechSupply/Manila Steel/BuildRight, none of them real). See
   renderLoad()/computeSupplierPortfolioLoad() below for the live replacement, built from
   NPR_SUPPLIERS (real All_Suppliers — Fenteng/Tony) + ALL_PR (already-loaded real PRs) +
   a live Purchase_Order fetch (same REPORT_PO_LIVE/count-by-supplier-name pattern as
   computeLiveLoadBalancing, factored out into computeLiveActivePOCounts so both share
   one source of truth). */

/* ════════════════════════════════
   STATE
════════════════════════════════ */
let activeTab = 'all';
let queueFilter = 'all';
let allFilter = 'other'; /* All PRs opens on the In Progress pill (2026-10-01, per user) */

/* ── Per-PR extended info (Sales Owner, Customer Type, Similar Item, Attachments) ── */
const PR_INFO = {
  1:{salesOwner:'Ana Martinez',customerType:'Corporate',   similarItem:false,attachments:['pump-valve-spec.pdf','GlobalParts-quotation.xlsx']},
  2:{salesOwner:'Ana Martinez',customerType:'Corporate',   similarItem:true, attachments:['safety-helmet-sample.jpg','safety-helmet-specs.pdf']},
  3:{salesOwner:'Bea Santos',  customerType:'Business Partner',similarItem:false,attachments:['fastener-spec-316ss.pdf']},
  4:{salesOwner:'Bea Santos',  customerType:'Corporate',   similarItem:true, attachments:[]},
  5:{salesOwner:'Carlos Reyes',customerType:'Business Partner',similarItem:false,attachments:['bearing-tech-sheet.pdf']},
  6:{salesOwner:'Carlos Reyes',customerType:'Corporate',   similarItem:false,attachments:[]},
  7:{salesOwner:'Ana Martinez',customerType:'Corporate',   similarItem:false,attachments:[]},
  8:{salesOwner:'Bea Santos',  customerType:'Corporate',   similarItem:false,attachments:['pvc-conduit-drawing.pdf']},
  9:{salesOwner:'Carlos Reyes',customerType:'Business Partner',similarItem:false,attachments:[]},
};

/* ── Photo thumbnail helpers ── */
const PHOTO_COLORS_PR=[
  {bg:'#EFF6FF',fg:'#1D4ED8'},{bg:'#F0FDF4',fg:'#15803D'},{bg:'#FFF7ED',fg:'#C2410C'},
  {bg:'#FDF4FF',fg:'#7E22CE'},{bg:'#FFF1F2',fg:'#BE123C'},{bg:'#F0FDFA',fg:'#0D9488'},
];
function getPhotoColor(sku){
  let h=0;for(const c of sku)h=(h*31+c.charCodeAt(0))&0xFFFFFF;
  return PHOTO_COLORS_PR[Math.abs(h)%PHOTO_COLORS_PR.length];
}
function getInitialsPR(name){
  return name.trim().split(/\s+/).slice(0,2).map(w=>w[0]||'').join('').toUpperCase();
}
/* ADDED 2026-07-15, per user ("Tony Fan rec. supplier but here it says Fenteng") — real
   bug: `Suppliers.Supplier_Name` resolves to the FULL name ("Tony Fan"/"Fenteng
   Lighting") everywhere in this widget, but `Purchase_Request1.Selected_Supplier` (and
   `PO_Line_Items.Supplier`) store the SHORT name ("Tony"/"Fenteng" — confirmed in
   CLAUDE.md's own Purchase Request System notes). Every exact-string supplier-name
   comparison in this file was silently failing whenever it crossed that short/full
   boundary — confirmed by the "View" button search returning 0 results for "Tony Fan"
   against PRs whose stored value is "Tony". Fix: match names PREFIX-TOLERANT
   (case-insensitive, either string a prefix of the other) instead of requiring an exact
   match, everywhere a supplier name from Suppliers/NPR_SUPPLIERS might be compared
   against one from Purchase_Request1/Purchase_Order. */
function supplierKeyMatch(a,b){
  if(!a||!b) return false;
  var x=String(a).toLowerCase().trim(), y=String(b).toLowerCase().trim();
  if(!x||!y) return false;
  return x===y || x.indexOf(y)===0 || y.indexOf(x)===0;
}
function findCountForSupplier(name, countByName){
  if(!countByName) return 0;
  if(Object.prototype.hasOwnProperty.call(countByName,name)) return countByName[name];
  for(var key in countByName){
    if(Object.prototype.hasOwnProperty.call(countByName,key) && supplierKeyMatch(name,key)) return countByName[key];
  }
  return 0;
}

/* Live PO-derived active counts, shared across every "how loaded is this supplier"
   display in this widget (Detail view Load Balancing, Supplier Load View tab, and now
   this main-list Rec. Supplier hint too) — one fetch/compute, cached, so all 3 places
   agree instead of drifting like the old stale-Active_PO_Count version did (see the
   comment above computeRecommendedSupplier's rewrite). `null` until the first fetch
   resolves; callers that need it before then fall back to the old stale-field heuristic
   for a reasonable first-paint guess, and self-heal once this populates (see
   loadFromCreator's own re-render-on-arrival, same pattern already used for
   NPR_ITEMS). */
let LIVE_PO_COUNTS = null;
let _cachedPORows = null;
let _cachedPOTime = 0;
let _poFetchPromise = null;
const PO_CACHE_TTL = 180000; /* 3 minutes TTL */

function fetchLivePOData(cb, forceRefresh){
  var now = Date.now();
  if(!forceRefresh && _cachedPORows && (now - _cachedPOTime < PO_CACHE_TTL)){
    if(typeof cb === 'function') cb(_cachedPORows);
    return;
  }
  if(_poFetchPromise){
    if(typeof cb === 'function'){
      _poFetchPromise.then(function(rows){ cb(rows); });
    }
    return;
  }
  if(typeof ZOHO==='undefined'||!ZOHO.CREATOR||!ZOHO.CREATOR.DATA||typeof ZOHO.CREATOR.DATA.getRecords!=='function'){
    if(typeof cb === 'function') cb(_cachedPORows || []);
    return;
  }
  var gr = ZOHO.CREATOR.DATA.getRecords.bind(ZOHO.CREATOR.DATA);
  _poFetchPromise = gr({ report_name: REPORT_PO_LIVE, page: 1, pageSize: 200 })
    .then(function(resp){
      var poRows = (resp && resp.code===3000 && Array.isArray(resp.data)) ? resp.data : [];
      _cachedPORows = poRows;
      _cachedPOTime = Date.now();
      LIVE_PO_COUNTS = computeLiveActivePOCounts(poRows);
      _poFetchPromise = null;
      return poRows;
    })
    .catch(function(e){
      console.warn('[PR] live PO fetch failed:', e);
      LIVE_PO_COUNTS = LIVE_PO_COUNTS || {};
      _poFetchPromise = null;
      return _cachedPORows || [];
    });
  if(typeof cb === 'function'){
    _poFetchPromise.then(function(rows){ cb(rows); });
  }
}

/* Recommended Supplier — among suppliers that handle this category (or handle
   everything), pick the one carrying the lightest load. REWRITTEN 2026-07-15: now
   prefers LIVE_PO_COUNTS (real Purchase_Order data, same source/definition the Detail
   view's Load Balancing table and Supplier Load View tab already use) over the old
   stale Suppliers.Active_PO_Count/Max_Capacity snapshot fields — this is the actual fix
   for the Tony-vs-Fenteng disagreement: the old version sorted by a stale ratio (Tony
   2/30=6.7% vs Fenteng 2/15=13.3%, Tony "wins") while the real live data has both at 0
   active POs (genuinely tied). Falls back to the old stale-field heuristic only when
   LIVE_PO_COUNTS hasn't loaded yet (first paint, before fetchLivePOData's first
   response) — self-heals to the live answer once it arrives.
   REWRITTEN AGAIN 2026-08-15, per user ("dapat ang recommendation ay based sa
   pinakababang Initial Price, or if available ang Negotiated... Pero if existing na
   ang price, dapat sa lead time... and based din sa category" + "dapat pag ka submit
   ng supplier tsaka lang magkakaroon ng recommendation") — load/capacity is no
   longer the basis at all. New optional `supplierQuotes` param (same
   {supplier,initial,negotiated,leadTime,...} shape mapPR() already produces from
   Supplier_Selected) drives the pick: lowest price (Negotiated if present, else
   Initial_Price), Lead_Time as a tiebreaker on equal price. A supplier with no quote
   row (or blank Negotiated AND Initial_Price) is excluded from consideration
   entirely — if nobody eligible has quoted yet, returns '—' (no recommendation),
   matching the user's explicit "only after submission" requirement. Callers without
   quote data yet (e.g. the brand-new-PR create flow, before any supplier exists to
   quote) simply omit the 2nd arg and always get '—', which is correct for that case. */
function computeRecommendedSupplier(category, supplierQuotes){
  if(!NPR_SUPPLIERS.length || !category || category==='—') return '—';
  function dpvLocal(obj){
    if(obj==null||obj==='') return '';
    if(typeof obj==='object') return obj.zc_display_value||obj.display_value||obj.Name||obj.name||obj.Supplier_Name||obj.ID||'';
    var s=String(obj); return (s==='[object Object]'||/^\[object/.test(s)) ? '' : s;
  }
  function nameOf(s){ return dpvLocal(s.Supplier_Name)||dpvLocal(s.Name)||dpvLocal(s.name)||String(s.ID||''); }
  supplierQuotes = supplierQuotes || [];
  function quoteFor(nm){
    for(var i=0;i<supplierQuotes.length;i++){
      var q = supplierQuotes[i];
      if(q && q.supplier && supplierKeyMatch(q.supplier, nm)) return q;
    }
    return null;
  }
  var catLower = category.toLowerCase();
  var eligible = NPR_SUPPLIERS.filter(function(s){
    var handlesAll = s.Handles_All===true||s.Handles_All==='true';
    if(handlesAll) return true;
    var cats = s.Supported_Categories;
    var catsStr = Array.isArray(cats) ? cats.map(dpvLocal).join(', ') : (dpvLocal(cats)||String(cats||''));
    return catsStr.toLowerCase().indexOf(catLower)!==-1;
  }).filter(function(s){
    var status = dpvLocal(s.Status)||String(s.Status||'');
    return !/inactive|suspend|overload/i.test(status);
  });
  if(!eligible.length) return '—';
  var bestName = '';
  var bestPrice = -1;
  var bestLeadTime = -1;
  eligible.forEach(function(s){
    var nm = nameOf(s);
    var q = quoteFor(nm);
    if(!q) return;
    var price = q.negotiated!=null ? q.negotiated : q.initial;
    if(price==null) return;
    if(bestPrice===-1 || price<bestPrice){
      bestPrice = price; bestLeadTime = (q.leadTime!=null?q.leadTime:-1); bestName = nm;
    } else if(price===bestPrice){
      var lt = q.leadTime;
      if(lt!=null && (bestLeadTime===-1 || lt<bestLeadTime)){ bestLeadTime = lt; bestName = nm; }
    }
  });
  return bestName || '—';
}

/* ADDED 2026-07-15, per user ("how can we make it live every PR open or something") —
   full live recompute of the "Supplier Recommendation — Load Balancing" table, client-
   side, called fresh on every Detail view open (see openDetailView). Deliberately NOT
   reading the native Supplier_Load_Balancing subform at all here — this app's deployment
   only uses the widget (native form isn't opened by end users, per user confirmation),
   so there's no reason to round-trip through a server-side Validations recompute + a
   second fetch; computing straight from already-available data is simpler and instant.
   Mirrors pr_sync_supplier_load_balancing.txt's OWN live-count logic exactly (same
   count basis — PO_Line_Items rows, not distinct POs, per that script's 2026-07-15
   rework — same active/Max_Capacity ratio, same >=100 Overloaded / >=80 Near Capacity
   thresholds) so the two don't silently drift apart even though only one of them
   actually renders anywhere now. */
function dpvSupplierLive(obj){
  if(obj==null||obj==='') return '';
  if(typeof obj==='object') return obj.zc_display_value||obj.display_value||obj.Name||obj.name||obj.Supplier_Name||obj.ID||'';
  var s=String(obj); return (s==='[object Object]'||/^\[object/.test(s)) ? '' : s;
}
function supplierNameLive(s){ return dpvSupplierLive(s.Supplier_Name)||dpvSupplierLive(s.Name)||dpvSupplierLive(s.name)||String(s.ID||''); }

/* Live active PO_Line_Items count per supplier name, non-Completed/non-Cancelled POs —
   shared by computeLiveLoadBalancing() (Detail view, category-filtered) and
   computeSupplierPortfolioLoad() (Supplier Load View tab, portfolio-wide) so both read
   off one counting definition instead of two copies that could quietly diverge. */
function computeLiveActivePOCounts(poRows){
  var countByName = {};
  (poRows||[]).forEach(function(po){
    var st = dpvSupplierLive(po.PO_Status)||String(po.PO_Status||'');
    if(st==='Completed'||st==='Cancelled') return;
    var lines = Array.isArray(po.PO_Line_Items) ? po.PO_Line_Items : [];
    lines.forEach(function(ln){
      var nm = dpvSupplierLive(ln.Supplier)||String(ln.Supplier||'');
      if(!nm) return;
      countByName[nm] = (countByName[nm]||0)+1;
    });
  });
  return countByName;
}

/* CHANGED 2026-08-15, per user ("dapat ang recommendation ay based sa pinakababang
   Initial Price, or if available ang Negotiated... Pero if existing na ang price,
   dapat sa lead time... and based din sa category" + separate follow-up: "dapat pag
   ka submit ng supplier tsaka lang magkakaroon ng recommendation") — two changes:
   (1) "Recommended" now goes to the eligible supplier with the LOWEST price
   (Negotiated if entered, else Initial_Price), Lead_Time (days) as tiebreaker only
   when price is equal — same basis as the server-side fix in
   pr_sync_supplier_load_balancing.txt, mirrored here so the widget's own live
   recompute (which "always wins" over the server value, per this function's own
   2026-08-13 fix note below) doesn't silently diverge from it again.
   (2) A supplier with NO quote submitted yet (no supplierQuotes row, or one with
   both Negotiated and Initial_Price blank) is never marked "Recommended" — shows
   "Awaiting Quote" instead of the old "Available (Higher load)". If NO eligible
   supplier has quoted yet, nobody gets Recommended at all (recommendedName stays
   ''), matching the user's explicit ask that a recommendation should only exist
   once at least one supplier has actually submitted.
   activePOs/percent/loadStatus are UNCHANGED (still real live PO_Line_Items counts,
   still shown as informational Load columns) — they just no longer decide who gets
   the Recommended badge. New `supplierQuotes` param mirrors _currentMappedPR's own
   already-computed array (see mapPR()'s Supplier_Selected parsing) — same
   {supplier,initial,negotiated,leadTime,...} shape, no new fetch needed. */
function computeLiveLoadBalancing(category, poRows, supplierQuotes){
  if(!NPR_SUPPLIERS.length || !category || category==='—') return [];
  var dpvLocal = dpvSupplierLive;
  function catList(raw){
    var s = dpvLocal(raw)||String(raw||'');
    s = s.replace(/\r/g,'');
    return s.indexOf('\n')!==-1 ? s.split('\n') : s.split(',');
  }
  var supName = supplierNameLive;
  var countByName = computeLiveActivePOCounts(poRows);
  supplierQuotes = supplierQuotes || [];
  function quoteFor(nm){
    for(var i=0;i<supplierQuotes.length;i++){
      var q = supplierQuotes[i];
      if(q && q.supplier && supplierKeyMatch(q.supplier, nm)) return q;
    }
    return null;
  }

  var eligibleSet = {};
  NPR_SUPPLIERS.forEach(function(s){
    var handlesAll = s.Handles_All===true||s.Handles_All==='true';
    var isElig = handlesAll;
    if(!isElig){
      var cats = s.Supported_Categories;
      if(cats!=null && cats!==''){
        isElig = catList(cats).some(function(c){ return c.trim()===category; });
      }
    }
    if(isElig) eligibleSet[supName(s)] = true;
  });

  var recommendedName = '';
  var bestPrice = -1;
  var bestLeadTime = -1;
  NPR_SUPPLIERS.forEach(function(s){
    var nm = supName(s);
    if(!eligibleSet[nm]) return;
    var q = quoteFor(nm);
    if(!q) return;
    var price = q.negotiated!=null ? q.negotiated : q.initial;
    if(price==null) return;
    if(bestPrice===-1 || price<bestPrice){
      bestPrice = price; bestLeadTime = (q.leadTime!=null?q.leadTime:-1); recommendedName = nm;
    } else if(price===bestPrice){
      var lt = q.leadTime;
      if(lt!=null && (bestLeadTime===-1 || lt<bestLeadTime)){ bestLeadTime = lt; recommendedName = nm; }
    }
  });

  return NPR_SUPPLIERS.map(function(s){
    var nm = supName(s);
    var isElig = !!eligibleSet[nm];
    var cnt = findCountForSupplier(nm, countByName);
    var maxCap = parseFloat(dpvLocal(s.Max_Capacity)||s.Max_Capacity||0)||0;
    var pct = maxCap>0 ? Math.round((cnt*100)/maxCap) : 0;
    var loadStatus = pct>=100?'Overloaded':(pct>=80?'Near Capacity':'Normal');
    var q = quoteFor(nm);
    var hasQuote = !!(q && (q.negotiated!=null || q.initial!=null));
    var eligText = 'Removed';
    if(isElig){
      eligText = (nm===recommendedName) ? 'Recommended' : (hasQuote ? 'Available' : 'Awaiting Quote');
    }
    return {
      name: nm||'—',
      category: isElig?'Match':'Not Match',
      activePOs: cnt,
      percent: pct,
      loadStatus: loadStatus,
      eligible: eligText,
    };
  }).filter(function(row){ return row.name && row.name!=='—'; });
}

/* Fetches fresh Purchase_Order data and re-renders the Detail view's Load Balancing
   table with a truly live recompute — called on every openDetailView(). Independent
   of, and fires after, the existing getRecordById full-record re-render so a slow PO
   fetch never blocks the rest of the detail view from showing up-to-date. */
function refreshLiveLoadBalancing(prId, category){
  if(!NPR_SUPPLIERS.length){ loadNewPRDropdowns(); }
  fetchLivePOData(function(poRows){
    /* Only apply if the user hasn't navigated away from this PR since the fetch started */
    if(!_currentMappedPR || String(_currentMappedPR.id)!==String(prId)) return;
    var live = computeLiveLoadBalancing(category, poRows, _currentMappedPR.supplierQuotes);
    if(!live.length) return;   /* NPR_SUPPLIERS not ready yet or no category — keep whatever's already shown */
    _currentMappedPR.loadBalancing = live;
    /* FIXED 2026-08-13, real bug live (PR-00001): this table's own "Recommended" badge
       comes from live's recomputed name, but recSupplier (the ONLY thing
       syncFollowedRecFromSupplier/autoHealFollowedRecommendation compare the picked
       supplier against) was still whatever computeRecommendedSupplier() set at
       mapPR() time — a separate calc (ratio-based, different tie-break) that can name a
       different supplier than this live table does. Result: user picks the supplier this
       table visibly marks "Recommended", but Followed_Recommendation still computes "No"
       and blocks on a spurious Override Reason. Since this live fetch is already the
       source of truth for the table ("live fetch always wins" per the comment above),
       make it the source of truth for recSupplier too, then re-run the heal check so an
       already-selected-but-now-matching supplier clears immediately. */
    var liveRecRow = live.find(function(row){ return row.eligible==='Recommended'; });
    if(liveRecRow) _currentMappedPR.recSupplier = liveRecRow.name;
    autoHealFollowedRecommendation(_currentMappedPR);
    var d = buildDetailFromPR(_currentMappedPR);
    renderDetailView(_currentMappedPR, d, _currentMappedPR);
  });
}
/* Row thumbnail — real Product_Image_PR if the PR has one, colored-initials fallback otherwise.
   The <img> src has to be set after the row exists in the DOM (see loadRowThumbs), so this
   only renders the markup + a placeholder fallback.
   `scope` must be unique per view (queue/all/grouping) — every view stays in the DOM at once
   (just hidden), so the same record's id alone isn't a unique DOM id across views; without a
   scope prefix, getElementById would always resolve to whichever view happens to come first in
   the document, silently writing the image onto a hidden view's thumbnail instead of this one's. */
function rowThumbHtml(r, scope){
  const pc = getPhotoColor(r.sku||'SKU');
  const pi = getInitialsPR(r.product||'?');
  return `<div class="rthumb-box" style="width:32px;height:32px;border-radius:6px;overflow:hidden;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:800;background:${pc.bg};color:${pc.fg};position:relative">
    <img id="rthumb-${scope}-${r.id}" style="display:none;width:100%;height:100%;object-fit:cover;cursor:zoom-in" onload="this.style.display='';var fb=document.getElementById('rthumb-fb-${scope}-${r.id}');if(fb)fb.style.display='none';" onerror="this.style.display='none';var fb=document.getElementById('rthumb-fb-${scope}-${r.id}');if(fb)fb.style.display='';" onclick="event.stopPropagation();if(this.src)openLightbox(this.src)" />
    <span id="rthumb-fb-${scope}-${r.id}">${pi}</span>
  </div>`;
}

let _thumbObserver = null;

function _loadSingleThumb(r, scope){
  if(!r || !r.photo) return;
  const img = document.getElementById('rthumb-'+scope+'-'+r.id);
  const fb  = document.getElementById('rthumb-fb-'+scope+'-'+r.id);
  if(!img || img.dataset._loaded) return;
  img.dataset._loaded = 'true';

  applyCreatorImage(img, r.photo, function(src){
    if(src && img){
      img.style.display = '';
      if(fb) fb.style.display = 'none';
    }
  });
}

function loadRowThumbs(data, scope){
  if(!data || !data.length) return;
  var photoItems = data.filter(function(r){ return !!r.photo; });
  if(!photoItems.length) return;

  if(typeof IntersectionObserver !== 'undefined'){
    if(!_thumbObserver){
      _thumbObserver = new IntersectionObserver(function(entries){
        entries.forEach(function(entry){
          if(entry.isIntersecting){
            var el = entry.target;
            _thumbObserver.unobserve(el);
            if(el._thumbRecord){
              _loadSingleThumb(el._thumbRecord, el._thumbScope);
            }
          }
        });
      }, { rootMargin: '350px 0px' });
    }

    photoItems.forEach(function(r){
      var img = document.getElementById('rthumb-'+scope+'-'+r.id);
      if(!img) return;
      var wrap = img.parentElement;
      if(wrap){
        wrap._thumbRecord = r;
        wrap._thumbScope = scope;
        _thumbObserver.observe(wrap);
      } else {
        _loadSingleThumb(r, scope);
      }
    });
  } else {
    photoItems.forEach(function(r){ _loadSingleThumb(r, scope); });
  }
}
function getFileBadgePR(f){
  const ext=(f.split('.').pop()||'').toLowerCase();
  if(ext==='pdf') return{t:'PDF',bg:'#FEE2E2',c:'#DC2626'};
  if(['jpg','jpeg','png','gif','webp'].includes(ext)) return{t:'IMG',bg:'#DBEAFE',c:'#1D4ED8'};
  if(['mp4','mov','avi'].includes(ext)) return{t:'VID',bg:'#EDE9FE',c:'#7C3AED'};
  if(['dwg','step','stl','obj'].includes(ext)) return{t:'3D',bg:'#D1FAE5',c:'#065F46'};
  return{t:'FILE',bg:'#F1F5F9',c:'#475569'};
}

/* ════════════════════════════════
   HELPERS
════════════════════════════════ */
function $(id){return document.getElementById(id)}
// FIXED 2026-08-15, real bug found live ("can't select supplier" — console showed
// "Uncaught ReferenceError: el is not defined" in syncFollowedRecFromSupplier()) —
// enterEditMode() alone calls el(...) 20+ times (dvDesc/dvQty/dvSupplier/etc), but
// `el` was never actually defined anywhere in this file or its 3 loaded components
// (confirmed via full-codebase search) — only $(id) was ever defined as the
// getElementById shorthand. Whatever inconsistent behavior let SOME earlier edits
// through this session was incidental (e.g. depending on whether an external SDK
// bundle happened to expose a same-named global that session — the console log
// also showed widgetFramework...js itself failing to load with a 400), not a real
// guarantee. Defining el as a plain alias for $ here removes that dependency
// entirely and makes every el(...) call in enterEditMode() (and anywhere else in
// this file) deterministically correct regardless of SDK load timing.
function el(id){return document.getElementById(id)}
/* FIXED 2026-07-15, per user: `finalPrice` is a MIXED-currency value depending on
   `priceSource` — a real supplier quote (`Selcted_Final_Cost`) is Currency(CNY) in the
   native form (paid to Fenteng/Tony), but the SRP_Rate_PR/catalog-Rate fallbacks this
   same field can carry are PHP (customer-facing sell-side reference numbers, plain
   Number type, no currency ambiguity of their own — see so_to_pr_scripts_NewScripts.txt
   NOTES). A blanket ₱-everywhere was wrong for the 'quote' case specifically. Symbol now
   follows `priceSource`: ¥ for a real quote ('quote'/'none' — 'none' has no real value
   either way, defaults to the buy-side symbol since that's this widget's primary
   context), ₱ for 'srp'/'catalog' (PHP-denominated references). */
function fmtPrice(n, priceSource){
  if(!(n>0)) return '—';
  var sym = (priceSource==='srp'||priceSource==='catalog'||priceSource==='srp_approved') ? '₱' : '¥';
  return sym+n.toLocaleString('en-PH');
}

function catBadge(v){return `<span class="badge-pill cat-badge">${v}</span>`}

function recBadge(v){
  if(v==='Yes') return `<span class="badge-pill rec-yes">&#10003; Yes</span>`;
  if(v==='Override') return `<span class="badge-pill rec-override">&#9889; Override</span>`;
  return `<span style="color:var(--gray-300)">—</span>`;
}

function shipBadge(v){
  if(!v||v==='—') return `<span style="color:var(--gray-300)">—</span>`;
  return `<span class="badge-pill ship-badge">${v}</span>`;
}

/* FIXED 2026-08-18, real live bug (screenshot, New PR form: pill selector on MEDIUM,
   PR Summary sidebar showed LOW) — every OTHER caller of this function passes a mapped
   PR row's r.priority, already normalized to the 3-letter 'MED' (see mapPR()'s own
   priRaw==='HIGH'?'HIGH':priRaw==='LOW'?'LOW':'MED'). The New PR form's own
   newPRPriority state variable is the one exception — it has to stay the FULL word
   'MEDIUM' (Zoho's real Priority field expects 'HIGH'/'MEDIUM'/'LOW', not 'MED' — see
   the payload build a few hundred lines down, "Creator sends MEDIUM (not MED)") — so
   'MEDIUM' never matched the old p==='MED' check and silently fell through to the LOW
   branch every time. Accept both spellings here instead of normalizing newPRPriority
   itself, so the real Zoho payload value is untouched. */
function priorityHtml(p){
  if(p==='HIGH') return `<span class="pri-high"><span class="priority-dot"></span>HIGH</span>`;
  if(p==='MED'||p==='MEDIUM') return `<span class="pri-med"><span class="priority-dot"></span>MED</span>`;
  return `<span class="pri-low"><span class="priority-dot"></span>LOW</span>`;
}

function delayBadge(v){
  const cls = v==='On Track'?'delay-ontrack':v==='At Risk'?'delay-atrisk':'delay-delayed';
  return `<span class="badge-pill ${cls}">&#9679; ${v}</span>`;
}


  // ---------------------------------------------------------------------
  // Next Step — ADDED 2026-09-30 (see Proposals/Next_Step_Plan_2026-09-30.md).
  // DISPLAY ONLY: shows staff where a record is and what the next step is,
  // and who does it. Never saves anything. The wording/roles for this widget
  // live in its own nextStepFor() below — edit them there only.
  // Self-styled (injects its own <style>), so it doesn't depend on Tailwind
  // classes existing in a precompiled CSS build.
  // ns = { here, action, who, tone: "next" | "wait" | "done" }
  // ---------------------------------------------------------------------
  (function injectNextStepCss() {
    if (document.getElementById("nsStyles")) return;
    const s = document.createElement("style");
    s.id = "nsStyles";
    s.textContent =
      ".ns-pill{display:inline-flex;align-items:center;gap:4px;font-size:11px;font-weight:600;line-height:1.25;padding:3px 9px;border-radius:9999px;border:1px solid;white-space:nowrap}" +
      ".ns-next{background:#eff6ff;color:#1d4ed8;border-color:#bfdbfe}" +
      ".ns-wait{background:#fffbeb;color:#b45309;border-color:#fde68a}" +
      ".ns-done{background:#ecfdf5;color:#047857;border-color:#a7f3d0}" +
      ".ns-stop{background:#fee2e2;color:#dc2626;border-color:#fca5a5}" +
      ".ns-who{font-weight:400;opacity:.85}" +
      ".ns-banner{display:flex;flex-wrap:wrap;align-items:center;gap:6px 10px;font-size:13px;line-height:1.35;padding:10px 14px;border-radius:12px;border:1px solid;margin:0 0 16px}" +
      ".ns-lbl{font-size:10px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;opacity:.7;margin-right:4px}" +
      ".ns-arrow{opacity:.5}";
    document.head.appendChild(s);
  })();

  function nsEsc(v) {
    return String(v == null ? "" : v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  function nsToneClass(ns) {
    return ns.tone === "done" ? "ns-done" : ns.tone === "wait" ? "ns-wait" : ns.tone === "stop" ? "ns-stop" : "ns-next";
  }

  function nextStepPill(ns) {
    if (!ns) return `<span style="color:#cbd5e1">—</span>`;
    const lead = ns.tone === "done" ? "✓" : ns.tone === "wait" ? "Waiting on:" : ns.tone === "stop" ? "✕" : "Next:";
    const who = ns.who ? ` <span class="ns-who">— ${nsEsc(ns.who)}</span>` : "";
    return `<span class="ns-pill ${nsToneClass(ns)}">${lead} ${nsEsc(ns.action)}${who}</span>`;
  }

  // Table cell / card content. data-ns-id lets refreshNextStep() repaint it
  // in place after an inline save, without re-rendering the whole table.
  function nextStepCell(id, ns) {
    return `<span data-ns-id="${nsEsc(id)}">${nextStepPill(ns)}</span>`;
  }

  function nextStepBannerHtml(ns) {
    if (!ns) return "";
    const lbl = (ns.tone === "done" || ns.tone === "stop") ? "Status" : ns.tone === "wait" ? "Waiting on" : "Next step";
    const who = ns.who ? ` <span class="ns-who">(${nsEsc(ns.who)})</span>` : "";
    return `<div class="ns-banner ${nsToneClass(ns)}">` +
      `<span><span class="ns-lbl">You are here</span><b>${nsEsc(ns.here)}</b></span>` +
      `<span class="ns-arrow">→</span>` +
      `<span><span class="ns-lbl">${lbl}</span><b>${nsEsc(ns.action)}</b>${who}</span>` +
      `</div>`;
  }

  function renderNextStepBanner(elId, id, ns) {
    const el = document.getElementById(elId);
    if (!el) return;
    el.setAttribute("data-ns-banner", String(id));
    el.innerHTML = nextStepBannerHtml(ns);
  }

  // Repaint every Next Step cell + the open banner for one record.
  function refreshNextStep(id, ns) {
    const key = String(id);
    document.querySelectorAll("[data-ns-id]").forEach((el) => {
      if (el.getAttribute("data-ns-id") === key) el.innerHTML = nextStepPill(ns);
    });
    document.querySelectorAll("[data-ns-banner]").forEach((el) => {
      if (el.getAttribute("data-ns-banner") === key) el.innerHTML = nextStepBannerHtml(ns);
    });
  }

function nextStepFor(r){
  if(!r) return null;
  /* On Hold / Cancelled win over the normal stage (ADDED 2026-10-01) */
  if(holdStateOf(r)==='On Hold'){
    var fu = r.holdFollowUpRaw ? ' — follow up by '+fmtDateShort(r.holdFollowUpRaw) : '';
    return {here:'On Hold ('+r.status+')', action:'Client'+fu, who:'Sales', tone:'wait'};
  }
  if(holdStateOf(r)==='Cancelled') return {here:'Cancelled ('+r.status+')', action:'Cancelled — client confirmed', who:'', tone:'stop'};
  if(r.status==='Converted to PO') return {here:'Converted to PO', action:'PO created'+(r.poNumber?' ('+r.poNumber+')':'')+' — continue in Purchase Order', who:'', tone:'done'};
  if(r.status==='Ready for PO') return {here:'Ready for PO', action:'Group into a PO', who:'Purchasing', tone:'next'};
  var here = 'For Sourcing';
  if(!r.selectedSupplier) return {here:here, action:'Select a supplier', who:'Purchasing', tone:'next'};
  if(!r.priceApproved) return {here:here, action:'Get / approve the final price', who:'Purchasing', tone:'next'};
  if(!r.shipMode || r.shipMode==='—') return {here:here, action:'Set the shipment mode', who:'Purchasing', tone:'next'};
  return {here:here, action:'Complete the sourcing details', who:'Purchasing', tone:'next'};
}

function statusBadge(v){
  const map = {'Ready for PO':'status-readypo','Converted to PO':'status-converted','For Sourcing':'status-forsourcing','For Approval':'status-forapproval','Pending Approval':'status-pending'};
  return `<span class="badge-pill ${map[v]||'status-pending'}">&#9679; ${v}</span>`;
}

/* ════════════════════════════════
   ON HOLD / CANCELLED — PR On Hold plan Phase 1 (ADDED 2026-10-01)
   Proposals/PR_On_Hold_Plan_2026-09-30.md. Hold_Status is a SEPARATE field from
   PR_Status (Active / On Hold / Cancelled), so Resume/Restore returns the PR to
   wherever it was. Per item only. A blank Hold_Status (every PR created before
   the field existed) counts as Active.
════════════════════════════════ */
const HOLD_REASONS = ['Client stopped order','Client payment issue','Client changing specs','Client confirmed cancel','Other'];
/* approvePOMain batches by Sales_Order + PR_READY_FOR_PO. Since Phase 2 (2026-10-01)
   it skips On Hold/Cancelled PRs itself, so a held PR no longer blocks Create PO for
   its siblings in the same SO. Set back to false ONLY if that server guard is ever
   removed: the widget then blocks Create PO for the whole SO instead. */
const HOLD_SERVER_GUARD_LIVE = true;

function holdStateOf(r){
  var s = r && r.holdStatus;
  return (s==='On Hold' || s==='Cancelled') ? s : 'Active';
}
function isPrInactive(r){ return holdStateOf(r)!=='Active'; }
function recomputeReadyPR(){
  READY_PR = ALL_PR.filter(function(r){ return r.status==='Ready for PO' && !isPrInactive(r); });
}
function holdBadge(r){
  var st = holdStateOf(r);
  if(st==='On Hold')   return ' <span class="badge-pill hold-onhold">ON HOLD</span>';
  if(st==='Cancelled') return ' <span class="badge-pill hold-cancelled">CANCELLED</span>';
  return '';
}
function holdParseDate(v){
  if(!v) return null;
  var s = String(v).trim().split(' ')[0];
  var m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if(m) return new Date(+m[1], +m[2]-1, +m[3]);
  m = s.match(/^(\d{2})-([A-Za-z]{3})-(\d{4})$/);
  if(m){
    var mi = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'].indexOf(m[2].toLowerCase());
    if(mi>-1) return new Date(+m[3], mi, +m[1]);
  }
  var d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}
function holdDateCell(v){ return v ? fmtDateShort(String(v).trim().split(' ')[0]) : '—'; }
function holdDaysOf(r){
  var d = holdParseDate(r.holdDateRaw);
  if(!d) return null;
  var t = new Date(); t.setHours(0,0,0,0);
  return Math.max(0, Math.round((t - d) / 86400000));
}
function holdTodayYMD(){
  var d=new Date(); var pad=function(n){ return String(n).padStart(2,'0'); };
  return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());
}
/* Held/cancelled PRs in this SO that the server would still convert (see
   HOLD_SERVER_GUARD_LIVE above). */
function heldSweepBlockers(soNo){
  if(HOLD_SERVER_GUARD_LIVE) return [];
  return ALL_PR.filter(function(p){
    if(p.soNo!==soNo || !isPrInactive(p) || p.converted || p.poNumber) return false;
    var rawReady = p._raw && (p._raw.PR_READY_FOR_PO===true || p._raw.PR_READY_FOR_PO==='true');
    return p.status==='Ready for PO' || rawReady;
  });
}
function heldSweepMessage(blockers){
  return 'Create PO blocked: '+blockers.map(function(p){ return p.prNo; }).join(', ')+' in this SO is On Hold or Cancelled and would still be included in the PO. Resume or Restore it first.';
}
function goToTab(name){
  var b = document.querySelector('.tab-btn[data-tab="'+name+'"]');
  if(b) b.click();
}

function getHoldData(kind){
  var st = kind==='cancelled' ? 'Cancelled' : 'On Hold';
  var d = ALL_PR.filter(function(r){ return holdStateOf(r)===st; });
  var box = $(kind+'Search');
  var q = box ? box.value.trim().toLowerCase() : '';
  if(q) d = d.filter(function(r){
    var hay = `${r.prNo} ${r.soNo} ${r.customer} ${r.product} ${r.sku} ${r.poNumber||''} ${r.holdReason||''}`.toLowerCase();
    return hay.includes(q) || supplierKeyMatch(q, r.selectedSupplier||'');
  });
  return d;
}

function renderHoldPanels(){
  ['onhold','cancelled'].forEach(function(kind){
    var body = $(kind+'Body');
    if(!body) return;
    var isHold = kind==='onhold';
    var st = isHold ? 'On Hold' : 'Cancelled';
    var total = ALL_PR.filter(function(r){ return holdStateOf(r)===st; }).length;
    var data = getHoldData(kind);
    if(!data.length){
      body.innerHTML = emptyStateRow(total===0 ? (isHold ? 'No Purchase Requests are On Hold.' : 'No Purchase Requests are Cancelled.') : 'No PRs match this search.');
      $(kind+'Footer').innerHTML = `<span class="table-footer-info"><strong>0</strong> of <strong>${total}</strong> PRs</span>`;
      return;
    }
    var today = new Date(); today.setHours(0,0,0,0);
    body.innerHTML = data.map(function(r){
      var reason = escapeHtml(r.holdReason||'—');
      var notes = r.holdNotes ? ' title="'+escapeHtml(r.holdNotes)+'"' : '';
      var common = `
        <td><span class="cell-link">${r.prNo}</span></td>
        <td><span class="cell-so">${r.soNo}</span></td>
        <td class="cell-product" title="${escapeHtml(r.product)}">${r.product}</td>
        <td><span class="cell-sku">${r.sku}</span></td>
        <td style="font-variant-numeric:tabular-nums">${r.qty.toLocaleString()}</td>
        <td class="cell-customer" title="${escapeHtml(r.customer)}">${r.customer}</td>
        <td><span class="cell-supplier">${r.selectedSupplier||'—'}</span></td>
        <td>${statusBadge(r.status)}</td>
        <td>${r.poNumber||'—'}</td>
        <td${notes}>${reason}</td>
        <td style="white-space:nowrap">${holdDateCell(r.holdDateRaw)}</td>`;
      var tail;
      if(isHold){
        var days = holdDaysOf(r);
        var fuDate = holdParseDate(r.holdFollowUpRaw);
        var fuDue = fuDate && fuDate <= today;
        tail = `
        <td style="font-variant-numeric:tabular-nums">${days===null?'—':days}</td>
        <td style="white-space:nowrap${fuDue?';color:var(--red);font-weight:600':''}"${fuDue?' title="Follow-up date reached"':''}>${holdDateCell(r.holdFollowUpRaw)}</td>
        <td>${escapeHtml(r.heldBy||'—')}</td>`;
      } else {
        tail = `
        <td>${escapeHtml(r.heldBy||'—')}</td>`;
      }
      return `<tr onclick="openDetailView('${r.id}')">${common}${tail}</tr>`;
    }).join('');
    $(kind+'Footer').innerHTML = `<span class="table-footer-info"><strong>${data.length}</strong> of <strong>${total}</strong> PRs ${isHold?'on hold':'cancelled'}</span>`;
  });
}

/* Detail view: buttons, banner and locks for the open PR. Buttons are never hidden
   (Purchasing-only is a team rule, not a role check); who pressed is recorded in
   Held_By + Timeline History. */
function applyHoldUi(r){
  var st = holdStateOf(r);
  var inactive = st!=='Active';
  var hb = $('dBtnHold'), cb = $('dBtnCancelPR');
  if(hb){
    if(st==='On Hold'){ hb.textContent='Resume'; hb.onclick=resumePR; }
    else { hb.textContent='Put On Hold'; hb.onclick=function(){ openHoldModal('hold'); }; }
    hb.disabled = st==='Cancelled';
    hb.title = st==='Cancelled' ? 'This PR is Cancelled — Restore it first' : '';
  }
  if(cb){
    if(st==='Cancelled'){ cb.textContent='Restore'; cb.onclick=restorePR; }
    else { cb.textContent='Cancel PR'; cb.onclick=function(){ openHoldModal('cancel'); }; }
  }
  var lockTitle = inactive ? ('Locked — this PR is '+st) : '';
  ['dBtnEdit','dBtnSave','dBtnCreatePO'].forEach(function(id){
    var b = $(id);
    if(!b) return;
    b.disabled = inactive;
    b.title = lockTitle;
  });
  var banner = $('holdBanner');
  var nsB = $('nsBanner');
  if(nsB) nsB.style.display = inactive ? 'none' : '';
  if(banner){
    if(!inactive){ banner.style.display='none'; banner.innerHTML=''; }
    else {
      var days = holdDaysOf(r);
      var parts = ['<span class="hold-banner-title">'+(st==='On Hold' ? '&#9208; ON HOLD — waiting on client' : '&#10005; CANCELLED — client confirmed')+'</span>'];
      parts.push('Stage: <b>'+escapeHtml(r.status)+'</b>'+(r.poNumber ? ' ('+escapeHtml(r.poNumber)+')' : ''));
      if(r.holdReason) parts.push('Reason: <b>'+escapeHtml(r.holdReason)+'</b>');
      if(r.holdNotes)  parts.push('Notes: '+escapeHtml(r.holdNotes));
      if(r.holdDateRaw) parts.push((st==='On Hold'?'Held on':'Cancelled on')+': <b>'+holdDateCell(r.holdDateRaw)+'</b>'+(st==='On Hold' && days!==null ? ' ('+days+' day'+(days===1?'':'s')+')' : ''));
      if(st==='On Hold' && r.holdFollowUpRaw) parts.push('Follow up: <b>'+holdDateCell(r.holdFollowUpRaw)+'</b>');
      if(r.heldBy) parts.push('By: '+escapeHtml(r.heldBy));
      banner.innerHTML = '<div class="hold-banner'+(st==='Cancelled'?' cancelled':'')+'">'+parts.map(function(p,i){ return i===0 ? p : '<span>'+p+'</span>'; }).join('')+'</div>';
      banner.style.display='';
    }
  }
  var badges = $('dBadges');
  if(badges && inactive) badges.insertAdjacentHTML('afterbegin', holdBadge(r).trim());
}

let _holdModalMode = 'hold';
function openHoldModal(mode){
  if(!_currentMappedPR){ showToast('No record loaded'); return; }
  if(_editMode){ showToast('Save or cancel your edits first'); return; }
  _holdModalMode = mode==='cancel' ? 'cancel' : 'hold';
  var isCancel = _holdModalMode==='cancel';
  $('hmTitle').textContent = (isCancel ? 'Cancel PR — ' : 'Put On Hold — ')+_currentMappedPR.prNo;
  $('hmSub').textContent = isCancel
    ? 'Use Cancel only when the client has confirmed they no longer want this item. It can be restored later if needed.'
    : 'Use On Hold while you are still waiting for the client\'s answer. The PR keeps its current stage and continues from there on Resume.';
  $('hmReason').innerHTML = '<option value="">— Select —</option>'+HOLD_REASONS.map(function(x){ return '<option value="'+escapeHtml(x)+'">'+escapeHtml(x)+'</option>'; }).join('');
  $('hmReason').value = isCancel ? 'Client confirmed cancel' : '';
  $('hmNotes').value = '';
  $('hmFollow').value = '';
  $('hmFollowWrap').style.display = isCancel ? 'none' : '';
  var ok = $('hmOkBtn');
  ok.textContent = isCancel ? 'Cancel PR' : 'Put On Hold';
  ok.disabled = false;
  $('holdModal').style.display = 'flex';
}
function closeHoldModal(){ $('holdModal').style.display = 'none'; }

function submitHoldModal(){
  var r = _currentMappedPR;
  if(!r){ closeHoldModal(); return; }
  var isCancel = _holdModalMode==='cancel';
  var reason = $('hmReason').value;
  var notes = $('hmNotes').value.trim();
  var follow = isCancel ? '' : $('hmFollow').value;
  if(!reason){ showToast('Please select a reason'); return; }
  if(reason==='Other' && !notes){ showToast('Please add notes for "Other"'); return; }
  var newState = isCancel ? 'Cancelled' : 'On Hold';
  var by = CURRENT_USER_EMAIL || 'unknown';
  var payload = {
    Hold_Status: newState,
    Hold_Reason: reason,
    Hold_Notes: notes,
    Hold_Date: holdTodayYMD(),
    Held_By: by,
    Hold_Follow_Up_Date: follow
  };
  var changes = [{ label:'Hold Status', from:holdStateOf(r), to:newState }, { label:'Reason', to:reason }];
  if(notes)  changes.push({ label:'Notes', to:notes });
  if(follow) changes.push({ label:'Follow Up Date', to:follow });
  changes.push({ label:'By', to:by });
  var ok = $('hmOkBtn');
  ok.disabled = true; ok.textContent = 'Saving…';
  saveHoldFields(r, payload, isCancel ? 'Cancelled PR' : 'Put On Hold', changes, function(success){
    ok.disabled = false; ok.textContent = isCancel ? 'Cancel PR' : 'Put On Hold';
    if(success){
      closeHoldModal();
      showToast(r.prNo+(isCancel ? ' cancelled' : ' put On Hold'));
    }
  });
}

function resumePR(){
  var r = _currentMappedPR;
  if(!r) return;
  showConfirm('Resume '+r.prNo+'? It will continue from "'+r.status+'".', function(){
    var by = CURRENT_USER_EMAIL || 'unknown';
    saveHoldFields(r, { Hold_Status:'Active', Hold_Follow_Up_Date:'' }, 'Resumed from On Hold',
      [{ label:'Hold Status', from:'On Hold', to:'Active' }, { label:'By', to:by }],
      function(success){ if(success) showToast(r.prNo+' resumed'); });
  });
}
function restorePR(){
  var r = _currentMappedPR;
  if(!r) return;
  var note = r.converted ? ' If its PO was already cancelled in Books, it will need a new PO.' : '';
  showConfirm('Restore '+r.prNo+'? It will be Active again and continue from "'+r.status+'".'+note, function(){
    var by = CURRENT_USER_EMAIL || 'unknown';
    saveHoldFields(r, { Hold_Status:'Active', Hold_Follow_Up_Date:'' }, 'Restored from Cancelled',
      [{ label:'Hold Status', from:'Cancelled', to:'Active' }, { label:'By', to:by }],
      function(success){ if(success) showToast(r.prNo+' restored'); });
  });
}

/* One write path for Hold / Resume / Cancel / Restore. A blank date ('' to clear a
   stale follow-up) is retried without the blank keys if Creator rejects it, so the
   status change itself never fails over a cosmetic clear. */
function saveHoldFields(r, payload, timelineTitle, changes, done){
  if(typeof ZOHO==='undefined'||!ZOHO.CREATOR||!ZOHO.CREATOR.DATA||typeof ZOHO.CREATOR.DATA.updateRecordById!=='function'){
    showToast('Not connected to Zoho Creator — open this widget inside Zoho Creator to save.');
    if(done) done(false);
    return;
  }
  var id = String(r.id);
  var hasBlank = payload.Hold_Follow_Up_Date==='';
  function fail(resp){
    console.error('[PR Hold] update failed:', JSON.stringify(resp));
    var msg = (resp && (resp.message || resp.error)) ? (typeof (resp.message||resp.error)==='string' ? (resp.message||resp.error) : JSON.stringify(resp.message||resp.error)) : 'see console';
    showToast('Could not save — '+msg+'. Check that the Hold fields exist on Purchase Request.');
    if(done) done(false);
  }
  function attempt(data, isRetry){
    ZOHO.CREATOR.DATA.updateRecordById({ report_name: REPORT_NAME, id: id, payload: { data: data } })
      .then(function(resp){
        if(resp && (resp.code===3000 || String(resp.code)==='3000')){ onSaved(data); return; }
        if(!isRetry && hasBlank){ attempt(stripBlank(data), true); return; }
        fail(resp);
      })
      .catch(function(err){
        if(!isRetry && hasBlank){ attempt(stripBlank(data), true); return; }
        fail(err);
      });
  }
  function stripBlank(data){
    var out = {};
    Object.keys(data).forEach(function(k){ if(!(k==='Hold_Follow_Up_Date' && data[k]==='')) out[k]=data[k]; });
    return out;
  }
  function onSaved(){
    prTimeline.log(r.prNo, timelineTitle, 'Updated', changes);
    /* Patch the in-memory copies (full payload, blanks included) and re-map, so every
       tab, the queue counts and PO Grouping reflect the change without a full reload. */
    var idx = ALL_PR.findIndex(function(p){ return String(p.id)===id; });
    var listRaw = idx>-1 ? ALL_PR[idx]._raw : null;
    if(listRaw) Object.assign(listRaw, payload);
    if(PR_FULL_CACHE[id] && PR_FULL_CACHE[id]!==listRaw) Object.assign(PR_FULL_CACHE[id], payload);
    if(idx>-1 && listRaw){
      var remapped = mapPR(listRaw);
      remapped.recSupplier = ALL_PR[idx].recSupplier;
      ALL_PR[idx] = remapped;
    }
    recomputeReadyPR();
    renderQueue(); renderAllPRs(); renderConverted(); renderPrGroups(); updateStats();
    if(_currentMappedPR && String(_currentMappedPR.id)===id && $('view-detail').style.display!=='none'){
      _editMode = false;
      openDetailView(id);
    }
    if(done) done(true);
  }
  attempt(payload, false);
}

function actionBtns(r){
  if(isPrInactive(r)) return `<span style="font-size:12px;color:var(--gray-400)">${holdStateOf(r)}</span>`;
  return `<div class="action-btns">
    <button class="btn-action group-po" onclick="event.stopPropagation();openGroupWorkspace('${r.id}')">Group&#8594;PO</button>
  </div>`;
}

function targetCell(r){
  return r.targetDate + (r.targetOverdue ? ' <span style="color:var(--amber);font-size:13px" title="Overdue">&#9888;</span>' : '');
}

function inqCell(v){
  if(!v) return `<span style="color:var(--gray-300)">—</span>`;
  return `<span class="cell-link" title="View Inquiry">${v}</span>`;
}

function prDateCell(v){
  return `<span style="font-size:12.5px;color:var(--gray-500);white-space:nowrap">${v}</span>`;
}

/* ════════════════════════════════
   RENDER — READY QUEUE
════════════════════════════════ */
function getQueueData(){
  let d = READY_PR;
  if(queueFilter==='urgent')   d = d.filter(r=>r.urgent);
  else if(queueFilter==='atRisk')   d = d.filter(r=>r.atRisk);
  else if(queueFilter==='override') d = d.filter(r=>r.override);
  const q = $('queueSearch').value.trim().toLowerCase();
  if(q) d = d.filter(r=>`${r.prNo} ${r.soNo} ${r.customer} ${r.product} ${r.sku} ${r.inqRef||''}`.toLowerCase().includes(q));
  return d;
}

function renderQueue(){
  const data = getQueueData();
  if(data.length === 0){
    $('queueBody').innerHTML = emptyStateRow(READY_PR.length===0 ? 'No Purchase Requests are ready for PO yet.' : 'No PRs match this filter/search.');
    $('queueFooter').innerHTML = `<span class="table-footer-info"><strong>0</strong> of <strong>${READY_PR.length}</strong> PRs ready for PO</span>`;
    return;
  }
  data.forEach(function(r){ r.recSupplier = computeRecommendedSupplier(r.category, r.supplierQuotes); autoHealFollowedRecommendation(r); });
  $('queueBody').innerHTML = data.map(r=>`
    <tr onclick="openDetailView('${r.id}')">
      <td><span class="cell-link">${r.prNo}</span></td>
      <td>${nextStepCell(r.id, nextStepFor(r))}</td>
      <td>${inqCell(r.inqRef)}</td>
      <td><span class="cell-so">${r.soNo}</span></td>
      <td>${rowThumbHtml(r,'q')}</td>
      <td class="cell-product" title="${escapeHtml(r.product)}">${r.product}</td>
      <td><span class="cell-sku">${r.sku}</span></td>
      <td style="font-variant-numeric:tabular-nums">${r.qty.toLocaleString()}</td>
      <td class="cell-customer" title="${escapeHtml(r.customer)}">${r.customer}</td>
      <td><span class="cell-supplier">${r.recSupplier}</span></td>
      <td><span class="cell-supplier${r.override?' override-sup':''}">${r.selectedSupplier||'—'}</span></td>
      <td>${recBadge(r.followedRec)}</td>
      <td class="cell-price"${r.priceSource==='srp'?' title="SO reference price — no supplier quote yet"':r.priceSource==='catalog'?' title="Catalog rate — auto-approved, no supplier quote yet"':r.priceSource==='srp_approved'?' title="Manually approved SRP — final, same value sent to Books"':''}>${fmtPrice(r.finalPrice, r.priceSource)}${r.priceSource==='srp'?' <span style="font-size:10px;color:var(--gray-400);font-weight:500">(SRP)</span>':r.priceSource==='catalog'?' <span style="font-size:10px;color:var(--gray-400);font-weight:500">(Catalog)</span>':r.priceSource==='srp_approved'?' <span style="font-size:10px;color:var(--gray-400);font-weight:500">(SRP Approved)</span>':''}</td>
      <td>${shipBadge(r.shipMode)}</td>
      <td style="white-space:nowrap">${targetCell(r)}</td>
      <td>${priorityHtml(r.priority)}</td>
      <td>${delayBadge(r.delay)}</td>
      <td>${statusBadge(r.status)}</td>
      <td>${prDateCell(r.prDate)}</td>
      <td>${actionBtns(r)}</td>
    </tr>`).join('');
  loadRowThumbs(data,'q');

  const total = data.reduce((s,r)=>s+r.finalPrice,0);
  /* FIXED 2026-07-15, per user (currency symbol audit): defaults to ¥/CNY, matching
     fmtPrice()'s own default — a caveat worth flagging, not solving today: this SUMS
     `finalPrice` across rows that can individually be CNY (real quote) or PHP (SRP/
     catalog reference), so a mixed-source total is technically adding two different
     currencies together. Pre-existing behavior (was already summing mixed values under
     the wrong universal ₱ symbol before this fix) — not made worse, just now labeled
     with the more-common-case symbol instead of the definitely-wrong one. */
  $('queueFooter').innerHTML = `
    <span class="table-footer-info"><strong>${data.length}</strong> of <strong>${READY_PR.length}</strong> PRs ready for PO</span>
    <span class="table-footer-info">Total PO value: <strong>¥${total.toLocaleString('en-PH')}</strong></span>`;
}

/* ════════════════════════════════
   RENDER — ALL PRs
════════════════════════════════ */
function getAllData(){
  let d = ALL_PR;
  /* FIXED 2026-09-01: "In Progress" must also exclude already-converted PRs — a
     converted PR is done, not still in progress toward PO. */
  if(allFilter==='other') d = d.filter(r=>r.status!=='Ready for PO' && r.status!=='Converted to PO' && !isPrInactive(r));
  const q = $('allSearch').value.trim().toLowerCase();
  if(q) d = d.filter(r=>{
    const hay = `${r.prNo} ${r.soNo} ${r.customer} ${r.product} ${r.sku} ${r.inqRef||''}`.toLowerCase();
    /* supplierKeyMatch (prefix-tolerant), not plain includes() — viewSupplierPRs() passes
       the FULL Suppliers.Supplier_Name ("Tony Fan") but r.selectedSupplier stores the
       SHORT name ("Tony"); a plain substring check never matched, 0 results every time. */
    return hay.includes(q) || supplierKeyMatch(q, r.selectedSupplier||'');
  });
  return d;
}

/* ADDED 2026-07-15, per user ("why the view has no function?") — Supplier Load View's
   "View" button was a `showToast` stub (no supplier detail page exists in this widget
   to send it to). Real, useful behavior instead: jump to the All PRs tab pre-filtered
   to that supplier's own PRs, reusing the existing search box (now also matches
   selectedSupplier, see the line just above) rather than building a separate filter
   mechanism. */
function viewSupplierPRs(name){
  activeTab = 'all';
  document.querySelectorAll('.tab-btn').forEach(function(b){ b.classList.toggle('active', b.dataset.tab==='all'); });
  ['queue','all','load'].forEach(function(p){ $('panel-'+p).style.display = p==='all' ? '' : 'none'; });
  $('allSearch').value = name;
  allFilter = 'all';
  $('allPills').querySelectorAll('.pill').forEach(function(b){ b.classList.toggle('active', b.dataset.filter==='all'); });
  renderAllPRs();
  window.scrollTo(0,0);
}

function renderAllPRs(){
  const data = getAllData();
  if(data.length === 0){
    $('allBody').innerHTML = emptyStateRow(ALL_PR.length===0 ? 'No Purchase Requests yet.' : 'No PRs match this filter/search.');
    $('allCount').textContent = '(' + ALL_PR.length + ')';
    $('allFooter').innerHTML = `<span class="table-footer-info"><strong>0</strong> PRs total</span>`;
    return;
  }
  data.forEach(function(r){ r.recSupplier = computeRecommendedSupplier(r.category, r.supplierQuotes); autoHealFollowedRecommendation(r); });
  $('allBody').innerHTML = data.map(r=>`
    <tr onclick="openDetailView('${r.id}')">
      <td><span class="cell-link">${r.prNo}</span></td>
      <td>${nextStepCell(r.id, nextStepFor(r))}</td>
      <td>${inqCell(r.inqRef)}</td>
      <td><span class="cell-so">${r.soNo}</span></td>
      <td>${rowThumbHtml(r,'a')}</td>
      <td class="cell-product" title="${escapeHtml(r.product)}">${r.product}</td>
      <td><span class="cell-sku">${r.sku}</span></td>
      <td style="font-variant-numeric:tabular-nums">${r.qty.toLocaleString()}</td>
      <td class="cell-customer" title="${escapeHtml(r.customer)}">${r.customer}</td>
      <td><span class="cell-supplier">${r.recSupplier}</span></td>
      <td><span class="cell-supplier${r.override?' override-sup':''}">${r.selectedSupplier||'—'}</span></td>
      <td class="cell-price"${r.priceSource==='srp'?' title="SO reference price — no supplier quote yet"':r.priceSource==='catalog'?' title="Catalog rate — auto-approved, no supplier quote yet"':r.priceSource==='srp_approved'?' title="Manually approved SRP — final, same value sent to Books"':''}>${fmtPrice(r.finalPrice, r.priceSource)}${r.priceSource==='srp'?' <span style="font-size:10px;color:var(--gray-400);font-weight:500">(SRP)</span>':r.priceSource==='catalog'?' <span style="font-size:10px;color:var(--gray-400);font-weight:500">(Catalog)</span>':r.priceSource==='srp_approved'?' <span style="font-size:10px;color:var(--gray-400);font-weight:500">(SRP Approved)</span>':''}</td>
      <td style="white-space:nowrap">${targetCell(r)}</td>
      <td>${priorityHtml(r.priority)}</td>
      <td>${statusBadge(r.status)}${holdBadge(r)}</td>
      <td>${prDateCell(r.prDate)}</td>
      <td>${forecastCell(r._raw || {})}</td>
      <td>${actionBtns(r)}</td>
    </tr>`).join('');
  loadRowThumbs(data,'a');

  /* The All pill always shows the full total, not whatever pill is active (FIXED 2026-10-01:
     it used to show the In Progress count once that pill was selected). */
  $('allCount').textContent = '(' + ALL_PR.length + ')';
  $('allFooter').innerHTML = `<span class="table-footer-info"><strong>${data.length}</strong> PRs total</span>`;
}

/* ════════════════════════════════
   RENDER — CONVERTED TO PO
   Added 2026-09-01, per user request: a dedicated tab listing PRs that already
   have a Purchase Order created (native PR_Status == "Converted to PO"), so
   they're easy to find instead of quietly sitting under "Ready for PO" forever
   (see the `converted` override in mapPR's status derivation, fixed same day).
════════════════════════════════ */
function getConvertedData(){
  let d = ALL_PR.filter(function(r){ return r.converted; });
  const q = $('convertedSearch').value.trim().toLowerCase();
  if(q) d = d.filter(function(r){
    const hay = `${r.prNo} ${r.poNumber||''} ${r.soNo} ${r.customer} ${r.product} ${r.sku}`.toLowerCase();
    return hay.includes(q) || supplierKeyMatch(q, r.selectedSupplier||'');
  });
  return d;
}

function renderConverted(){
  const data = getConvertedData();
  if(data.length === 0){
    const allConverted = ALL_PR.filter(function(r){ return r.converted; });
    $('convertedBody').innerHTML = emptyStateRow(allConverted.length===0 ? 'No Purchase Requests have been converted to a PO yet.' : 'No PRs match this search.');
    $('convertedFooter').innerHTML = `<span class="table-footer-info"><strong>0</strong> PRs converted</span>`;
    return;
  }
  $('convertedBody').innerHTML = data.map(r=>`
    <tr onclick="openDetailView('${r.id}')">
      <td style="white-space:nowrap"><span class="cell-link">${r.prNo}</span>${holdBadge(r)}</td>
      <td>${nextStepCell(r.id, nextStepFor(r))}</td>
      <td><span class="cell-link">${r.poNumber||'—'}</span></td>
      <td><span class="cell-so">${r.soNo}</span></td>
      <td>${rowThumbHtml(r,'c')}</td>
      <td class="cell-product" title="${escapeHtml(r.product)}">${r.product}</td>
      <td><span class="cell-sku">${r.sku}</span></td>
      <td style="font-variant-numeric:tabular-nums">${r.qty.toLocaleString()}</td>
      <td class="cell-customer" title="${escapeHtml(r.customer)}">${r.customer}</td>
      <td><span class="cell-supplier">${r.selectedSupplier||'—'}</span></td>
      <td class="cell-price">${fmtPrice(r.finalPrice, r.priceSource)}</td>
      <td style="white-space:nowrap">${targetCell(r)}</td>
      <td>${prDateCell(r.prDate)}</td>
    </tr>`).join('');
  loadRowThumbs(data,'c');

  $('convertedFooter').innerHTML = `<span class="table-footer-info"><strong>${data.length}</strong> PRs converted</span>`;
}

/* ════════════════════════════════
   RENDER — PR GROUPS (added 2026-09-11, per user: "gumawa ka ng PR Group para
   ng Qoute group. pero di siya babased sa PO grouping hah") — plain read-only
   browsing view over the SAME ALL_PR data every other tab here already has
   loaded, grouped client-side by SO#+Customer (the only natural multi-PR key on
   this form — no separate PO_Grouping report fetch, no shared state with
   GROUP_ALL/GROUP_BUCKETS/openGroupWorkspace(), no "Create PO" action anywhere
   in this panel). A PR whose SO/Customer happens to be blank still gets its own
   ("—"/"—") group rather than being dropped.
════════════════════════════════ */
function buildPrGroups(){
  var q = ($('prgSearch') ? $('prgSearch').value : '').toLowerCase().trim();
  var map = {};
  ALL_PR.forEach(function(r){
    var key = r.soNo+'||'+r.customer;
    if(!map[key]) map[key] = { soNo:r.soNo, customer:r.customer, rows:[] };
    map[key].rows.push(r);
  });
  var groups = Object.keys(map).map(function(k){ return map[k]; });
  if(q){
    groups = groups.map(function(g){
      var rows = g.rows.filter(function(r){
        var hay = [g.soNo, g.customer, r.prNo, r.sku, r.product].join(' ').toLowerCase();
        return hay.indexOf(q)!==-1;
      });
      return rows.length ? { soNo:g.soNo, customer:g.customer, rows:rows } : null;
    }).filter(Boolean);
  }
  groups.forEach(function(g){
    g.rows.sort(function(a,b){
      var na = parseInt(String(a.prNo).replace(/[^0-9]/g,''), 10) || 0;
      var nb = parseInt(String(b.prNo).replace(/[^0-9]/g,''), 10) || 0;
      return nb - na;
    });
  });
  groups.sort(function(a,b){
    var maxPrA = (a.rows[0] && (parseInt(String(a.rows[0].prNo).replace(/[^0-9]/g,''), 10) || 0)) || 0;
    var maxPrB = (b.rows[0] && (parseInt(String(b.rows[0].prNo).replace(/[^0-9]/g,''), 10) || 0)) || 0;
    if(maxPrB !== maxPrA) return maxPrB - maxPrA;
    return b.soNo.localeCompare(a.soNo, undefined, {numeric:true}) || b.customer.localeCompare(a.customer);
  });
  return groups;
}

/* ADDED 2026-09-11, per user ("palitan mo yung row na nakalagay. dapat Image,
   Product name, SKU, Qty, Supplier selected, Unit Price and SRP. edit and save
   sa SRP") — inline, per-row SRP edit/save, same underlying field
   (SRP_Approved_PR) and same locked-until-Edit-clicked pattern as Inquiry's own
   Quote Groups "SRP jan sa labas" chips (srpApprovedInfo() itself is the exact
   helper the Detail view sidebar's own SRP editor already uses — reused as-is,
   not reimplemented), just keyed by PR record ID instead of an array index
   since these cards fully re-render on every buildPrGroups() call. */
var prgSrpEditing = {};
function prgSrpCell(r){
  var info = srpApprovedInfo(r);
  /* FIXED 2026-09-11, per user ("dapat di pa siya naka edit") — this cell must
     always start LOCKED (plain value), even for a never-saved/auto-computed
     SRP — the original `!info.isAuto` gate meant every PR that had never had
     SRP manually approved yet (i.e. almost all of them) opened straight into
     edit mode with no click needed, which is what the screenshot showed.
     Only prgEditSrp() (an explicit Edit click) should ever unlock a row now.
     CHANGED 2026-09-11 again, per user ("lagyan mo ng action. tapos edit, save
     and cancel") — Edit/Save/Cancel moved OUT of this cell into their own
     dedicated Action column (see prgActionCell()), matching the same
     column shape the supplier-side PR Groups/Group Inquiry tabs already use —
     this cell now shows ONLY the value or the input, nothing else. */
  var locked = !prgSrpEditing[r.id];
  if(locked){
    return '<span class="prg-srp-wrap">'+info.symbol+(info.value||0).toLocaleString('en-PH')+'</span>';
  }
  return '<span class="prg-srp-wrap" onclick="event.stopPropagation()">'
    +info.symbol+'<input type="number" class="prg-srp-input" id="prgsrp-'+r.id+'" value="'+(info.value||0)+'" min="0" step="0.01" onclick="event.stopPropagation()" onkeydown="if(event.key===\'Enter\'){event.preventDefault();prgSaveSrp(\''+r.id+'\')}">'
    +'</span>';
}
/* ADDED 2026-09-11, per user ("lagyan mo ng action. tapos edit, save and
   cancel") — dedicated Action column for the SRP inline editor, same
   Edit/Save/Cancel shape as the supplier-side PR Groups/Group Inquiry rows
   (grpEditRow/grpSaveRow/grpCancelEdit). Previously this tab had no Cancel at
   all — once you clicked Edit the only way out was Save, even to back out of
   an accidental click. */
function prgActionCell(r){
  if(isPrInactive(r)) return '<span style="font-size:12px;color:var(--gray-400)" title="Locked — this PR is '+holdStateOf(r)+'">Locked</span>';
  var editing = !!prgSrpEditing[r.id];
  if(editing){
    return '<button type="button" class="prg-srp-btn" data-prgsrp-save="'+r.id+'" onclick="event.stopPropagation();prgSaveSrp(\''+r.id+'\')">Save</button> '
      +'<button type="button" class="prg-srp-btn" style="background:var(--gray-100);color:var(--gray-600)" onclick="event.stopPropagation();prgCancelSrp(\''+r.id+'\')">Cancel</button>';
  }
  return '<button type="button" class="prg-srp-btn" onclick="event.stopPropagation();prgEditSrp(\''+r.id+'\')">Edit</button>';
}
function prgEditSrp(id){
  prgSrpEditing[id] = true;
  renderPrGroups();
}
function prgCancelSrp(id){
  delete prgSrpEditing[id];
  renderPrGroups();
}
async function prgSaveSrp(id){
  var r = ALL_PR.find(function(x){ return String(x.id)===String(id); });
  if(!r){ showToast('Record not found.'); return; }
  var input = $('prgsrp-'+id);
  if(!input) return;
  var amt = parseFloat(input.value)||0;
  if(typeof ZOHO==='undefined'||!ZOHO.CREATOR||!ZOHO.CREATOR.DATA||typeof ZOHO.CREATOR.DATA.updateRecordById!=='function'){
    showToast('Not connected to Zoho Creator — open this widget inside Zoho Creator to save.'); return;
  }
  showConfirm('Save SRP amount of ₱'+amt.toLocaleString('en-PH')+' for '+r.prNo+'?', async function(){
    var btn = document.querySelector('[data-prgsrp-save="'+id+'"]');
    if(btn){ btn.disabled = true; btn.textContent = '…'; }
    try{
      var resp = await ZOHO.CREATOR.DATA.updateRecordById({
        app_name: REAL_APP_NAME,
        report_name: REPORT_NAME,
        id: String(id),
        payload: { data: { SRP_Approved_PR: amt } }
      });
      if(resp && resp.code===3000){
        r.srpApprovedPR = amt;
        r.priceSource = 'srp_approved';
        r.finalPrice = amt;
        delete prgSrpEditing[id];
        showToast('SRP saved.');
        renderPrGroups();
      } else {
        showToast('Save failed — '+(resp && resp.message ? resp.message : 'see console'));
        console.error('[PR Groups] SRP save non-3000:', resp);
        if(btn){ btn.disabled = false; btn.textContent = 'Save'; }
      }
    } catch(err){
      showToast('Save failed — see console');
      console.error('[PR Groups] SRP save error', err);
      if(btn){ btn.disabled = false; btn.textContent = 'Save'; }
    }
  });
}

function renderPrGroups(){
  var groups = buildPrGroups();
  var totalPRs = groups.reduce(function(s,g){ return s+g.rows.length; }, 0);
  $('prgSummary').textContent = groups.length+' group'+(groups.length===1?'':'s')+' · '+totalPRs+' PR'+(totalPRs===1?'':'s')+' total';
  $('prGroupsBadge').textContent = groups.length;

  var wrap = $('prgCardsWrap');
  if(!groups.length){
    wrap.innerHTML = '<div class="prg-empty">No purchase requests found.</div>';
    return;
  }
  wrap.innerHTML = groups.map(function(g){
    var rowsHtml = g.rows.map(function(r){
      var editingRow = !!prgSrpEditing[r.id];
      return '<tr'+(editingRow?'':' onclick="openDetailView(\''+r.id+'\')"')+'>'
        +'<td>'+rowThumbHtml(r,'prg')+'</td>'
        +'<td title="'+escapeHtml(r.product)+'"><span class="cell-link">'+r.prNo+'</span>'+holdBadge(r)+' &middot; '+r.product+'</td>'
        +'<td><span class="cell-sku">'+r.sku+'</span></td>'
        +'<td style="text-align:right">'+r.qty.toLocaleString()+'</td>'
        +'<td>'+(r.selectedSupplier||'—')+'</td>'
        +'<td>'+fmtPrice(r.finalPrice, r.priceSource)+'</td>'
        +'<td>'+prgSrpCell(r)+'</td>'
        +'<td onclick="event.stopPropagation()">'+prgActionCell(r)+'</td>'
      +'</tr>';
    }).join('');
    return '<div class="prg-card">'
      +'<div class="prg-card-hdr">'
        +'<div><div class="prg-card-so">'+g.soNo+'<span class="prg-card-cust"> &middot; '+escapeHtml(g.customer)+'</span></div>'
        +'<div class="prg-card-meta">'+g.rows.length+' PR'+(g.rows.length>1?'s':'')+'</div></div>'
      +'</div>'
      +'<div class="table-wrap"><table class="prg-table">'
        +'<colgroup><col style="width:8%"><col style="width:20%"><col style="width:12%"><col style="width:6%"><col style="width:13%"><col style="width:13%"><col style="width:13%"><col style="width:15%"></colgroup>'
        +'<thead><tr><th>Image</th><th>Product Name</th><th>SKU</th><th style="text-align:right">Qty</th><th>Supplier Selected</th><th>Unit Price</th><th>SRP</th><th>Action</th></tr></thead>'
        +'<tbody>'+rowsHtml+'</tbody>'
      +'</table></div>'
    +'</div>';
  }).join('');
  loadRowThumbs(groups.reduce(function(all,g){ return all.concat(g.rows); }, []), 'prg');
}

/* ════════════════════════════════
   RENDER — SUPPLIER LOAD
════════════════════════════════ */
/* ADDED 2026-07-15, per user ("still mock datas") — replaces the old hardcoded
   5-fake-supplier SUPPLIER_LOAD array. Real suppliers from NPR_SUPPLIERS (All_Suppliers
   — Fenteng/Tony). REWORKED same day, per user ("should see active PO not PR") — Active
   POs/Total Qty/Ship Modes/Capacity Load all now derive from the same real, live
   Purchase_Order/PO_Line_Items data (not ALL_PR/pending PRs, which was the first cut) —
   see computeSupplierPortfolioLoad below. Portfolio-wide (not filtered to one PR's
   category), since "how loaded is this supplier overall" is a different question than
   "is this supplier eligible for THIS PR's category." */
/* CHANGED 2026-07-15, per user ("should see active PO not PR") — this whole table is
   about supplier CAPACITY/workload, which is real committed Purchase_Order data, not
   still-pending Purchase_Request1 records. Reworked to derive Active POs/Total Qty/Ship
   Modes all from the same live PO_Line_Items rows that Capacity Load already uses
   (previously Active POs came from live PO data but Total Qty/Ship Modes still came from
   ALL_PR/pending PRs — inconsistent basis within one row). Also fixes the same short-vs-
   full supplier-name mismatch bug via supplierKeyMatch (see computeRecommendedSupplier's
   rewrite for the full story) — every PO_Line_Items.Supplier value is the short form
   ("Tony"), NPR_SUPPLIERS' own name is the full form ("Tony Fan"). */
function computeSupplierPortfolioLoad(poRows){
  if(!NPR_SUPPLIERS.length) return [];
  var dpvLocal = dpvSupplierLive;
  var linesBySupplier = {};
  (poRows||[]).forEach(function(po){
    var st = dpvLocal(po.PO_Status)||String(po.PO_Status||'');
    if(st==='Completed'||st==='Cancelled') return;
    var lines = Array.isArray(po.PO_Line_Items) ? po.PO_Line_Items : [];
    lines.forEach(function(ln){
      var nm = dpvLocal(ln.Supplier)||String(ln.Supplier||'');
      if(!nm) return;
      if(!linesBySupplier[nm]) linesBySupplier[nm]=[];
      linesBySupplier[nm].push(ln);
    });
  });

  return NPR_SUPPLIERS.map(function(s){
    var nm = supplierNameLive(s);
    if(!nm) return null;
    var handlesAll = s.Handles_All===true||s.Handles_All==='true';
    var catsRaw = dpvLocal(s.Supported_Categories)||String(s.Supported_Categories||'');
    var catsDisplay = handlesAll ? 'All categories' : catsRaw.replace(/\r/g,'').split(/\n|,/).map(function(c){return c.trim();}).filter(Boolean).join(', ') || '—';

    var matchedLines = [];
    for(var key in linesBySupplier){
      if(Object.prototype.hasOwnProperty.call(linesBySupplier,key) && supplierKeyMatch(nm,key)) matchedLines = matchedLines.concat(linesBySupplier[key]);
    }

    var activePOs = matchedLines.length;
    var totalQty = matchedLines.reduce(function(sum,ln){ return sum+(parseFloat(dpvLocal(ln.QTY)||ln.QTY||0)||0); },0);
    var units = matchedLines.map(function(ln){ return dpvLocal(ln.Unit)||String(ln.Unit||'pcs'); }).filter(function(v,i,arr){ return arr.indexOf(v)===i; });
    var qtyDisplay = matchedLines.length ? (totalQty.toLocaleString()+' '+(units.length===1?(units[0]||'pcs'):'(mixed units)')) : '—';
    var shipModes = matchedLines.map(function(ln){ return dpvLocal(ln.Shipping_Mode)||String(ln.Shipping_Mode||''); }).filter(Boolean)
      .filter(function(v,i,arr){ return arr.indexOf(v)===i; }).join(', ') || '—';

    var maxCap = parseFloat(dpvLocal(s.Max_Capacity)||s.Max_Capacity||0)||0;
    var loadPct = maxCap>0 ? Math.round((activePOs*100)/maxCap) : 0;

    return { name:nm, category:catsDisplay, activePOs:activePOs, totalQty:qtyDisplay, shipModes:shipModes, loadPct:loadPct };
  }).filter(Boolean);
}

var _liveLoadViewData = [];
function renderLoad(){
  const colorClass = pct => pct>=80?'red':pct>=50?'amber':'green';
  if(!_liveLoadViewData.length){
    $('loadTable').innerHTML = `<thead><tr><th>Supplier</th><th>Active POs</th><th>Total Qty</th><th>Ship Modes</th><th style="min-width:210px">Capacity Load</th><th>Status</th><th>Actions</th></tr></thead>
      <tbody><tr><td colspan="7" style="text-align:center;color:var(--gray-500);padding:24px">Loading supplier data…</td></tr></tbody>`;
  }
  refreshSupplierLoadView();
}
function refreshSupplierLoadView(){
  if(!NPR_SUPPLIERS.length){ loadNewPRDropdowns(); }
  fetchLivePOData(function(poRows){
    _liveLoadViewData = computeSupplierPortfolioLoad(poRows);
    renderLoadTable(_liveLoadViewData);
  });
}
function renderLoadTable(list){
  const colorClass = pct => pct>=80?'red':pct>=50?'amber':'green';
  if(!list.length){
    $('loadTable').innerHTML = `<thead><tr><th>Supplier</th><th>Active POs</th><th>Total Qty</th><th>Ship Modes</th><th style="min-width:210px">Capacity Load</th><th>Status</th><th>Actions</th></tr></thead>
      <tbody><tr><td colspan="7" style="text-align:center;color:var(--gray-500);padding:24px">No suppliers found.</td></tr></tbody>`;
    return;
  }
  const rows = list.map(s=>{
    const cc = colorClass(s.loadPct);
    const nearCap = s.loadPct>=80;
    const nearCapBadge = nearCap
      ? `<span class="badge-pill" style="background:var(--amber-light);color:var(--amber);border-color:var(--amber-mid)">&#9888; Near Capacity</span>`
      : `<span class="badge-pill" style="background:var(--green-light);color:var(--green);border-color:var(--green-mid)">&#10003; Available</span>`;
    return `<tr>
      <td>
        <div class="supplier-name-cell">${s.name}</div>
        <div class="supplier-cat-cell">${s.category}</div>
      </td>
      <td style="font-weight:600;color:var(--blue);font-size:15px">${s.activePOs}</td>
      <td>${s.totalQty}</td>
      <td style="color:var(--gray-600)">${s.shipModes}</td>
      <td>
        <span class="load-bar-wrap"><span class="load-bar ${cc}" style="width:${s.loadPct}%;display:block"></span></span>
        <span class="load-pct ${cc}">${s.loadPct}%</span>
      </td>
      <td>${nearCapBadge}</td>
      <td>
        <button class="btn-action" onclick="viewSupplierPRs('${escapeHtml(s.name).replace(/'/g,"\\'")}')">View</button>
      </td>
    </tr>`;
  }).join('');

  $('loadTable').innerHTML = `
    <thead><tr>
      <th>Supplier</th>
      <th>Active POs</th>
      <th>Total Qty</th>
      <th>Ship Modes</th>
      <th style="min-width:210px">Capacity Load</th>
      <th>Status</th>
      <th>Actions</th>
    </tr></thead>
    <tbody>${rows}</tbody>`;
}

/* ════════════════════════════════
   DETAIL DATA
════════════════════════════════ */
const PR_DETAIL = {
  1:{productName:'Industrial Pump Valve 2"',locked:false,createdDate:'Apr 12, 2024',updatedDate:'Apr 16, 2024',converted:false,poNumber:null,lockDate:null,supplierConfirmed:true,inqNegotiatedPrice:1250,remainingDays:3,leadDays:14,priorityScore:82,priorityBreakdown:[{label:'Delivery Urgency',score:30,max:30,color:'red',note:'<3d left'},{label:'Blocking / Issues',score:25,max:25,color:'amber',note:'Issue exists · Medium'},{label:'Deal Value',score:15,max:20,color:'amber',note:'₱280k'},{label:'Aging',score:10,max:15,color:'green',note:'3-4d since action'},{label:'Client Type',score:2,max:10,color:'gray',note:'Regular client'}],priorityAlert:'Delayed flag — priority force-upgraded to HIGH regardless of score.',readiness:[{label:'Approved',ok:true,detail:'Ana Martinez'},{label:'Supplier selected',ok:true,detail:'GlobalParts'},{label:'Final price confirmed',ok:true,detail:'₱1,250'},{label:'Shipping mode selected',ok:true,detail:'Sea Freight'},{label:'Target date exists',ok:true,detail:'Apr 20'}],recSuppliers:[{name:'GlobalParts Co.',categories:'All categories',match:true,activePOs:72,loadPct:72,status:'Normal',eligible:'rec'},{name:'TechSupply PH',categories:'Selected categories',match:true,activePOs:88,loadPct:55,status:'Near Capacity',eligible:'avail'},{name:'Manila Steel',categories:'Selected Categories',match:false,activePOs:96,loadPct:96,status:'Overloaded',eligible:'removed-1'}]},
  2:{productName:'Safety Helmet E Series',locked:false,createdDate:'Apr 8, 2024',updatedDate:'Apr 14, 2024',converted:false,poNumber:null,lockDate:null,supplierConfirmed:true,inqNegotiatedPrice:385,remainingDays:9,leadDays:7,priorityScore:78,priorityBreakdown:[{label:'Delivery Urgency',score:28,max:30,color:'red',note:'9d left'},{label:'Blocking / Issues',score:20,max:25,color:'amber',note:'Minor issue'},{label:'Deal Value',score:14,max:20,color:'green',note:'₱77k'},{label:'Aging',score:12,max:15,color:'green',note:'5d since action'},{label:'Client Type',score:4,max:10,color:'gray',note:'Business partner'}],priorityAlert:null,readiness:[{label:'Approved',ok:true,detail:'Ana Martinez'},{label:'Supplier selected',ok:true,detail:'Acme Industrial'},{label:'Final price confirmed',ok:true,detail:'₱385'},{label:'Shipping mode selected',ok:true,detail:'Air Freight'},{label:'Target date exists',ok:true,detail:'Apr 22'}],recSuppliers:[{name:'Acme Industrial',categories:'Safety / PPE',match:true,activePOs:62,loadPct:62,status:'Normal',eligible:'rec'},{name:'GlobalParts Co.',categories:'All categories',match:true,activePOs:72,loadPct:72,status:'Normal',eligible:'avail'},{name:'TechSupply PH',categories:'Selected categories',match:false,activePOs:88,loadPct:88,status:'Near Capacity',eligible:'removed-1'}]},
  3:{productName:'SS Fasteners M8 Grade 316',locked:false,createdDate:'Apr 5, 2024',updatedDate:'Apr 12, 2024',converted:false,poNumber:null,lockDate:null,supplierConfirmed:true,inqNegotiatedPrice:48,remainingDays:6,leadDays:10,priorityScore:65,priorityBreakdown:[{label:'Delivery Urgency',score:22,max:30,color:'amber',note:'6d left'},{label:'Blocking / Issues',score:18,max:25,color:'amber',note:'At risk flag'},{label:'Deal Value',score:10,max:20,color:'green',note:'₱24k'},{label:'Aging',score:11,max:15,color:'green',note:'7d since action'},{label:'Client Type',score:4,max:10,color:'gray',note:'Corporate'}],priorityAlert:null,readiness:[{label:'Approved',ok:true,detail:'Bea Santos'},{label:'Supplier selected',ok:true,detail:'TechSupply PH'},{label:'Final price confirmed',ok:true,detail:'₱48'},{label:'Shipping mode selected',ok:true,detail:'Land Freight'},{label:'Target date exists',ok:true,detail:'Apr 19'}],recSuppliers:[{name:'TechSupply PH',categories:'Fasteners',match:true,activePOs:88,loadPct:55,status:'Normal',eligible:'rec'},{name:'Manila Steel',categories:'Fasteners / Structural',match:true,activePOs:64,loadPct:64,status:'Normal',eligible:'avail'},{name:'BuildRight Corp.',categories:'Construction',match:false,activePOs:45,loadPct:45,status:'Normal',eligible:'removed-1'}]},
  4:{productName:'HDPE Pipe 50mm PN16',locked:false,createdDate:'Apr 9, 2024',updatedDate:'Apr 15, 2024',converted:false,poNumber:null,lockDate:null,supplierConfirmed:true,inqNegotiatedPrice:2950,remainingDays:12,leadDays:18,priorityScore:55,priorityBreakdown:[{label:'Delivery Urgency',score:18,max:30,color:'green',note:'12d left'},{label:'Blocking / Issues',score:15,max:25,color:'amber',note:'Override logged'},{label:'Deal Value',score:11,max:20,color:'green',note:'₱88.5k'},{label:'Aging',score:8,max:15,color:'amber',note:'9d since action'},{label:'Client Type',score:3,max:10,color:'gray',note:'Corporate'}],priorityAlert:null,readiness:[{label:'Approved',ok:true,detail:'Bea Santos'},{label:'Supplier selected',ok:true,detail:'Manila Steel'},{label:'Final price confirmed',ok:true,detail:'₱2,950'},{label:'Shipping mode selected',ok:true,detail:'Sea Freight'},{label:'Target date exists',ok:true,detail:'Apr 25'}],recSuppliers:[{name:'BuildRight Corp.',categories:'Pipes / Construction',match:true,activePOs:45,loadPct:45,status:'Normal',eligible:'rec'},{name:'Manila Steel',categories:'Pipes / Structural',match:true,activePOs:64,loadPct:64,status:'Normal',eligible:'override'},{name:'TechSupply PH',categories:'Fasteners',match:false,activePOs:88,loadPct:88,status:'Near Capacity',eligible:'removed-1'}]},
  5:{productName:'Bearing SKF 6205-2RS',locked:false,createdDate:'Apr 1, 2024',updatedDate:'Apr 10, 2024',converted:false,poNumber:null,lockDate:null,supplierConfirmed:true,inqNegotiatedPrice:8900,remainingDays:0,leadDays:14,priorityScore:90,priorityBreakdown:[{label:'Delivery Urgency',score:30,max:30,color:'red',note:'Overdue'},{label:'Blocking / Issues',score:25,max:25,color:'red',note:'Delayed'},{label:'Deal Value',score:18,max:20,color:'amber',note:'₱89k'},{label:'Aging',score:12,max:15,color:'amber',note:'13d since action'},{label:'Client Type',score:5,max:10,color:'gray',note:'Business partner'}],priorityAlert:'Delayed flag — priority force-upgraded to HIGH regardless of score.',readiness:[{label:'Approved',ok:true,detail:'Carlos Reyes'},{label:'Supplier selected',ok:true,detail:'GlobalParts'},{label:'Final price confirmed',ok:true,detail:'₱8,900'},{label:'Shipping mode selected',ok:true,detail:'Air Freight'},{label:'Target date exists',ok:true,detail:'Apr 14'}],recSuppliers:[{name:'GlobalParts Co.',categories:'All categories',match:true,activePOs:72,loadPct:72,status:'Normal',eligible:'rec'},{name:'Acme Industrial',categories:'Industrial / Safety',match:true,activePOs:62,loadPct:62,status:'Normal',eligible:'avail'},{name:'Manila Steel',categories:'Structural',match:false,activePOs:96,loadPct:96,status:'Overloaded',eligible:'removed-1'}]},
  6:{productName:'Galvanized Wire 2mm Coil',locked:false,createdDate:'Apr 11, 2024',updatedDate:'Apr 16, 2024',converted:false,poNumber:null,lockDate:null,supplierConfirmed:true,inqNegotiatedPrice:12,remainingDays:17,leadDays:5,priorityScore:35,priorityBreakdown:[{label:'Delivery Urgency',score:10,max:30,color:'green',note:'17d left'},{label:'Blocking / Issues',score:8,max:25,color:'green',note:'None'},{label:'Deal Value',score:6,max:20,color:'green',note:'₱12k'},{label:'Aging',score:8,max:15,color:'green',note:'4d since action'},{label:'Client Type',score:3,max:10,color:'gray',note:'Regular client'}],priorityAlert:null,readiness:[{label:'Approved',ok:true,detail:'Carlos Reyes'},{label:'Supplier selected',ok:true,detail:'TechSupply PH'},{label:'Final price confirmed',ok:true,detail:'₱12'},{label:'Shipping mode selected',ok:true,detail:'Land Freight'},{label:'Target date exists',ok:true,detail:'Apr 28'}],recSuppliers:[{name:'TechSupply PH',categories:'Electrical / Wire',match:true,activePOs:88,loadPct:55,status:'Normal',eligible:'rec'},{name:'BuildRight Corp.',categories:'Construction',match:false,activePOs:45,loadPct:45,status:'Normal',eligible:'removed-1'}]},
  7:{productName:'Concrete Anchor Bolt M12',locked:false,createdDate:'Apr 14, 2024',updatedDate:'Apr 17, 2024',converted:false,poNumber:null,lockDate:null,supplierConfirmed:false,inqNegotiatedPrice:0,remainingDays:26,leadDays:10,priorityScore:40,priorityBreakdown:[{label:'Delivery Urgency',score:14,max:30,color:'green',note:'26d left'},{label:'Blocking / Issues',score:10,max:25,color:'green',note:'None'},{label:'Deal Value',score:8,max:20,color:'green',note:'TBD'},{label:'Aging',score:6,max:15,color:'amber',note:'3d since action'},{label:'Client Type',score:2,max:10,color:'gray',note:'Regular client'}],priorityAlert:null,readiness:[{label:'Approved',ok:true,detail:'Ana Martinez'},{label:'Supplier selected',ok:false,detail:'—'},{label:'Final price confirmed',ok:false,detail:'—'},{label:'Shipping mode selected',ok:false,detail:'—'},{label:'Target date exists',ok:true,detail:'May 10'}],recSuppliers:[{name:'Manila Steel',categories:'Industrial / Structural',match:true,activePOs:64,loadPct:64,status:'Normal',eligible:'rec'},{name:'GlobalParts Co.',categories:'All categories',match:true,activePOs:72,loadPct:72,status:'Normal',eligible:'avail'}]},
  8:{productName:'PVC Conduit 20mm Flexible',locked:false,createdDate:'Apr 16, 2024',updatedDate:'Apr 18, 2024',converted:false,poNumber:null,lockDate:null,supplierConfirmed:false,inqNegotiatedPrice:0,remainingDays:29,leadDays:7,priorityScore:28,priorityBreakdown:[{label:'Delivery Urgency',score:8,max:30,color:'green',note:'29d left'},{label:'Blocking / Issues',score:8,max:25,color:'green',note:'Pending approval'},{label:'Deal Value',score:5,max:20,color:'green',note:'TBD'},{label:'Aging',score:5,max:15,color:'green',note:'2d since action'},{label:'Client Type',score:2,max:10,color:'gray',note:'Corporate'}],priorityAlert:null,readiness:[{label:'Approved',ok:false,detail:'Pending'},{label:'Supplier selected',ok:false,detail:'—'},{label:'Final price confirmed',ok:false,detail:'—'},{label:'Shipping mode selected',ok:false,detail:'—'},{label:'Target date exists',ok:true,detail:'May 15'}],recSuppliers:[{name:'BuildRight Corp.',categories:'Pipes / Construction',match:true,activePOs:45,loadPct:45,status:'Normal',eligible:'rec'},{name:'Manila Steel',categories:'Pipes / Structural',match:true,activePOs:64,loadPct:64,status:'Normal',eligible:'avail'}]},
  9:{productName:'Steel Beam W6x12 A36',locked:false,createdDate:'Apr 17, 2024',updatedDate:'Apr 20, 2024',converted:false,poNumber:null,lockDate:null,supplierConfirmed:true,inqNegotiatedPrice:4200,remainingDays:30,leadDays:21,priorityScore:62,priorityBreakdown:[{label:'Delivery Urgency',score:16,max:30,color:'green',note:'30d left'},{label:'Blocking / Issues',score:18,max:25,color:'amber',note:'For approval'},{label:'Deal Value',score:16,max:20,color:'amber',note:'₱84k'},{label:'Aging',score:10,max:15,color:'green',note:'3d since action'},{label:'Client Type',score:2,max:10,color:'gray',note:'Business partner'}],priorityAlert:null,readiness:[{label:'Approved',ok:false,detail:'Pending mgr'},{label:'Supplier selected',ok:true,detail:'GlobalParts'},{label:'Final price confirmed',ok:true,detail:'₱4,200'},{label:'Shipping mode selected',ok:true,detail:'Sea Freight'},{label:'Target date exists',ok:true,detail:'May 20'}],recSuppliers:[{name:'GlobalParts Co.',categories:'All categories',match:true,activePOs:72,loadPct:72,status:'Normal',eligible:'rec'},{name:'Manila Steel',categories:'Structural',match:true,activePOs:64,loadPct:64,status:'Normal',eligible:'avail'}]},
};

/* ════════════════════════════════
   VIEW SWITCHING
════════════════════════════════ */
function showView(name){
  ['list','new','detail','group'].forEach(v=>document.getElementById('view-'+v).style.display=v===name?'':'none');
  if(name==='list') window.scrollTo(0,0);
  if(name!=='detail'){ stopChatPolling(); internalNotes.close(); }
}

/* ════════════════════════════════
   CONVERSATION (PR_Messages) — per-PR buyer↔supplier chat, right rail on Detail view.
   Mirrors the Inquiry-side chat feature exactly (UI/EndUser/INQs/app/index.html — see
   that file's own copy of this comment for the full architecture rationale: new plain
   form not a subform, polling not push since no native websocket/subscribe API exists
   for Creator widgets, etc). Buyer sees both supplier threads tabbed, keyed by PR_No
   instead of INQ_No. Each supplier's own PR widget (Fenteng-PR/Tony-PR) shows only its
   own single thread — see those files' copy of this block.
════════════════════════════════ */
let chatPollTimer = null;
let chatActiveSupplier = 'Fenteng';
let chatCurrentPrNo = '';
let chatLastSignature = '';
let chatSelectedSupplier = ''; /* r.selectedSupplier of the PR currently open — gates which tab can actually send, see refreshChatSendGate() */
function chatVal(v){ return (v==null) ? '' : String(v); }
function chatFmtDateTime(d){
  var pad = function(n){ return String(n).padStart(2,'0'); };
  return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate())+' '+pad(d.getHours())+':'+pad(d.getMinutes())+':'+pad(d.getSeconds());
}
/* ADDED 2026-07-16, per user ("only one supplier is selected right so. maybe disable
   the message sending -> supplier for that unselected supplier") — once a PR has a
   confirmed Selected_Supplier, messaging the OTHER (non-selected) supplier about that
   same PR doesn't make sense, so lock its input+Send once a selection exists. Read-view
   (switching tabs, seeing past messages) stays open either way — this only gates
   SENDING, per the ask. Before any selection is made (both suppliers still candidates,
   `chatSelectedSupplier` blank), sending stays open on both tabs. */
function refreshChatSendGate(){
  var input = document.getElementById('dChatInput');
  var btn = document.getElementById('dChatSendBtn');
  var locked = chatSelectedSupplier && !supplierKeyMatch(chatSelectedSupplier, chatActiveSupplier);
  input.disabled = !!locked;
  input.placeholder = locked ? (chatActiveSupplier+' was not selected for this PR — messaging disabled.') : ('Message this supplier…');
  btn.disabled = locked || !input.value.trim();
}
function startChatPolling(prNo, selectedSupplier){
  stopChatPolling();
  chatCurrentPrNo = prNo || '';
  chatSelectedSupplier = selectedSupplier || '';
  var fTab = document.getElementById('dChatTabFenteng');
  var tTab = document.getElementById('dChatTabTony');
  /* ADDED 2026-08-25, per user request ("if sino yung selected supplier siya lang
     lalabas sa conversation") — goes further than the 2026-07-16 change above (which
     only disabled SENDING to the non-selected supplier but still showed both tabs).
     Once a PR has a confirmed Selected_Supplier, the other supplier's tab is hidden
     entirely — there's nothing to route to them for this PR anymore. Before any
     selection is made (chatSelectedSupplier blank), both tabs still show as before,
     since either supplier is still a real candidate. */
  var isFenteng = chatSelectedSupplier && supplierKeyMatch(chatSelectedSupplier, 'Fenteng');
  var isTony    = chatSelectedSupplier && supplierKeyMatch(chatSelectedSupplier, 'Tony');
  if(isFenteng || isTony){
    chatActiveSupplier = isFenteng ? 'Fenteng' : 'Tony';
    fTab.style.display = isFenteng ? '' : 'none';
    tTab.style.display = isTony ? '' : 'none';
  } else {
    chatActiveSupplier = 'Fenteng';
    fTab.style.display = '';
    tTab.style.display = '';
  }
  fTab.classList.toggle('active', chatActiveSupplier==='Fenteng');
  tTab.classList.toggle('active', chatActiveSupplier==='Tony');
  chatLastSignature = '';
  document.getElementById('dChatInput').value = '';
  refreshChatSendGate();
  if(!chatCurrentPrNo) return;
  setTimeout(loadChatMessages, 120);
  chatPollTimer = setInterval(loadChatMessages, 5000);
}
function stopChatPolling(){
  if(chatPollTimer){ clearInterval(chatPollTimer); chatPollTimer = null; }
}
function switchChatTab(supplier){
  chatActiveSupplier = supplier;
  document.getElementById('dChatTabFenteng').classList.toggle('active', supplier==='Fenteng');
  document.getElementById('dChatTabTony').classList.toggle('active', supplier==='Tony');
  chatLastSignature = '';
  document.getElementById('dChatInput').value = '';
  refreshChatSendGate();
  loadChatMessages();
}
async function loadChatMessages(){
  if(!chatCurrentPrNo || typeof ZOHO==='undefined'||!ZOHO.CREATOR||!ZOHO.CREATOR.DATA||typeof ZOHO.CREATOR.DATA.getRecords!=='function') return;
  try{
    var criteria = 'PR_No=="'+chatCurrentPrNo.replace(/"/g,'\\"')+'" && Supplier=="'+chatActiveSupplier+'"';
    var resp = await ZOHO.CREATOR.DATA.getRecords({ app_name: REAL_APP_NAME, report_name: CHAT_REPORT, criteria: criteria, max_records: 500 });
    var rows = (resp && resp.code === 3000 && Array.isArray(resp.data)) ? resp.data : [];
    rows.sort(function(a,b){ return chatVal(a.Sent_On).localeCompare(chatVal(b.Sent_On)); });
    var sig = rows.length + '|' + (rows.length ? chatVal(rows[rows.length-1].ID) : '');
    if(sig === chatLastSignature) return;
    chatLastSignature = sig;
    renderChatMessages(rows);
  } catch(err){
    console.warn('[Chat] load failed:', err);
    renderChatMessages([]);
  }
}
function renderChatMessages(rows){
  var box = document.getElementById('dChatMsgs');
  var wasNearBottom = (box.scrollHeight - box.scrollTop - box.clientHeight) < 60;
  if(!rows.length){
    box.innerHTML = '<div class="chat-empty">No messages yet — start the conversation.</div>';
    return;
  }
  box.innerHTML = rows.map(function(m){
    var mine = chatVal(m.Sender_Role) === 'Buyer';
    var name = escapeHtml(chatVal(m.Sender_Name) || (mine ? 'Buyer' : chatActiveSupplier));
    var time = escapeHtml(chatVal(m.Sent_On));
    return '<div class="chat-bubble '+(mine?'mine':'theirs')+'">'
      + '<div class="chat-meta">'+name+'</div>'
      + escapeHtml(chatVal(m.Message))
      + '<div class="chat-time">'+time+'</div>'
      + '</div>';
  }).join('');
  if(wasNearBottom) box.scrollTop = box.scrollHeight;
}
async function sendChatMessage(){
  if(chatSelectedSupplier && !supplierKeyMatch(chatSelectedSupplier, chatActiveSupplier)){ showToast(chatActiveSupplier+' was not selected for this PR'); return; }
  var msg = document.getElementById('dChatInput').value.trim();
  if(!msg){ showToast('Type a message first'); return; }
  if(!chatCurrentPrNo) return;
  if(typeof ZOHO==='undefined'||!ZOHO.CREATOR||!ZOHO.CREATOR.DATA||typeof ZOHO.CREATOR.DATA.addRecords!=='function'){
    showToast('Creator API not available — widget must be uploaded to Creator.');
    return;
  }
  var btn = document.getElementById('dChatSendBtn');
  btn.disabled = true;
  try{
    var payload = {
      PR_No: chatCurrentPrNo,
      Supplier: chatActiveSupplier,
      Sender_Role: 'Buyer',
      Sender_Name: 'Buyer',
      Message: msg,
      Sent_On: chatFmtDateTime(new Date())
    };
    var resp = await ZOHO.CREATOR.DATA.addRecords({ app_name: REAL_APP_NAME, form_name: 'PR_Messages', payload: { data: payload } });
    if(resp && resp.code === 3000){
      document.getElementById('dChatInput').value = '';
      chatLastSignature = '';
      loadChatMessages();
    } else {
      showToast('Could not send message — code ' + (resp && resp.code));
    }
  } catch(err){
    console.error('[Chat] send failed:', err);
    showToast('Error sending message — see console');
  } finally {
    refreshChatSendGate();
  }
}
document.getElementById('dChatInput').addEventListener('keydown', function(e){
  if(e.key==='Enter' && !e.shiftKey){ e.preventDefault(); sendChatMessage(); }
});
document.getElementById('dChatInput').addEventListener('input', refreshChatSendGate);
document.getElementById('dChatSendBtn').disabled = true;

/* ADDED 2026-07-15, per user ("when that exact PR is clicked it should go to that exact
   PR's detailed view") — read side of the cross-widget navigation added to the POs
   widget (UI/EndUser/POs/app/PO.html's navigateToPR). Reads the `openPR` PAGE VARIABLE
   (ZOHO.CREATOR.UTIL.getQueryParams — despite the method name, in the current Creator
   UI this reads "Page Variables", the renamed successor to the old "Page Parameters"
   feature; see CLAUDE.md Deluge Gotchas for the full gotcha) off the Creator PAGE this
   widget is embedded in, and auto-opens that PR's detail view once ALL_PR is loaded.
   Guarded to run only once (_deepLinkChecked) so it can't re-fire on a later unrelated
   re-fetch of the same list. CONFIRMED WORKING END-TO-END 2026-07-15 (live console log
   showed getQueryParams resolving {"openPR":"PR-00002"}, match found, detail opened) —
   REQUIRES the `openPR` variable to exist on the Purchase_Request page first (Design →
   page builder → "Variables" tab (top toolbar, NOT the page-level gear icon) → Add
   Variable → name `openPR`, any text-compatible Data Type). Diagnostic console.logs
   removed after confirmation — see git history / this comment if it ever needs
   re-diagnosing. */
var _deepLinkChecked = false;
function checkDeepLinkOpenPR(){
  if(_deepLinkChecked) return;
  _deepLinkChecked = true;
  if(typeof ZOHO==='undefined' || !ZOHO.CREATOR || !ZOHO.CREATOR.UTIL || typeof ZOHO.CREATOR.UTIL.getQueryParams!=='function') return;
  ZOHO.CREATOR.UTIL.getQueryParams().then(function(resp){
    var prNo = resp && resp.openPR;
    if(!prNo) return;
    var match = ALL_PR.find(function(p){ return p.prNo === prNo; });
    if(match){
      openDetailView(match.id);
    } else {
      console.warn('[PR] deep-link openPR not found in loaded list:', prNo);
    }
  }).catch(function(e){
    console.warn('[PR] getQueryParams failed', e);
  });
}

/* ════════════════════════════════
   DETAIL VIEW — OPEN & RENDER
════════════════════════════════ */
let PR_FULL_CACHE = {}; /* in-memory cache for getRecordById raw data, keyed by String(id) */

function openDetailView(id){
  /* Creator IDs are large numeric strings — always compare as strings to avoid
     precision loss (they exceed Number.MAX_SAFE_INTEGER) and type mismatch */
  const r = ALL_PR.find(p=>String(p.id)===String(id));
  if(!r){ showToast('PR not found'); return; }

  const cachedRaw = PR_FULL_CACHE[String(r.id)];

  /* Initialize _currentRawRecord immediately from cache or r._raw so Edit is instant */
  _currentRawRecord = cachedRaw || r._raw || null;

  if(cachedRaw){
    /* Instant load from in-memory cache — zero network delay */
    const fullR = mapPR(cachedRaw);
    if(_cachedPORows){
      var live = computeLiveLoadBalancing(fullR.category, _cachedPORows, fullR.supplierQuotes);
      if(live && live.length){
        fullR.loadBalancing = live;
        var liveRecRow = live.find(function(row){ return row.eligible==='Recommended'; });
        if(liveRecRow) fullR.recSupplier = liveRecRow.name;
        autoHealFollowedRecommendation(fullR);
      }
    }
    _currentMappedPR = fullR;
    const d = buildDetailFromPR(fullR);
    renderDetailView(fullR, d, fullR);
  } else {
    _currentMappedPR = r;
    if(_cachedPORows){
      var live0 = computeLiveLoadBalancing(r.category, _cachedPORows, r.supplierQuotes);
      if(live0 && live0.length){
        r.loadBalancing = live0;
        var liveRecRow0 = live0.find(function(row){ return row.eligible==='Recommended'; });
        if(liveRecRow0) r.recSupplier = liveRecRow0.name;
        autoHealFollowedRecommendation(r);
      }
    }
    const d0 = buildDetailFromPR(r);
    renderDetailView(r, d0, r);
  }

  showView('detail');
  window.scrollTo(0,0);
  startChatPolling(r.prNo, r.selectedSupplier);
  prTimeline.open(r.prNo);
  internalNotes.open(r.prNo);

  /* If PO rows aren't cached yet, fetch in background and patch in */
  if(!_cachedPORows){
    refreshLiveLoadBalancing(r.id, r.category);
  }

  /* Fire getRecordById for the FULL record if not already cached */
  if(!cachedRaw && creatorLoaded && typeof ZOHO!=='undefined' && ZOHO.CREATOR && ZOHO.CREATOR.DATA &&
     typeof ZOHO.CREATOR.DATA.getRecordById === 'function'){
    var gbr = ZOHO.CREATOR.DATA.getRecordById.bind(ZOHO.CREATOR.DATA);
    gbr({ report_name: REPORT_NAME, id: String(r.id), field_config: 'all' })
      .then(function(resp){
        if(resp && resp.code === 3000 && resp.data){
          console.log('[PR] getRecordById ok — re-rendering detail with full record');
          PR_FULL_CACHE[String(r.id)] = resp.data;
          /* Only apply if user is still on this PR */
          if(!_currentMappedPR || String(_currentMappedPR.id) !== String(r.id)) return;
          _currentRawRecord = resp.data;
          var fullR = mapPR(resp.data);
          if(_cachedPORows){
            var live = computeLiveLoadBalancing(fullR.category, _cachedPORows, fullR.supplierQuotes);
            if(live && live.length){
              fullR.loadBalancing = live;
              var liveRecRow = live.find(function(row){ return row.eligible==='Recommended'; });
              if(liveRecRow) fullR.recSupplier = liveRecRow.name;
              autoHealFollowedRecommendation(fullR);
            }
          }
          _currentMappedPR = fullR;
          /* Only re-render if user is NOT currently editing to prevent overwriting user input */
          if(!_editMode){
            var d = buildDetailFromPR(fullR);
            renderDetailView(fullR, d, fullR);
          }
        } else {
          console.warn('[PR] getRecordById non-3000:', resp && resp.code);
        }
      })
      .catch(function(err){
        console.warn('[PR] getRecordById error:', JSON.stringify(err));
      });
  }
}

/* Item specifications on the Detail view. Shown only when the PR actually carries at least
   one — a PR raised before these fields existed, or one with none filled in, would
   otherwise render six empty rows. */
function specFieldsHtml(specs){
  if(!specs) return '';
  var rows = [
    ['Dimension', specs.Dimension],
    ['Color Body', specs.Color_Body],
    ['Color Temperature', specs.Color_Temperature],
    ['Type of Bulb', specs.Type_of_Bulb],
    ['Voltage', specs.Voltage],
    ['Lumens', specs.Lumens],
  ].filter(function(x){ return !!(x[1] && String(x[1]).trim()); });
  if(!rows.length) return '';
  return '<div class="detail-field span-4" style="border-top:1px solid var(--gray-100);padding-top:10px">'
       + '<div class="detail-label-sm">Specifications</div></div>'
       + rows.map(function(x){
           return '<div class="detail-field"><div class="detail-label-sm">' + x[0] + '</div>'
                + '<div class="detail-val">' + escapeHtml(String(x[1])) + '</div></div>';
         }).join('');
}
function buildDetailFromPR(r){
  /* Build a detail object from the mapped PR record */
  return {
    sourcingType:    r.sourcingType || 'Import',
    productName:     r.product,
    locked:          false,
    createdDate:     r.prDate,
    updatedDate:     r.prDate,
    converted:       !!r.converted,
    poNumber:        r.poNumber || null,
    lockDate:        null,
    supplierConfirmed: !!(r.selectedSupplier && r.selectedSupplier !== '—'),
    inqNegotiatedPrice: r.finalPrice,
    remainingDays:   r.remDays || 0,
    leadDays:        r.leadDays || 0,
    priorityScore:   r.priority==='HIGH'?80:r.priority==='MED'?55:30,
    priorityBreakdown:[
      {label:'Delivery Urgency',score:r.priority==='HIGH'?30:18,max:30,color:r.priority==='HIGH'?'red':'amber',note:''},
      {label:'Blocking / Issues',score:r.delay==='Delayed'?25:10,max:25,color:r.delay==='Delayed'?'red':'green',note:r.delay},
      {label:'Deal Value',score:r.finalPrice>10000?18:r.finalPrice>1000?12:6,max:20,color:'green',note:((r.priceSource==='srp'||r.priceSource==='catalog'||r.priceSource==='srp_approved')?'₱':'¥')+(r.finalPrice||0).toLocaleString()},
      {label:'Aging',score:10,max:15,color:'amber',note:''},
      {label:'Client Type',score:4,max:10,color:'gray',note:r.customerType||''},
    ],
    priorityAlert: r.delay==='Delayed'?'Delayed flag — priority force-upgraded to HIGH regardless of score.':null,
    readiness:[
      {label:'Approved',          ok:true,                                         detail:r.salesOwner||'—'},
      {label:'Supplier selected', ok:!!(r.selectedSupplier&&r.selectedSupplier!=='—'), detail:r.selectedSupplier||'—'},
      {label:'Final price confirmed', ok:!!r.priceApproved,                        detail:priceReadinessDetail(r)},
      /* Local (HC System) has no external freight leg at all — auto-satisfied here,
         mirroring pr_check_readiness.txt's own Sourcing_Type=="Local" bypass, 2026-09-05. */
      {label:'Shipping mode selected',ok:r.sourcingType==='Local'||!!(r.shipMode&&r.shipMode!=='—'), detail:r.sourcingType==='Local'?'N/A — Local':(r.shipMode||'—')},
      {label:'Target date exists', ok:!!(r.targetDate&&r.targetDate!=='—'),        detail:r.targetDate||'—'},
    ],
    /* Real Supplier_Load_Balancing subform rows (server-computed) when available —
       falls back to the old single-guess computed version only if a PR predates this
       subform being populated (loadBalancing empty). */
    recSuppliers: (r.loadBalancing && r.loadBalancing.length) ? r.loadBalancing.map(function(row){
      /* CHANGED 2026-08-15, per user ("dapat pag ka submit ng supplier tsaka lang
         magkakaroon ng recommendation") — computeLiveLoadBalancing() now returns a
         3rd real status, 'Awaiting Quote', for an eligible supplier who hasn't
         submitted a price yet. Previously fell through to the generic 'avail' code
         (same bucket as a real priced-but-not-cheapest supplier), which would have
         kept showing "Available (higher load)" for a supplier with literally no
         quote on file at all. */
      var code = row.eligible==='Recommended' ? 'rec'
               : row.eligible==='Removed' ? 'removed-1'
               : row.eligible==='Awaiting Quote' ? 'awaiting'
               : (row.name===r.selectedSupplier && r.override) ? 'override'
               : 'avail';
      return {name:row.name,categories:row.category||r.category||'',match:row.category==='Match',
              activePOs:row.activePOs,loadPct:row.percent,status:row.loadStatus,eligible:code};
    }) : [
      /* Fallback pre-live-data row — CHANGED 2026-08-15: only tag 'rec' when
         recSupplier actually resolved to a real name (no quotes yet -> recSupplier
         is '—', so this must not show a false "Recommended" badge either). */
      ...(r.recSupplier && r.recSupplier!=='—' ? [{name:r.recSupplier,categories:r.category||'',match:true,activePOs:0,loadPct:70,status:'Normal',eligible:'rec'}] : []),
      ...(r.selectedSupplier&&r.selectedSupplier!==r.recSupplier?[{name:r.selectedSupplier,categories:r.category||'',match:true,activePOs:0,loadPct:80,status:'Normal',eligible:r.override?'override':'avail'}]:[]),
    ],
  };
}

/* ADDED 2026-07-15, per user ("make the approved editable. but still auto populated by
   - when pr have rate - srp approved = that rate, when pr doesnt have rate - srp
   approved = final price") — computes the display value + currency symbol for the
   sidebar's "SRP (Approved)" row and the edit-mode input's pre-fill. `srpApprovedPR`
   (the new real header field) wins once a human has actually set it; until then
   it shows the auto-computed default so the field is never blank without reason.
   CHANGED 2026-07-15, per user ("0 should be acceptable... books item cost price = 0
   literally... display should stay the same"): a manually-saved 0 is a real, intentional
   override (e.g. a genuine free/zero-cost line to Books), not "never touched" — `stored`
   now checks null/undefined (see mapPR's srpApprovedPR, which is `null` only when the
   field was never saved, not when it was saved as 0) instead of `>0`, so a saved 0
   persists on redisplay instead of silently reverting to the auto-computed default.
   FIXED 2026-07-16, per user ("SRP pricing always PHP"): this row IS the SRP &
   Pricing Summary — regardless of what it auto-defaults from (catalog Rate or a raw
   supplier quote), it's always shown/approved as a PHP reference number, never CNY.
   Symbol simplified to unconditional ₱ (was wrongly falling to ¥ whenever the
   auto-default happened to come from a real supplier quote). */
function srpApprovedInfo(r){
  var isCatalog = r.itemRateVal > 0;
  var auto = isCatalog ? r.itemRateVal : r.finalPrice;
  var stored = r.srpApprovedPR !== null && r.srpApprovedPR !== undefined;
  return { value: stored ? r.srpApprovedPR : auto, auto: auto, symbol: '₱', isAuto: !stored };
}

function renderDetailView(r,d,info={}){
  renderNextStepBanner("nsBanner", r.id, nextStepFor(r));
  /* FIXED 2026-09-01, per user report: this button always said "No PO created yet"
     even on an already-converted PR — it was never wired to the real converted/
     poNumber state. Now reflects it directly (still a toast, not real PO navigation —
     no confirmed safe way to deep-link into the separate Purchase Order widget from here). */
  var vpBtn = document.getElementById('dBtnViewPO');
  if(vpBtn){
    if(d.converted){
      vpBtn.onclick = function(){ showToast(d.poNumber ? ('PO: '+d.poNumber) : 'Converted to PO — PO number not synced yet'); };
    } else {
      vpBtn.onclick = function(){ showToast('No PO created yet'); };
    }
  }
  const lbColor = pct=>pct>=90?'red':pct>=75?'amber':'green';
  const srpInfo = srpApprovedInfo(r);
  const salesOwner  = info.salesOwner  || '—';
  const customerType= info.customerType|| '—';
  const similarItem = !!info.similarItem;
  const pc = getPhotoColor(r.sku);
  const pi = getInitialsPR(d.productName);

  /* Real Attachments — read from the full raw record (only available once getRecordById
     resolves; the quick pre-render from list data won't have this yet) */
  const rawRec = _currentRawRecord;
  const attRaw = rawRec ? rawRec.Attachments : null;
  const attItems = attRaw ? (Array.isArray(attRaw)?attRaw:[attRaw]) : [];
  let attImgHtml = '', attLinkHtml = '';
  const attImgEls = [];
  attItems.forEach(function(a,i){
    const url = attachRawToString(a); if(!url) return;
    const label = attachFileName(a);
    const safeUrl = escapeHtml(url), safeLabel = escapeHtml(label);
    const dlCall = "downloadCreatorFile('Attachments','"+safeUrl+"','"+safeLabel+"')";
    if(isImageFile(label)){
      attImgHtml += `<div style="display:flex;flex-direction:column;align-items:center;gap:4px">
        <div class="photo-thumb"><img id="datt-${i}" style="width:100%;height:100%;object-fit:cover" onclick="if(this.src)openLightbox(this.src)" /></div>
        <span style="font-size:11px;color:var(--blue);cursor:pointer;text-decoration:underline" onclick="${dlCall}">&#8659; Download</span>
      </div>`;
      attImgEls.push({i:i,a:a});
    } else {
      attLinkHtml += `<span class="attach-link" onclick="${dlCall}">&#128206; ${safeLabel}</span>`;
    }
  });
  const attHtml = attItems.length
    ? (attImgHtml?`<div style="display:flex;flex-wrap:wrap;gap:10px;margin-bottom:8px">${attImgHtml}</div>`:'')+attLinkHtml
    : '<span style="color:var(--gray-400);font-size:13px;font-style:italic">No attachments</span>';

  function supStatusBadge(status){
    const cls=status==='Normal'?'rec-status-normal':status==='Near Capacity'?'rec-status-nearcap':'rec-status-over';
    return `<span class="badge-pill ${cls}">&#9679; ${status}</span>`;
  }
  function eligHtml(s){
    if(s.eligible==='rec')       return `<span class="rec-el-rec">&#9679; Recommended</span>`;
    if(s.eligible==='override')  return `<span class="rec-el-rec" style="background:var(--purple-light);color:var(--purple);border-color:var(--purple-mid)">Override Selected</span>`;
    /* CHANGED 2026-08-15: "(higher load)" reasoning no longer applies — recommendation
       is price/lead-time based now, not load-based. 'awaiting' is a NEW distinct state
       (added same day) for an eligible supplier who simply hasn't quoted yet. */
    if(s.eligible==='avail')     return `<span class="rec-el-avail">Available</span>`;
    if(s.eligible==='awaiting')  return `<span class="rec-el-avail" style="opacity:.7">Awaiting Quote</span>`;
    if(s.eligible==='removed-1') return `<span class="rec-el-removed">&#10005; Removed — Step 1</span>`;
    return '<span class="rec-el-avail">—</span>';
  }

  /* topbar */
  $('dTopTitle').textContent = r.prNo+' — Decision Workspace';

  /* subheader */
  $('dPrNo').textContent  = r.prNo;
  $('dSoNo').textContent  = r.soNo;
  $('dCustomer').textContent = r.customer;
  const priStyle = r.priority==='HIGH'
    ? 'background:var(--red-light);color:var(--red);border-color:var(--red-mid)'
    : r.priority==='MED'
      ? 'background:var(--amber-light);color:var(--amber);border-color:var(--amber-mid)'
      : 'background:var(--gray-100);color:var(--gray-500);border-color:var(--gray-300)';
  $('dBadges').innerHTML =
    `<span class="badge-pill status-readypo">&#9679; Ready for PO</span>`+
    `<span class="badge-pill" style="${priStyle}">&#9679; ${r.priority}</span>`+
    `<span class="badge-pill ${r.delay==='On Track'?'delay-ontrack':r.delay==='At Risk'?'delay-atrisk':'delay-delayed'}">&#9679; ${r.delay}</span>`+
    `<span class="badge-pill rec-yes">Ready for PO: YES</span>`+
    `<span class="badge-pill status-pending">Converted: ${d.converted?'YES':'NO'}</span>`;
  applyHoldUi(r);

  /* meta */
  $('dMeta').innerHTML = `Locked:&nbsp;<strong>${d.locked?'Yes':'No'}</strong><span class="detail-meta-sep">&nbsp;·&nbsp;</span>Created:&nbsp;<strong>${d.createdDate}</strong><span class="detail-meta-sep">&nbsp;·&nbsp;</span>Last updated:&nbsp;<strong>${d.updatedDate}</strong>`;

  /* remaining days color */
  const daysClass = d.remainingDays<=0?'days-red':d.remainingDays<=5?'days-warn':'days-ok';
  const daysText  = d.remainingDays<=0?'Overdue':d.remainingDays+' days';
  const scoreColor = d.priorityScore>=80?'red':d.priorityScore>=60?'amber':'green';
  const allOk  = d.readiness.every(ri=>ri.ok);

  /* ── MAIN ── */
  $('dMain').innerHTML = `
    <div class="sec-card">
      <div class="sec-header"><span class="sec-title">Product Info</span></div>
      <div style="padding:16px 20px 0">
        <div style="display:flex;align-items:center;gap:16px;padding:14px 16px;background:var(--gray-50);border:1.5px solid var(--gray-200);border-radius:var(--radius)">
          <div style="width:72px;height:72px;border-radius:var(--radius);flex-shrink:0;overflow:hidden;display:flex;align-items:center;justify-content:center;font-size:20px;font-weight:800;letter-spacing:-.02em;background:${pc.bg};color:${pc.fg}">
            <img id="dProductImage" style="display:none;width:100%;height:100%;object-fit:cover;cursor:zoom-in" onclick="if(this.src)openLightbox(this.src)" />
            <span id="dProductImageFallback">${pi}</span>
          </div>
          <div style="flex:1;min-width:0">
            <div style="font-size:10.5px;font-weight:600;color:var(--gray-400);text-transform:uppercase;letter-spacing:.07em;margin-bottom:4px">Item Photo / Name</div>
            <div style="font-size:14px;font-weight:600;color:var(--gray-800)">${d.productName}</div>
            <div style="font-size:12px;color:var(--gray-400);font-family:monospace;margin-top:3px">${r.sku}</div>
            <div style="font-size:12.5px;color:var(--gray-600);line-height:1.4;margin-top:6px" id="dvDesc">${r.description?descToDisplayHtml(r.description):'<span class="detail-val muted">No description</span>'}</div>
          </div>
        </div>
      </div>
      <div class="detail-info-grid">
        <div class="detail-field"><div class="detail-label-sm">Quantity</div><div class="detail-val" id="dvQty">${r.qty.toLocaleString()} ${r.unit}</div></div>
        <div class="detail-field"><div class="detail-label-sm">Supplier Target Date</div><div class="detail-val" id="dvTargetDate">${r.supTargetDate||'—'}</div></div>
        <div class="detail-field"><div class="detail-label-sm">INQ Reference</div><div class="detail-val blue">${r.inqRef||'<span class="detail-val muted">— None</span>'}</div></div>
        <div class="detail-field"><div class="detail-label-sm">Customer</div><div class="detail-val">${r.customer}</div></div>
        <div class="detail-field"><div class="detail-label-sm">Customer Type</div><div class="detail-val">${customerType}</div></div>
        <div class="detail-field"><div class="detail-label-sm">Sales Owner</div><div class="detail-val">${salesOwner}</div></div>
        <div class="detail-field"><div class="detail-label-sm">PR Date</div><div class="detail-val">${r.prDate}</div></div>
        <div class="detail-field"><div class="detail-label-sm">Category</div><div class="detail-val"><span class="badge-pill cat-badge">${r.category}</span></div></div>
        <div class="detail-field"><div class="detail-label-sm">Delay Status</div><div class="detail-val" id="dvDelayStatus">${delayBadge(r.delay)}</div></div>
        <div class="detail-field span-2"><div class="detail-label-sm">Similar Item</div><div class="detail-val" id="dvSimilarItem">${similarItem?'<span style="color:var(--blue);font-weight:600">&#10003; Open to similar design</span>':'<span class="detail-val muted">Not flagged</span>'}</div></div>
        ${specFieldsHtml(r.specs)}
        <div class="detail-field span-4"><div class="detail-label-sm">Attachments</div><div style="margin-top:4px">${attHtml}</div></div>
      </div>
    </div>

    ${d.sourcingType==='Local' ? '' : `
    <div class="sec-card">
      <div class="sec-header">
        <span class="sec-title">Supplier Recommendation — Load Balancing</span>
        <span class="sec-hint">System decides &nbsp;·&nbsp; Human supervises</span>
      </div>
      <div class="sec-body">
        <div class="table-wrap">
          <table class="rec-table">
            <thead><tr><th>Supplier</th><th>Step 1 — Category</th><th>Active POs</th><th>Load Bar</th><th>Step 2 — Status</th><th>Step 3 — Eligible</th></tr></thead>
            <tbody>${d.recSuppliers.map(s=>{const cc=lbColor(s.loadPct);return `
              <tr>
                <td><div class="rec-sname">${s.name}</div>${s.categories?`<div class="rec-scat">${s.categories}</div>`:''}</td>
                <td class="${s.match?'rec-match-y':'rec-match-n'}">${s.match?'&#10003; Match':'&#10007; No match'}</td>
                <td style="font-weight:600;color:var(--gray-800);font-variant-numeric:tabular-nums">${s.activePOs}</td>
                <td><div class="rec-load-row"><div class="rec-lb-bg"><div class="rec-lb ${cc}" style="width:${s.loadPct}%;display:block"></div></div><span class="rec-lpct ${cc}">${s.loadPct}%</span></div></td>
                <td>${supStatusBadge(s.status)}</td>
                <td>${eligHtml(s)}</td>
              </tr>`;}).join('')}</tbody>
          </table>
        </div>
      </div>
    </div>`}

    <div class="sec-card">
      <div class="sec-header"><span class="sec-title">Supplier Selection</span></div>
      <div class="sec-body">
        <div class="fg fg-3">
          <div><div class="fi-lbl">Selected Supplier</div><div class="fi-val" id="dvSupplier" style="color:var(--blue);font-size:15px;font-weight:600">${r.selectedSupplier||'—'}</div></div>
          <div><div class="fi-lbl">Followed Recommendation</div><div class="fi-val" id="dvFollowedRec">${recBadge(r.followedRec)}</div></div>
          <div><div class="fi-lbl">Priority</div><div class="fi-val" id="dvPriority">${priorityHtml(r.priority)}</div></div>
          <div id="dvOverrideReasonWrap" style="grid-column:span 3;${r.followedRec==='No'?'':'display:none'}">
            <div class="fi-lbl">Override Reason</div>
            <div class="fi-val" id="dvOverrideReason" style="font-weight:400;font-size:13.5px;color:var(--gray-700)">${r.overrideReason||'<span class="fi-val muted">— No reason provided</span>'}</div>
          </div>
        </div>
      </div>
    </div>

    <div class="sec-card">
      <!-- Prices here are unambiguously CNY (yen sign) — raw Supplier_Selected.Initial_Price/
           Negotiated/Final_Price, never a PHP-sourced fallback like finalPrice can
           carry elsewhere on this page. Fixed 2026-07-15, was showing peso sign. -->
      <div class="sec-header"><span class="sec-title">Supplier Quotes</span></div>
      <div class="sec-body">
        <div class="table-wrap">
          <table class="rec-table">
            <thead><tr><th>Supplier</th><th>Availability</th><th>Initial Price</th><th>Negotiated</th><th>Final Price</th><th>Lead Time</th><th>Status</th><th>Selected</th></tr></thead>
            <tbody>${r.supplierQuotes.length ? r.supplierQuotes.map(function(q){return `
              <tr>
                <td><div class="rec-sname">${q.supplier}</div></td>
                <td>${q.availability}</td>
                <td>${q.initial!==null?'¥'+q.initial.toLocaleString('en-PH'):'—'}</td>
                <td>${q.negotiated!==null?'¥'+q.negotiated.toLocaleString('en-PH'):'—'}</td>
                <td style="font-weight:600">${q.final!==null?'¥'+q.final.toLocaleString('en-PH'):'—'}</td>
                <td>${q.leadTime!==null?q.leadTime+' days':'—'}</td>
                <td>${q.status||'—'}</td>
                <td style="text-align:center"><input type="radio" class="quote-supplier-pick" name="quoteSupplierPick" value="${q.supplier}" ${q.selected?'checked':''} ${_editMode?'':'disabled'} onchange="selectSupplierFromQuotes('${q.supplier}')" style="width:16px;height:16px;cursor:pointer" title="${_editMode?'Select '+q.supplier+' as the winning supplier':'Click Edit to change supplier'}"></td>
              </tr>`;}).join('') : '<tr><td colspan="8" style="text-align:center;color:var(--gray-400);font-style:italic;padding:20px">No supplier quotes yet</td></tr>'}</tbody>
          </table>
        </div>
      </div>
    </div>

    <div class="sec-card">
      <div class="sec-header"><span class="sec-title">Pricing &amp; Approval</span></div>
      <div class="sec-body">
        <div class="fg fg-4">
          <div><div class="fi-lbl">Final Price<span style="font-weight:400;font-size:11px;color:var(--gray-400)"> (${priceSourceLabel(r)})</span></div><div class="fi-val price" id="dvFinalPrice">${(r.priceSource==='srp'||r.priceSource==='catalog'||r.priceSource==='srp_approved')?'₱':'¥'}${r.finalPrice.toLocaleString('en-PH')}</div></div>
          <div><div class="fi-lbl">Price Status</div><div class="fi-val">${priceStatusPill(r)}</div></div>
          <div><div class="fi-lbl">Supplier Confirmed</div><div class="fi-val">${d.supplierConfirmed?'<span class="badge-pill rec-yes">&#10003; Yes</span>':'<span class="badge-pill status-pending">Pending</span>'}</div></div>
          <div><div class="fi-lbl">INQ Negotiated Ref. (read-only)</div><div class="fi-val" style="color:var(--gray-600);font-size:15px">${d.inqNegotiatedPrice>0?((r.priceSource==='srp'||r.priceSource==='catalog'||r.priceSource==='srp_approved')?'₱':'¥')+d.inqNegotiatedPrice.toLocaleString('en-PH'):'—'}</div></div>
        </div>
        ${!r.priceApproved && !r.hasInqRef ? '<div style="margin-top:12px;padding:10px 12px;border-radius:8px;background:var(--gray-50);border:1px solid var(--gray-100);font-size:12.5px;color:var(--gray-500)">No catalog rate on file for this item and no supplier quote yet — Final Price stays unconfirmed until a supplier responds on their own PR.</div>' : ''}
      </div>
    </div>

    <div class="sec-card">
      <div class="sec-header"><span class="sec-title">Shipment &amp; Timeline</span></div>
      <div class="sec-body">
        <div class="fg fg-5">
          <div><div class="fi-lbl">Shipping Mode</div><div class="fi-val" id="dvShipMode"><span class="badge-pill ship-badge">&#9679; ${r.shipMode}</span></div></div>
          <div><div class="fi-lbl">Target Delivery</div><div class="fi-val">${r.targetDelivery||r.targetDate||'—'}</div></div>
          <div><div class="fi-lbl">Remaining Days</div><div class="fi-val ${daysClass}">${daysText}</div></div>
          <div><div class="fi-lbl">Required Days (lead)</div><div class="fi-val">${d.leadDays} days</div></div>
          <div><div class="fi-lbl">Delay Status</div><div class="fi-val" id="dvDelayStatusF">${delayBadge(r.delay)}</div></div>
        </div>
      </div>
    </div>`;

  /* Product Image + Attachment thumbnails must be set after the innerHTML above exists in the DOM */
  if(rawRec && rawRec.Product_Image_PR){
    $('dProductImageFallback').style.display = 'none';
    $('dProductImage').style.display = '';
    applyCreatorImage($('dProductImage'), rawRec.Product_Image_PR);
  }
  attImgEls.forEach(function(it){
    const el = document.getElementById('datt-'+it.i);
    if(el) loadAttachImage(el, it.a, 'Attachments');
  });

  /* ── SIDEBAR ── */
  $('dSidebar').innerHTML = `
    <div class="side-card">
      <div class="side-hdr">Priority Score</div>
      <div class="side-body">
        <div class="score-top"><span class="score-num" style="color:var(--${scoreColor})">${d.priorityScore}</span><span class="score-denom">&nbsp;/ 100</span></div>
        ${priorityHtml(r.priority)}
        <div style="margin-top:12px;border-top:1px solid var(--gray-100);padding-top:10px">
          ${d.priorityBreakdown.map(pb=>`
            <div class="score-row">
              <span class="score-lbl">${pb.label}</span>
              <div style="display:flex;align-items:center;gap:5px;flex-shrink:0">
                <div class="score-bar-bg"><div class="score-bar ${pb.color}" style="width:${Math.round(pb.score/pb.max*100)}%;display:block"></div></div>
                <span class="score-pts">${pb.score}/${pb.max}</span>
                <span class="score-note" title="${pb.note}">${pb.note}</span>
              </div>
            </div>`).join('')}
        </div>
        ${d.priorityAlert?`<div class="score-alert">${d.priorityAlert}</div>`:''}
      </div>
    </div>

    <div class="side-card">
      <div class="side-hdr">SRP &amp; Pricing Summary</div>
      <div class="side-body">
        <div class="conv-row"><span class="conv-lbl">Selected Final Cost</span><span class="conv-val muted">${r.finalPriceConfirmed>0?'¥'+r.finalPriceConfirmed.toLocaleString('en-PH'):'—'}</span></div>
        <div class="conv-row"><span class="conv-lbl">SRP (Approved)</span><span class="conv-val muted" id="dvSrpApprovedPR">${srpInfo.value>0?srpInfo.symbol+srpInfo.value.toLocaleString('en-PH')+(srpInfo.isAuto?' <span style="font-size:10px;color:var(--gray-400);font-weight:400">(auto)</span>':''):'—'}</span></div>
        <div class="conv-row"><span class="conv-lbl">Margin</span><span class="conv-val" style="color:var(--${(r.finalPrice>0 && r.finalPriceConfirmed>0)?(((r.finalPrice-r.finalPriceConfirmed)/r.finalPrice*100)>=0?'green':'red'):'gray-500'});font-weight:600">${(r.finalPrice>0 && r.finalPriceConfirmed>0)?Math.round((r.finalPrice-r.finalPriceConfirmed)/r.finalPrice*100)+'%':'—'}</span></div>
        <div class="conv-row"><span class="conv-lbl">SRP Status</span><span class="conv-val" style="color:var(--${srpInfo.isAuto?'gray-400':'green'});font-weight:600">&#9679; ${srpInfo.isAuto?'Pending Approval':'Approved'}</span></div>
      </div>
    </div>

    <div class="side-card">
      <div class="side-hdr">PR Readiness Checklist</div>
      <div class="side-body">
        ${d.readiness.map(ri=>`
          <div class="ri-row">
            <div class="ri-left">
              <div class="${ri.ok?'ri-icon-ok':'ri-icon-fail'}">
                ${ri.ok
                  ?'<svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3.5" width="11" height="11"><path d="M20 6L9 17l-5-5"/></svg>'
                  :'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" width="10" height="10" style="color:var(--red)"><path d="M18 6L6 18M6 6l12 12"/></svg>'}
              </div>
              <span class="ri-lbl">${ri.label}</span>
            </div>
            <span class="ri-detail">${ri.detail}</span>
          </div>`).join('')}
        ${allOk
          ?`<div class="ri-pass"><div class="ri-pass-t">PR READY FOR PO = YES</div><div class="ri-pass-s">All 5 conditions passed</div></div>`
          :`<div class="ri-fail"><div class="ri-fail-t">Not yet ready — conditions pending</div></div>`}
      </div>
    </div>

    <div class="side-card">
      <div class="side-hdr">Conversion</div>
      <div class="side-body">
        <div class="conv-row"><span class="conv-lbl">Converted to PO</span><span class="conv-val muted">&#9679; ${d.converted?'Yes':'No'}</span></div>
        <div class="conv-row"><span class="conv-lbl">PO Number</span><span class="conv-val muted">${d.poNumber||'—'}</span></div>
        <div class="conv-row"><span class="conv-lbl">Locked</span><span class="conv-val muted">&#9679; ${d.locked?'Yes':'No'}</span></div>
        <div class="conv-row"><span class="conv-lbl">Lock Date</span><span class="conv-val muted">${d.lockDate||'—'}</span></div>
      </div>
    </div>`;
}

/* ════════════════════════════════
   NEW PR FORM
════════════════════════════════ */
/* ════════════════════════════════
   NEW PR — CONSTANTS & STATE
════════════════════════════════ */
const FORM_NAME_PR    = 'Purchase_Request1';
const REPORT_ITEMS_PR = 'All_Items';
const REPORT_CUST_PR  = 'All_Customers';
const REPORT_SUPP_PR  = 'All_Suppliers';
const REPORT_INQ_PR   = 'All_Inquiries';
/* Add Item by ID — same shared, app-level Custom API the Inquiry widget's own
   "+ Add item by ID" flow uses (Widget\Proc\Inquiry\app\index.html) — not
   form-specific, safe to call from here with the identical api_name/public_key. */
const CUSTOM_API_ADD_ITEM     = 'add_item_by_id';
const CUSTOM_API_ADD_ITEM_KEY = 'yjWf2kbeuBRHJpEDzKy8RuQyR';

let NPR_ITEMS     = [];   /* loaded from All_Items */
let NPR_CUSTOMERS = [];   /* loaded from All_Customers */
let NPR_SUPPLIERS = [];   /* loaded from All_Suppliers */
let NPR_INQUIRIES = [];   /* loaded from All_Inquiries */
let newPRPriority = 'MEDIUM';
let nprDropsLoaded = false;
let nprAttachedFiles = [];   /* files picked for the Attachments field, uploaded after the PR record is created */

/* ════════════════════════════════
   NEW PR — LOAD DROPDOWNS FROM CREATOR
════════════════════════════════ */
function loadNewPRDropdowns(){
  if(nprDropsLoaded) return;
  if(typeof ZOHO==='undefined'||!ZOHO.CREATOR||!ZOHO.CREATOR.DATA) return;

  const gr  = ZOHO.CREATOR.DATA.getRecords.bind(ZOHO.CREATOR.DATA);
  const opt = {page:1,pageSize:200};

  function dpv(obj){ /* display value from Creator object or string — never returns [object Object] */
    if(!obj) return '';
    if(typeof obj==='object') return obj.zc_display_value||obj.display_value||obj.Name||obj.name||obj.Supplier_Name||obj.ID||'';
    var s=String(obj); return (s==='[object Object]'||/^\[object/.test(s)) ? '' : s;
  }
  function addOpt(selId, val, label){
    var o=document.createElement('option'); o.value=val; o.textContent=label;
    var el=$(selId); if(el) el.appendChild(o);
  }

  /* FIXED 2026-08-25, real bug reported live ("Item kulang kulang" — the Item Name
     picker on New Purchase Request wasn't showing every catalog item). page:1/
     pageSize:200 above only ever fetches the FIRST 200 rows of a report — All_Items
     has more than that, so every item past #200 silently never reached NPR_ITEMS or
     the dropdown. Same bug class already confirmed and fixed in the sibling Inquiry
     widget (Widget\Proc\Inquiry\app\index.html's own fetchAllRecords()) — Creator's
     getRecords caps a single call at 1000 records regardless, so a report bigger than
     that also needs cursor-based paging via record_cursor to get the rest. Scoped to
     Items only (the reported gap) — Customers/Suppliers/Inquiries below still use the
     original 200-row opt, unchanged. */
  function fetchAllItemRecords(){
    var all = [];
    var cursor = null;
    var guard = 0;
    function nextPage(){
      var cfg = {report_name:REPORT_ITEMS_PR, max_records:1000};
      if(cursor) cfg.record_cursor = cursor;
      return gr(cfg).then(function(resp){
        if(!(resp && resp.code===3000 && Array.isArray(resp.data))) return {code:3000,data:all};
        all = all.concat(resp.data);
        cursor = resp.record_cursor || null;
        guard++;
        if(cursor && guard < 20) return nextPage();
        return {code:3000,data:all};
      });
    }
    return nextPage();
  }

  /* Items — field names confirmed against the sibling Inquiry app (Inq.html), which reads
     this exact All_Items report: item_name, SKU, Description, Unit, Rate */
  fetchAllItemRecords().then(function(r){
    if(r&&r.code===3000&&Array.isArray(r.data)){
      NPR_ITEMS = r.data.map(function(i){
        return {
          ID:          i.ID,
          name:        dpv(i.item_name)||'(unnamed item)',
          sku:         dpv(i.SKU)||'',
          category:    i.category||i.Category||dpv(i.category)||'',
          description: dpv(i.Description)||'',
          rate:        parseFloat(String(dpv(i.Rate)||'0').replace(/[^0-9.]/g,''))||0,
          photo:       i.Product_Image||null   /* item's own photo — previewed on selection */
        };
      });
      /* Item picker is a custom searchable combo (not a native <select>) —
         see renderItemOptions()/selectItemOption(), rendered on demand from NPR_ITEMS */

      /* mapPR() runs (via the parallel All_Purchase_Request fetch) before this Items fetch is
         guaranteed to finish, so its item-description lookup can miss on the first pass —
         patch the already-mapped PR rows now that NPR_ITEMS is actually here, then re-render. */
      ALL_PR.forEach(function(pr){
        var item = NPR_ITEMS.find(function(it){ return String(it.ID)===String(pr.itemId); });
        if(item && item.description) pr.description = item.description;
        /* Re-derive price display/approval now that the item's real catalog Rate is
           known — mapPR()'s first pass may have run before NPR_ITEMS was loaded and
           defaulted itemRateVal to 0. */
        var realRate = (item && item.rate) || 0;
        pr.itemRateVal = realRate;   /* keep in sync — srpApprovedInfo()'s catalog check reads this */
        var pi = computePriceInfo(pr.finalPriceConfirmed, pr.srpRatePR, realRate, pr.hasInqRef, pr.srpApprovedPR);
        pr.finalPrice = pi.fpDisplay;
        pr.priceSource = pi.priceSource;
        pr.priceIsSrp = pi.priceSource === 'srp';
        pr.priceIsCatalog = pi.priceSource === 'catalog';
        pr.priceApproved = pi.priceApproved;
        if(pr.selectedSupplier && pi.priceApproved && pr.shipMode && pr.shipMode!=='—' && pr.status==='For Sourcing'){
          pr.status = 'Ready for PO';
        }
      });
      /* Same re-patch for the separate PO_Grouping report's own rows (mapGroupRow() has
         no NPR_ITEMS access on its own first pass either — see that function's own
         comment) — GROUP_ALL/GROUP_BUCKETS are a fully independent fetch+map from
         ALL_PR, don't share row objects, so this needs its own pass. */
      GROUP_ALL.forEach(function(gr){
        /* CHANGED 2026-07-15 (matches mapGroupRow()'s own change, same day) — Grouping
           Workspace display stays the raw quote (finalPriceConfirmed) even after Items
           load; no SRP/catalog fallback re-applied here either. */
        gr.finalPrice = gr.finalPriceConfirmed;
        gr.priceSource = 'quote';
      });
      buildGroupBuckets();
      if($('groupCardsWrap')) renderGroupCards();
      renderQueue(); renderAllPRs(); renderConverted();

      /* FIXED 2026-07-21, real bug ("final price still unchecked in widget but checked
         in native" — confirmed via API the item genuinely has a real catalog Rate,
         e.g. Agnar SKU AGNAR-NNMGNTC-M-WHT, Rate=1005) — openDetailView()'s own
         getRecordById re-map (`_currentMappedPR = mapPR(resp.data)`) creates a NEW
         object, disconnected from this ALL_PR array — the re-patch loop above only
         updates ALL_PR's own elements, so a Detail view already open when Items
         finishes loading (a real race — getRecordById and this Items fetch run in
         parallel, either can resolve first) never picks up the corrected itemRateVal/
         priceApproved, staying stuck on whatever NPR_ITEMS looked like at the moment
         Detail opened. Re-sync + re-render the currently-open Detail view here too. */
      /* FIXED same day — this re-render must NEVER fire while the user is mid-edit
         (_editMode true): it would blow away whatever they'd already picked/typed in
         the edit-mode inputs (e.g. a just-selected Supplier) by re-rendering the whole
         Detail view back to its display/edit-mode-open state. Only safe to patch data
         silently when the user isn't actively editing. */
      if(!_editMode && _currentMappedPR && document.getElementById('view-detail') &&
         document.getElementById('view-detail').style.display !== 'none'){
        var openPR = ALL_PR.find(function(p){ return String(p.id)===String(_currentMappedPR.id); });
        if(openPR){
          _currentMappedPR = openPR;
          var dOpen = buildDetailFromPR(openPR);
          renderDetailView(openPR, dOpen, openPR);
        }
      }
    }
  }).catch(function(e){ console.warn('[New-PR] Items load failed:',e); });

  /* Customers — field names confirmed against the sibling Inquiry app (Inq.html), which
     reads this exact All_Customers report: customer_name, Customer_Type */
  gr({report_name:REPORT_CUST_PR,...opt}).then(function(r){
    if(r&&r.code===3000&&Array.isArray(r.data)){
      NPR_CUSTOMERS = r.data.map(function(c){
        return {
          ID:   c.ID,
          name: dpv(c.customer_name)||'(unnamed customer)',
          type: dpv(c.Customer_Type)||''
        };
      });
      NPR_CUSTOMERS.forEach(function(c){ addOpt('nCustomer', c.ID, c.name); });
    }
  }).catch(function(e){ console.warn('[New-PR] Customers load failed:',e); });

  /* Suppliers — Selected_Supplier is a TEXT field → value = display name */
  gr({report_name:REPORT_SUPP_PR,...opt}).then(function(r){
    if(r&&r.code===3000&&Array.isArray(r.data)){
      NPR_SUPPLIERS = r.data;
      NPR_SUPPLIERS.forEach(function(s){
        /* Supplier_Name may return as object — wrap each candidate with dpv() */
        var nm = dpv(s.Supplier_Name)||dpv(s.Name)||dpv(s.name)||dpv(s.Supplier)||String(s.ID||'');
        if(!nm||nm==='[object Object]') return;
        addOpt('nSupplier', nm, nm); /* value = name string (text field) */
      });
      /* Rec. Supplier column on the main list only becomes accurate once supplier data is
         in — re-render whichever tab is already on screen so it doesn't stay stuck on "—". */
      renderQueue(); renderAllPRs(); renderConverted();
    }
  }).catch(function(e){ console.warn('[New-PR] Suppliers load failed:',e); });

  /* Inquiries — inquiry_reference is a list lookup → send record ID */
  gr({report_name:REPORT_INQ_PR,...opt}).then(function(r){
    if(r&&r.code===3000&&Array.isArray(r.data)){
      NPR_INQUIRIES = r.data;
      NPR_INQUIRIES.forEach(function(inq){
        var label = inq.INQ_No||dpv(inq.INQ_No)||inq.ID;
        addOpt('nInqRef', inq.ID, label); /* value = Inquiry record ID */
      });
    }
  }).catch(function(e){ console.warn('[New-PR] Inquiries load failed (optional):',e); });

  /* Sales Owner — picklist in Creator, hardcoded. Real stored values are prefixed
     "HC " (confirmed from existing records, e.g. "HC Sales 1") — sending the bare
     "Sales 1" form fails with "Invalid column value for Sales_Owner". */
  ['HC Sales 1','HC Sales 2','HC Sales 3','HC Sales 4','HC Sales 5',
   'HC Sales 6','HC Sales 7','HC Sales 8','HC Sales 9','HC Sales Coordinator'].forEach(function(s){
    addOpt('nSalesOwner', s, s);
  });

  nprDropsLoaded = true;
}

function openNewPR(){
  newPRPriority = 'MEDIUM';
  loadNewPRDropdowns();
  resetNewPRForm();
  showView('new');
  window.scrollTo(0,0);
}

/* The six item specifications live on the Inquiry (added there 2026-10-19) and are carried
   to the PR by so_to_pr.txt for SO-driven PRs. A PR raised by hand here does the same thing
   from whichever Inquiry the INQ Reference points at. Only blank boxes are filled, so a
   value typed before picking the INQ is never overwritten; clearing the INQ clears nothing. */
var NPR_SPEC_FIELDS = [
  ['nSpecDimension','Dimension'],
  ['nSpecColorBody','Color_Body'],
  ['nSpecColorTemp','Color_Temperature'],
  ['nSpecBulbType','Type_of_Bulb'],
  ['nSpecVoltage','Voltage'],
  ['nSpecLumens','Lumens'],
];
function fillSpecsFromInq(){
  var id = $('nInqRef') ? $('nInqRef').value : '';
  if(!id) return;
  var inq = NPR_INQUIRIES.find(function(x){ return String(x.ID) === String(id); });
  if(!inq) return;
  NPR_SPEC_FIELDS.forEach(function(pair){
    var box = $(pair[0]);
    if(!box || readSpecChoice(pair[0]).trim()) return;
    var v = dpv(inq[pair[1]]) || '';
    if(pair[0] === 'nSpecColorTemp' || pair[0] === 'nSpecBulbType') writeSpecChoice(pair[0], v);
    else box.value = v;
  });
}
function resetNewPRForm(){
  $('nPRNoBadge').textContent = generatePRNo();
  const today = new Date().toLocaleDateString('en-PH',{year:'numeric',month:'short',day:'numeric'});
  $('nPRDate').textContent = today;
  ['nItemSku','nCustomer','nCustomerType','nSalesOwner','nSupplier','nShipMode','nInqRef'].forEach(function(id){
    if($(id)) $(id).value='';
  });
  if($('nSourcingType')) $('nSourcingType').value = 'Import';
  if($('nSupplier')) $('nSupplier').disabled = false;
  if($('nFollowedRec')) $('nFollowedRec').disabled = false;
  if($('nShipMode')) $('nShipMode').disabled = false;
  if($('nItemComboLabel')){ $('nItemComboLabel').textContent='— Select item —'; $('nItemComboLabel').classList.add('muted'); }
  $('nFollowedRec').value = 'Yes';
  $('nOverrideRow').style.display = 'none';
  ['nSku','nDesc','nCategory','nOverrideReason'].forEach(function(id){ if($(id)) $(id).value=''; });
  ['nSpecDimension','nSpecColorBody','nSpecVoltage','nSpecLumens'].forEach(function(id){ if($(id)) $(id).value=''; });
  writeSpecChoice('nSpecColorTemp','');
  writeSpecChoice('nSpecBulbType','');
  ['nQty','nFinalPrice'].forEach(function(id){ if($(id)) $(id).value=''; });
  if($('nTargetDate')) $('nTargetDate').value='';
  if($('nUnit')) $('nUnit').value='pcs';
  if($('nSoNo')) $('nSoNo').value='';
  if($('nSimilarItem')) $('nSimilarItem').checked=false;
  if($('nNotes')) $('nNotes').value='';
  if($('nProductImageWrap')){ $('nProductImageWrap').style.display='none'; $('nProductImage').src=''; }
  nprAttachedFiles = [];
  if($('nFileChips')) $('nFileChips').innerHTML='';
  selectPriority('MEDIUM');
  updatePRSummary();
}

function onItemSelect(){
  const id  = $('nItemSku').value;
  const it  = NPR_ITEMS.find(function(i){ return i.ID===id; });
  if(it){
    if($('nSku'))      $('nSku').value      = it.sku||'';
    if($('nDesc'))     $('nDesc').value     = it.description||'';
    if($('nCategory')) $('nCategory').value = it.category||'';
  } else {
    if($('nSku'))      $('nSku').value      = '';
    if($('nDesc'))     $('nDesc').value     = '';
    if($('nCategory')) $('nCategory').value = '';
  }
  console.log('[New-PR] Item photo for', it&&it.name, ':', JSON.stringify(it&&it.photo));
  if(it && it.photo){
    $('nProductImageWrap').style.display = '';
    $('nProductImage').src = '';
    applyCreatorImage($('nProductImage'), it.photo);
  } else {
    $('nProductImageWrap').style.display = 'none';
    $('nProductImage').src = '';
  }
  updatePRSummary();
}

function onCustomerSelect(){
  const id = $('nCustomer').value;
  const c  = NPR_CUSTOMERS.find(function(x){ return x.ID===id; });
  const typeSel = $('nCustomerType');
  if(c && c.type){
    /* Only apply it if it matches one of the picklist's own options exactly */
    const match = Array.prototype.find.call(typeSel.options, function(o){ return o.value===c.type; });
    if(match) typeSel.value = c.type;
  }
  updatePRSummary();
}

/* ── Attachments — file picker + chips, uploaded to the record once it's created ── */
function renderNPRFileChips(){
  $('nFileChips').innerHTML = nprAttachedFiles.map(function(f,i){
    var isImg = f.type.startsWith('image/');
    var thumb = isImg ? '<img src="'+URL.createObjectURL(f)+'" />' : '&#128206;';
    return '<span class="file-chip">'+thumb+'<span class="file-chip-name" title="'+escapeHtml(f.name)+'">'+escapeHtml(f.name)+'</span><button type="button" class="file-chip-del" onclick="removeNPRFile('+i+')" title="Remove">&#215;</button></span>';
  }).join('');
}
function removeNPRFile(i){ nprAttachedFiles.splice(i,1); renderNPRFileChips(); }
$('nAttachments').addEventListener('change', function(){
  Array.prototype.forEach.call(this.files, function(f){ nprAttachedFiles.push(f); });
  renderNPRFileChips();
  this.value = '';
});

/* ── Item picker: custom searchable combo, capped to ~5 visible rows ── */
/* Color_Temperature and Type_of_Bulb are Creator Dropdowns on Purchase_Request1, with
   "Allow Other Choice" ON — same as the Inquiry they are copied from. So the PR form
   offers the same choices rather than free text, plus an Other box for anything the
   Inquiry recorded outside the list. */
const BULB_TYPE_OPTIONS = [
  "A60 - E27",
  "LED Strip",
  "A60 - E27 Dimmable",
  "c35 - L E14",
  "c35 - L E14 Dimmable",
  "Corn type E14",
  "Corn type E14 Dimmable",
  "Corn type E27",
  "Corn type E27 Dimmable",
  "E14-Candle",
  "G4",
  "G4 Dimmable",
  "G4 Jelly",
  "G9",
  "G-95",
  "G9 Dimmable",
  "G45 - E27",
  "G45 - E27 Dimmable",
  "G80 - E27",
  "G125 - E27",
  "GU10",
  "GU10 Dimmable",
  "ST64",
];
/* Value to save: the picked option, or whatever was typed under Other. */
function readSpecChoice(id){
  const el = $(id), other = $(id + 'Other');
  if(!el) return '';
  if(el.value === '__other__') return other ? other.value.trim() : '';
  return el.value;
}
/* Value from a record: pick the matching option, else drop into Other with the text. */
function writeSpecChoice(id, value){
  const el = $(id), other = $(id + 'Other');
  if(!el) return;
  const v = (value == null ? '' : String(value)).trim();
  const known = (id === 'nSpecBulbType')
    ? BULB_TYPE_OPTIONS.indexOf(v) > -1
    : Array.prototype.some.call(el.options || [], function(o){ return o.value === v; });
  if(v && !known){
    el.value = '__other__';
    if(other){ other.value = v; other.style.display = ''; }
  } else {
    el.value = v;
    if(other){ other.value = ''; other.style.display = 'none'; }
  }
  if(id === 'nSpecBulbType') setBulbLabel();
}
function syncSpecOther(id){
  const el = $(id), other = $(id + 'Other');
  if(!el || !other) return;
  const on = el.value === '__other__';
  other.style.display = on ? '' : 'none';
  if(on) other.focus(); else other.value = '';
}
function setBulbLabel(){
  const v = $('nSpecBulbType').value, lab = $('nSpecBulbTypeLabel');
  if(!v){ lab.textContent = '\u2014 Select \u2014'; lab.classList.add('muted'); }
  else if(v === '__other__'){ lab.textContent = 'Other \u2014 type it below'; lab.classList.remove('muted'); }
  else { lab.textContent = v; lab.classList.remove('muted'); }
}
function renderBulbOptions(){
  const q = $('nSpecBulbTypeSearch').value.trim().toLowerCase();
  const cur = $('nSpecBulbType').value;
  const list = BULB_TYPE_OPTIONS.filter(function(o){ return !q || o.toLowerCase().indexOf(q) > -1; });
  let html = '';
  if(!q) html += '<div class="combo-option' + (cur ? '' : ' active') + '" data-v="">\u2014 Select \u2014</div>';
  list.forEach(function(o){
    html += '<div class="combo-option' + (o === cur ? ' active' : '') + '" data-v="' + escapeHtml(o) + '">' + escapeHtml(o) + '</div>';
  });
  if(!list.length) html += '<div class="combo-option" style="color:var(--gray-400);cursor:default">No match \u2014 use Other below.</div>';
  const box = $('nSpecBulbTypeList');
  box.innerHTML = html;
  box.querySelectorAll('.combo-option[data-v]').forEach(function(el){
    el.addEventListener('click', function(){ pickBulbType(el.getAttribute('data-v')); });
  });
}
function pickBulbType(v){
  $('nSpecBulbType').value = v;
  setBulbLabel();
  toggleBulbDropdown(false);
  syncSpecOther('nSpecBulbType');
}
function toggleBulbDropdown(forceOpen){
  const panel = $('nSpecBulbTypePanel');
  const willOpen = forceOpen !== undefined ? forceOpen : panel.style.display === 'none';
  panel.style.display = willOpen ? 'block' : 'none';
  if(willOpen){
    $('nSpecBulbTypeSearch').value = '';
    renderBulbOptions();
    setTimeout(function(){ $('nSpecBulbTypeSearch').focus(); }, 0);
  }
}
function toggleItemDropdown(forceOpen){
  const panel = $('nItemComboPanel');
  const willOpen = forceOpen!==undefined ? forceOpen : panel.style.display==='none';
  panel.style.display = willOpen ? 'block' : 'none';
  if(willOpen){
    $('nItemComboSearch').value = '';
    renderItemOptions();
    setTimeout(function(){ $('nItemComboSearch').focus(); },0);
  }
}

function renderItemOptions(){
  const q = $('nItemComboSearch').value.trim().toLowerCase();
  const list = $('nItemComboList');
  const currentId = $('nItemSku').value;
  const filtered = NPR_ITEMS.filter(function(it){
    if(!q) return true;
    return (it.name+' '+it.sku).toLowerCase().includes(q);
  });
  /* "+ Add item by ID" always shows at the bottom of the list — not just on a
     miss — same convention as the Inquiry widget's own item picker, so a
     supplier's brand-new item can be pulled from Books even if the person
     typing doesn't know yet whether it's already in the catalog. Pinned via
     .combo-option-add (position:sticky) so it stays visible without scrolling
     through the whole catalog first — plain .combo-option alone would just be
     the last (usually off-screen) row of the scrollable list. */
  const addNewHtml = '<div class="combo-option combo-option-add" style="color:var(--orange);font-weight:600" onclick="openNewItemModal()">+ Add item by ID (not in catalog yet)</div>';
  const optionsHtml = filtered.length
    ? filtered.map(function(it){
        return `<div class="combo-option${currentId===it.ID?' active':''}" onclick="selectItemOption('${it.ID}')">${it.name}</div>`;
      }).join('')
    : '<div class="combo-empty">No items found</div>';
  list.innerHTML = optionsHtml + addNewHtml;
}

function selectItemOption(id){
  $('nItemSku').value = id;
  const it = NPR_ITEMS.find(function(i){ return i.ID===id; });
  const lbl = $('nItemComboLabel');
  lbl.textContent = it ? it.name : '— Select item —';
  lbl.classList.toggle('muted', !it);
  toggleItemDropdown(false);
  onItemSelect();
}

/* ── Add Item by ID — pulls a brand-new item straight from Zoho Books when it isn't in
   the All_Items catalog yet, same Custom API + response shape as the Inquiry widget's
   own copy of this feature. Ported (not just referenced) since this is a separate
   widget with no shared JS file between the two. ── */
function openNewItemModal(){
  toggleItemDropdown(false);
  $('niItemId').value = '';
  $('newItemModal').style.display = 'flex';
}
function closeNewItemModal(){
  $('newItemModal').style.display = 'none';
}
async function saveNewItem(){
  clearFieldErrors();
  var itemId = $('niItemId').value.trim();
  if(!itemId){ showToast('Item ID is required'); highlightFieldError('niItemId'); return; }
  if(typeof ZOHO==='undefined'||!ZOHO.CREATOR||!ZOHO.CREATOR.DATA||typeof ZOHO.CREATOR.DATA.invokeCustomApi!=='function'){
    showToast('Creator API not available — widget must be uploaded to Creator.');
    return;
  }
  var btn = $('niSaveBtn');
  btn.disabled = true; btn.textContent = 'Fetching from Books…';
  try{
    var resp = await ZOHO.CREATOR.DATA.invokeCustomApi({
      api_name: CUSTOM_API_ADD_ITEM,
      http_method: 'POST',
      content_type: 'application/json',
      payload: { itemBooksId: itemId },
      public_key: CUSTOM_API_ADD_ITEM_KEY
    });
    var result = (resp && resp.data) ? resp.data : (resp && resp.result) ? resp.result : resp;
    console.log('[New-PR] addItemByIdBooks result:', JSON.stringify(result));
    if(result && result.status === 'success'){
      var newItem = {
        ID:          result.recordId,
        name:        result.item_name || '(unnamed item)',
        sku:         result.SKU || '',
        category:    result.category || '',
        description: result.Description || '',
        rate:        parseFloat(result.Rate) || 0,
        photo:       null /* not synced by this API — same gap as the Inquiry widget's own copy */
      };
      /* Upsert into NPR_ITEMS too — replace if this record ID already existed locally, push if new */
      var existingIdx = -1;
      for(var i=0;i<NPR_ITEMS.length;i++){ if(String(NPR_ITEMS[i].ID)===String(newItem.ID)){ existingIdx = i; break; } }
      if(existingIdx > -1) NPR_ITEMS[existingIdx] = newItem; else NPR_ITEMS.push(newItem);
      closeNewItemModal();
      selectItemOption(newItem.ID);
      showToast(result.message || 'Item added');
    } else {
      showToast((result && result.message) || 'Could not add item — see console');
    }
  } catch(err){
    console.error('[New-PR] addItemByIdBooks call failed:', err);
    showToast('Error adding item — see console');
  } finally {
    btn.disabled = false; btn.textContent = 'Add Item';
  }
}

document.addEventListener('click', function(e){
  const combo = $('nItemCombo');
  if(combo && !combo.contains(e.target)) toggleItemDropdown(false);
  const bulb = $('nSpecBulbTypeCombo');
  if(bulb && !bulb.contains(e.target)) toggleBulbDropdown(false);
});

/* Auto-syncs "Followed Recommendation" the moment a supplier is picked, so Override
   Reason is only ever required when the pick genuinely differs from the recommended
   supplier — fixes real gate-blocking bug: picking the recommended supplier still left
   Override Reason required because Followed_Recommendation was 100% manual and easy to
   leave on "No"/stale. User can still flip it manually after if they want to record an
   override for a supplier that happens to match (edge case, not blocked either way). */
/* Sourcing Type "Local" (HC System) — no external supplier, no quote/recommendation
   cycle, and Books is skipped entirely server-side (pr_sync_supplier_selected.txt /
   receiving_create_bin_receiving.txt). Widget-side: locks Selected Supplier to "HC
   System" and hides the recommendation/override UI, which doesn't apply here.
   ALSO, per user ("wala namang lcl, fcl at air pag sa local lang") — Local never has
   an external freight leg, so Shipping Mode doesn't apply either; locked blank/
   disabled here, and pr_check_readiness.txt's own "Shipping mode selected" condition
   is auto-satisfied server-side for Local so this never blocks PR_READY_FOR_PO. */
function onNewPRSourcingTypeChange(){
  const isLocal = $('nSourcingType').value === 'Local';
  const suppSel = $('nSupplier');
  const shipSel = $('nShipMode');
  if(isLocal){
    suppSel.value = 'HC System';
    suppSel.disabled = true;
    $('nFollowedRec').value = 'Yes';
    $('nFollowedRec').disabled = true;
    $('nOverrideRow').style.display = 'none';
    shipSel.value = '';
    shipSel.disabled = true;
  } else {
    suppSel.disabled = false;
    $('nFollowedRec').disabled = false;
    if(suppSel.value === 'HC System') suppSel.value = '';
    shipSel.disabled = false;
  }
  updatePRSummary();
}
function onNewPRSupplierChange(){
  updatePRSummary();
  const sup = $('nSupplier').value;
  const cat = $('nCategory').value;
  if(sup && cat && cat!=='—'){
    const rec = computeRecommendedSupplier(cat);
    $('nFollowedRec').value = supplierKeyMatch(sup, rec) ? 'Yes' : 'No';
    onFollowedRecChange();
  }
}
function onFollowedRecChange(){
  $('nOverrideRow').style.display = $('nFollowedRec').value==='No' ? '' : 'none';
}

function selectPriority(p){
  newPRPriority = p;
  document.querySelectorAll('#nPriPicker .pri-pill-btn').forEach(function(btn){
    btn.className='pri-pill-btn';
    if(btn.dataset.pri===p){
      btn.classList.add(p==='HIGH'?'active-high':p==='MEDIUM'?'active-med':'active-low');
    }
  });
  updatePRSummary();
}

const NPC_FIELDS = [
  {id:'nItemSku',       lbl:'Item / SKU'},
  {id:'nTargetDate',    lbl:'Target Date'},
  {id:'nQty',           lbl:'Quantity'},
  {id:'nCustomer',      lbl:'Customer'},
  {id:'nCustomerType',  lbl:'Customer Type'},
  {id:'nSalesOwner',    lbl:'Sales Owner'},
  /* Selected Supplier, Final Price, and Shipping Mode are auto-filled later — not required to submit */
];

function updatePRSummary(){
  const itemId = $('nItemSku').value;
  const item   = NPR_ITEMS.find(function(i){ return i.ID===itemId; });
  const price  = parseFloat($('nFinalPrice').value||'0');
  const today  = new Date().toLocaleDateString('en-PH',{year:'numeric',month:'short',day:'numeric'});

  $('nSumPRNo').textContent = $('nPRNoBadge').textContent || generatePRNo();
  $('nSumDate').textContent = today;
  $('nSumSku').innerHTML    = item
    ? `<span class="cell-sku">${item.sku}</span>`
    : '<span style="color:var(--gray-300)">—</span>';

  /* Show display name not raw ID */
  const custSel = $('nCustomer');
  const suppSel = $('nSupplier');
  $('nSumCustomer').textContent = (custSel&&custSel.selectedIndex>0 ? custSel.options[custSel.selectedIndex].text : null)||'—';
  $('nSumSupplier').textContent = (suppSel&&suppSel.selectedIndex>0 ? suppSel.options[suppSel.selectedIndex].text : null)||'—';

  $('nSumPrice').textContent    = price>0 ? '¥'+price.toLocaleString('en-PH') : '—';
  $('nSumPriority').innerHTML   = priorityHtml(newPRPriority);
  $('nSumShip').textContent     = ($('nShipMode')&&$('nShipMode').value)||'—';

  $('nChecklist').innerHTML = NPC_FIELDS.map(function(f){
    const el=$(f.id);
    var ok = false;
    if(f.id==='nQty')        ok = parseInt(el&&el.value||'0')>0;
    else if(f.id==='nFinalPrice') ok = price>0;
    else                      ok = !!(el&&el.value&&el.value.trim());
    return `<div class="prc-row"><span class="prc-dot${ok?' ok':''}"></span><span class="prc-lbl${ok?' ok':''}">${f.lbl}</span></div>`;
  }).join('');
}

/* ════════════════════════════════
   FIELD-LEVEL ERROR HIGHLIGHT (2026-07-14, per user — same pattern as INQs/app/
   index.html's New Inquiry form and the supplier widgets) — marks each missing field
   red, shakes it, scrolls the first one into view, clears once the user edits it.
════════════════════════════════ */
function clearFieldErrors(){
  document.querySelectorAll('.field-error').forEach(function(el){ el.classList.remove('field-error'); });
}
function highlightFieldError(id){
  var el = $(id);
  if(!el) return;
  el.classList.add('field-error');
  var clear = function(){ el.classList.remove('field-error'); el.removeEventListener('input', clear); el.removeEventListener('change', clear); };
  el.addEventListener('input', clear);
  el.addEventListener('change', clear);
}

/* ════════════════════════════════
   NEW PR — SUBMIT
════════════════════════════════ */
function submitNewPR(){
  clearFieldErrors();
  /* Validate required fields */
  const missingFields = NPC_FIELDS.filter(function(f){
    const el=$(f.id);
    if(f.id==='nQty')        return !(parseInt(el&&el.value||'0')>0);
    if(f.id==='nFinalPrice') return !(parseFloat(el&&el.value||'0')>0);
    return !el||!el.value||!el.value.trim();
  });
  const missing = missingFields.map(function(f){ return f.lbl; });

  /* Override Reason is only required when the recommendation wasn't followed */
  const overrideMissing = ($('nFollowedRec').value==='No' && !$('nOverrideReason').value.trim());
  if(overrideMissing) missing.push('Override Reason');

  if(missing.length){
    showToast('Missing: '+missing.slice(0,3).join(', ')+(missing.length>3?' (+more)':''));
    missingFields.forEach(function(f){ highlightFieldError(f.id); });
    if(overrideMissing) highlightFieldError('nOverrideReason');
    const firstId = missingFields.length ? missingFields[0].id : (overrideMissing ? 'nOverrideReason' : null);
    if(firstId){ const firstEl=$(firstId); if(firstEl) firstEl.scrollIntoView({behavior:'smooth', block:'center'}); }
    return;
  }

  const btn=$('btnNPRSubmit')||document.querySelector('#view-new .btn-sm[onclick="submitNewPR()"]');
  if(btn){ btn.disabled=true; btn.innerHTML='<span style="display:inline-block;width:12px;height:12px;border:2px solid rgba(255,255,255,.4);border-top-color:#fff;border-radius:50%;animation:spin .7s linear infinite;vertical-align:middle;margin-right:6px"></span>Saving…'; }

  const prNo    = $('nPRNoBadge').textContent || generatePRNo();
  /* Zoho's date fields only accept plain "YYYY-MM-DD" via addRecords — DD-MMM-YYYY and
     MM/DD/YYYY are both rejected with "Enter a valid date format" (confirmed against the
     live form). <input type="date"> already gives YYYY-MM-DD, so send it through unchanged. */
  const today   = (function(){
    var d=new Date(); var pad=function(n){return String(n).padStart(2,'0');};
    return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());
  })();
  function fmtDP(v){ return v||''; }

  /* Selected_Supplier is a TEXT field → send display name */
  const suppSel   = $('nSupplier');
  const suppName  = (suppSel&&suppSel.selectedIndex>0) ? suppSel.options[suppSel.selectedIndex].text : (suppSel&&suppSel.value||'');

  const payload = {
    PR_No:                   prNo,
    Items:                   $('nItemSku').value,        /* lookup → plain ID */
    Customer:                $('nCustomer').value,       /* lookup → plain ID */
    Customer_Type:           $('nCustomerType').value,
    Sales_Owner:             $('nSalesOwner').value,
    quantity:                String(parseFloat($('nQty').value)||0),
    unit:                    $('nUnit').value,
    supplier_target_date:    fmtDP($('nTargetDate').value),
    Target_Delivery:         fmtDP($('nTargetDate').value),
    category:                $('nCategory').value,
    sku:                     $('nSku').value,
    description:             $('nDesc').value,
    inquiry_reference:       $('nInqRef').value,         /* Inquiry record ID */
    Sales_Order:             $('nSoNo').value,
    Selected_Supplier:       suppName,                   /* text field → name */
    Followed_Recommendation: $('nFollowedRec').value,
    Override_Reason:         $('nFollowedRec').value==='No' ? $('nOverrideReason').value : '',
    Selcted_Final_Cost:      String(parseFloat($('nFinalPrice').value)||0),
    Shipment_Mode:           $('nShipMode').value,       /* Airfreight / LCL / FCL */
    Priority:                newPRPriority,              /* HIGH / MEDIUM / LOW */
    PR_Date:                 today,
    Sourcing_Type:           $('nSourcingType') ? $('nSourcingType').value : 'Import',
    Dimension:               $('nSpecDimension') ? $('nSpecDimension').value.trim() : '',
    Color_Body:              $('nSpecColorBody') ? $('nSpecColorBody').value.trim() : '',
    Color_Temperature:       readSpecChoice('nSpecColorTemp'),
    Type_of_Bulb:            readSpecChoice('nSpecBulbType'),
    Voltage:                 $('nSpecVoltage') ? $('nSpecVoltage').value.trim() : '',
    Lumens:                  $('nSpecLumens') ? $('nSpecLumens').value.trim() : '',
  };

  /* Checkbox — boolean true only; never false */
  if($('nSimilarItem')&&$('nSimilarItem').checked) payload.Similar_Item = true;

  /* Strip empty / null / false / undefined */
  const clean = {};
  Object.keys(payload).forEach(function(k){
    var v=payload[k];
    if(v===false||v===null||v===undefined||v==='') return;
    clean[k]=v;
  });

  console.log('[New-PR] Submitting payload:', JSON.stringify(clean, null, 2));

  async function onSuccess(newId){
    if(btn){ btn.disabled=false; btn.innerHTML='Submit PR &#8594;'; }
    if(nprAttachedFiles.length && newId){
      showToast('Uploading '+nprAttachedFiles.length+' file(s)…');
      const uploadOk = await uploadFilesTo(newId, 'Attachments', nprAttachedFiles);
      showToast(uploadOk ? (prNo+' saved with attachments!') : (prNo+' saved — some files failed, attach via Zoho Creator.'));
    } else if(nprAttachedFiles.length){
      showToast(prNo+' saved, but no record ID returned — attach files via Zoho Creator.');
    } else {
      showToast(prNo+' created successfully!');
    }
    /* Refresh the PR list in background */
    setTimeout(function(){ loadFromCreator(); showView('list'); }, 800);
  }
  /* TEMP DIAGNOSTIC, added 2026-09-05 — persistent on-screen box (not the
     3s-auto-dismissing toast) showing the FULL raw error response plus the
     exact payload sent, so this can just be screenshotted (same pattern
     already proven in Exception Control's own createQcRecordForCompleted
     debugging, 2026-09-04). Investigating a live "Invalid Configuration!!!"
     error on New PR submit — remove this whole block once the real cause is
     confirmed fixed. */
  function showDiagBox(html){
    var old = document.getElementById('nprDiagBox');
    if(old) old.remove();
    var box = document.createElement('div');
    box.id = 'nprDiagBox';
    box.style.cssText = 'position:fixed;top:16px;left:16px;right:16px;max-width:640px;margin:0 auto;z-index:99999;background:#111827;color:#f9fafb;font:12px/1.5 monospace;padding:14px 16px;border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,.35);white-space:pre-wrap;word-break:break-word;max-height:70vh;overflow:auto;';
    box.innerHTML = html + '<div style="text-align:right;margin-top:10px;"><button onclick="document.getElementById(\'nprDiagBox\').remove()" style="background:#374151;color:#fff;border:none;padding:5px 12px;border-radius:6px;cursor:pointer;font:12px monospace;">Close</button></div>';
    document.body.appendChild(box);
  }
  function onError(resp, primaryErr){
    if(btn){ btn.disabled=false; btn.innerHTML='Submit PR &#8594;'; }
    var msg = (resp&&(resp.message||resp.error))||JSON.stringify(resp).substring(0,120);
    console.error('[New-PR] addRecords error:', JSON.stringify(resp));
    showToast('Save failed: '+msg);
    var html = '<b>Payload sent:</b><br>'+JSON.stringify(clean, null, 1).replace(/</g,'&lt;');
    /* The fallback (invokeCustomApi) almost always just returns a generic
       "Invalid Configuration" from its own guessed owner/app names — the
       PRIMARY addRecords error (when it exists) is the one that actually
       names the real cause (bad field/lookup value), so show it FIRST and
       separately instead of letting the fallback's noise bury it. */
    if(primaryErr !== undefined){
      html += '<br><br><b>PRIMARY addRecords error (the real cause is usually here):</b><br>'+JSON.stringify(primaryErr, null, 1).replace(/</g,'&lt;');
      html += '<br><br><b>Fallback (invokeCustomApi) error:</b><br>'+JSON.stringify(resp, null, 1).replace(/</g,'&lt;');
    } else {
      html += '<br><br><b>Raw error response:</b><br>'+JSON.stringify(resp, null, 1).replace(/</g,'&lt;');
    }
    showDiagBox(html);
  }

  if(typeof ZOHO==='undefined'||!ZOHO.CREATOR||!ZOHO.CREATOR.DATA){
    /* Preview mode */
    setTimeout(function(){ if(btn){btn.disabled=false;btn.innerHTML='Submit PR &#8594;';} showToast(prNo+' submitted (preview mode)!'); },800);
    return;
  }

  const watchdog = setTimeout(function(){ onError({message:'Creator timeout'}); }, 20000);

  function invokeApiFallback(){
    return ZOHO.CREATOR.UTIL.getInitParams().then(function(params){
      const owner = (params&&params.scope)||'homecartel';
      const app   = (params&&params.appLinkName)||'supply-chain-app';
      const url   = 'https://creator.zoho.com/api/v2/'+owner+'/'+app+'/form/'+FORM_NAME_PR;
      return ZOHO.CREATOR.DATA.invokeCustomApi({ url, method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(clean) });
    });
  }

  ZOHO.CREATOR.DATA.addRecords({ app_name: REAL_APP_NAME, form_name: FORM_NAME_PR, payload: { data: clean } })
    .then(function(r){
      clearTimeout(watchdog);
      console.log('[New-PR] addRecords resp:', JSON.stringify(r));
      if(r&&r.code===3000){
        var saved = r.data && (Array.isArray(r.data) ? r.data[0] : r.data);
        var newId = saved && (saved.ID || saved.id || saved.record_id);
        onSuccess(newId);
        return;
      }
      /* Fallback: invokeCustomApi — but the ORIGINAL addRecords error (r) is usually the
         real, specific cause (e.g. a bad field/lookup value); the fallback's own error is
         often just a generic "Invalid Configuration" from guessed owner/app names, so prefer
         r's message over r2's when both are present. */
      return invokeApiFallback().then(function(r2){
        clearTimeout(watchdog);
        console.log('[New-PR] invokeCustomApi resp:', JSON.stringify(r2));
        if(r2&&r2.code===3000){ onSuccess(); return; }
        onError(r2, r);
      });
    })
    .catch(function(err){
      clearTimeout(watchdog);
      console.error('[New-PR] addRecords threw:', JSON.stringify(err));
      /* Direct fallback */
      invokeApiFallback().then(function(r2){
        if(r2&&r2.code===3000) onSuccess(); else onError(r2, err);
      }).catch(function(r3){ onError(r3, err); });
    });
}

/* ════════════════════════════════
   PO GROUPING WORKSPACE — connected to Zoho Creator report: PO_Grouping
   Every PR in the report is shown, organized into cards by SO + Customer
   (matching the report's own grouping) so nothing gets left out.
════════════════════════════════ */
const REPORT_GROUPING   = 'PO_Grouping';
let GROUP_ALL           = [];   /* all mapped rows from PO_Grouping report */
let GROUP_BUCKETS       = [];   /* [{key, soNo, customer, rows:[...]}] — one per SO+Customer */

/* Map a raw PO_Grouping record → plain object using this report's exact field link names */
function mapGroupRow(r){
  function val(f){
    var x = r[f];
    if(x===null||x===undefined) return '';
    if(typeof x==='object') return x.display_value||x.zc_display_value||x.Name||x.name||x.ID||'';
    return String(x);
  }
  function boolVal(f){ return r[f]===true || r[f]==='true'; }

  var priceRaw = r['Selcted_Final_Cost'];
  var price = (priceRaw && typeof priceRaw==='object')
    ? (parseFloat(priceRaw.value||priceRaw.display_value||0)||0)
    : (parseFloat(priceRaw||0)||0);
  var srpRatePR = parseFloat(String(r['SRP_Rate_PR']||'0').replace(/[^0-9.]/g,'')) || 0;
  var hasInqRef = !!(val('inquiry_reference') || val('Inquiry_Reference') || val('INQ_No') || val('Inquiry_reference'));

  /* Catalog-Rate lookup by SKU (not ID) — the PO_Grouping report's own `Items` lookup
     field shape is unconfirmed/may differ from All_Purchase_Request's, but `sku` is a
     plain string field on both, already reliably read below. Matching by SKU sidesteps
     that uncertainty entirely. NPR_ITEMS may not be loaded yet on this first pass
     (loaded in parallel); the re-patch loop below (once Items load) recomputes
     finalPrice for real. */
  var skuG = val('sku') || '';
  var itemMasterG = NPR_ITEMS.find(function(it){ return it.sku && skuG && it.sku===skuG; });
  var itemRateValG = (itemMasterG && itemMasterG.rate) || 0;
  var priceInfoG = computePriceInfo(price, srpRatePR, itemRateValG, hasInqRef);

  /* CHANGED 2026-08-14, real live bug (PR-00003/SO-16476, INQ-00024 "CUSTOMIZED
     FLOOR LAMP") — the old 3rd fallback, val('Supplier_Selected'), ran this
     record's SUBFORM (an array of {Suppliers,Selected,...} rows) through val()'s
     generic scalar-field logic. val() only special-cases plain objects
     (typeof x==='object') — an array also satisfies that, but has none of the
     object branch's expected keys (display_value/Name/ID/etc.), so it should
     have fallen through to '' harmlessly. Confirmed live it did NOT: this
     report (PO_Grouping) apparently flattens a single-row Supplier_Selected
     subform down to just its Selected CHECKBOX value when the row's own
     Selected=false (no Suppliers name column survives) — a raw boolean primitive,
     which fails the typeof==='object' check and falls to val()'s last line,
     `String(x)`, producing the literal text "false" shown on PR-00003's card.
     Root cause of Selected staying false on an otherwise-legitimate INQ-routed
     row is a separate, upstream gap (pr_sync_supplier_selected.txt's Step 2 can
     force-unselect a row whose Supplier_ID doesn't appear in this PR's own
     Supplier_Load_Balancing match set — not fixed here). Reading the RAW
     subform directly (r['Supplier_Selected'], bypassing val() entirely) and
     preferring the Selected=true row but falling back to the first row's name
     either way means the real supplier name ("Tony Fan") still displays even
     when Selected regressed to false, instead of leaking a stray boolean. */
  var supSelRowsG = r['Supplier_Selected'];
  supSelRowsG = Array.isArray(supSelRowsG) ? supSelRowsG : (supSelRowsG && typeof supSelRowsG==='object' ? [supSelRowsG] : []);
  var supSelWinnerG = supSelRowsG.find(function(row){ return row && (row.Selected===true || row.Selected==='true'); }) || supSelRowsG[0];
  var supSelNameG = supSelWinnerG && supSelWinnerG.Suppliers;
  if(supSelNameG && typeof supSelNameG==='object') supSelNameG = supSelNameG.display_value||supSelNameG.zc_display_value||supSelNameG.Name||supSelNameG.name||'';
  supSelNameG = supSelNameG ? String(supSelNameG) : '';
  var supplier = val('Selected_Supplier') || val('Selected_Supplier1') || supSelNameG || '—';
  var priRaw = val('Priority') || 'MEDIUM';
  var linkPoNo = val('Link_PO_No');

  return {
    id:         r.ID,
    prNo:       val('PR_No')       || '—',
    soNo:       val('Sales_Order') || '—',
    customer:   val('Customer')    || '—',
    supplier:   supplier,
    sku:        val('sku')         || '—',
    product:    val('Items')       || '—',
    qty:        parseFloat(val('quantity')||'0') || 0,
    unit:       val('unit')        || 'pcs',
    /* CHANGED 2026-07-15, per user ("this display should be the final price also...
       not the srp/rate") — PO Grouping Workspace's own Final Price column/total now
       shows the RAW quote only (Selcted_Final_Cost), same "purely display non srp"
       principle already applied to Action 1/pr_to_po_grouping.txt and the POs widget's
       own fmtCurrency. Readiness gate is untouched (`ready` below reads the real
       server-computed PR_READY_FOR_PO directly, never this display value), so a
       from-inquiry/catalog-auto-approved PR can still show ¥0 here while correctly
       staying "Ready". `priceInfoG`/priceSource kept computed above only because
       computePriceInfo() is still the shared source for `hasInqRef`/`srpRatePR`
       plumbing elsewhere — not used for this row's own display anymore. */
    finalPrice: price,
    priceSource: 'quote',
    finalPriceConfirmed: price,   /* raw Selcted_Final_Cost, kept for the NPR_ITEMS re-patch recompute */
    srpRatePR:  srpRatePR,
    hasInqRef:  hasInqRef,
    shipMode:   val('Shipment_Mode') || '—',
    targetDate: val('Target_Delivery') || val('supplier_target_date') || '—',
    priority:   priRaw==='HIGH'?'HIGH':priRaw==='LOW'?'LOW':'MED',
    delay:      val('Delay_Status') || 'On Track',
    /* Real server-computed readiness (pr_check_readiness.txt) — already reflects the
       inquiry/catalog-rate auto-approve rule, with defensive fallback if missing on raw record */
    ready:      (r['PR_READY_FOR_PO'] !== undefined) ? boolVal('PR_READY_FOR_PO') : !!(supplier && supplier!=='—' && priceInfoG.priceApproved && val('Shipment_Mode')),
    linkPoNo:   linkPoNo,
    /* Already converted if explicitly approved OR already linked to a PO number */
    approved:   boolVal('PR_Approved') || !!linkPoNo || (val('PR_Status') === 'Converted to PO'),
    /* Same direct read as mapPR() uses for the main list — Product_Image_PR is now a real
       column on the PO_Grouping report too. */
    photo:      r['Product_Image_PR']||null,
  };
}

let _cachedGroupingData = null;
let _cachedGroupingTime = 0;
let _groupingFetchPromise = null;
const GROUPING_CACHE_TTL = 180000; /* 3 minutes TTL */

/* Helper to map an ALL_PR entry to a group row */
function mapPrToGroupRow(p){
  if(!p) return null;
  if(p._raw) return mapGroupRow(p._raw);
  return {
    id: p.id,
    prNo: p.prNo || '—',
    soNo: p.soNo || '—',
    customer: p.customer || '—',
    supplier: p.selectedSupplier || p.recSupplier || '—',
    sku: p.sku || '—',
    product: p.product || '—',
    qty: p.qty || 0,
    unit: p.unit || 'pcs',
    finalPrice: p.finalPrice || 0,
    priceSource: p.priceSource || 'quote',
    finalPriceConfirmed: p.finalPrice || 0,
    srpRatePR: p.srpRatePR || 0,
    hasInqRef: p.hasInqRef || false,
    shipMode: p.shipMode || '—',
    targetDate: p.targetDate || '—',
    priority: p.priority || 'MED',
    delay: p.delay || 'On Track',
    ready: p.ready || false,
    linkPoNo: p.poNumber || null,
    approved: p.converted || !!p.poNumber,
    photo: p.photo || null
  };
}

/* Merges all in-memory ALL_PR rows with records from PO_Grouping report so no PR or group is ever missing */
function mergeGroupData(groupingRecords){
  var map = new Map();
  // 1. All records currently in ALL_PR
  if(Array.isArray(ALL_PR)){
    ALL_PR.forEach(function(p){
      var row = (p && p._raw) ? mapGroupRow(p._raw) : mapPrToGroupRow(p);
      if(row && row.id) map.set(String(row.id), row);
    });
  }
  // 2. Overlay / add records from PO_Grouping report
  if(Array.isArray(groupingRecords)){
    groupingRecords.forEach(function(r){
      if(r && r.id){
        map.set(String(r.id), r);
      }
    });
  }
  /* On Hold / Cancelled PRs are not groupable (ADDED 2026-10-01). Keyed off ALL_PR,
     since the PO_Grouping report may not carry the Hold_Status column. */
  if(Array.isArray(ALL_PR)){
    ALL_PR.forEach(function(p){ if(p && isPrInactive(p)) map.delete(String(p.id)); });
  }
  return Array.from(map.values());
}

function loadGroupingData(cb, forceRefresh){
  var now = Date.now();
  if(!forceRefresh && _cachedGroupingData && (now - _cachedGroupingTime < GROUPING_CACHE_TTL)){
    GROUP_ALL = mergeGroupData(_cachedGroupingData);
    if(typeof cb === 'function') cb();
    return;
  }
  if(_groupingFetchPromise){
    if(typeof cb === 'function'){
      _groupingFetchPromise.then(function(){ cb(); });
    }
    return;
  }
  if(typeof ZOHO==='undefined'||!ZOHO.CREATOR||!ZOHO.CREATOR.DATA||typeof ZOHO.CREATOR.DATA.getRecords!=='function'){
    GROUP_ALL = mergeGroupData([]);
    if(typeof cb === 'function') cb();
    return;
  }

  var gr = ZOHO.CREATOR.DATA.getRecords.bind(ZOHO.CREATOR.DATA);
  var timedOut = false;
  var fetchTimer = setTimeout(function(){
    timedOut = true;
    console.warn('[PO Grouping] getRecords watchdog timeout (8s)');
    GROUP_ALL = mergeGroupData(_cachedGroupingData || []);
    _groupingFetchPromise = null;
    if(typeof cb === 'function') cb();
  }, 8000);

  _groupingFetchPromise = gr({report_name:REPORT_GROUPING, page:1, pageSize:200}).then(function(resp){
    clearTimeout(fetchTimer);
    if(timedOut) return;
    var fetchedRows = (resp&&resp.code===3000&&Array.isArray(resp.data)) ? resp.data.map(mapGroupRow) : [];
    _cachedGroupingData = fetchedRows;
    _cachedGroupingTime = Date.now();
    GROUP_ALL = mergeGroupData(fetchedRows);
    _groupingFetchPromise = null;
    if(typeof cb === 'function') cb();
  }).catch(function(err){
    clearTimeout(fetchTimer);
    if(timedOut) return;
    console.warn('[PO Grouping] getRecords failed or empty:', err);
    GROUP_ALL = mergeGroupData(_cachedGroupingData || []);
    _groupingFetchPromise = null;
    if(typeof cb === 'function') cb();
  });

  if(typeof cb === 'function'){
    _groupingFetchPromise.then(function(){ cb(); });
  }
}

/* Bucket every PR by SO + Customer — matches the report's own grouping (minus Order
   Value, which is a per-record amount, not a rule for combining/splitting into one PO) */
function buildGroupBuckets(){
  const map = new Map();
  GROUP_ALL.forEach(function(r){
    const key = r.soNo+'||'+r.customer;
    if(!map.has(key)) map.set(key, {key:key, soNo:r.soNo, customer:r.customer, rows:[]});
    map.get(key).rows.push(r);
  });
  /* Sort PR rows within each bucket descending by PR number (latest PR on top) */
  map.forEach(function(bucket){
    bucket.rows.sort(function(a, b){
      var na = parseInt(String(a.prNo).replace(/[^0-9]/g,''), 10) || 0;
      var nb = parseInt(String(b.prNo).replace(/[^0-9]/g,''), 10) || 0;
      return nb - na;
    });
  });
  /* Sort buckets descending by latest PR number (highest/newest PR first) */
  GROUP_BUCKETS = Array.from(map.values()).sort(function(a,b){
    var maxPrA = (a.rows[0] && (parseInt(String(a.rows[0].prNo).replace(/[^0-9]/g,''), 10) || 0)) || 0;
    var maxPrB = (b.rows[0] && (parseInt(String(b.rows[0].prNo).replace(/[^0-9]/g,''), 10) || 0)) || 0;
    if(maxPrB !== maxPrA) return maxPrB - maxPrA;
    return b.soNo.localeCompare(a.soNo, undefined, {numeric:true}) || b.customer.localeCompare(a.customer);
  });
}

function openGroupWorkspace(prId){
  showView('group');
  window.scrollTo(0,0);

  function applyFilterAndRender(){
    buildGroupBuckets();
    /* Clicking "Group→PO" from a specific PR should only show that PR's own SO+Customer
       group — not every group in the report. Opening from the top-level nav button (no
       prId) still shows everything. */
    if(prId){
      var targetPR = (ALL_PR && ALL_PR.find(function(p){ return String(p.id)===String(prId) || String(p.prNo)===String(prId); }));
      var targetSo = targetPR ? targetPR.soNo : null;
      var targetCust = targetPR ? targetPR.customer : null;

      var bucket = GROUP_BUCKETS.find(function(b){
        if(b.rows.some(function(r){ return String(r.id)===String(prId) || String(r.prNo)===String(prId); })) return true;
        if(targetSo && targetSo !== '—' && b.soNo === targetSo){
          if(!targetCust || targetCust === '—' || b.customer === targetCust) return true;
        }
        return false;
      });
      GROUP_BUCKETS = bucket ? [bucket] : [];
      $('gBtnShowAll').style.display = '';
    } else {
      $('gBtnShowAll').style.display = 'none';
    }
    renderGroupCards();
  }

  /* Always populate GROUP_ALL immediately with available in-memory data for instant 0ms rendering */
  GROUP_ALL = mergeGroupData(_cachedGroupingData || []);
  applyFilterAndRender();

  loadGroupingData(function(){
    applyFilterAndRender();
  });
}

function cardSummary(bucket){
  const rows = bucket.rows;
  const totalValue = rows.reduce((s,r)=>s+r.qty*r.finalPrice,0);
  const mixedShip = new Set(rows.map(r=>r.shipMode)).size>1;
  const supplierSet = new Set(rows.map(r=>r.supplier));
  /* CHANGED 2026-08-14, real live bug (PR-00003/SO-16476) — supplierSet above
     (kept as-is, still used by the card footer/elsewhere) is a STRICT string
     Set, so "Tony" (bare, what so_to_pr_scripts_NewScripts.txt's non-INQ
     routing hardcodes) and "Tony Fan" (full display name, what an INQ-routed
     PR reads off the Inquiry's own Supplier Quotes) counted as 2 DIFFERENT
     suppliers — same "bare vs full supplier name" class already fixed
     elsewhere in this app (approvePOMain, INQsv2 chat, POs chat-lock — see
     this file's own supplierKeyMatch(), already used for exactly this
     tolerant comparison in the chat-lock/Followed-Recommendation logic below).
     Reused here instead of inventing a new comparator: groups rows into
     distinct suppliers using supplierKeyMatch() so "Tony"/"Tony Fan" (or
     "Fenteng"/"Fenteng Lighting") in the same SO group count as ONE supplier,
     not a false "Mixed suppliers" block. */
  const distinctSuppliersG = [];
  rows.forEach(function(r){
    if(!distinctSuppliersG.some(function(s){ return supplierKeyMatch(s, r.supplier); })) distinctSuppliersG.push(r.supplier);
  });
  const sameSupplier = rows.length>0 && distinctSuppliersG.length===1;
  const canonicalSupplier = distinctSuppliersG[0] || '—';
  const allReady = rows.length>0 && rows.every(r=>r.ready);
  const noneConverted = rows.length>0 && rows.every(r=>!r.approved);
  return {rows, totalValue, mixedShip, supplierSet, sameSupplier, canonicalSupplier, allReady, noneConverted,
    passed: rows.length>0 && sameSupplier && allReady && noneConverted};
}

function renderGroupCards(){
  const wrap = $('groupCardsWrap');
  if(!GROUP_BUCKETS.length){
    wrap.innerHTML = '<div class="po-group-empty">No PRs found in PR to PO Grouping.</div>';
    $('gDot').style.background = 'var(--gray-400)';
    $('gSelPill').style.color = 'var(--gray-500)';
    $('gSelText').textContent = 'No PRs found';
    return;
  }

  wrap.innerHTML = GROUP_BUCKETS.map(renderGroupCard).join('');
  loadRowThumbs(GROUP_ALL,'pg');

  /* Topbar pill — aggregate across whichever cards are currently shown (all groups, or just
     the one filtered group when opened from a specific PR's "Group→PO" button). */
  const totalPRs = GROUP_BUCKETS.reduce(function(s,b){ return s+b.rows.length; },0);
  $('gDot').style.background = 'var(--blue)';
  $('gSelPill').style.color = 'var(--blue-dark)';
  $('gSelText').textContent = GROUP_BUCKETS.length+' group'+(GROUP_BUCKETS.length>1?'s':'')+' · '+totalPRs+' PRs total';
}

function renderGroupCard(bucket, i){
  const rows = bucket.rows;
  const s = cardSummary(bucket);

  /* Supplier column highlight uses the card's dominant (most frequent) supplier.
     Kept as a raw string (cosmetic highlight only, not a gate) — the actual
     Mixed-suppliers block above is already tolerant via cardSummary()'s
     supplierKeyMatch() grouping; supMatch below just also uses it so "Tony"
     next to "Tony Fan" doesn't cosmetically highlight as if it deviated from
     the group when they're really the same supplier (2026-08-14). */
  const supplierCounts = {};
  rows.forEach(r=>{ supplierCounts[r.supplier] = (supplierCounts[r.supplier]||0)+1; });
  const majoritySupplier = Object.keys(supplierCounts).sort(function(a,b){ return supplierCounts[b]-supplierCounts[a]; })[0];

  return `
  <div class="po-group-card" id="groupCard_${i}">
    <div class="po-group-card-hdr">
      <div>
        <div class="po-group-card-so">${bucket.soNo}<span class="po-group-card-cust"> &middot; ${bucket.customer}</span></div>
        <div class="po-group-card-meta">${rows.length} PR${rows.length>1?'s':''}</div>
      </div>
      <div class="po-group-card-actions">
        <span class="po-group-card-status" style="color:${s.passed?'var(--green)':'var(--red)'}">
          ${s.passed?'&#9679; Validation Passed':'&#9679; Validation Failed'}
        </span>
        <button class="btn btn-sm btn-create-po" onclick="createPOFromCard(${i})">Create PO &#8594;</button>
      </div>
    </div>
    <div class="table-wrap">
      <div class="group-grid-cols group-grid-head">
        <div>Image</div><div>PR No.</div><div>Product Name</div><div>SKU</div><div>Qty</div><div>Supplier</div>
        <div>Final Price</div><div>Ship Mode</div><div>Target Date</div><div>Priority</div><div>Delay</div><div>Ready</div>
      </div>
      ${rows.map(function(r){
        const supMatch = supplierKeyMatch(r.supplier, majoritySupplier);
        return `<div class="group-grid-cols group-grid-row">
          <div>${rowThumbHtml(r,'pg')}</div>
          <div><span class="cell-link" onclick="openDetailView('${r.id}')">${r.prNo}</span></div>
          <div class="cell-product">${r.product}</div>
          <div><span class="cell-sku">${r.sku}</span></div>
          <div style="font-variant-numeric:tabular-nums">${r.qty.toLocaleString()} ${r.unit}</div>
          <div><span class="cell-supplier${supMatch?'':' override-sup'}">${r.supplier}</span></div>
          <div class="cell-price">${(r.priceSource==='srp'||r.priceSource==='catalog'||r.priceSource==='srp_approved')?'₱':'¥'}${r.finalPrice.toLocaleString('en-PH')}</div>
          <div>${shipBadge(r.shipMode)}</div>
          <div style="font-size:12.5px;color:var(--gray-600)">${r.targetDate}</div>
          <div>${priorityHtml(r.priority)}</div>
          <div>${delayBadge(r.delay)}</div>
          <div><span class="badge-pill ${r.ready?'ready-yes':'status-pending'}">${r.ready?'&#10003; Yes':'&#10007; No'}</span></div>
        </div>`;
      }).join('')}
    </div>
    <div class="po-group-card-footer">
      <span>PRs: <strong>${rows.length}</strong></span>
      <span>Total Value: <strong>¥${s.totalValue.toLocaleString('en-PH')}</strong></span>
      <span>Supplier: <strong style="color:${s.sameSupplier?'var(--green)':'var(--red)'}">${s.sameSupplier?s.canonicalSupplier:'Mixed'}</strong></span>
      <span>Mixed Shipping: <strong style="color:${s.mixedShip?'var(--orange)':'var(--green)'}">${s.mixedShip?'Yes':'No'}</strong></span>
    </div>
  </div>`;
}

function createPOFromCard(i){
  const bucket = GROUP_BUCKETS[i];
  const s = cardSummary(bucket);
  if(!s.rows.length){ showToast('No PRs in this group'); return; }
  if(!s.sameSupplier){ showToast('Mixed suppliers in this group — a PO can only go to one supplier'); return; }
  if(!s.allReady){ showToast('Not all PRs in this group are Ready for PO'); return; }
  if(!s.noneConverted){ showToast('One or more PRs in this group are already converted/approved'); return; }
  const heldBlockers = heldSweepBlockers(bucket.soNo);
  if(heldBlockers.length){ showToast(heldSweepMessage(heldBlockers)); return; }

  const btn = document.querySelector('#groupCard_'+i+' .btn-create-po');
  showConfirm(
    'Approve '+s.rows.length+' PR(s) for '+bucket.soNo+' · '+bucket.customer+' and convert to a Purchase Order?',
    function(){ runApprovePOBatch(bucket.soNo, btn); }
  );
}

/* Detail-view header "Create PO" button — same batch action, scoped to the currently
   open PR's own SO (its siblings under that SO get swept in too, same as the card
   version — the backend batches by Sales_Order, not by which specific PR was clicked). */
function createPOFromDetail(){
  if(!_currentMappedPR || !_currentMappedPR.soNo){ showToast('No record loaded'); return; }
  if(isPrInactive(_currentMappedPR)){ showToast('This PR is '+holdStateOf(_currentMappedPR)+' — it cannot be converted to a PO'); return; }
  const soNo = _currentMappedPR.soNo;
  const heldBlockers = heldSweepBlockers(soNo);
  if(heldBlockers.length){ showToast(heldSweepMessage(heldBlockers)); return; }
  const prNo = _currentMappedPR.prNo;
  const btn = $('dBtnCreatePO');
  showConfirm(
    'Approve PR(s) for '+soNo+' and convert to a Purchase Order?',
    function(){
      runApprovePOBatch(soNo, btn);
      prTimeline.log(prNo, 'Approved for PO', 'Approval', [{ label:'Sales Order', to:soNo }]);
    }
  );
}

/* ════════════════════════════════
   CONFIRM MODAL
════════════════════════════════ */
let _confirmYesHandler = null;
function showConfirm(msg, onYes){
  $('confirmMsg').textContent = msg;
  _confirmYesHandler = onYes;
  const okBtn = $('confirmOkBtn');
  okBtn.onclick = function(){
    closeConfirm();
    if(typeof _confirmYesHandler==='function') _confirmYesHandler();
  };
  $('confirmOverlay').classList.add('show');
}
function closeConfirm(){
  $('confirmOverlay').classList.remove('show');
}

/* ════════════════════════════════
   APPROVE PR(s) → PO — calls the 3 Custom APIs that mirror the native
   PR_Approved Report Action Item (Purchase_Order, Fenteng, Tony), in sequence.
   See DelugeScripts/pr_approve_po_custom_api.txt for the function/API setup.
════════════════════════════════ */
const CUSTOM_API_KEY_PO_MAIN     = 'yBd972M8m7QgO4kM8H2UguyR5';
const CUSTOM_API_KEY_PO_FENTENG  = 'KpqTrk9M53PY3pyjJzUDR7aEn';
const CUSTOM_API_KEY_PO_TONY     = 'dpTDMs1mVsVhO8OaBOmftEGOW';
const CUSTOM_API_KEY_PO_HC       = 'fsfsFAat8RX5s5GQGzbKRvOxH';

function callApprovePOApi(apiName, publicKey, soNo){
  return ZOHO.CREATOR.DATA.invokeCustomApi({
    api_name: apiName,
    http_method: 'POST',
    content_type: 'application/json',
    payload: { soNo: soNo },
    public_key: publicKey
  }).then(function(resp){
    /* Confirmed live 2026-07-09 (via a sibling Custom API's own Summary page, same
       Standard-response setup as this one): the response wraps the function's
       returned Map under "result", not "data" ({"code":3000,"result":{...}}) — check
       both, "data" first for safety. */
    var result = (resp && resp.data) ? resp.data : (resp && resp.result) ? resp.result : resp;
    console.log('['+apiName+'] resp:', JSON.stringify(result));
    return result;
  }).catch(function(err){
    console.error('['+apiName+'] error:', JSON.stringify(err));
    return { status:'error', message:(err&&err.message)||'Request failed' };
  });
}

async function runApprovePOBatch(soNo, btnEl){
  if(btnEl){ btnEl.disabled = true; btnEl.dataset._label = btnEl.innerHTML; btnEl.innerHTML = 'Approving…'; }

  if(typeof ZOHO==='undefined'||!ZOHO.CREATOR||!ZOHO.CREATOR.DATA){
    showToast('Creator SDK not available (preview mode)');
    if(btnEl){ btnEl.disabled=false; btnEl.innerHTML=btnEl.dataset._label||'Create PO &#8594;'; }
    return;
  }

  try{
    const r1 = await callApprovePOApi('approve_po_main',    CUSTOM_API_KEY_PO_MAIN,    soNo);
    if(r1 && r1.status==='error'){
      showToast('Approve failed: '+(r1.message||'unknown error'));
      if(btnEl){ btnEl.disabled=false; btnEl.innerHTML=btnEl.dataset._label||'Create PO &#8594;'; }
      return;
    }
    /* Fenteng/Tony/HC are independently idempotent (re-derive their own eligible PRs from
       PR_Approved+Link_PO_No rather than trusting r1's payload) — run all regardless of
       which supplier(s) were actually in this SO, they no-op harmlessly if not relevant. */
    await callApprovePOApi('approve_po_fenteng', CUSTOM_API_KEY_PO_FENTENG, soNo);
    await callApprovePOApi('approve_po_tony',    CUSTOM_API_KEY_PO_TONY,    soNo);
    /* Local (HC System) — real Custom API link name is "Approve_P_O_H_C" (auto-generated
       by Creator's Custom API builder from "ApprovePOHC", not "approve_po_hc" as
       originally planned — see project_hc_system_local_sourcing_phase1_2 memory). */
    await callApprovePOApi('Approve_P_O_H_C',    CUSTOM_API_KEY_PO_HC,      soNo);

    if(btnEl){ btnEl.disabled=false; btnEl.innerHTML=btnEl.dataset._label||'Create PO &#8594;'; }
    showToast((r1&&r1.message)||'PO approved for '+soNo);

    /* Invalidate cached PO data, grouping data & PR cache so newly converted POs are fetched fresh */
    _cachedPORows = null;
    _cachedPOTime = 0;
    _cachedGroupingData = null;
    _cachedGroupingTime = 0;
    PR_FULL_CACHE = {};

    /* Refresh so the card/detail view reflects the new PR_Approved/Link_PO_No state */
    setTimeout(function(){
      loadGroupingData(function(){ buildGroupBuckets(); renderGroupCards(); }, true);
    }, 800);
  } catch(e){
    if(btnEl){ btnEl.disabled=false; btnEl.innerHTML=btnEl.dataset._label||'Create PO &#8594;'; }
    console.error('[Approve PO] threw:', e);
    showToast('Approve failed — see console');
  }
}

/* ════════════════════════════════
   EDIT / SAVE — Detail View
════════════════════════════════ */
let _editMode = false;
let _currentRawRecord = null;   // raw Creator record from getRecordById
let _currentMappedPR  = null;   // mapPR result — used for re-render

/* Date: YYYY-MM-DD → DD-MMM-YYYY (Creator payload format) */
/* Date: DD-MMM-YYYY or YYYY-MM-DD → YYYY-MM-DD (for <input type="date">) */
function fmtDateForInput(v){
  if(!v) return '';
  var months={Jan:'01',Feb:'02',Mar:'03',Apr:'04',May:'05',Jun:'06',
              Jul:'07',Aug:'08',Sep:'09',Oct:'10',Nov:'11',Dec:'12'};
  if(/^\d{2}-[A-Za-z]{3}-\d{4}$/.test(v)){
    var p=v.split('-'); return p[2]+'-'+(months[p[1]]||'01')+'-'+p[0].padStart(2,'0');
  }
  if(/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  return '';
}

/* Extract raw scalar from a Creator field (string or object) */
function rawStr(f){
  var rec = _currentRawRecord || (_currentMappedPR && _currentMappedPR._raw);
  if(!rec) return '';
  var x = rec[f];
  if(x===null||x===undefined) return '';
  if(typeof x==='object') return x.display_value||x.zc_display_value||x.Name||x.name||x.Supplier_Name||
    Object.values(x).find(function(v){ return typeof v==='string'&&v&&v!=='[object Object]'; })||'';
  var s = String(x);
  /* reject stored "[object Object]" strings from bad historical submits */
  return (s==='[object Object]'||/^\[object/.test(s)) ? '' : s;
}

/* CHANGED 2026-07-15, per user ("i like --blue-mid more, let's revert to that and apply
   also to PRs") — idle border switched from solid var(--blue) to the lighter
   var(--blue-mid) tint (matching INQs widget's own edit-mode inputs, see that file's
   comment), paired with a global `[id^="ei_"]:focus` rule below that bumps back to full
   var(--blue) while a field is actually focused — same idle/focus split now used in
   both widgets. */
const EI_INPUT_STYLE = 'width:100%;padding:6px 10px;border:1.5px solid var(--blue-mid);border-radius:var(--radius-sm);font-family:inherit;font-size:13.5px;color:var(--gray-800);background:var(--white);outline:none;box-sizing:border-box';

/* FIXED 2026-08-25, real bug reported live ("pag nag edit and save ako kahit wala
   pa akong inaupdate na field naka auto select ni fenteng") — when `current`
   didn't exactly match any of `options` (blank/unset Selected_Supplier, the exact
   case here — no supplier chosen yet), NO <option> got the `selected` attribute,
   and per plain HTML <select> behavior the browser then just visually shows the
   FIRST option — "Fenteng" for the ei_supplier dropdown — even though nothing was
   ever really chosen. Since Save reads whatever the dropdown currently shows
   (`gv('ei_supplier')`) and writes it as the real Selected_Supplier the moment
   it's non-empty, simply entering Edit mode and clicking Save without touching
   this field at all silently locked in "Fenteng" as a real decision. Same latent
   bug shape existed for every other makeSelect() dropdown in this file
   (ei_followed_rec/ei_priority/ei_ship_mode/etc) wherever the underlying field can
   legitimately still be blank. Fixed at the source: when `current` doesn't match
   any real option, prepend a genuine blank placeholder option and select THAT
   instead — Save's own `if(value)` guards (already present on every one of these
   fields) then correctly treat the empty placeholder as "user didn't set this",
   same as before this bug existed, instead of silently adopting the first choice. */
function makeSelect(id, options, current, disabledAttr){
  const hasMatch = options.indexOf(current) !== -1;
  const placeholder = hasMatch ? '' : '<option value="" selected>— Select —</option>';
  return `<select id="${id}" style="${EI_INPUT_STYLE}" ${disabledAttr||''}>`+
    placeholder+
    options.map(o=>`<option value="${o}" ${o===current?'selected':''}>${o}</option>`).join('')+
    `</select>`;
}

function enterEditMode(){
  if(!_currentRawRecord && _currentMappedPR && _currentMappedPR._raw){
    _currentRawRecord = _currentMappedPR._raw;
  }
  if(!_currentRawRecord && !_currentMappedPR){ showToast('No record loaded'); return; }
  if(isPrInactive(_currentMappedPR)){ showToast('This PR is '+holdStateOf(_currentMappedPR)+' — '+(holdStateOf(_currentMappedPR)==='Cancelled'?'Restore':'Resume')+' it first to edit'); return; }
  _editMode = true;

  /* Mirrors the native PR_Lock_After_PO validation (Purchase_Request1, Edited >
     Validations): once PR_Status=="Converted to PO", Qty/Selected Supplier/Final
     Price/Shipping Mode are locked — the native form disables those fields on load
     so the validation never even trips. Widget attrs below do the same instead of
     letting the user type a change that only fails at Save. */
  const isLocked = !!(_currentMappedPR && _currentMappedPR.converted);
  const lockAttr = isLocked ? 'disabled title="Locked — this PR is already converted to a PO"' : '';

  const eb = $('dBtnEdit');
  eb.textContent = 'Cancel';
  eb.onclick = cancelEditMode;
  const sb = $('dBtnSave');
  sb.style.background='var(--blue)';
  sb.style.color='#fff';
  sb.style.borderColor='var(--blue)';

  const el = id => document.getElementById(id);

  /* B — Description */
  if(el('dvDesc'))
    el('dvDesc').innerHTML=`<textarea id="ei_description" style="${EI_INPUT_STYLE};resize:vertical;min-height:56px">${decodePRDesc(rawStr('description'))}</textarea>`;

  /* B — Quantity + Unit */
  if(el('dvQty'))
    el('dvQty').innerHTML=
      `<div style="display:flex;gap:6px;align-items:center">
        <input type="number" id="ei_qty" value="${rawStr('quantity')||'1'}" min="0" style="${EI_INPUT_STYLE};width:90px" ${lockAttr}>
        ${makeSelect('ei_unit',['pcs','sets','boxes','rolls','kgs','meters','liters'],rawStr('unit'))}
       </div>`;

  /* B — Supplier Target Date */
  if(el('dvTargetDate'))
    el('dvTargetDate').innerHTML=`<input type="date" id="ei_target_date" value="${fmtDateForInput(rawStr('supplier_target_date'))}" style="${EI_INPUT_STYLE}">`;

  /* B — Delay Status */
  if(el('dvDelayStatus'))
    el('dvDelayStatus').innerHTML=makeSelect('ei_delay_status',['On Track','At Risk','Delayed'],rawStr('Delay_Status'));

  /* B — Similar Item */
  var curRec = _currentRawRecord || (_currentMappedPR && _currentMappedPR._raw);
  var simVal = false;
  if(curRec && curRec['Similar_Item'] !== undefined){
    simVal = String(curRec['Similar_Item'])==='true'||curRec['Similar_Item']===true;
  } else if(_currentMappedPR){
    simVal = !!_currentMappedPR.similarItem;
  }
  if(el('dvSimilarItem'))
    el('dvSimilarItem').innerHTML=
      `<label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:13.5px;color:var(--gray-700)">
         <input type="checkbox" id="ei_similar_item" ${simVal?'checked':''} style="accent-color:var(--blue);width:15px;height:15px">
         Open to similar design / equivalent alternatives
       </label>`;

  /* D — Selected Supplier — FIXED 2026-07-21, real bug ("cant select supplier"): this
     was a free-text input, but PR_Sync_Supplier_Selected (native Validations) recomputes
     Selected_Supplier from the Supplier_Selected SUBFORM's own Selected flag on every
     save — a plain text edit here never touched that subform, so it got silently reset
     back to the actual winner on save regardless of what was typed. Converted to a
     dropdown (only 2 real suppliers app-wide) + saveEdits() now also sends a full
     Supplier_Selected replace with the chosen row's Selected flag flipped true, so the
     native sync computes the SAME winner the user picked instead of reverting it. */
  if(el('dvSupplier')){
    el('dvSupplier').innerHTML=makeSelect('ei_supplier',['Fenteng','Tony'],rawStr('Selected_Supplier'),lockAttr);
    const supSel = document.getElementById('ei_supplier');
    if(supSel) supSel.addEventListener('change', function(){ syncFollowedRecFromSupplier(this.value); });
  }

  /* D — Followed Recommendation */
  if(el('dvFollowedRec'))
    el('dvFollowedRec').innerHTML=makeSelect('ei_followed_rec',['Yes','No'],rawStr('Followed_Recommendation'));

  /* D — Override Reason — only relevant when Followed Recommendation is "No";
     toggle its visibility live as that select changes during edit */
  if(el('dvOverrideReasonWrap')){
    el('dvOverrideReasonWrap').style.display = '';
    el('dvOverrideReason').innerHTML = `<textarea id="ei_override_reason" style="${EI_INPUT_STYLE};resize:vertical;min-height:48px" placeholder="Explain why the recommended supplier was not followed…">${rawStr('Override_Reason')}</textarea>`;
    const frSel = document.getElementById('ei_followed_rec');
    if(frSel) frSel.addEventListener('change', function(){
      el('dvOverrideReasonWrap').style.display = this.value==='No' ? '' : 'none';
    });
  }

  /* D — Priority (Creator stores: HIGH / MEDIUM / LOW) */
  if(el('dvPriority'))
    el('dvPriority').innerHTML=makeSelect('ei_priority',['HIGH','MEDIUM','LOW'],rawStr('Priority'));

  /* E — Final Price — always edits the raw Selcted_Final_Cost field directly (not the
     fallback-aware `finalPrice`), so unambiguously CNY — ¥ prefix added 2026-07-15 for
     clarity while editing (previously showed no currency symbol at all here). */
  if(el('dvFinalPrice'))
    el('dvFinalPrice').innerHTML=`<span style="font-weight:700;margin-right:4px">¥</span><input type="number" id="ei_final_price" value="${rawStr('Selcted_Final_Cost')||'0'}" min="0" step="0.01" style="${EI_INPUT_STYLE};font-size:18px;font-weight:700" ${lockAttr}>`;

  /* Sidebar — SRP (Approved), editable, pre-filled with the stored value if a human
     already set one, else the same auto-computed default the (non-edit) display shows —
     see srpApprovedInfo(). Saving always writes SRP_Approved_PR for real from here on,
     so the "(auto)" tag disappears the moment the user accepts/edits and saves once. */
  if(el('dvSrpApprovedPR') && _currentMappedPR){
    const srpEditInfo = srpApprovedInfo(_currentMappedPR);
    el('dvSrpApprovedPR').innerHTML=`<span style="font-weight:600;margin-right:4px">${srpEditInfo.symbol}</span><input type="number" id="ei_srp_approved" value="${srpEditInfo.value||0}" min="0" step="0.01" style="${EI_INPUT_STYLE}">`;
  }

  /* F — Shipping Mode */
  if(el('dvShipMode'))
    el('dvShipMode').innerHTML=makeSelect('ei_ship_mode',['Airfreight','LCL','FCL'],rawStr('Shipment_Mode'),lockAttr);

  /* F — Delay Status duplicate (keep in sync with B) */
  if(el('dvDelayStatusF'))
    el('dvDelayStatusF').innerHTML=makeSelect('ei_delay_status_f',['On Track','At Risk','Delayed'],rawStr('Delay_Status'));

  /* Supplier Quotes table's own radio picks — per user request ("choices should be
     disabled when not in edit mode"), rendered disabled by buildDetailFromPR()/render
     itself (not touched by this function otherwise), so flip them live here rather
     than waiting for a full re-render. */
  document.querySelectorAll('.quote-supplier-pick').forEach(function(radio){
    radio.disabled = false;
    radio.title = 'Select '+radio.value+' as the winning supplier';
  });

  showToast('Edit mode — make changes then Save');
}

/* ADDED 2026-07-21, per user ("how about the supplier quotes. i cannot select a
   supplier (no checkbox)") — the Supplier Quotes table was pure read-only display;
   its per-row radio feeds the SAME Selected Supplier mechanism the D-section dropdown
   uses (saveEdits()'s Supplier_Selected full-array replace), not a separate/duplicate
   save path. CHANGED same day, per follow-up ("choices should be disabled when not in
   edit mode") — the radios are now rendered `disabled` outside edit mode and only
   enabled by enterEditMode() itself, so this can only ever fire while _editMode is
   already true — the old auto-enter-edit-mode fallback is dead code now, removed. */
// FIXED 2026-08-15, real bug found live ("can select parin ng supplier" — still
// silently failed even after the el() crash fix, no console error at all this
// time). Root cause: this PR's own Supplier_Selected.Suppliers holds the FULL
// display name ("Tony Fan"/"Fenteng Lighting" — same short/full-name inconsistency
// class already fixed elsewhere in this app, e.g. supplierKeyMatch() itself,
// mapGroupRow()'s Mixed-suppliers fix), but `ei_supplier` is a plain <select> whose
// only real <option> values are the short form (makeSelect('ei_supplier',
// ['Fenteng','Tony'],...)). Assigning `sel.value` to a string with no matching
// <option> is a silent no-op in the DOM — no error, the dropdown just never
// changes. Normalizes to the short form the dropdown actually understands before
// assigning.
function normalizeSupplierShortName(sup){
  var s = String(sup||'');
  if(supplierKeyMatch(s,'Fenteng')) return 'Fenteng';
  if(supplierKeyMatch(s,'Tony')) return 'Tony';
  return s;
}
function selectSupplierFromQuotes(sup){
  var shortSup = normalizeSupplierShortName(sup);
  var sel = document.getElementById('ei_supplier');
  if(sel) sel.value = shortSup;
  syncFollowedRecFromSupplier(shortSup);
  showToast(sup+' selected — click Save to confirm');
}

/* Same auto-sync as onNewPRSupplierChange(), applied in Detail Edit — fed by either the
   D-section supplier dropdown or a Supplier Quotes radio pick (selectSupplierFromQuotes
   above). Uses _currentMappedPR.recSupplier (already computed by mapPR/computeRecommendedSupplier
   for this record's category) rather than recomputing here. */
/* ADDED 2026-07-28, real bug found live — PR-00006 showed Tony as the currently
   RECOMMENDED supplier (Load Balancing) AND as the Selected Supplier, yet Create PO
   still blocked with "needs Override Reason". Confirmed via direct API pull:
   Followed_Recommendation was genuinely stored "No" server-side — set correctly at
   SOME earlier point (Tony wasn't the recommended supplier back then, Load
   Balancing shifts over time as Active PO counts change), but syncFollowedRecFromSupplier()
   only ever fires on a manual supplier PICK action — nothing re-checks whether an
   ALREADY-selected supplier has since become the recommended one. This self-heals
   that staleness the moment recSupplier is (re)computed for a row: if the selected
   supplier now matches the live recommendation but the stored flag still says "No",
   silently correct it in-memory (so the UI stops showing a false block immediately)
   and persist the fix via a background updateRecordById (Followed_Recommendation=
   "Yes", Override_Reason cleared) — same "system self-heals, no manual save
   required" convention already used elsewhere in this app (e.g. quote_group
   backfill in inquiry_check_readiness.txt). Guarded per-record-ID so it only ever
   fires once per page session, not on every re-render. */
var _healedFollowedRecIds = {};
function autoHealFollowedRecommendation(r){
  if(!r || !r.id || _healedFollowedRecIds[r.id]) return;
  if(!r.selectedSupplier || r.followedRec !== 'No') return;
  if(!r.recSupplier || r.recSupplier === '—') return;
  if(!supplierKeyMatch(r.selectedSupplier, r.recSupplier)) return;
  _healedFollowedRecIds[r.id] = true;
  r.followedRec = 'Yes';
  r.override = false;
  r.overrideReason = '';
  if(typeof ZOHO==='undefined' || !ZOHO.CREATOR || !ZOHO.CREATOR.DATA) return;
  ZOHO.CREATOR.DATA.updateRecordById({
    report_name: REPORT_NAME,
    id: String(r.id),
    payload: { data: { Followed_Recommendation: 'Yes', Override_Reason: '' } }
  }).then(function(resp){
    console.log('[PR] auto-healed Followed_Recommendation for ' + r.prNo + ':', JSON.stringify(resp));
  }).catch(function(e){
    console.error('[PR] auto-heal Followed_Recommendation failed for ' + r.prNo, e);
  });
}

function syncFollowedRecFromSupplier(sup){
  var frSel = document.getElementById('ei_followed_rec');
  if(!frSel || !_currentMappedPR) return;
  var isRec = supplierKeyMatch(sup, _currentMappedPR.recSupplier);
  frSel.value = isRec ? 'Yes' : 'No';
  // FIXED 2026-08-15, real bug found live ("can't select supplier" — console showed
  // "Uncaught ReferenceError: el is not defined") — `el(...)` was never a defined
  // helper anywhere in this file; this app's own shorthand for
  // document.getElementById is `$(...)` (see its definition a few hundred lines up).
  // Pre-existing typo, unrelated to this session's other edits — crashed the whole
  // selectSupplierFromQuotes() click handler, so no supplier selection ever
  // completed/persisted.
  var wrap = $('dvOverrideReasonWrap');
  if(wrap) wrap.style.display = isRec ? 'none' : '';
}

function cancelEditMode(){
  _editMode = false;
  const eb=$('dBtnEdit'); eb.textContent='Edit'; eb.onclick=enterEditMode;
  const sb=$('dBtnSave'); sb.style.background=''; sb.style.color=''; sb.style.borderColor='';
  /* Re-render from stored mapped record */
  if(_currentMappedPR){
    const d=buildDetailFromPR(_currentMappedPR);
    renderDetailView(_currentMappedPR,d,_currentMappedPR);
  }
}

/* Maps saveEdits()'s cleanPayload keys (the actual Zoho field link names it writes)
   to human labels for the timeline diff — see TimelineHistory.diffFlat in
   timeline_history_component/README.md. Unlisted keys (e.g. Supplier_Selected, the
   subform full-array rewrite) are skipped — Selected_Supplier's own diff line
   already describes that change in plain terms. */
const PR_EDIT_FIELD_LABELS = {
  description: 'Description', quantity: 'Quantity', unit: 'Unit',
  supplier_target_date: 'Target Date', Delay_Status: 'Delay Status',
  Selected_Supplier: 'Selected Supplier', Followed_Recommendation: 'Followed Recommendation',
  Override_Reason: 'Override Reason', Priority: 'Priority',
  Selcted_Final_Cost: 'Final Cost', SRP_Approved_PR: 'SRP Approved',
  Shipment_Mode: 'Shipment Mode', Similar_Item: 'Similar Item'
};
const PR_EDIT_NUMERIC_FIELDS = { quantity: 1, Selcted_Final_Cost: 1, SRP_Approved_PR: 1 };

function saveEdits(){
  if(!_editMode){ showToast('Click Edit first'); return; }
  var curRec = _currentRawRecord || (_currentMappedPR && _currentMappedPR._raw);
  if(!curRec || !_currentMappedPR){ showToast('No record loaded'); return; }

  function gv(id){ const e=document.getElementById(id); return e?e.value.trim():''; }
  function gc(id){ const e=document.getElementById(id); return e&&e.checked; }

  /* Build payload — only send changed / non-empty values */
  const raw = {};

  const desc=gv('ei_description');        if(desc) raw.description=desc;
  const qty=gv('ei_qty');                 if(qty)  raw.quantity=String(parseFloat(qty)||0);
  const unit=gv('ei_unit');               if(unit) raw.unit=unit;

  const td=gv('ei_target_date');
  if(td) raw.supplier_target_date=td;

  /* Delay Status — use section B value; section F is kept in sync for display only */
  const ds=gv('ei_delay_status')||gv('ei_delay_status_f');
  if(ds) raw.Delay_Status=ds;

  const sup=gv('ei_supplier');            if(sup) raw.Selected_Supplier=sup;

  /* Also flip the winner in Supplier_Selected itself — see enterEditMode()'s own
     comment on this field. Full-array replace (no row IDs, same proven no-ID-full-
     replace pattern used throughout this app for subform writes) built from the
     already-loaded raw record, only the Selected flags changed — every other column
     per row carried through verbatim so nothing else is lost. */
  var ssArray = (curRec && Array.isArray(curRec.Supplier_Selected)) ? curRec.Supplier_Selected : null;
  if(sup && ssArray && ssArray.length){
    // FIXED 2026-08-15, real bug found live ("when i save the select supplier
    // hindi siya nasesave") — `sup` here is the SHORT form (ei_supplier's own
    // <option> values are 'Fenteng'/'Tony', see makeSelect() in enterEditMode()),
    // but `row.Suppliers` holds the FULL display name ("Tony Fan"/"Fenteng
    // Lighting") on records routed through INQ (same short/full-name class fixed
    // elsewhere in this app). Strict `===` never matched either row, so BOTH rows
    // always saved Selected:false regardless of which supplier was picked —
    // confirmed live via the actual updateRecordById payload. Swapped to
    // supplierKeyMatch(), same tolerant helper already used throughout this file.
    raw.Supplier_Selected = ssArray.map(function(row){
      return {
        Supplier_ID: row.Supplier_ID, Suppliers: row.Suppliers,
        Availability: row.Availability, Initial_Price: row.Initial_Price,
        Negotiated: row.Negotiated, Final_Price: row.Final_Price,
        Lead_Time: row.Lead_Time, Status: row.Status,
        Selected: supplierKeyMatch(row.Suppliers, sup)
      };
    });
  }

  const fr=gv('ei_followed_rec');         if(fr) raw.Followed_Recommendation=fr;

  const orr=gv('ei_override_reason');     if(orr) raw.Override_Reason=orr;

  const pri=gv('ei_priority');            if(pri) raw.Priority=pri;

  const fp=gv('ei_final_price');
  if(fp) raw.Selcted_Final_Cost=String(parseFloat(fp)||0);

  /* Unlike every other optional field on this form (skipped via `if(x)` when blank, so a
     blank input means "leave native value untouched"), SRP (Approved) always writes —
     per user request 2026-07-15 ("0 should be acceptable... treat blank as 0 too"), a
     literal 0 is a real, intentional Books cost-price override, and a blank input on
     save should resolve to that same explicit 0 rather than silently no-op'ing and
     leaving whatever was there before. */
  const srpAp=gv('ei_srp_approved');
  raw.SRP_Approved_PR=String(parseFloat(srpAp)||0);

  const sm=gv('ei_ship_mode');            if(sm) raw.Shipment_Mode=sm;

  /* Checkbox — send true only; omit if false (Creator rule) */
  if(gc('ei_similar_item')) raw.Similar_Item=true;

  /* Strip false / null / undefined / empty string */
  const cleanPayload={};
  Object.keys(raw).forEach(k=>{
    if(raw[k]!==false&&raw[k]!==null&&raw[k]!==undefined&&raw[k]!=='')
      cleanPayload[k]=raw[k];
  });

  if(!Object.keys(cleanPayload).length){ showToast('No changes to save'); return; }

  console.log('[PR] updateRecordById payload:', JSON.stringify(cleanPayload));

  const sb=$('dBtnSave');
  sb.textContent='Saving…'; sb.disabled=true;

  if(typeof ZOHO==='undefined'||!ZOHO.CREATOR||!ZOHO.CREATOR.DATA){
    sb.textContent='Save'; sb.disabled=false;
    showToast('Creator SDK not available'); return;
  }

  const ubr=ZOHO.CREATOR.DATA.updateRecordById.bind(ZOHO.CREATOR.DATA);
  ubr({
    report_name: REPORT_NAME,
    id: String(_currentMappedPR.id),
    payload: { data: cleanPayload }
  })
  .then(function(resp){
    sb.textContent='Save'; sb.disabled=false;
    console.log('[PR] updateRecordById resp:', JSON.stringify(resp));
    if(resp&&(resp.code===3000||String(resp.code)==='3000')){
      showToast(_currentMappedPR.prNo+' saved successfully');
      var tlChanges = TimelineHistory.diffFlat(curRec, cleanPayload, PR_EDIT_FIELD_LABELS, null, PR_EDIT_NUMERIC_FIELDS);
      if(tlChanges.length) prTimeline.log(_currentMappedPR.prNo, TimelineHistory.titleFor(tlChanges, 'Updated PR'), 'Updated', tlChanges);
      _editMode=false;
      const eb=$('dBtnEdit'); eb.textContent='Edit'; eb.onclick=enterEditMode;
      sb.style.background=''; sb.style.color=''; sb.style.borderColor='';
      /* Re-fetch full record and re-render */
      const gbr=ZOHO.CREATOR.DATA.getRecordById.bind(ZOHO.CREATOR.DATA);
      gbr({ report_name:REPORT_NAME, id:String(_currentMappedPR.id), field_config:'all' })
        .then(function(r2){
          if(r2&&r2.code===3000&&r2.data){
            _currentRawRecord=r2.data;
            PR_FULL_CACHE[String(_currentMappedPR.id)] = r2.data;
            _currentMappedPR=mapPR(r2.data);
            /* Also refresh the list data so Ready for PO count stays current */
            var idx=ALL_PR.findIndex(p=>String(p.id)===String(_currentMappedPR.id));
            if(idx>-1){ ALL_PR[idx]=_currentMappedPR; recomputeReadyPR(); updateStats(); }
            const d=buildDetailFromPR(_currentMappedPR);
            renderDetailView(_currentMappedPR,d,_currentMappedPR);
          }
        }).catch(function(e){ console.warn('[PR] re-fetch after save error:',e); });
    } else {
      showToast('Save failed — code '+(resp&&resp.code)+' '+(resp&&resp.message||''));
    }
  })
  .catch(function(err){
    sb.textContent='Save'; sb.disabled=false;
    console.error('[PR] updateRecordById error:',JSON.stringify(err));
    /* Fallback: try invokeCustomApi */
    showToast('Direct update failed — trying fallback…');
    ZOHO.CREATOR.DATA.invokeCustomApi({
      url:'https://creator.zoho.com/api/v2/homecartel/supply-chain-app/report/'+REPORT_NAME+'/'+String(_currentMappedPR.id),
      method:'PATCH',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify(cleanPayload)
    }).then(function(r2){
      console.log('[PR] invokeCustomApi fallback resp:',JSON.stringify(r2));
      showToast('Saved via fallback — check record in Creator');
    }).catch(function(e2){
      console.error('[PR] fallback also failed:',JSON.stringify(e2));
      showToast('Save error — see console');
    });
  });
}

/* ════════════════════════════════
   TAB SWITCHING
════════════════════════════════ */
document.querySelectorAll('.tab-btn').forEach(btn=>{
  btn.addEventListener('click',()=>{
    activeTab = btn.dataset.tab;
    document.querySelectorAll('.tab-btn').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    ['queue','all','load','converted','prgroups','onhold','cancelled'].forEach(p=>$('panel-'+p).style.display = p===activeTab?'':'none');
    if(activeTab==='all')       renderAllPRs();
    if(activeTab==='load')      renderLoad();
    if(activeTab==='converted') renderConverted();
    if(activeTab==='prgroups')  renderPrGroups();
    if(activeTab==='onhold' || activeTab==='cancelled') renderHoldPanels();
  });
});

/* ── Queue filter pills ── */
$('queuePills').addEventListener('click',e=>{
  const p = e.target.closest('.pill');
  if(!p) return;
  queueFilter = p.dataset.filter;
  $('queuePills').querySelectorAll('.pill').forEach(b=>b.classList.remove('active'));
  p.classList.add('active');
  renderQueue();
});

/* ── All PRs filter pills ── */
$('allPills').addEventListener('click',e=>{
  const p = e.target.closest('.pill');
  if(!p) return;
  allFilter = p.dataset.filter;
  $('allPills').querySelectorAll('.pill').forEach(b=>b.classList.remove('active'));
  p.classList.add('active');
  renderAllPRs();
});

/* ════════════════════════════════
   CLOCK
════════════════════════════════ */
function updateClock(){
  const t = new Date().toLocaleTimeString('en-PH',{hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false});
  if($('dClock')) $('dClock').textContent = t;
  if($('nClock')) $('nClock').textContent = t;
}
updateClock();
setInterval(updateClock,1000);

/* ════════════════════════════════
   TOAST
════════════════════════════════ */
let toastTimer;
function showToast(msg){
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(()=>t.classList.remove('show'),3000);
}
/* Code 9220 ("No records exist in this report") comes back as an HTTP 400 — the SDK
   promise REJECTS with the real code buried in err.responseText as a JSON STRING, not
   a plain err.code/err.responseJSON.code (that shape never matched, silently showing
   the ugly "Creator connection error" toast for a perfectly normal empty report).
   Ported from the proven-correct errCode() in UI/EndUser/INQs/app/Inq.html. */
function errCode(e){
  try {
    if(e && e.responseText) return JSON.parse(e.responseText).code;
    var s = (e && e.message) ? e.message : (typeof e === 'string' ? e : JSON.stringify(e));
    return JSON.parse(JSON.parse(s).responseText || s).code;
  } catch(_){ return null; }
}
/* Empty-state placeholder row — both the Ready Queue and All PRs tables had no
   fallback for zero rows at all (data.map('').join('') just silently renders a blank
   tbody). Wide colspan is harmless even against tables with fewer real columns. */
/* ───────── FORECAST (added 2026-11-04) ─────────
   Read-only. Written by the Forecast_Stamp_Daily schedule onto this form's
   Forecast_Delivery / Forecast_Window / Forecast_Status fields; this widget only
   displays them.

   The full window (e.g. "Nov 20 - Dec 15, 2026 | LCL | In transit") goes in the
   title attribute rather than the cell, so the column stays one line wide. The
   date shown is the midpoint of that window, never a promise.

   Colours are the validated chart palette, not the app's UI amber: #2a78d6 /
   #c47f00 / #d03b3b pass the lightness band, the contrast floor and deuteranopia
   separation. Status also carries its own word, so it is never colour-alone.

   fcEsc: these widgets disagree on what the escaper is called (escapeHtml here,
   esc there), so this picks whichever exists and carries its own as a last
   resort - it must never be the reason a row fails to render. */
var fcEsc = (function () {
  if (typeof escapeHtml === "function") return escapeHtml;
  if (typeof esc === "function") return esc;
  return function (s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  };
})();

var FORECAST_TONE = {
  "On Track":       { bg: "#eaf2fc", fg: "#1f5aa0", dot: "#2a78d6" },
  "At Risk":        { bg: "#fdf4e3", fg: "#8a5a00", dot: "#c47f00" },
  "Will Miss":      { bg: "#fdecec", fg: "#a02a2a", dot: "#d03b3b" },
  "Overdue":        { bg: "#fdecec", fg: "#a02a2a", dot: "#d03b3b" },
  "No Client Date": { bg: "#f1f5f9", fg: "#64748b", dot: "#94a3b8" },
  "No Start Date":  { bg: "#f1f5f9", fg: "#64748b", dot: "#94a3b8" },
};

/* Creator hands dates back in whichever format the app is set to; this accepts the
   four shapes seen across this app and returns "" rather than "Invalid Date". */
function forecastDateText(v) {
  if (!v) return "";
  var s = String(v).trim();
  var m = s.match(/^(\d{2})-([A-Za-z]{3})-(\d{4})/);
  if (m) return m[2] + " " + m[1] + ", " + m[3];
  var d = new Date(s.replace(/-/g, "/"));
  if (isNaN(d.getTime())) return s.split(" ")[0];
  return d.toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" });
}

function forecastCell(r) {
  r = r || {};
  var raw = r.Forecast_Delivery;
  var status = String(r.Forecast_Status == null ? "" : r.Forecast_Status).trim();
  var win = String(r.Forecast_Window == null ? "" : r.Forecast_Window).trim();

  if (!raw && !status) return '<span style="color:#cbd5e1">—</span>';

  var tone = FORECAST_TONE[status] || FORECAST_TONE["No Start Date"];
  var date = raw ? fcEsc(forecastDateText(raw)) : "—";
  var tip = fcEsc(win || status || "");

  return (
    '<span title="' + tip + '" style="display:inline-flex;align-items:center;gap:6px;' +
    "white-space:nowrap;border-radius:999px;padding:2px 9px;font-size:11px;" +
    "font-weight:600;background:" + tone.bg + ";color:" + tone.fg + '">' +
    '<span style="width:6px;height:6px;border-radius:50%;background:' + tone.dot +
    ';flex:none"></span>' + date +
    (status && status !== "On Track" ? " &middot; " + fcEsc(status) : "") +
    "</span>"
  );
}

function emptyStateRow(msg){
  return `<tr><td colspan="20" style="text-align:center;padding:48px 20px;color:var(--gray-400)">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="width:36px;height:36px;margin:0 auto 10px;opacity:.5;display:block"><path d="M3 3h18v13H3zM1 16h22v5H1zM8 21h8"/></svg>
    ${escapeHtml(msg)}
  </td></tr>`;
}

/* Final-price display value + approval status — mirrors the native Deluge logic exactly
   (pr_check_readiness.txt Condition 2 for `priceApproved`, pr_to_po_grouping.txt's
   rateToUse 3-tier fallback for `fpDisplay`/`priceSource`). Kept as one shared function
   so mapPR() and the NPR_ITEMS re-patch loop (items load in parallel, may not be ready
   on the first mapPR pass) stay in sync instead of duplicating the rule twice. */
function computePriceInfo(fp, srpRatePR, itemRateVal, hasInqRef, srpApprovedPR){
  /* ADDED 2026-07-21, per user ("always use the SRP approved... as final") — a real,
     manually-approved SRP_Approved_PR (not the auto-computed sidebar default — see
     srpApprovedInfo(), that's display-only) is now the TOP-PRIORITY source for both the
     displayed Final Price and readiness approval, ahead of even a real supplier quote.
     Once a human has explicitly approved a number here, that's final — matches the
     already-established "SRP & Pricing Summary is what goes to Books" rule (pr_to_po_
     grouping.txt/acknowledge_po_custom_api.txt already send SRP_Approved_PR to Books
     first) — this just makes the WIDGET's own readiness/display agree with that. */
  if(srpApprovedPR > 0){
    return {fpDisplay: srpApprovedPR, priceSource: 'srp_approved', priceApproved: true};
  }
  var fpDisplay = fp, priceSource = fp>0 ? 'quote' : 'none';
  if(fpDisplay <= 0){
    if(srpRatePR > 0){ fpDisplay = srpRatePR; priceSource = 'srp'; }
    else if(itemRateVal > 0){ fpDisplay = itemRateVal; priceSource = 'catalog'; }
  }
  /* From-inquiry items: already validated upstream at the Inquiry's own SRP-approval
     step, auto-approved regardless of rate. Not-from-inquiry with a real catalog Rate:
     auto-approved too, that rate is the authoritative Books price. Everything else needs
     a genuine supplier quote (fp>0). */
  var priceApproved = hasInqRef ? true : (itemRateVal > 0 ? true : fp > 0);
  return {fpDisplay:fpDisplay, priceSource:priceSource, priceApproved:priceApproved};
}

/* Readiness-checklist detail text for the "Final price confirmed" row — explains WHY
   it's approved (or not), matching the 3-case rule above. */
function priceReadinessDetail(r){
  /* FIXED 2026-07-15, per user (currency symbol audit): the 'supplier quote' case was
     showing ₱ (PHP) for what is, by definition, a REAL Selcted_Final_Cost quote — always
     CNY. Only the inquiry case needed a conditional (an inquiry-routed item can still be
     0-rate/no-real-quote, falling back to a PHP reference internally) — 'catalog' was
     already correctly ₱. */
  if(r.priceSource==='srp_approved') return 'SRP Approved — ₱'+r.finalPrice.toLocaleString();
  if(r.hasInqRef) return 'From Inquiry — approved'+(r.finalPrice>0?' ('+((r.priceSource==='srp'||r.priceSource==='catalog'||r.priceSource==='srp_approved')?'₱':'¥')+r.finalPrice.toLocaleString()+')':'');
  if(r.priceSource==='catalog') return 'Catalog rate — auto approved (₱'+r.finalPrice.toLocaleString()+')';
  if(r.priceApproved) return '¥'+r.finalPrice.toLocaleString()+' — supplier quote';
  if(r.sourcingType==='Local') return 'Awaiting price entry';
  return 'Awaiting supplier quote';
}

/* Price Status pill for the Detail Pricing card — same visual language as the Inquiry
   widget's "SRP Status" pill (Approved = green, Pending = gray). */
function priceStatusPill(r){
  if(r.priceApproved) return '<span class="badge-pill rec-yes">&#10003; Approved</span>';
  return '<span class="badge-pill status-pending">&#9679; Awaiting Supplier Quote</span>';
}
function priceSourceLabel(r){
  if(r.priceSource==='srp_approved') return 'SRP Approved (final)';
  if(r.hasInqRef) return 'From Inquiry (SRP approved)';
  if(r.priceSource==='catalog') return 'Catalog Rate (auto)';
  if(r.priceSource==='srp') return 'SO Reference (SRP)';
  if(r.priceSource==='quote') return 'Supplier Quote';
  return 'No price yet';
}

/* ════════════════════════════════
   FIELD MAPPER — All_Purchase_Request → widget object
════════════════════════════════ */
function mapPR(r, idx){
  function v(f){ return (r[f] && typeof r[f]==='object') ? (r[f].display_value||r[f].zc_display_value||r[f].Name||r[f].ID||'') : (r[f]||''); }

  /* val() for objects — Creator lookup fields return {ID, zc_display_value, display_value} */
  function vObj(field){
    var raw = r[field];
    if(!raw) return '';
    if(typeof raw === 'object'){
      return raw.zc_display_value || raw.display_value || raw.Name || raw.name || raw.ID || '';
    }
    return String(raw);
  }

  /* safeStr — for simple picklist/dropdown fields that Creator might return as
     plain string OR as an object with any key. Tries every known key then
     falls back to first non-null value found. */
  function safeStr(field){
    var raw = r[field];
    if(raw === null || raw === undefined) return '';
    if(typeof raw !== 'object') return String(raw);
    /* Try all known Creator object keys */
    var val = raw.display_value || raw.zc_display_value || raw.Name || raw.name ||
              raw.value || raw.title || raw.label || raw.text || raw.ID || '';
    if(!val){
      /* Last resort: grab first string value from the object */
      var keys = Object.keys(raw);
      for(var i=0; i<keys.length; i++){
        if(raw[keys[i]] && typeof raw[keys[i]]==='string'){ val=raw[keys[i]]; break; }
      }
    }
    return val;
  }

  /* For list fields (inquiry_reference) — Creator may return array */
  function vList(field){
    var raw = r[field];
    if(!raw) return '';
    if(Array.isArray(raw)) return raw.map(function(i){ return typeof i==='object'?(i.display_value||i.zc_display_value||i.ID||''):i; }).filter(Boolean).join(', ');
    if(typeof raw === 'object') return raw.display_value || raw.zc_display_value || raw.ID || '';
    return String(raw);
  }

  /* Priority — Creator sends MEDIUM (not MED) */
  var priRaw = vObj('Priority') || v('Priority') || 'MEDIUM';
  var pri = priRaw === 'HIGH' ? 'HIGH' : priRaw === 'LOW' ? 'LOW' : 'MED';

  /* Delay status */
  var delay = vObj('Delay_Status') || v('Delay_Status') || 'On Track';

  /* Supplier target date */
  var td = v('supplier_target_date') || vObj('supplier_target_date') || '';
  var tdDisplay = td ? fmtDateShort(td) : '—';
  var tdOverdue = false;
  if(td){
    var tdClean = td.replace(/[a-zA-Z]/g,'').trim(); /* remove month name letters for Date parse */
    var parts = td.split('-');
    if(parts.length===3 && parts[0].length===4){
      /* YYYY-MM-DD format */
      var diff = new Date(parts[0], parts[1]-1, parts[2]) - new Date();
      tdOverdue = diff < 0;
    }
  }

  /* Final price — actual Creator field link name is Selcted_Final_Cost (not Final_Price);
     may return as object {value:'900.00'} */
  var _fpRaw = r['Selcted_Final_Cost'];
  var _fpStr = '';
  if(_fpRaw && typeof _fpRaw==='object'){
    _fpStr = _fpRaw.value||_fpRaw.display_value||_fpRaw.zc_display_value||String(_fpRaw)||'0';
  } else {
    _fpStr = String(_fpRaw||'0');
  }
  var fp = parseFloat(_fpStr.replace(/[^0-9.]/g,'')) || 0;

  /* Final Price DISPLAY fallback (2026-07-14, per user, display-only — does NOT affect
     `status`/Ready-for-PO below, which stays on the raw `fp` above): when no supplier
     has quoted a price yet, show SRP_Rate_PR (the SO's own approved sell-rate, already
     reliably set at PR creation, plain Number type — no Currency-type ambiguity, unlike
     an earlier attempt that wrote a fallback into Selcted_Final_Cost itself and got
     reverted) as a reference number instead of a blank "—". */
  var srpRatePR = parseFloat(String(r['SRP_Rate_PR']||'0').replace(/[^0-9.]/g,'')) || 0;
  /* fpDisplay/priceSource/priceApproved computed below, once itemMaster (needs
     NPR_ITEMS, may still be loading) and hasInqRef are resolved. */

  /* Selected Supplier — text field.
     Guard against "[object Object]" stored from a bad historical submit,
     and handle Creator returning this as an object with non-standard keys */
  var _supRaw = r['Selected_Supplier'];
  var selSup = '';
  if(_supRaw && typeof _supRaw === 'object'){
    selSup = _supRaw.display_value||_supRaw.zc_display_value||_supRaw.Name||_supRaw.name||
             _supRaw.value||_supRaw.Supplier_Name||
             Object.values(_supRaw).find(function(x){ return typeof x==='string'&&x&&x!=='[object Object]'; })||'';
  } else {
    selSup = String(_supRaw||'');
  }
  /* Reject known bad values — "[object Object]", stray IDs, empty */
  if(!selSup || selSup==='[object Object]' || /^\[object/.test(selSup)) selSup = '';

  /* Category — may come from Items lookup object or direct field */
  var cat = v('category') || '';
  if(!cat && r['Items'] && typeof r['Items']==='object'){
    cat = r['Items'].category || r['Items'].Category || '';
  }

  /* Converted/locked state — real PR_Status field, matches the native
     PR_Lock_After_PO validation (Purchase_Request1, Edited > Validations) which
     blocks quantity/Selected_Supplier/Shipment_Mode/Target_Delivery/
     Selcted_Final_Cost/Production_Date/Supplier_Selected once PR_Status ==
     "Converted to PO". Native form avoids ever tripping that validation by
     disabling those specific fields on load once converted — the widget needs to
     mirror that (see enterEditMode) instead of letting the user type a doomed
     edit that only fails at Save time. */
  var converted = (vObj('PR_Status') || v('PR_Status') || '') === 'Converted to PO';

  /* Description shown on the Detail page must be the ITEM's own description (from the
     Items master, NPR_ITEMS — loaded alongside the New PR dropdowns), not whatever text got
     saved into this PR's own `description` field at creation time (which, for PRs created
     before an earlier bug fix, may actually contain the item's name instead). Falls back to
     the PR's own saved value if the item lookup isn't available yet. */
  var itemsRaw = r['Items'];
  var itemId = (itemsRaw && typeof itemsRaw==='object') ? (itemsRaw.ID||itemsRaw.id||'') : String(itemsRaw||'');
  var itemMaster = NPR_ITEMS.find(function(it){ return String(it.ID)===String(itemId); });
  var itemDescription = (itemMaster && itemMaster.description) || v('description') || '';

  /* Price display + approval status — see computePriceInfo() above. `itemRateVal` may
     read 0 here if NPR_ITEMS hasn't loaded yet on the very first pass; the ALL_PR
     re-patch loop below (once Items load) recomputes this for real. */
  var itemRateVal = (itemMaster && itemMaster.rate) || 0;
  var hasInqRef = !!(vList('inquiry_reference') || vList('Inquiry_Reference') || vList('INQ_No') || vList('Inquiry_reference'));
  var srpApprovedPRVal = (function(){ var raw=r['SRP_Approved_PR']; if(raw===null||raw===undefined||String(raw).trim()===''){ return null; } var n=parseFloat(String(raw).replace(/[^0-9.]/g,'')); return isNaN(n)?null:n; })();
  var priceInfo = computePriceInfo(fp, srpRatePR, itemRateVal, hasInqRef, srpApprovedPRVal);

  /* PR status — derived. Uses priceInfo.priceApproved (not raw fp>0) so from-inquiry
     and real-catalog-Rate items can reach "Ready for PO" without waiting on a supplier
     quote, matching pr_check_readiness.txt's own Condition 2 rework. */
  var status = 'For Sourcing';
  if(selSup && priceInfo.priceApproved && v('Shipment_Mode')) status = 'Ready for PO';
  /* FIXED 2026-09-01, per user report: a PR already converted (native PR_Status ==
     "Converted to PO") kept showing "Ready for PO" forever, because this derivation
     never checked `converted` — the conditions that produce "Ready for PO" (supplier
     selected, price approved, ship mode set) all stay true after conversion too, so
     the badge/queue never updated. Converted now overrides any other computed status. */
  if(converted) status = 'Converted to PO';

  /* Supplier Load Balancing — REAL native subform on Purchase_Request1 (Suppliers,
     Match_Category, Active_POs, Percent, Load_Status, Eligible_Supplier), already
     computed/populated server-side. Read directly instead of recomputing a
     "recommended supplier" client-side — that computed version (computeRecommendedSupplier)
     used to go blank whenever a supplier didn't match on the client's own category-string
     logic, even though the real subform already had the right answer. */
  var lbRaw = r['Supplier_Load_Balancing'];
  var loadBalancing = (Array.isArray(lbRaw) ? lbRaw : (lbRaw ? [lbRaw] : [])).map(function(row){
    var supObj = row['Suppliers'];
    var supName = '';
    if(supObj && typeof supObj==='object'){
      supName = supObj['Supplier_Name.first_name'] || supObj.zc_display_value || supObj.display_value || supObj.Name || '';
    } else {
      supName = String(supObj||'');
    }
    return {
      name:      supName || '—',
      category:  row['Match_Category'] || '',
      activePOs: parseFloat(row['Active_POs']||'0') || 0,
      percent:   parseFloat(row['Percent']||'0') || 0,
      loadStatus:row['Load_Status'] || 'Normal',
      eligible:  row['Eligible_Supplier'] || '',
    };
  });

  /* ADDED 2026-07-15, per user ("include this to widget... only needed fields especially
     prices") — Supplier_Selected subform (Purchase_Request1's own per-candidate-supplier
     quote comparison, same real field this PR's own Selcted_Final_Cost/Selected_Supplier
     get synced FROM by PR_Sync_Supplier_Selected — see that Deluge file). Mirrors the
     Inquiry widget's own "Supplier Quotes" table, but for PR-stage suppliers. `Suppliers`
     is a plain TEXT field here (confirmed via PR_Sync_Supplier_Selected's own
     `newSel.Suppliers=supName;` — unlike Supplier_Load_Balancing's own `Suppliers`,
     which IS a lookup object), so no object-unwrap needed. Already exposed on this
     report's Configure Fields panel (confirmed via live screenshot) — no report-side
     prerequisite needed. */
  var ssRaw = r['Supplier_Selected'];
  function _numOrNull(v){
    if(v===null || v===undefined || v==='') return null;
    var n = parseFloat(v);
    return isNaN(n) ? null : n;
  }
  var supplierQuotes = (Array.isArray(ssRaw) ? ssRaw : (ssRaw ? [ssRaw] : [])).map(function(row){
    return {
      supplier:   row['Suppliers'] || '—',
      availability: row['Availability'] || '—',
      /* FIXED 2026-07-15, live bug found by user: a genuinely-stored 0 (Tony's real
         Initial/Negotiated/Final Price, confirmed via native form screenshot) was
         showing as "—" same as Fenteng's truly-blank fields — `parseFloat(v||'0')||0`
         collapses "blank" and "real 0" into the same value, losing the distinction.
         _numOrNull keeps null for genuinely-blank fields only; render checks `!==null`,
         not `>0`, so a real 0 now displays as "0" like the native form does. */
      initial:    _numOrNull(row['Initial_Price']),
      negotiated: _numOrNull(row['Negotiated']),
      final:      _numOrNull(row['Final_Price']),
      leadTime:   _numOrNull(row['Lead_Time']),
      status:     row['Status'] || '',
      selected:   row['Selected']===true || row['Selected']==='true',
    };
  });

  return {
    _raw:             r,
    id:               r.ID,
    prNo:             v('PR_No')                     || '—',
    prDate:           fmtDateShort(v('PR_Date'))      || '—',
    inqRef:           (vList('inquiry_reference') || vList('Inquiry_Reference') || vList('INQ_No') || vList('Inquiry_reference')) || null,
    soNo:             vObj('Sales_Order')             || '—',
    customer:         vObj('Customer')                || '—',
    sku:              v('sku')                        || '—',
    product:          vObj('Items')                   || '—',
    qty:              parseFloat(v('quantity')||'0')  || 0,
    unit:             v('unit')                       || 'pcs',
    category:         cat                             || '—',
    sourcingType:     v('Sourcing_Type')               || 'Import',
    specs:            {
      Dimension:     v('Dimension') || '',
      Color_Body:    v('Color_Body') || '',
      Color_Temperature: v('Color_Temperature') || '',
      Type_of_Bulb:  v('Type_of_Bulb') || '',
      Voltage:       v('Voltage') || '',
      Lumens:        v('Lumens') || '',
    },
    recSupplier:      '—',
    loadBalancing:    loadBalancing,
    supplierQuotes:   supplierQuotes,
    converted:        converted,
    /* Real field, set alongside PR_Status by pr_to_po_grouping.txt/pr_approve_po_custom_api.txt
       once this PR is grouped into a PO (Purchase_Request1.Link_PO_No = targetPO.PO_No).
       Was previously hardcoded to null in buildDetailFromPR — fixed 2026-09-01. */
    poNumber:         v('Link_PO_No')                 || null,
    selectedSupplier: selSup                          || null,
    followedRec:      v('Followed_Recommendation')    || '—',
    overrideReason:   v('Override_Reason')             || '',
    finalPrice:       priceInfo.fpDisplay,
    priceIsSrp:        priceInfo.priceSource === 'srp',       /* kept for back-compat */
    priceIsCatalog:    priceInfo.priceSource === 'catalog',
    priceSource:       priceInfo.priceSource,        /* 'quote' | 'srp' | 'catalog' | 'none' */
    /* Approval status — mirrors pr_check_readiness.txt Condition 2 exactly (not just
       "fp>0" anymore): from-inquiry or real-catalog-Rate items auto-approve even with
       fp==0, only a not-from-inquiry/0-rate item still needs a real supplier quote. Use
       this (not the raw `fp` amount) anywhere that implies real confirmation/gating,
       e.g. the Detail view's "Final price confirmed" readiness item. */
    priceApproved:     priceInfo.priceApproved,
    hasInqRef:         hasInqRef,
    srpRatePR:         srpRatePR,   /* raw SO-approved rate, kept for the NPR_ITEMS re-patch recompute */
    finalPriceConfirmed: fp,   /* raw Selcted_Final_Cost only — kept for anything that still wants the literal quoted amount */
    /* ADDED 2026-07-15, per user ("make the approved editable... still auto populated by
       when pr have rate - srp approved = that rate, when pr doesnt have rate - srp
       approved = final price") — itemRateVal exposed on the mapped object so the sidebar
       can compute the same auto-default the Deluge-side logic already uses elsewhere
       (catalog Rate first, Final Price fallback). srpApprovedPR is the new real header
       field (Number, user-created) backing the editable SRP (Approved) row — blank/never-
       saved means "never manually set" (null, sidebar shows the auto-computed default).
       CHANGED 2026-07-15, per user ("0 should be acceptable"): a genuinely blank/never-
       saved field must map to `null`, NOT 0 — 0 is now a real, distinguishable saved
       value (Books sometimes needs a literal 0 cost price), so collapsing "unset" and
       "explicitly 0" into the same falsy value would make a saved 0 indistinguishable
       from never having saved anything, silently reverting to the auto default. */
    itemRateVal:       itemRateVal,
    srpApprovedPR:     srpApprovedPRVal,
    shipMode:         v('Shipment_Mode')              || '—',
    targetDate:       tdDisplay,
    targetOverdue:    tdOverdue,
    priority:         pri,
    delay:            delay,
    status:           status,
    urgent:           pri === 'HIGH',
    atRisk:           delay === 'At Risk',
    override:         v('Followed_Recommendation') === 'No',
    salesOwner:       safeStr('Sales_Owner'),
    customerType:     safeStr('Customer_Type'),
    similarItem:      v('Similar_Item') === 'true' || v('Similar_Item') === true,
    description:      itemDescription,
    itemId:           itemId,
    remDays:          parseInt(v('Remaining_Days')||'0'),
    leadDays:         parseInt(v('Required_Days_Lead')||'0'),
    delayStatus:      delay,
    shipment:         v('Shipment_Mode'),
    targetDelivery:   fmtDateShort(v('Target_Delivery')||''),
    supTargetDate:    tdDisplay,
    photo:            r['Product_Image_PR']||null,
    /* On Hold / Cancelled (ADDED 2026-10-01) — blank Hold_Status = Active */
    holdStatus:       (function(){ var hs=String(safeStr('Hold_Status')||'').trim(); return (hs==='On Hold'||hs==='Cancelled') ? hs : 'Active'; })(),
    holdReason:       safeStr('Hold_Reason'),
    holdNotes:        v('Hold_Notes'),
    holdDateRaw:      v('Hold_Date'),
    heldBy:           v('Held_By'),
    holdFollowUpRaw:  v('Hold_Follow_Up_Date'),
  };
}

function fmtDateShort(v){
  if(!v) return '—';
  /* YYYY-MM-DD → Apr 20, 2026 */
  if(v.match(/^\d{4}-\d{2}-\d{2}$/)){
    var p = v.split('-');
    var m = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return m[parseInt(p[1],10)-1]+' '+parseInt(p[2],10)+', '+p[0];
  }
  /* DD-MMM-YYYY → Apr 20, 2026 */
  if(v.match(/^\d{2}-[A-Za-z]{3}-\d{4}$/)){
    var dp = v.split('-');
    return dp[1]+' '+parseInt(dp[0],10)+', '+dp[2];
  }
  return v;
}

/* ════════════════════════════════
   CREATOR SDK LOAD
════════════════════════════════ */
function showLoadingState(){
  ['queueBody','allBody'].forEach(function(id){
    var el = $(id);
    if(el) el.innerHTML = '<tr><td colspan="20" style="text-align:center;padding:32px;color:var(--gray-400)"><span style="display:inline-block;width:16px;height:16px;border:2.5px solid var(--gray-200);border-top-color:var(--blue);border-radius:50%;animation:spin .7s linear infinite;margin-right:8px;vertical-align:middle"></span>Loading from Zoho Creator…</td></tr>';
  });
}

function loadFromCreator(){
  /* Exact pattern from working Inq-viewlist widget:
     - No ZOHO.CREATOR.init() call (not a function in this SDK version)
     - Bind getRecords directly then call it
     - Handle error code 9220 = empty report (not a real error) */

  /* Resolve the REAL app_name/owner from the SDK instead of trusting the hardcoded guess —
     addRecords (unlike getRecords) fails with "Invalid Configuration" if app_name is wrong,
     so this must be correct before the user can submit a new PR. Runs in parallel with the
     getRecords call below since it only needs to finish before the user hits Submit PR. */
  if(typeof ZOHO!=='undefined' && ZOHO.CREATOR && ZOHO.CREATOR.UTIL && typeof ZOHO.CREATOR.UTIL.getInitParams==='function'){
    ZOHO.CREATOR.UTIL.getInitParams().then(function(params){
      if(params && params.appLinkName) REAL_APP_NAME = params.appLinkName;
      if(params && params.scope) ACCOUNT_OWNER = params.scope;
      /* Who's logged in — needed for Internal Conversation/Notification to know which
         hardcoded account is viewing. getInitParams() key name for this isn't
         documented/guaranteed — try the same candidate keys the Inquiry-side widget
         found working, in case getInitParams() carries the same info under one of
         them (see resolveCurrentUserEmail() above). */
      resolveCurrentUserEmail(params);
      console.log('[Init] Resolved app_name:', REAL_APP_NAME, 'owner:', ACCOUNT_OWNER, 'user:', CURRENT_USER_EMAIL||'(unresolved)');
    }).catch(function(err){ console.warn('[Init] getInitParams failed, keeping defaults:', err&&err.message||err); });
  }
  /* Defensive second attempt — INQs' own widget found user identity via
     ZOHO.CREATOR.init() rather than getInitParams(). SDK behavior has been observed
     to vary across widgets in this app family, so try it anyway behind a feature
     check; harmless no-op if truly unavailable. */
  if(typeof ZOHO!=='undefined' && ZOHO.CREATOR && typeof ZOHO.CREATOR.init==='function'){
    ZOHO.CREATOR.init().then(resolveCurrentUserEmail).catch(function(){});
  }

  var _timeout = setTimeout(function(){
    console.warn('[PR] getRecords timed out');
    showToast('Creator timeout — check widget permissions');
    renderQueue(); renderAllPRs(); renderConverted(); updateStats();
  }, 10000);

  if(typeof ZOHO === 'undefined' || !ZOHO.CREATOR || !ZOHO.CREATOR.DATA ||
     typeof ZOHO.CREATOR.DATA.getRecords !== 'function'){
    clearTimeout(_timeout);
    console.warn('[PR] SDK not available');
    renderQueue(); renderAllPRs(); renderConverted(); updateStats();
    return;
  }

  var gr = ZOHO.CREATOR.DATA.getRecords.bind(ZOHO.CREATOR.DATA);

  /* Reset in-memory caches on full reload */
  PR_FULL_CACHE = {};
  _cachedGroupingData = null;
  _cachedGroupingTime = 0;

  /* Pre-load New PR dropdowns in parallel with the PR list */
  loadNewPRDropdowns();

  /* Pre-load PO Grouping in background so opening PO Grouping Workspace is instant */
  loadGroupingData();

  /* ADDED 2026-07-15 — populate LIVE_PO_COUNTS as early as possible so
     computeRecommendedSupplier() (main list's "Rec. Supplier" column) uses real live
     data instead of the stale Active_PO_Count fallback from first paint onward. Once
     it resolves, re-render whichever list is currently showing (same
     repatch-then-rerender pattern already used for NPR_ITEMS below). */
  fetchLivePOData(function(){
    if(activeTab==='queue') renderQueue();
    else if(activeTab==='all') renderAllPRs();
    else if(activeTab==='load') refreshSupplierLoadView();
    else if(activeTab==='converted') renderConverted();
    else if(activeTab==='prgroups') renderPrGroups();
  });

  gr({ report_name: REPORT_NAME, page: 1, pageSize: 200 })
    .then(function(resp){
      clearTimeout(_timeout);
      console.log('[PR] getRecords code:', resp && resp.code, '| records:', resp && resp.data && resp.data.length);
      if(resp && resp.code === 3000){
        var raw = Array.isArray(resp.data) ? resp.data : [];
        /* DEBUG — log raw field values for first record to diagnose blank fields */
        if(raw.length > 0){
          var rec0 = raw[0];
          console.log('[PR DEBUG] Sales_Owner raw:', JSON.stringify(rec0['Sales_Owner']));
          console.log('[PR DEBUG] Customer_Type raw:', JSON.stringify(rec0['Customer_Type']));
          console.log('[PR DEBUG] Selected_Supplier raw:', JSON.stringify(rec0['Selected_Supplier']));
          console.log('[PR DEBUG] Selcted_Final_Cost raw:', JSON.stringify(rec0['Selcted_Final_Cost']));
          var inqKeys = Object.keys(rec0).filter(function(k){ return /nq/i.test(k); });
          console.log('[PR DEBUG] Inquiry-like keys found:', inqKeys.join(', ') || '(none)');
          inqKeys.forEach(function(k){ console.log('[PR DEBUG] '+k+' raw:', JSON.stringify(rec0[k])); });
          console.log('[PR DEBUG] Full first record keys:', Object.keys(rec0).join(', '));
        }
        ALL_PR   = raw.map(mapPR);
        /* ADDED 2026-08-25, per user request ("dapat naka descend pag may bagong PR"),
           CHANGED same day ("pati yung PR dapat" — apply the same PR-number-based sort
           already used for the supplier-side Tony PR/Fenteng PR widgets, for
           consistency) — newest PR should show first, keyed off the PR NUMBER's own
           trailing digits (e.g. "PR-2026-8001" -> 20268001) rather than the internal
           Zoho record ID. Queue tab and All PRs tab both render straight off this same
           ALL_PR array (see renderQueue()/renderAllPRs()), so sorting once here covers
           both. Digit-extraction still sorts correctly across a year boundary (e.g.
           "PR-2026-9999" -> "PR-2027-0001") as long as the year+sequence digit width
           stays consistent, same reasoning already verified for the supplier widgets. */
        ALL_PR.sort(function(a,b){
          var na = parseInt(String(a.prNo).replace(/[^0-9]/g,''),10) || 0;
          var nb = parseInt(String(b.prNo).replace(/[^0-9]/g,''),10) || 0;
          return nb - na;
        });
        recomputeReadyPR();
        creatorLoaded = true;
        checkDeepLinkOpenPR();
        console.log('[PR] Mapped:', ALL_PR.length, 'total |', READY_PR.length, 'ready for PO');
        if(ALL_PR.length > 0){
          console.log('[PR DEBUG] Mapped[0] salesOwner:', ALL_PR[0].salesOwner, '| customerType:', ALL_PR[0].customerType, '| selectedSupplier:', ALL_PR[0].selectedSupplier, '| finalPrice:', ALL_PR[0].finalPrice);
        }
      } else {
        console.warn('[PR] getRecords non-3000:', JSON.stringify(resp));
        showToast('Creator error '+(resp&&resp.code)+': '+(resp&&resp.message||''));
      }
      renderQueue(); renderAllPRs(); renderConverted(); updateStats();
      if(document.getElementById('view-group') && document.getElementById('view-group').style.display !== 'none'){
        GROUP_ALL = mergeGroupData(_cachedGroupingData || []);
        buildGroupBuckets();
        renderGroupCards();
      }
    })
    .catch(function(err){
      clearTimeout(_timeout);
      if(errCode(err) === 9220){
        /* 9220 = report is empty — not an error */
        console.log('[PR] Report is empty (9220)');
        ALL_PR = []; READY_PR = [];
        creatorLoaded = true;
      } else {
        console.error('[PR] getRecords threw:', JSON.stringify(err));
        showToast('Creator connection error — see console');
      }
      renderQueue(); renderAllPRs(); renderConverted(); updateStats();
    });
}

function updateStats(){
  $('statTotal').textContent   = READY_PR.length;
  $('statHigh').textContent    = READY_PR.filter(function(r){ return r.priority==='HIGH'; }).length;
  $('statRisk').textContent    = READY_PR.filter(function(r){ return r.atRisk; }).length;
  $('statOverride').textContent= READY_PR.filter(function(r){ return r.override; }).length;
  var nearCap = ALL_PR.reduce(function(acc,r){
    if(r.selectedSupplier && r.selectedSupplier!=='—'&&!acc.includes(r.selectedSupplier)) acc.push(r.selectedSupplier);
    return acc;
  },[]).length;
  $('statCap').textContent = nearCap || 0;
  $('readyCount').textContent = READY_PR.length;
  $('queueBadge').textContent = READY_PR.length;
  $('convertedBadge').textContent = ALL_PR.filter(function(r){ return r.converted; }).length;
  var onHoldCount = ALL_PR.filter(function(r){ return holdStateOf(r)==='On Hold'; }).length;
  $('statHold').textContent = onHoldCount;
  $('onholdBadge').textContent = onHoldCount;
  $('cancelledBadge').textContent = ALL_PR.filter(function(r){ return holdStateOf(r)==='Cancelled'; }).length;
  renderHoldPanels();
  /* PR Groups tab badge — distinct SO#+Customer count, same grouping key buildPrGroups()
     uses, kept in sync here (not just inside renderPrGroups()) so it's accurate even
     before the tab has ever been opened, same convention as queueBadge/convertedBadge. */
  $('prGroupsBadge').textContent = Object.keys(ALL_PR.reduce(function(m,r){ m[r.soNo+'||'+r.customer]=1; return m; },{})).length;
  /* Update pill counts */
  var urgent   = READY_PR.filter(function(r){ return r.urgent; }).length;
  var atRisk   = READY_PR.filter(function(r){ return r.atRisk; }).length;
  var override = READY_PR.filter(function(r){ return r.override; }).length;
  $('queuePills').querySelectorAll('.pill').forEach(function(p){
    var f = p.dataset.filter;
    var counts = {all:READY_PR.length, urgent:urgent, atRisk:atRisk, override:override};
    if(counts[f]!==undefined) p.querySelector('.pill-count').textContent='('+counts[f]+')';
  });

  /* Update All PRs pill counts (were hardcoded in HTML) */
  var ipCount = ALL_PR.filter(function(r){ return r.status!=='Ready for PO' && r.status!=='Converted to PO' && !isPrInactive(r); }).length;
  $('allPills').querySelectorAll('.pill').forEach(function(p){
    var f = p.dataset.filter;
    var sc = p.querySelector('.pill-count');
    if(!sc) return;
    if(f==='other') sc.textContent='('+ipCount+')';
  });
}

/* ── PR number generator uses Creator data ── */
function generatePRNo(){
  var year = new Date().getFullYear();
  var max  = ALL_PR.reduce(function(m,r){
    var parts = (r.prNo||'').split('-');
    var n = parseInt(parts[parts.length-1]);
    return isNaN(n) ? m : Math.max(m, n);
  }, 0);
  return 'PR-'+year+'-'+String(max+1).padStart(4,'0');
}

/* ── Init ── */
/* Add spin keyframe if not present */
if(!document.querySelector('#spinStyle')){
  var s = document.createElement('style');
  s.id = 'spinStyle';
  s.textContent = '@keyframes spin{to{transform:rotate(360deg)}}';
  document.head.appendChild(s);
}

window.addEventListener('load', loadFromCreator);
