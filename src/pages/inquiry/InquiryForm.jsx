import { useMemo, useState } from 'react';
import { useStore } from '../../store.jsx';
import { FormFields, Modal } from '../../ui/components.jsx';
import {
  AVAILABILITY, BULB_TYPES, COLLATERAL_FIELDS, COLLATERAL_VALUES, COLOR_TEMPS, COMMISSIONS, CUSTOMER_TYPES, ORDER_TYPES, PROJECT_TYPES,
  QUOTE_STAGES, SALES_OWNERS, UNITS, WAITING_ON, blankInquiryData, emptyQuote, quoteFinal,
} from '../../domain/inquiry.js';
import { PricingCard, ReadinessCard, Combo, Field, Section, goTo } from './parts.jsx';

const KEYS = Object.keys(blankInquiryData());
const lc = (s) => String(s || '').trim().toLowerCase();

function toForm(q) {
  const blank = blankInquiryData();
  const out = {};
  KEYS.forEach((k) => { out[k] = q[k] === undefined ? blank[k] : structuredClone(q[k]); });
  return out;
}

// A dropdown that also accepts a typed value, for fields where "Other" is a legal answer.
function SelectOther({ id, value, options, onChange }) {
  const isOther = value !== '' && !options.includes(value);
  const [forced, setForced] = useState(isOther);
  const showOther = forced || isOther;
  return (
    <>
      <select id={id} value={showOther ? '__other__' : value} onChange={(e) => {
        if (e.target.value === '__other__') { setForced(true); onChange(''); } else { setForced(false); onChange(e.target.value); }
      }}>
        <option value="">— Select —</option>
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
        <option value="__other__">— Other (type it) —</option>
      </select>
      {showOther && <input className="other-input" value={value} placeholder="Type it" onChange={(e) => onChange(e.target.value)} aria-label="Other value" />}
    </>
  );
}

export default function InquiryForm({ mode, inquiry }) {
  const { db, act, notify } = useStore();
  const editing = mode === 'edit';
  const locked = editing && inquiry.status === 'Sales Order';
  const [f, setF] = useState(() => (editing ? toForm(inquiry) : blankInquiryData()));
  const [itemText, setItemText] = useState(editing ? inquiry.item : '');
  const [customerText, setCustomerText] = useState(editing ? inquiry.customer : '');
  const [projectText, setProjectText] = useState(editing ? inquiry.projectName : '');
  const [errors, setErrors] = useState({});
  const [modal, setModal] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));
  const clear = (id) => setErrors((e) => (e[id] ? { ...e, [id]: false } : e));
  const bad = (id) => !!errors[id];

  const customerProjects = useMemo(() => db.projects.filter((p) => p.customerId === f.customerId), [db.projects, f.customerId]);
  const tagged = editing ? inquiry.suppliers : db.suppliers.filter((s) => !s.stock).map((s) => s.name);
  const group = editing ? inquiry.quoteGroup : '';

  // ── Pickers: typing matches an exact name to a master record and autofills from it ──
  const onItemText = (text) => {
    setItemText(text);
    clear('fItems');
    const m = db.products.find((p) => lc(p.name) === lc(text));
    setF((s) => {
      if (editing && !m) return { ...s, itemId: '' };
      const next = { ...s, itemId: m ? m.id : '', sku: m ? m.sku : '', description: m ? m.description : '', unit: (m && m.unit) || 'pcs' };
      if (!editing) next.srp = m && m.rate > 0 ? m.rate : '';
      return next;
    });
  };
  const pickItem = (p) => { setItemText(p.name); clear('fItems'); setF((s) => ({ ...s, itemId: p.id, sku: p.sku, description: p.description, unit: p.unit || 'pcs', ...(editing ? {} : { srp: p.rate > 0 ? p.rate : '' }) })); };

  const onCustomerText = (text) => {
    setCustomerText(text);
    clear('fCustomer');
    const m = db.customers.find((c) => lc(c.name) === lc(text));
    setF((s) => {
      const changed = (m ? m.id : '') !== s.customerId;
      return {
        ...s, customerId: m ? m.id : '', customerType: m && CUSTOMER_TYPES.includes(m.type) ? m.type : s.customerType,
        ...(changed ? { projectId: '' } : {}),
      };
    });
    if ((m ? m.id : '') !== f.customerId) setProjectText('');
  };
  const pickCustomer = (o) => onCustomerText(o.label);

  const onProjectText = (text) => {
    setProjectText(text);
    const m = customerProjects.find((p) => lc(p.name) === lc(text));
    setF((s) => ({ ...s, projectId: m ? m.id : '', ...(m && m.type ? { projectType: m.type } : {}) }));
  };

  // ── Supplier quotes ──
  const usedSuppliers = f.quotes.map((q) => q.supplier);
  const freeSupplier = db.suppliers.map((s) => s.name).find((n) => !usedSuppliers.includes(n));
  const setQuote = (i, patch) => setF((s) => ({
    ...s,
    quotes: s.quotes.map((q, j) => {
      if (j !== i) return patch.selected ? { ...q, selected: false } : q; // only one supplier can be Selected
      const next = { ...q, ...patch };
      if (!(Number(next.initial) > 0)) next.negotiated = 0; // Negotiated stays locked until Initial has a value
      return next;
    }),
  }));

  const addFiles = (key, files) => set(key, [...f[key], ...Array.from(files).map((x) => ({ name: x.name, size: x.size, type: x.type }))]);
  const dropFile = (key, i) => set(key, f[key].filter((_, j) => j !== i));

  // ── Submit: the same checks, in the same order, as the widget's Submit button ──
  const validate = () => {
    const checks = [
      [!itemText.trim(), 'fItems', 'Please enter an Item Name.'],
      [itemText.trim() && !f.itemId, 'fItems', 'Please pick the Item from the suggestion list (typed text did not match any item).'],
      [!customerText.trim(), 'fCustomer', 'Please enter a Customer.'],
      [customerText.trim() && !f.customerId, 'fCustomer', 'Please pick the Customer from the suggestion list (typed text did not match any customer).'],
      [!f.customerType, 'fCustomerType', 'Please select a Customer Type.'],
      [!f.salesOwner, 'fSalesOwner', 'Please select a Sales Owner.'],
      [!f.targetDate, 'fTargetDate', 'Please enter a Target Date.'],
      [!(parseInt(f.qty, 10) > 0), 'fQuantity', 'Please enter a Quantity greater than 0.'],
    ];
    const hit = checks.find((c) => c[0]);
    if (!hit) return true;
    setErrors({ [hit[1]]: true });
    notify('refuse', hit[2]);
    const el = document.getElementById(hit[1]);
    if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); el.focus(); }
    return false;
  };

  const submit = () => {
    if (locked || !validate()) return;
    setBusy(true);
    const data = { ...f, qty: parseInt(f.qty, 10), srp: Number(f.srp) || 0 };
    const res = editing ? act('inquiryUpdate', { id: inquiry.id, data }) : act('inquiryCreate', { data });
    setBusy(false);
    if (res) goTo(editing ? inquiry.id : '');
  };

  const preview = { quotes: f.quotes, collateral: f.collateral, srp: f.srp };
  const inv = (id) => (bad(id) ? 'invalid' : '');

  return (
    <section className="screen inquiry-form">
      <header className="screen-head">
        <div className="head-left">
          <button className="btn" onClick={() => goTo(editing ? inquiry.id : '')}>← {editing ? 'Back to inquiry' : 'INQ List'}</button>
          <div>
            <h1>{editing ? `Edit ${inquiry.no}` : 'New Inquiry'}</h1>
            <p className="muted">{editing ? 'Changes are written to the timeline.' : 'The inquiry number is assigned when you save.'}</p>
          </div>
        </div>
        <div className="head-actions">
          <button className="btn" onClick={() => goTo(editing ? inquiry.id : '')}>Cancel</button>
          <button className="btn btn-primary" onClick={submit} disabled={busy || locked}>{busy ? 'Saving…' : editing ? 'Save Changes' : 'Submit Inquiry'}</button>
        </div>
      </header>
      {locked && <div className="notice notice-bad">{inquiry.no} became {inquiry.soNo} and is locked, so it cannot be edited.</div>}

      <div className="form-layout">
        <div className="form-main">
          <Section title="Customer">
            <div className="field-grid">
              <Field label="Customer" req id="fCustomer">
                <Combo
                  id="fCustomer" value={customerText} onChange={onCustomerText} invalid={bad('fCustomer')} placeholder="Search or create a customer"
                  options={db.customers.map((c) => ({ id: c.id, label: c.name }))} onPick={pickCustomer}
                  onAdd={(text) => setModal({ kind: 'customer', text })} addLabel={(t) => (t ? `+ Create new customer "${t}"` : '+ Create new customer')} emptyText="No matching customers"
                />
              </Field>
              <Field label="Customer Type" req id="fCustomerType">
                <select id="fCustomerType" className={inv('fCustomerType')} value={f.customerType} onChange={(e) => { set('customerType', e.target.value); clear('fCustomerType'); }}>
                  <option value="">— Select type —</option>
                  {CUSTOMER_TYPES.map((t) => <option key={t}>{t}</option>)}
                </select>
              </Field>
              <Field label="Design Company" id="fDesignCompany"><input id="fDesignCompany" value={f.designCompany} onChange={(e) => set('designCompany', e.target.value)} placeholder="Enter design company" /></Field>
              <Field label="Design Partner" id="fDesignPartner">
                <select id="fDesignPartner" value={f.designPartner} onChange={(e) => set('designPartner', e.target.value)}><option>No</option><option>Yes</option></select>
              </Field>
              <Field label="Designer/Architect" id="fDesignerArchitect"><input id="fDesignerArchitect" value={f.designerArchitect} onChange={(e) => set('designerArchitect', e.target.value)} placeholder="Enter designer/architect" /></Field>
            </div>
            <div className="field-section">Project</div>
            <div className="field-grid">
              <Field label="Project" id="fProject" hint={f.customerId ? '' : 'Select a customer first.'}>
                <Combo
                  id="fProject" value={projectText} onChange={onProjectText} placeholder={f.customerId ? 'Search or create a project' : 'Select a customer first'}
                  options={customerProjects.map((p) => ({ id: p.id, label: p.name }))}
                  onPick={(p) => onProjectText(p.label)} emptyText={f.customerId ? 'No matching projects' : 'Select a customer first'}
                  onAdd={f.customerId ? (text) => setModal({ kind: 'project', text }) : undefined} addLabel={(t) => (t ? `+ Create new project "${t}"` : '+ Create new project')}
                />
              </Field>
              <Field label="Project Name" id="fProjectName"><input id="fProjectName" value={f.projectId ? projectText : ''} readOnly placeholder="Auto-filled from Project" /></Field>
              <Field label="Project Type" id="fProjectType">
                <select id="fProjectType" value={f.projectType} onChange={(e) => set('projectType', e.target.value)}>
                  <option value="">— Select type —</option>{PROJECT_TYPES.map((t) => <option key={t}>{t}</option>)}
                </select>
              </Field>
            </div>
            <div className="field-section">Suppliers</div>
            <Field label="Suppliers (auto-selected)" wide>
              <div className="chips">{tagged.map((n) => <span key={n} className="chip">{n}</span>)}</div>
            </Field>
            <div className="field-section">Quote &amp; Discounts</div>
            <div className="field-grid">
              <Field label="Quote Group" id="fQuoteGroup"><input id="fQuoteGroup" value={group || ''} readOnly placeholder="Assigned on save" /></Field>
              <Field label="Group Discount Percentage" id="fGroupDiscountPct"><input id="fGroupDiscountPct" type="number" min="0" max="100" step="0.01" value={f.groupDiscountPct} onChange={(e) => set('groupDiscountPct', e.target.value)} placeholder="0" /></Field>
              <Field label="Additional Discount Needed" id="fAddtlDiscNeeded">
                <select id="fAddtlDiscNeeded" value={f.addtlDiscNeeded} onChange={(e) => set('addtlDiscNeeded', e.target.value)}><option>No</option><option>Yes</option></select>
              </Field>
            </div>
          </Section>

          <Section title="Sales">
            <div className="field-grid">
              <Field label="Sales Owner" req id="fSalesOwner">
                <select id="fSalesOwner" className={inv('fSalesOwner')} value={f.salesOwner} onChange={(e) => { set('salesOwner', e.target.value); clear('fSalesOwner'); }}>
                  <option value="">— Select owner —</option>{SALES_OWNERS.map((o) => <option key={o}>{o}</option>)}
                </select>
              </Field>
              <Field label="Waiting On" id="fWaitingOn">
                <select id="fWaitingOn" value={f.waitingOn} onChange={(e) => set('waitingOn', e.target.value)}>{WAITING_ON.map((o) => <option key={o} value={o}>{o === 'None' ? '— None —' : o}</option>)}</select>
              </Field>
              <Field label="Created" id="fCreatedDate"><input id="fCreatedDate" readOnly value={editing ? (inquiry.createdAt || '').slice(0, 10) : 'Set on save'} /></Field>
              <Field label="Order Type" id="fOrderType">
                <select id="fOrderType" value={f.orderType} onChange={(e) => set('orderType', e.target.value)}>{ORDER_TYPES.map((o) => <option key={o}>{o}</option>)}</select>
              </Field>
              <Field label="Commission" id="fCommission">
                <select id="fCommission" value={f.commission} onChange={(e) => set('commission', Number(e.target.value))}>{COMMISSIONS.map((c) => <option key={c} value={c}>{c}</option>)}</select>
              </Field>
              <label className="check-field"><input type="checkbox" checked={f.forBidding} onChange={(e) => set('forBidding', e.target.checked)} /> For Bidding</label>
            </div>
          </Section>

          <Section title="Item Details">
            <div className="field-grid">
              <Field label="Item Name" req id="fItems" wide>
                <Combo
                  id="fItems" value={itemText} onChange={onItemText} invalid={bad('fItems')} placeholder="Enter item name" startsWith
                  options={db.products.slice().sort((a, b) => a.name.localeCompare(b.name)).map((p) => ({ id: p.id, label: p.name, p }))}
                  onPick={(o) => pickItem(o.p)} onAdd={() => setModal({ kind: 'item' })} addLabel="+ Add item by ID (not in catalog yet)" emptyText="No matching items"
                />
              </Field>
              <Field label="SKU" id="fSku"><input id="fSku" value={f.sku} readOnly={!editing} onChange={(e) => set('sku', e.target.value)} placeholder="Auto-filled from Item Name" /></Field>
              <Field label="Quantity" req id="fQuantity"><input id="fQuantity" className={inv('fQuantity')} type="number" min="0" value={f.qty} onChange={(e) => { set('qty', e.target.value); clear('fQuantity'); }} placeholder="0" /></Field>
              <Field label="Description" id="fDescription" wide><input id="fDescription" value={f.description} readOnly={!editing} onChange={(e) => set('description', e.target.value)} placeholder="Auto-filled from Item Name" /></Field>
              <Field label="Unit" id="fUnit">
                <select id="fUnit" value={f.unit} disabled={!editing} onChange={(e) => set('unit', e.target.value)}>{UNITS.map((u) => <option key={u}>{u}</option>)}</select>
              </Field>
              <Field label="Target Date" req id="fTargetDate"><input id="fTargetDate" className={inv('fTargetDate')} type="date" value={f.targetDate} onChange={(e) => { set('targetDate', e.target.value); clear('fTargetDate'); }} /></Field>
              <label className="check-field wide"><input type="checkbox" checked={f.openToSimilar} onChange={(e) => set('openToSimilar', e.target.checked)} /> Open to similar design: accepts equivalent alternatives</label>
            </div>
            <div className="field-section">Specifications <small>(optional)</small></div>
            <div className="field-grid">
              <Field label="Dimension" id="fDimension"><input id="fDimension" value={f.dimension} onChange={(e) => set('dimension', e.target.value)} placeholder="e.g. 600 x 600 x 150 mm" /></Field>
              <Field label="Color Body" id="fColorBody"><input id="fColorBody" value={f.colorBody} onChange={(e) => set('colorBody', e.target.value)} placeholder="e.g. Matte Black" /></Field>
              <Field label="Color Temperature" id="fColorTemp"><SelectOther id="fColorTemp" value={f.colorTemperature} options={COLOR_TEMPS} onChange={(v) => set('colorTemperature', v)} /></Field>
              <Field label="Type of Bulb" id="fBulbType" hint="Pick from the list or type your own.">
                <Combo id="fBulbType" value={f.bulbType} onChange={(v) => set('bulbType', v)} options={BULB_TYPES.map((b) => ({ id: b, label: b }))} onPick={(o) => set('bulbType', o.label)} placeholder="— Select —" />
              </Field>
              <Field label="Voltage" id="fVoltage"><input id="fVoltage" value={f.voltage} onChange={(e) => set('voltage', e.target.value)} placeholder="e.g. 220-240V" /></Field>
              <Field label="Lumens" id="fLumens"><input id="fLumens" value={f.lumens} onChange={(e) => set('lumens', e.target.value)} placeholder="e.g. 1200 lm" /></Field>
            </div>
            <div className="field-section">Notes &amp; Files</div>
            <Field label="Additional Details / Description" id="fAddDesc" wide>
              <textarea id="fAddDesc" rows={3} value={f.additionalDescription} onChange={(e) => set('additionalDescription', e.target.value)} placeholder="Enter additional product details, specifications, notes, or special requirements…" />
            </Field>
            <Field label="Attachments" wide hint="File names are kept. The files themselves are not stored in this local build.">
              <input type="file" multiple aria-label="Attachments" accept="image/*,video/*,.pdf,.obj,.3mf,.fbx,.stl,.dwg,.dxf" onChange={(e) => { addFiles('attachments', e.target.files); e.target.value = ''; }} />
              <div className="chips">{f.attachments.map((a, i) => <span key={a.name + i} className="chip">📎 {a.name}<button type="button" aria-label={`Remove ${a.name}`} onClick={() => dropFile('attachments', i)}>×</button></span>)}</div>
            </Field>
          </Section>

          <Section title="Supplier Quotes">
            {f.quotes.length === 0 ? (
              <div className="empty small">No supplier quotes yet. Click “+ Add Quote” to add one.</div>
            ) : (
              <div className="table-wrap">
                <table className="table quotes-table">
                  <thead><tr><th>Supplier</th><th>Availability</th><th>Initial Price (¥)</th><th>Negotiated (¥)</th><th>Final Price (¥)</th><th>Lead Time</th><th>Stage</th><th>Selected</th><th /></tr></thead>
                  <tbody>
                    {f.quotes.map((q, i) => (
                      <tr key={i} className={q.selected ? 'row-selected' : ''}>
                        <td data-label="Supplier">
                          <select aria-label="Supplier" value={q.supplier} onChange={(e) => setQuote(i, { supplier: e.target.value })}>
                            <option value={q.supplier}>{q.supplier || 'Choose…'}</option>
                            {db.suppliers.map((s) => s.name).filter((n) => n !== q.supplier && !usedSuppliers.includes(n)).map((n) => <option key={n}>{n}</option>)}
                          </select>
                        </td>
                        <td data-label="Availability"><select aria-label="Availability" value={q.availability} onChange={(e) => setQuote(i, { availability: e.target.value })}>{AVAILABILITY.map((a) => <option key={a}>{a}</option>)}</select></td>
                        <td data-label="Initial"><input aria-label="Initial price" type="number" min="0" step="0.01" placeholder="0.00" value={q.initial || ''} onChange={(e) => setQuote(i, { initial: e.target.value })} /></td>
                        <td data-label="Negotiated"><input aria-label="Negotiated price" type="number" min="0" step="0.01" placeholder="0.00" disabled={!(Number(q.initial) > 0)} title={Number(q.initial) > 0 ? '' : 'Enter the Initial price first'} value={q.negotiated || ''} onChange={(e) => setQuote(i, { negotiated: e.target.value })} /></td>
                        <td data-label="Final"><input aria-label="Final price" readOnly value={quoteFinal(q) || ''} placeholder="0.00" /></td>
                        <td data-label="Lead time"><input aria-label="Lead time" value={q.leadTime} placeholder="e.g. 2 weeks" onChange={(e) => setQuote(i, { leadTime: e.target.value })} /></td>
                        <td data-label="Stage"><select aria-label="Stage" value={q.stage} onChange={(e) => setQuote(i, { stage: e.target.value })}>{QUOTE_STAGES.map((s) => <option key={s}>{s}</option>)}</select></td>
                        <td data-label="Selected" className="center"><input type="checkbox" aria-label="Selected" checked={q.selected} onChange={(e) => setQuote(i, { selected: e.target.checked })} /></td>
                        <td><button type="button" className="btn-del-row" aria-label="Remove quote" onClick={() => setF((s) => ({ ...s, quotes: s.quotes.filter((_, j) => j !== i) }))}>×</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="quotes-foot">
              <button type="button" className="btn btn-sm" disabled={!freeSupplier} onClick={() => setF((s) => ({ ...s, quotes: [...s.quotes, emptyQuote(freeSupplier)] }))}>+ Add Quote</button>
              <span className="hint">Final price is the Negotiated price if entered, otherwise the Initial price. Only one supplier can be Selected.</span>
            </div>
          </Section>

          <Section title="Product Collateral">
            <div className="collateral-grid">
              {COLLATERAL_FIELDS.map(([k, label]) => (
                <div key={k} className="collateral-item">
                  <label htmlFor={`coll-${k}`}>{label}</label>
                  <select id={`coll-${k}`} className={`coll coll-${f.collateral[k].replace('/', '')}`} value={f.collateral[k]} onChange={(e) => set('collateral', { ...f.collateral, [k]: e.target.value })}>
                    {COLLATERAL_VALUES.map((v) => <option key={v}>{v}</option>)}
                  </select>
                </div>
              ))}
            </div>
            <div className="field-grid">
              <Field label="Similar Design Photo" wide hint="File names are kept. The photos themselves are not stored in this local build.">
                <input type="file" multiple accept="image/*" aria-label="Similar design photos" onChange={(e) => { addFiles('similarPhotos', e.target.files); e.target.value = ''; }} />
                <div className="chips">{f.similarPhotos.map((a, i) => <span key={a.name + i} className="chip">📷 {a.name}<button type="button" aria-label={`Remove ${a.name}`} onClick={() => dropFile('similarPhotos', i)}>×</button></span>)}</div>
              </Field>
              <Field label="Specification Details" id="fSpecDetails" wide><input id="fSpecDetails" value={f.specDetails} onChange={(e) => set('specDetails', e.target.value)} placeholder="Enter specification details" /></Field>
            </div>
          </Section>
        </div>

        <aside className="form-side">
          <ReadinessCard inq={preview} />
          <PricingCard inq={preview}>
            <div className="srp-row">
              <label htmlFor="fSrp">SRP (Approved)</label>
              <div className="srp-input-wrap"><span>₱</span><input id="fSrp" type="number" min="0" step="0.01" placeholder="0.00" value={f.srp} onChange={(e) => set('srp', e.target.value)} /></div>
            </div>
          </PricingCard>
        </aside>
      </div>

      {modal && modal.kind === 'customer' && (
        <CustomerModal prefill={modal.text} onClose={() => setModal(null)} onSaved={(c) => { onCustomerText(c.name); setModal(null); }} />
      )}
      {modal && modal.kind === 'project' && (
        <ProjectModal prefill={modal.text} customer={db.customers.find((c) => c.id === f.customerId)} onClose={() => setModal(null)}
          onSaved={(p) => { setProjectText(p.name); setF((s) => ({ ...s, projectId: p.id, projectType: p.type || s.projectType })); setModal(null); }} />
      )}
      {modal && modal.kind === 'item' && (
        <ItemModal onClose={() => setModal(null)} onSaved={(p) => { pickItem(p); setModal(null); }} />
      )}
    </section>
  );
}

// ───────────── "create new" modals: customer, project, catalog item ─────────────

function MasterModal({ title, intro, fields, initial, submit, onClose, onSubmit }) {
  const [values, setValues] = useState(initial);
  const list = typeof fields === 'function' ? fields(values) : fields;
  const setValue = (k, v) => setValues((s) => ({ ...s, [k]: v }));
  return (
    <Modal title={title} onClose={onClose} footer={
      <>
        <button className="btn" onClick={onClose}>Cancel</button>
        <button type="submit" form="master-form" className="btn btn-primary">{submit}</button>
      </>
    }>
      <form id="master-form" onSubmit={(e) => { e.preventDefault(); onSubmit(values); }}>
        {intro && <p className="intro">{intro}</p>}
        <FormFields fields={list} values={values} setValues={setValues} setValue={setValue} />
      </form>
    </Modal>
  );
}

const ADDR = (p, label) => [
  { key: `${p}Line1`, label: `${label} address line 1` }, { key: `${p}Line2`, label: `${label} address line 2` },
  { key: `${p}City`, label: 'City / district' }, { key: `${p}State`, label: 'State / province' },
  { key: `${p}Zip`, label: 'Postal code' }, { key: `${p}Country`, label: 'Country' },
];
const pickAddr = (v, p) => ({ line1: v[`${p}Line1`], line2: v[`${p}Line2`], city: v[`${p}City`], state: v[`${p}State`], zip: v[`${p}Zip`], country: v[`${p}Country`] });

function CustomerModal({ prefill, onClose, onSaved }) {
  const { act } = useStore();
  return (
    <MasterModal
      title="New Customer" submit="Save Customer" onClose={onClose}
      intro="The live widget also creates the matching contact in Zoho Books. This standalone build keeps the customer locally."
      initial={{ name: prefill || '', type: '', companyName: '', email: '', phone: '', mobile: '', sameAsBilling: true, billLine1: '', billLine2: '', billCity: '', billState: '', billZip: '', billCountry: '', shipLine1: '', shipLine2: '', shipCity: '', shipState: '', shipZip: '', shipCountry: '' }}
      fields={(v) => [
        { key: 'name', label: 'Customer Name', required: true },
        { key: 'type', label: 'Customer Type', type: 'select', options: CUSTOMER_TYPES },
        { key: 'companyName', label: 'Company Name' }, { key: 'email', label: 'Email', type: 'email' },
        { key: 'phone', label: 'Phone' }, { key: 'mobile', label: 'Mobile' },
        ...ADDR('bill', 'Billing'),
        { key: 'sameAsBilling', label: 'Shipping address is the same as billing', type: 'checkbox' },
        ...(v.sameAsBilling ? [] : ADDR('ship', 'Shipping')),
      ]}
      onSubmit={(v) => {
        const res = act('customerCreate', {
          name: v.name, type: v.type, companyName: v.companyName, email: v.email, phone: v.phone, mobile: v.mobile,
          billing: pickAddr(v, 'bill'), sameAsBilling: v.sameAsBilling, shipping: pickAddr(v, 'ship'),
        });
        if (res) onSaved(res.customers.find((c) => c.id === res.last));
      }}
    />
  );
}

function ProjectModal({ prefill, customer, onClose, onSaved }) {
  const { act } = useStore();
  return (
    <MasterModal
      title="New Project" submit="Save Project" onClose={onClose}
      intro={`Customer: ${customer ? customer.name : '—'}. The project code (PRJ-xxxxx) is assigned automatically and the project starts Active.`}
      initial={{ name: prefill || '', groupDiscountPct: 0, type: '' }}
      fields={[
        { key: 'name', label: 'Project Name', required: true },
        { key: 'groupDiscountPct', label: 'Quote Discount Percentage', type: 'number' },
        { key: 'type', label: 'Project Type', type: 'select', options: PROJECT_TYPES },
      ]}
      onSubmit={(v) => {
        const res = act('projectCreate', { name: v.name, customerId: customer && customer.id, groupDiscountPct: v.groupDiscountPct, type: v.type });
        if (res) onSaved(res.projects.find((p) => p.id === res.last));
      }}
    />
  );
}

function ItemModal({ onClose, onSaved }) {
  const { act } = useStore();
  return (
    <MasterModal
      title="Add Item by ID" submit="Add Item" onClose={onClose}
      intro="The live widget fetches these details from Zoho Books by Item ID. This standalone build asks you to enter them. An ID already in the catalog updates that item."
      initial={{ bookId: '', name: '', sku: '', rate: '', unit: 'pcs', category: 'Lighting', description: '' }}
      fields={[
        { key: 'bookId', label: 'Item ID', required: true }, { key: 'name', label: 'Item Name', required: true },
        { key: 'sku', label: 'SKU' }, { key: 'rate', label: 'Rate (₱)', type: 'number' },
        { key: 'unit', label: 'Unit', type: 'select', options: UNITS }, { key: 'category', label: 'Category', type: 'select', options: ['Lighting', 'Fixtures', 'Electrical'] },
        { key: 'description', label: 'Description', type: 'textarea' },
      ]}
      onSubmit={(v) => {
        const res = act('productCreate', v);
        if (res) onSaved(res.products.find((p) => p.id === res.last));
      }}
    />
  );
}
