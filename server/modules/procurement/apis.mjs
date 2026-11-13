// Procurement custom APIs: the ported ones, and a "not ported yet" placeholder for the rest.
import { withPlaceholders } from '../../custom-api-helpers.mjs';
import { add_item_by_id, create_books_contact, fetch_customer_from_books } from './books-apis.mjs';
import { create_estimate } from './estimates.mjs';
import { search_items_akeneo, fetch_item_from_akeneo } from './akeneo-apis.mjs';

// Custom API name -> the Deluge function it runs (zoho-export/parsed/functions/).
// approve_po_* are what the Purchase Request tab's "Create PO" button calls (helper callApprovePOApi);
// Approve_P_O_H_C is the link name Creator generated for approvePOHC.
export const functions = {
  add_item_by_id: 'addItemByIdBooks',
  create_books_contact: 'createBooksContact',
  fetch_customer_from_books: 'fetchCustomerFromBooks',
  search_items_akeneo: 'searchItemsAkeneo',
  fetch_item_from_akeneo: 'fetchItemFromAkeneo',
  create_estimate: 'createEstimateForInquiry',
  approve_po_main: 'approvePOMain',
  approve_po_fenteng: 'approvePOFenteng',
  approve_po_tony: 'approvePOTony',
  Approve_P_O_H_C: 'approvePOHC',
  create_bin_receiving: 'createBinReceivingWidget',
  create_receiving_from_shipment: 'createReceivingFromShipmentWidget',
  clone_shipment_for_replacement: 'cloneShipmentForReplacement',
  create_rr_main: 'createRRMain',
  create_rr_tony: 'createRRTony',
  create_rr_fenteng: 'createRRFenteng',
};

export const apis = withPlaceholders(functions, { add_item_by_id, create_books_contact, create_estimate, fetch_customer_from_books, search_items_akeneo, fetch_item_from_akeneo });
