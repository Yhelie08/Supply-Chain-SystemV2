/* DMS shared UI primitives -- extracted verbatim from hc-dms-widget (5).html, 2026-10-22.
   Source: Delivery Management System/reference/hc-dms-widget-v5_2026-10-22.html

   Rendering only. The prototype's business logic is deliberately NOT here --
   runEngine, approve, raiseEx, addLog, matchSearch, inInitial/inScheduled/
   inArchived/inField, laneLoad, writeCalendar, setStatus and P all run on demo
   data, and every live widget already has its own live-tested equivalent.

   Load order in a widget:  dms-tokens.css, dms-shell.css, [dms-calendar.css |
   dms-policy.css], then this file.

   Change it HERE and re-copy into the widgets. A hand-edit inside one widget's
   zip is how the ten of them drifted apart in the first place. */

const pad = n => String(n).padStart(2, "0");

const isoOf = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

const addDays = (iso, n) => { const d = new Date(iso + "T00:00:00"); d.setDate(d.getDate() + n); return isoOf(d); };

const toMin = t => { if (!t) return 0; const [h, m] = t.split(":").map(Number); return h * 60 + (m || 0); };

const fmt12 = t => { const m = typeof t === "number" ? t : toMin(t); let h = Math.floor(m / 60); const mm = Math.round(m % 60); const ap = h >= 12 ? "PM" : "AM"; h = h % 12 || 12; return `${h}:${pad(mm)} ${ap}`; };

const to24 = s => { const m = String(s).trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i); if (!m) return "08:00"; let h = +m[1]; const ap = (m[3] || "").toUpperCase(); if (ap === "PM" && h < 12) h += 12; if (ap === "AM" && h === 12) h = 0; return `${pad(h)}:${m[2]}`; };

const nowStamp = () => { const d = new Date(); return `${isoOf(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}`; };

const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const fmtDate = iso => iso ? new Date(iso + "T00:00:00").toLocaleDateString("en-PH", { weekday: "short", month: "short", day: "numeric" }) : "—";

const fmtLong = iso => new Date(iso + "T00:00:00").toLocaleDateString("en-PH", { weekday: "long", month: "long", day: "numeric", year: "numeric" });

const TYPE_COLOR = { "Delivery Only": "--c-delivery", "With Installation": "--c-install", "Full-Day Install": "--c-fullday", "Multi-Day Install": "--c-multiday", "Replacement": "--c-replace", "Site Visit": "--c-site", "Pullout": "--c-pullout" };

const typeColor = o => o && o.fleet === "3rd Party" ? "var(--c-3p)" : `var(${TYPE_COLOR[o.type] || "--c-replace"})`;

const STATUS_CLS = { "Queued": "p-gray", "Pending Confirmation": "p-yel", "Scheduled": "p-acc", "Dispatched": "p-vio", "In Transit": "p-vio", "Delivered": "p-ok", "Completed": "p-ok", "Failed": "p-bad" };

const SEV = { High: { cls: "p-bad", c: "var(--bad)", days: 0 }, Medium: { cls: "p-warn", c: "var(--warn)", days: 2 }, Low: { cls: "p-yel", c: "var(--yel)", days: 5 } };

const RMA_CLS = { "For Approval": "p-yel", "Pullout Scheduled": "p-acc", "Received at WH": "p-vio", "Refunded": "p-ok", "Closed": "p-gray" };

const STAR_LBL = ["Tap a star to rate", "Poor", "Fair", "Good", "Very good", "Excellent"];

const svg = (p, s = 16) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;

const iconBtn = (act, id, label, icon, cls = "") => `<button type="button" class="ibtn ${cls}" data-act="${act}" data-id="${esc(id)}" aria-label="${esc(label)}" data-tip="${esc(label)}">${svg(IC[icon])}</button>`;

const emptyState = (title, hint = "") => `<div class="empty" role="status">${svg(IC.empty, 40)}<b>${esc(title)}</b>${hint ? `<span>${esc(hint)}</span>` : ""}</div>`;

const stars = r => r ? `<span class="stars" role="img" aria-label="${r} out of 5 stars">${"★".repeat(r)}<span>${"★".repeat(5 - r)}</span><b class="stars-n" aria-hidden="true">${r}/5</b></span>` : `<span class="muted">—</span>`;

const fInput = (label, name, val, o = {}) => `<div class="field"><label>${label}${o.req ? ' <span class="req">*</span>' : ""}</label><input type="${o.type || "text"}" name="${name}" value="${esc(val ?? "")}" ${o.req ? "data-required" : ""} ${o.ro ? 'readonly class="ro"' : ""} ${o.step ? `step="${o.step}"` : ""} ${o.min !== undefined ? `min="${o.min}"` : ""} placeholder="${esc(o.ph || "")}"></div>`;

const fSelect = (label, name, opts, val, o = {}) => `<div class="field"><label>${label}${o.req ? ' <span class="req">*</span>' : ""}</label><select name="${name}" ${o.req ? "data-required" : ""}>${o.blank !== undefined ? `<option value="">${esc(o.blank)}</option>` : ""}${opts.map(x => { const [v, l] = Array.isArray(x) ? x : [x, x]; return `<option value="${esc(v)}" ${String(v) === String(val ?? "") ? "selected" : ""}>${esc(l)}</option>`; }).join("")}</select></div>`;

const fRadio = (label, name, on) => `<div class="field"><label>${label}</label><div class="radio"><label><input type="radio" name="${name}" value="Yes" ${on ? "checked" : ""}> Yes</label><label><input type="radio" name="${name}" value="No" ${!on ? "checked" : ""}> No</label></div></div>`;

function actsCell(o, withFb) {
  const next = rowActions(o);
  return `${iconBtn("open", o.id, "View record", "view")}${iconBtn("edit", o.id, "Edit record", "edit")}${withFb ? iconBtn("feedback", o.id, "Customer feedback", "feedback") : ""}${next ? `<span class="sep" aria-hidden="true"></span>${next}` : ""}`;
}

function toast(msg, kind = "ok") {
  const t = document.createElement("div");
  t.className = "toast " + kind; t.setAttribute("role", kind === "bad" ? "alert" : "status");
  t.innerHTML = `<i aria-hidden="true"></i><span>${esc(msg)}</span><button type="button" aria-label="Dismiss notification">${svg(IC.close, 14)}</button>`;
  const box = $("#toasts"); box.appendChild(t);
  /* Tactile cue on phones (ignored where unsupported or motion is reduced) */
  try { if ((kind === "bad" || kind === "warn") && navigator.vibrate && !matchMedia("(prefers-reduced-motion: reduce)").matches) navigator.vibrate(kind === "bad" ? [40, 60, 40] : 30); } catch (_) {}
  while (box.children.length > 4) box.firstElementChild.remove();
  const life = kind === "bad" ? 7000 : kind === "warn" ? 5500 : 3800;
  let timer;
  const close = () => { clearTimeout(timer); t.classList.add("out"); setTimeout(() => t.remove(), 260); };
  const start = () => { timer = setTimeout(close, life); };
  t.addEventListener("mouseenter", () => clearTimeout(timer));
  t.addEventListener("mouseleave", start);
  t.addEventListener("focusin", () => clearTimeout(timer));
  t.querySelector("button").onclick = close;
  start();
}

function showModal(html, onSubmit) {
  const m = $("#modal");
  if (!m.classList.contains("on")) modalOpener = document.activeElement;
  const seq = ++modalSeq;
  m.innerHTML = html; m.className = "modal on"; m.scrollTop = 0; $("#scrim").classList.add("on");
  syncInert();
  const h = m.querySelector("header h3"); if (h) { h.id = "modalTitle"; m.setAttribute("aria-labelledby", "modalTitle"); }
  const d = m.querySelector("header p"); if (d) { d.id = "modalDesc"; m.setAttribute("aria-describedby", "modalDesc"); }
  const f = m.querySelector("form");
  /* Link every label to its control */
  f.querySelectorAll(".field").forEach((fld, i) => {
    const lab = fld.querySelector(":scope > label"), ctl = fld.querySelector(":scope > input, :scope > select, :scope > textarea");
    if (lab && ctl && !lab.htmlFor) { if (!ctl.id) ctl.id = `mf-${seq}-${i}`; lab.htmlFor = ctl.id; }
    const rg = fld.querySelector(".radio"); if (rg && lab) { rg.setAttribute("role", "radiogroup"); rg.setAttribute("aria-label", lab.textContent.trim()); }
  });
  /* Inline validation: message under the field, checked as the user types */
  f.querySelectorAll("[data-required]").forEach(el => {
    const fld = el.closest(".field"); if (!fld) return;
    el.setAttribute("aria-required", "true");
    const msg = document.createElement("div"); msg.className = "msg"; msg.id = (el.id || el.name) + "-msg"; msg.textContent = "This field is required";
    fld.appendChild(msg); el.setAttribute("aria-describedby", msg.id);
    const check = () => { const bad = !String(el.value).trim(); fld.classList.toggle("err", bad); el.setAttribute("aria-invalid", bad); };
    el.addEventListener("input", () => { el.dataset.touched = "1"; if (fld.classList.contains("err")) check(); });
    el.addEventListener("change", () => { el.dataset.touched = "1"; if (fld.classList.contains("err")) check(); });
    el.addEventListener("blur", () => { if (el.dataset.touched) check(); });
  });
  f.onsubmit = e => {
    e.preventDefault();
    const sub = f.querySelector(".m-foot button:not([type=button])");
    if (sub && sub.getAttribute("aria-busy") === "true") return;
    let firstBad = null;
    f.querySelectorAll("[data-required]").forEach(el => {
      const bad = !String(el.value).trim(), fld = el.closest(".field");
      if (fld) fld.classList.toggle("err", bad); el.setAttribute("aria-invalid", bad);
      if (bad && !firstBad) firstBad = el;
    });
    if (firstBad) {
      const n = f.querySelectorAll(".field.err").length;
      f.querySelectorAll(".field.err").forEach(x => { x.classList.remove("shake"); void x.offsetWidth; x.classList.add("shake"); });
      toast(`${n} required field${n > 1 ? "s" : ""} missing`, "warn"); firstBad.focus(); return;
    }
    const data = Object.fromEntries(new FormData(f).entries());
    f.querySelectorAll("input[type=checkbox]").forEach(c => data[c.name] = c.checked);
    const label = sub ? sub.innerHTML : "";
    if (sub) { sub.setAttribute("aria-busy", "true"); sub.disabled = true; sub.innerHTML = `<span class="spin" aria-hidden="true"></span>Saving…`; }
    setTimeout(() => {
      let res;
      try { res = onSubmit(data); } catch (err) { console.error(err); toast("Something went wrong — nothing was saved", "bad"); res = false; }
      if (res !== false) { if (seq === modalSeq) closeModal(); }
      else if (sub && sub.isConnected) { sub.removeAttribute("aria-busy"); sub.disabled = false; sub.innerHTML = label; }
    }, 220);
  };
  m.querySelector("[data-cancel]").onclick = closeModal;
  setTimeout(() => { const first = f.querySelector("input:not([readonly]):not([type=hidden]),select,textarea,.m-foot button:not([type=button])"); if (first) first.focus(); }, 60);
}

function shakeEl(el) { if (el && el.classList) { el.classList.remove("shake"); void el.offsetWidth; el.classList.add("shake"); } }

function announce(msg) { const r = $("#srLive"); if (r) { r.textContent = ""; setTimeout(() => r.textContent = msg, 30); } }

function trapFocus(e) {
  const box = $("#modal").classList.contains("on") ? $("#modal") : $("#drawer").classList.contains("on") ? $("#drawer") : ($("#side").classList.contains("on") && window.innerWidth <= 960) ? $("#side") : null;
  if (!box) return;
  const f = [...box.querySelectorAll('button,[href],input:not([type=hidden]),select,textarea,[tabindex]:not([tabindex="-1"])')].filter(x => !x.disabled && x.offsetParent !== null);
  if (!f.length) return;
  const first = f[0], last = f[f.length - 1];
  if (!box.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
  else if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
}

function paintStars(v) {
  document.querySelectorAll("#starPick [data-star]").forEach(b => { b.classList.toggle("on", +b.dataset.star <= v); b.setAttribute("aria-pressed", +b.dataset.star === v); });
  const l = $("#starLbl"); if (l) l.textContent = STAR_LBL[v || 0];
}

function initSigPad(existing) {
  const c = $("#sig"); sigPad.canvas = c; sigPad.drawn = false; sigPad.cleared = false;
  const ctx = c.getContext && c.getContext("2d"); sigPad.ctx = ctx;
  if (!ctx) return;
  const w = c.offsetWidth || 600, h = c.offsetHeight || 170, dpr = window.devicePixelRatio || 1;
  c.width = Math.round(w * dpr); c.height = Math.round(h * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.lineWidth = 2.2; ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.strokeStyle = "#1a1f29";
  if (existing) { const img = new Image(); img.onload = () => ctx.drawImage(img, 0, 0, w, h); img.src = existing; }
  let down = false;
  const pos = e => { const r = c.getBoundingClientRect(); return [(e.clientX - r.left) * (w / r.width), (e.clientY - r.top) * (h / r.height)]; };
  c.onpointerdown = e => {
    down = true; c.setPointerCapture && c.setPointerCapture(e.pointerId);
    const [x, y] = pos(e); ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + .1, y + .1); ctx.stroke();
    if (!sigPad.drawn) { sigPad.drawn = true; $("#sigPh").textContent = ""; $("#sigState").textContent = "Signature captured"; }
  };
  c.onpointermove = e => { if (!down) return; const [x, y] = pos(e); ctx.lineTo(x, y); ctx.stroke(); };
  c.onpointerup = c.onpointercancel = () => { down = false; };
}

function clearSig() {
  const c = sigPad.canvas; if (!c) return;
  if (sigPad.ctx) { sigPad.ctx.save(); sigPad.ctx.setTransform(1, 0, 0, 1, 0, 0); sigPad.ctx.clearRect(0, 0, c.width, c.height); sigPad.ctx.restore(); }
  sigPad.drawn = false; sigPad.cleared = true;
  $("#sigPh").textContent = "Sign here"; $("#sigState").textContent = "Use mouse, finger or stylus";
}
