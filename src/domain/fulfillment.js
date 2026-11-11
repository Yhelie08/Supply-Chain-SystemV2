// Constants and derived facts for the Fulfillment and Delivery pages.

export const DELIVERY_TYPES = ['Delivery', 'Pick Up', 'Installation'];
export const WAREHOUSES = ['Main Warehouse', 'Showroom', 'Bodega 2'];
export const TRUCKS = ['Truck 1', 'Truck 2', 'Truck 3'];
export const EC_STATES = ['Pending', 'In Rework', 'Completed', 'Unrepairable'];

// The stage a Sales Order is at: the earliest stage any of its items is still in.
const ORDER_OF = ['Waiting for Package', 'Order Readiness', 'Picking', 'Quality Checking', 'Crate', 'For Delivery', 'Delivered'];
export function orderStage(items) {
  const name = (i) => {
    if (i.stage === 'Dispatched') return 'Delivered';
    if (i.stage === 'Order Aggregation') return 'For Delivery';
    if (i.stage === 'Crate') return 'Crate';
    if (i.stage === 'QC') return 'Quality Checking';
    if (i.stage === 'Pick') return 'Picking';
    return i.pac ? 'Order Readiness' : 'Waiting for Package';
  };
  return items.map(name).sort((a, b) => ORDER_OF.indexOf(a) - ORDER_OF.indexOf(b))[0];
}
export { ORDER_OF };

// One row per Sales Order for the Sales Order Report.
export function orderRows(db) {
  const by = new Map();
  db.items.forEach((i) => { if (!by.has(i.soNo)) by.set(i.soNo, []); by.get(i.soNo).push(i); });
  return [...by.entries()].map(([soNo, items]) => {
    const inq = db.inquiries.find((q) => q.soNo === soNo);
    const hasException = db.exceptions.some((e) => e.source === 'Fulfillment' && e.status !== 'Closed' && items.some((i) => i.id === e.itemId));
    return {
      id: soNo, soNo, customer: items[0].customer, items, lines: items.length, qty: items.reduce((n, i) => n + i.qty, 0),
      stage: orderStage(items), pac: items[0].pac || '', deliveryType: items[0].deliveryType || '', orderType: inq ? inq.orderType : 'Normal',
      exception: hasException, canPackage: items.every((i) => !i.pac) && items.every((i) => i.received && i.stage === 'Readiness Gate'),
      createdOn: items[0].createdOn,
    };
  }).sort((a, b) => (a.createdOn < b.createdOn ? 1 : a.createdOn > b.createdOn ? -1 : b.soNo.localeCompare(a.soNo)));
}
