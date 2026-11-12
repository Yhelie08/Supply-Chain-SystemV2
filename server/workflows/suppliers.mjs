// What the Inquiry and Purchase Request workflows share about the two supplier portals.
import { unbracket, truthy } from './deluge.mjs';

// Each portal: the Books vendor id that identifies the supplier, the name its rows carry, and where its copies live.
export const SUPPLIERS = [
  { key: 'tony', n: '2', name: 'Tony', form: 'Supplier_2', booksId: '2680178000002735078', nameToken: 'tony', imageField: 'Product_Image_Supplier2_INQ',
    notifications: 'Tony_Notifications', page: 'Tony_Fan_Inquiries', param: 'tonyinquiriesid', emailEnv: 'TONY_PORTAL_EMAIL', prForm: 'Tony_Fan_Purchase_Request' },
  { key: 'fenteng', n: '1', name: 'Fenteng', form: 'Supplier_1', booksId: '2680178000049168001', nameToken: 'fenteng', imageField: 'Product_Image_Supplier1_INQ',
    notifications: 'Fenteng_Notifications', page: 'Fenteng_Lighting_Inquiries', param: 'fentenginquiriesid', emailEnv: 'FENTENG_PORTAL_EMAIL', prForm: 'Fenteng_Lighting_Purchase_Request' },
];

// All Suppliers records by record ID. `name` is the first name (what quote rows carry), `displayName` falls back to the last name.
export async function supplierIndex(store) {
  const rows = await store.find('Suppliers');
  return new Map(rows.map((r) => {
    const name = r.Supplier_Name?.first_name ?? '';
    return [String(r.ID), {
      id: String(r.ID), name, displayName: name || (r.Supplier_Name?.last_name ?? ''), booksId: String(r.Supplier_ID ?? ''),
      handlesAll: truthy(r.Handles_All), categories: r.Supported_Categories, maxCapacity: r.Max_Capacity,
    }];
  }));
}

// The Books vendor id of the supplier a quote row belongs to ('' when unknown).
export const quoteBooksId = (quote, suppliers) => suppliers.get(unbracket(quote.Supplier_ID))?.booksId ?? '';
