// Unpack every widget zip (the source that was uploaded to Zoho Creator) into tools/widgets/<section>/<tab>/
// and write server/pages.json: the sections and tabs in the same order as the Zoho app menu.
//
//   node tools/import-widgets.mjs ["C:/Users/User/Downloads/Deluge script"]
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const SRC = process.argv[2] || 'C:/Users/User/Downloads/Deluge script';
const ROOT = path.resolve(import.meta.dirname, '..');
// One folder per section, named exactly like the app's section dropdown, so developers can browse it.
const OUT = path.join(ROOT, 'modules');

// [Zoho page link name, tab label, widget zip relative to SRC]   — order = Zoho menu order.
// hidden: reachable by links from other widgets, but not shown as a tab (same as Zoho).
const SECTIONS = [
  { id: 'analytic', label: 'Analytic', tabs: [
    ['Supply_Chain_Analytic', 'Supply Chain Analytic', '_Shared/Widget/Supply Chain Conversion/SupplyChainConversion.zip', { guess: true }],
  ] },
  { id: 'procurement', label: 'Procurement', tabs: [
    ['Dashboard', 'Dashboard', 'Procurement/Dashboard/Widget/ProcurementDashboard.zip'],
    ['Inquiry', 'Inquiry List', 'Procurement/Inquiry/Widget/INQsv2.zip'],
    ['Purchase_Request', 'Purchase Request', 'Procurement/Purchase Request/Widget/PRs.zip'],
    ['Purchase_Order1', 'Purchase Order', 'Procurement/Purchase Order/Widget/POs.zip'],
    ['Shipments1', 'Shipments', 'Procurement/Shipments/Widget/Shipmentsv2.zip'],
    ['Receiving1', 'Receiving', 'Procurement/Receiving/Widget/Receiving.zip'],
    ['Replacement_Request1', 'Replacement Request', 'Procurement/Replacement/Widget/ReplacementRequest.zip'],
    ['Exceptions1', 'Exceptions', 'Procurement/Exceptions/Widget/Exception.zip'],
    ['Forecast_Setting', 'Forecast Setting', '_Shared/Forecast/Widget/Delivery Forecast/DeliveryForecast.zip', { guess: true }],
  ] },
  { id: 'tony-fan', label: 'Tony Fan', tabs: [
    ['Tony_Fan_Inquiries', 'Inquiries', 'Procurement/Supplier - Tony Fan/Widget/Tony Inq/Tony-Inquiries.zip'],
    ['Tony_Fan_PR', 'Purchase Request', 'Procurement/Supplier - Tony Fan/Widget/Tony PR/Tony-PR.zip'],
    ['Tony_Fan_PO', 'Purchase Order', 'Procurement/Supplier - Tony Fan/Widget/Tony PO/Tony-PO.zip'],
    ['Tony_Shipments', 'Shipments', 'Procurement/Supplier - Tony Fan/Widget/Tony Shipment/Tony-Shipment.zip'],
    ['Replacement_Request_Tony', 'Replacement Request', 'Procurement/Supplier - Tony Fan/Widget/Tony Replacement Request/Tony-RR.zip'],
  ] },
  { id: 'fenteng-lighting', label: 'Fenteng Lighting', tabs: [
    ['Fenteng_Lighting_Inquiries', 'Inquiries', 'Procurement/Supplier - Fenteng/Widget/Fengteng Inq/Fenteng-Inquiries.zip'],
    ['Fenteng_Lighting_PR', 'Purchase Request', 'Procurement/Supplier - Fenteng/Widget/Fenteng PR/Fenteng-PR.zip'],
    ['Fenteng_Lighting_PO', 'Purchase Order', 'Procurement/Supplier - Fenteng/Widget/Fenteng PO/Fenteng-PO.zip'],
    ['Fenteng_Shipments', 'Shipments', 'Procurement/Supplier - Fenteng/Widget/Fenteng Shipment/Fenteng-Shipment.zip'],
    ['Replacement_Request_Fenteng', 'Replacement Request', 'Procurement/Supplier - Fenteng/Widget/Fenteng Repalcement Request/Fenteng-RR.zip'],
  ] },
  { id: 'fulfillment', label: 'Fulfillment', tabs: [
    ['Fulfillment_Dashboard', 'Fulfillment Dashboard', 'Fulfillment/Scoreboard/Widget/Scoreboard.zip'],
    ['SOR', 'Sales Order Report', 'Fulfillment/SO Report/Widget/SO.zip'],
    ['Pre_Order2', 'Pre-Order', 'Fulfillment/Pre-Order/Widget/PreOrderReport.zip'],
    ['Order_Readiness1', 'Order Readiness', 'Fulfillment/Order Readiness/Widget/ReadinessGate.zip'],
    ['Pick2', 'Pick', 'Fulfillment/Pick/Widget/Pick.zip'],
    ['Quality_Check', 'Pack & QC', 'Fulfillment/QC Checklist/Widget/QCChecklist.zip'],
    ['Crate1', 'Crate', 'Fulfillment/Crate/Widget/CrateChecklist.zip'],
    ['Order_Aggregation2', 'To Ship', 'Fulfillment/Order Aggregation/Widget/OrderAggregation.zip'],
    ['Exception_Control2', 'Exception Control', 'Fulfillment/Exception Control/Widget/ExceptionControl.zip'],
    ['Transfer_Item', 'Transfer Item', 'Fulfillment/Transfer Item/Widget/TransferWarehouse.zip'],
    ['KANBAN', 'Kanban', 'Fulfillment/KANBAN/Widget/FulfillmentKanban.zip', { hidden: true }],
  ] },
  // Delivery widgets were unpacked earlier into modules/Delivery Management/<tab label>.
  { id: 'delivery', label: 'Delivery Management', tabs: [
    ['Delivery_Analytics1', 'Delivery Analytics'], ['Daily_Team_Availability1', 'Daily Team Availability'],
    ['Initial_Scheduling1', 'Initial Scheduling'], ['Service_Request2', 'Service Request'],
    ['Service_Appointment1', 'Service Appointment'], ['Ongoing_Service1', 'Ongoing Service'], ['Archived', 'Archived'],
    ['Field_Service_Site_Visits1', 'Field Service Site Visits'], ['Sales_Returns1', 'Sales Returns'],
    ['DMS_Exception_Queue1', 'DMS Exception Queue'], ['Truck_Maintenance', 'Truck Maintenance'],
    ['Policy_Setting', 'Policy Settings', null, { hidden: true }],
  ] },
];

const safe = (s) => s.replace(/[^\w .&-]+/g, '_').trim();
const sections = [];
for (const sec of SECTIONS) {
  const tabs = [];
  for (const [page, label, zip, opts = {}] of sec.tabs) {
    const dir = path.join(OUT, sec.label, safe(label));
    if (zip) {
      const zipPath = path.join(SRC, zip);
      if (!fs.existsSync(zipPath)) { console.warn(`MISSING ${page}: ${zipPath}`); continue; }
      fs.rmSync(dir, { recursive: true, force: true });
      fs.mkdirSync(dir, { recursive: true });
      execFileSync(process.platform === 'win32' ? 'C:/Windows/System32/tar.exe' : 'tar', ['-xf', zipPath, '-C', dir]); // Windows 10+ tar reads zip
    }
    const app = path.join(dir, 'app');
    if (!fs.existsSync(app)) { console.warn(`NO app/ folder for ${page} in ${dir}`); continue; }
    const entry = fs.existsSync(path.join(app, 'index.html')) ? 'index.html' : fs.readdirSync(app).find((f) => f.endsWith('.html'));
    tabs.push({ page, label, widget: `${sec.label}/${safe(label)}`, entry, ...(zip ? { zip } : {}), ...opts });
  }
  sections.push({ id: sec.id, label: sec.label, tabs });
}
fs.writeFileSync(path.join(ROOT, 'server', 'pages.json'), JSON.stringify(sections, null, 2) + '\n');
for (const s of sections) console.log(`${s.label.padEnd(20)} ${s.tabs.filter((t) => !t.hidden).length} tabs${s.tabs.some((t) => t.hidden) ? ` (+${s.tabs.filter((t) => t.hidden).length} hidden)` : ''}`);
