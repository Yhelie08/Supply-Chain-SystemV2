// Procurement custom APIs: the ported ones, and a "not ported yet" placeholder for the rest.
import { withPlaceholders } from '../../custom-api-helpers.mjs';
import { add_item_by_id, create_books_contact, fetch_customer_from_books } from './books-apis.mjs';
import { create_estimate } from './estimates.mjs';
import { search_items_akeneo, fetch_item_from_akeneo } from './akeneo-apis.mjs';
import { create_receiving_from_shipment } from './receiving-buttons.mjs';
import { clone_shipment_for_replacement } from './clone-shipment.mjs';
import { approve_po_main, approve_po_tony, approve_po_fenteng, Approve_P_O_H_C } from './po-approval.mjs';
import { create_rr_main, create_rr_tony, create_rr_fenteng } from './replacement-requests.mjs';
import { preview_procurement_setting, recalculate_shipments, get_procurement_settings } from './settings-hooks.mjs';
import { get_born_late_rate, get_po_tracking } from './po-spec.mjs';
import { get_rr_report } from './rr-spec.mjs';
import { get_procurement_dashboard } from './dashboard.mjs';

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
  // spec v1.4 (no Deluge function behind them): the Procurement Settings page
  preview_procurement_setting: 'SpecV14_PreviewProcurementSetting',
  recalculate_shipments: 'SpecV14_RecalculateShipments',
  get_procurement_settings: 'SpecV14_GetProcurementSettings',
  get_born_late_rate: 'SpecV14_GetBornLateRate',
  get_po_tracking: 'SpecV14_GetPoTracking',
  get_rr_report: 'SpecV14_GetRrReport',
  get_procurement_dashboard: 'SpecV14_GetProcurementDashboard',
};

export const apis = withPlaceholders(functions, {
  add_item_by_id, create_books_contact, create_estimate, fetch_customer_from_books, search_items_akeneo, fetch_item_from_akeneo,
  create_receiving_from_shipment, clone_shipment_for_replacement,
  approve_po_main, approve_po_tony, approve_po_fenteng, Approve_P_O_H_C, create_rr_main, create_rr_tony, create_rr_fenteng,
  preview_procurement_setting, recalculate_shipments, get_procurement_settings, get_born_late_rate, get_po_tracking, get_rr_report, get_procurement_dashboard,
});
