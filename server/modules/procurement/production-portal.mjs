// The supplier's Production screen of the spec v1.4 (02 Procurement / 07 Supplier Portal, 04 Ship and Track).
//
// The supplier works on its own copy of the shipment (Tony_Shipment / Fenteng_Shipment, never on the buyer's Shipments, which holds
// customer names). The copy carries only what the supplier may see: the lines, the planned production dates, its own reports.
//   supplier writes   Report_Prod_Event (production_started | production_finished) + Report_Prod_Date (the day it happened)
//                     Prod_Photo (a production photo)                                                    [SP-R4, ST-R3]
//   server does       checks the rules while the supplier is still on the screen (before), then on the parent shipment: copies the photo,
//                     records the stage event with source = supplier (when it happened + when we were told), re-plans, re-scores,
//                     and refreshes the view fields on the copy (refreshSupplierView in ship-track.mjs).
// A production finished report needs a production photo (ST-R3); this closes the gap the supplier's ship-date path still has.
import { register } from '../../workflows/index.mjs';
import { ZohoError, zohoNow } from '../../criteria.mjs';
import { blank, idOf } from '../../workflows/deluge.mjs';
import { occurredFrom, logEvent } from './events.mjs';
import { applyShipmentEvent, effectiveStage, refreshSupplierView } from './ship-track.mjs';

const text = (v) => (blank(v) || String(v) === 'null' ? '' : String(v));
const refuse = (m) => { throw new ZohoError(2001, m); };
const COPIES = ['Tony_Shipment', 'Fenteng_Shipment'];
const EVENTS = ['production_started', 'production_finished'];
const PHOTO_TYPES = /\.(jpe?g|png|heic|webp|pdf)$/i; // ST-R3 (10 MB is checked by the upload endpoint)

async function parentOf(store, copy) {
  const id = idOf(copy.Parent_Shipment_ID);
  if (id === '') return null;
  return store.getRecordById('Shipments', id, { raw: true }).catch(() => null);
}

for (const form of COPIES) {
  register(form, {
    beforeUpdate: async ({ input, previous, store }) => {
      const ev = text(input.Report_Prod_Event);
      const photo = text(input.Prod_Photo);
      if (photo !== '' && !PHOTO_TYPES.test(photo.split('?')[0])) refuse('A production photo must be JPG, PNG, HEIC, WebP or PDF.');
      if (ev === '') {
        if (text(input.Report_Prod_Date) !== '') refuse('Say what happened (production started or finished) with the date.');
        return;
      }
      if (!EVENTS.includes(ev)) refuse(`Unknown production report "${ev}".`);
      const rec = { ...(previous || {}), ...input };
      const parent = await parentOf(store, rec);
      if (!parent) refuse('This shipment is not linked to an order any more.');
      if (effectiveStage(parent) !== 'production') refuse('This shipment has already left Production.');
      occurredFrom(text(input.Report_Prod_Date)); // refuses a date in the future (SP-R4)
      if (ev === 'production_finished' && text(rec.Prod_Photo) === '' && blank(parent.Production_Photos)) {
        refuse('Add at least one production photo before you report production finished.');
      }
    },

    afterUpdate: async ({ record, previous, id, store }) => {
      const copyId = text(record.ID || id);
      const parent = await parentOf(store, record);
      if (!parent) return;
      const photo = text(record.Prod_Photo);
      const newPhoto = photo !== '' && photo !== text(previous?.Prod_Photo);
      const ev = text(record.Report_Prod_Event);
      const date = text(record.Report_Prod_Date);
      if (newPhoto) {
        // the photo shows on the shipment, on Receiving and on any exception later (ST-R4)
        await store.updateRecord('Shipments', parent.ID, { Production_Photos: photo, Last_Supplier_Update_At: zohoNow() }, { byForm: true });
        await logEvent(store, { recordType: 'shipment', recordId: parent.ID, recordNo: parent.Shipment_No, event: 'shipment.production_photo', occurredAt: zohoNow(), source: 'supplier', note: photo.split('/').pop() });
      }
      if (ev !== '') {
        await store.updateRecord(form, copyId, { Report_Prod_Event: '', Report_Prod_Date: '' }, { byForm: true });
        await applyShipmentEvent(store, parent.ID, ev, { occurredAt: date, source: 'supplier', gate: true })
          .catch((e) => console.error('[production-portal]', ev, e.message));
      }
      await refreshSupplierView(store, parent.ID);
    },
  });
}
