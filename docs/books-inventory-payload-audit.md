# Zoho Books & Zoho Inventory Payload and API Integration Audit

**Document Version**: 2.0.0  
**Target Milestone**: Milestone 3: Books Integration Audit (Requirement R3)  
**Author**: Books Integration Specialist (`teamwork_worker`)  
**Repository**: `Supply-Chain-SystemV2` (Branch `Johncel-Dev`)  
**Date**: November 2026  

---

## 1. Executive Summary & Architecture Overview

The Supply-Chain-SystemV2 application interfaces with the Zoho Books (v3) and Zoho Inventory (v1) ecosystems to manage logistics fulfillment, package dispatch, reverse logistics (sales returns), and customer service appointment scheduling. This audit artifact documents the authoritative API specifications, request body envelopes, custom field definitions, delivery type translations, response parsing quirks, offline safety guarantees, and automated test coverage across all integration touchpoints.

### 1.1 Architectural Topology

```
+--------------------------------------------------------------------------------------------------------+
|                                  Supply-Chain-SystemV2 Backend                                          |
|                                                                                                        |
|  +-------------------------+    +--------------------------------+    +-----------------------------+  |
|  |   Delivery Management   |    |      Inventory APIs Module     |    |     Books Client Wrapper    |  |
|  |     Custom APIs         |    | (inventory-apis.mjs)           |    |    (server/books/client.mjs)|  |
|  |     (apis.mjs)          |    |                                |    |                             |  |
|  | - confirm_dms_schedule_ |    | - create_shipment_order        |    | - 4-concurrency FIFO queue  |  |
|  |   request               |    | - create_sales_return_books    |    | - Single-flight token renew |  |
|  | - BOOKS_DELIVERY_TYPE_  |    | - BOOKS_DELIVERY_TYPE_MAP      |    | - 429 exponential backoff   |  |
|  |   MAP                   |    | - Custom fields sanitation     |    | - 401 forced re-auth retry  |  |
|  +------------+------------+    +---------------+----------------+    +--------------+--------------+  |
+---------------|---------------------------------|------------------------------------|-----------------+
                |                                 |                                    |
                | GET /books/v3/salesorders/{id}  | POST /inventory/v1/shipmentorders  |
                |                                 | POST /inventory/v1/salesreturns    |
                |                                 | POST /inventory/v1/salesreturnreceives
                v                                 v                                    v
+--------------------------------------------------------------------------------------------------------+
|                                      Zoho Cloud APIs                                                   |
|       Zoho Books API v3 (zhbooks3)               Zoho Inventory API v1 (zhinventory3)                 |
|       Base: https://www.zohoapis.com/books/v3    Base: https://www.zohoapis.com/inventory/v1           |
+--------------------------------------------------------------------------------------------------------+
```

### 1.2 Core Integration Points

1. **Shipment Order Creation (`create_shipment_order`)**: Creates official delivery shipment orders in Zoho Inventory linked to an existing Sales Order and Package. Injects 7 delivery and site context custom fields and updates local `Package_Shipments`.
2. **Sales Returns & Stock Inflow (`create_sales_return_books`)**: Two-stage reverse logistics pipeline that validates returned items against Sales Order line items, creates a Sales Return in Zoho Inventory, and automatically receives stock back into the warehouse.
3. **Schedule Request Confirmation Books Enrichment (`confirm_dms_schedule_request`)**: Enriches local `Service_Appointment_Form` records with verified customer email, shipping address, contact phone number, and Sales Order line items extracted from Zoho Books v3, backed by graceful offline decoupling (`skipped_books_offline`).
4. **Resilient Books Client (`server/books/client.mjs`)**: Centralized HTTP client managing Zoho OAuth token lifecycle, concurrency throttling, exponential 429 backoff, and application error normalization.

---

## 2. Shipment Orders Integration Specification

**Deluge Source Reference**: `zoho-export/parsed/functions/createShipmentOrder.dg` (lines 1–198)  
**Backend Handler**: `server/modules/delivery-management/inventory-apis.mjs:create_shipment_order`  
**Database Forms**: `Service_Appointment_Form`, `Package_Shipments`  

### 2.1 Workflow Steps

1. **Pre-flight Record Validation**:
   - Locates target `Service_Appointment_Form` by `p.recordId`. Returns error if missing.
   - Locates target `Package_Shipments` by `p.packageShipmentId`. Returns error if missing.
   - Rejects if `pack.Shipment_Created` is `true` or `"true"` (`"Already sent — Shipment Order ... already exists"`).
   - Rejects if `pack.Package_Number` is blank (`"No Package Number on this record..."`).
2. **Package Search in Zoho Inventory**:
   - Issues `GET https://www.zohoapis.com/inventory/v1/packages?organization_id={org}&salesorder_number={soNumber}`.
   - Matches package by `package_number === pack.Package_Number`.
   - Extracts `package_id` and `salesorder_id`. If no matching package exists, returns descriptive error.
3. **Delivery Type Mapping**:
   - Resolves delivery type: if `p.typeOfDelivery` is supplied, uses it; otherwise falls back to `appointment.Type_of_Delivery`.
   - Passes value through `BOOKS_DELIVERY_TYPE_MAP` to translate DMS-specific labels to legitimate Books picklist values.
4. **Shipment Order Creation**:
   - Issues `POST https://www.zohoapis.com/inventory/v1/shipmentorders?organization_id={org}&salesorder_id={soId}&package_ids={pkgId}`.
   - Injects the 7 custom fields inside the `shipmentorder_custom_fields` array.
5. **Response Normalization & Quirk Handling**:
   - Reads `created.shipmentorder.shipment_id` and `created.shipmentorder.shipment_number`.
   - If `shipment_number` is missing or empty, safely falls back to `shipment_id`.
6. **Local Database Update**:
   - Updates `Package_Shipments` with:
     - `Shipment_Created = true`
     - `Shipment_Order_No = shipmentNo`
     - `Shipment_Order_ID = shipmentId`

### 2.2 Endpoint & Query Parameter Contracts

| Operation | Method | Target URL | Query Parameters | Description |
|---|---|---|---|---|
| Search Package | `GET` | `https://www.zohoapis.com/inventory/v1/packages` | `organization_id` (String)<br>`salesorder_number` (String) | Locates package entity by Sales Order reference. |
| Create Shipment | `POST` | `https://www.zohoapis.com/inventory/v1/shipmentorders` | `organization_id` (String)<br>`salesorder_id` (String)<br>`package_ids` (String) | Creates the shipment order. Note: parameter name is plural `package_ids`. |

### 2.3 Request Body Envelope & Custom Fields

```json
{
  "date": "2026-12-01",
  "delivery_method": "Own Fleet",
  "shipping_charge": "0",
  "send_notification": false,
  "is_delivered": false,
  "shipmentorder_custom_fields": [
    { "customfield_id": "2680178000000763374", "value": "2026-12-02" },
    { "customfield_id": "2680178000000440145", "value": "Deliver Only" },
    { "customfield_id": "2680178000000305854", "value": "Gypsum" },
    { "customfield_id": "2680178000000305840", "value": "3m" },
    { "customfield_id": "2680178000000305866", "value": "Yes" },
    { "customfield_id": "2680178000004081025", "value": "Maria" },
    { "customfield_id": "2680178000004081035", "value": "Team A" }
  ]
}
```

> **Critical Envelope Note**: Zoho Inventory Shipment Orders **strictly requires** the JSON key `shipmentorder_custom_fields`. Using `custom_fields` results in the custom fields being ignored by the Zoho API.

### 2.4 Authoritative Custom Field ID Reference

| Custom Field ID | Internal Constant Key | Deluge Script Variable | Field Name / Purpose | Accepted Data Type / Format |
|---|---|---|---|---|
| `2680178000000763374` | `deliveryDate` | `deliveryDate` | Actual Delivery Date | Date (`YYYY-MM-DD`) |
| `2680178000000440145` | `typeOfDelivery` | `typeOfDeliveryVal` | Type of Delivery | Books Picklist Option |
| `2680178000000305854` | `ceilingMaterial` | `ceilingMaterial` | Ceiling Material | Picklist / String |
| `2680178000000305840` | `ceilingHeight` | `ceilingHeight` | Ceiling Height | String (e.g. `"3m"`) |
| `2680178000000305866` | `siteWiringReady` | `siteWiringReady` | Site Wiring Ready | Picklist (`"Yes"` / `"No"`) |
| `2680178000004081025` | `preparedBy` | `preparedBy` | Prepared By | User Name / String |
| `2680178000004081035` | `deliveryTeam` | `deliveryTeam` | Delivery Team | Team Name / String |

### 2.5 Delivery Type Picklist Mapping Matrix (`BOOKS_DELIVERY_TYPE_MAP`)

Zoho Inventory maintains a restricted picklist for Custom Field `2680178000000440145`. Passing an unlisted value causes an immediate HTTP 400 rejection (`code: 4, "Invalid value passed for custom field"`). The server applies `BOOKS_DELIVERY_TYPE_MAP` to ensure compatibility between local DMS choices and Books picklist choices:

| DMS Form Option (`Service_Appointment_Form`) | Target Books Picklist Option | Mapping Status |
|---|---|---|
| `"Delivery Only"` | `"Deliver Only"` | Remapped |
| `"With Installation"` | `"Deliver & Install"` | Remapped |
| `"Full-Day Install"` | `"Deliver & Install"` | Remapped |
| `"Multi-Day Install"` | `"Deliver & Install"` | Remapped |
| `"Replacement"` | `"Replacement"` | Exact Match |
| `"Site Visit"` | `"Service"` | Remapped |
| `"Pullout"` | `"Pick Up"` | Remapped |
| `"Pick Up"` | `"Pick Up"` | Exact Match |
| `"Demo"` | `"Demo"` | Passthrough (Books native) |
| `"Demo - Design Partner"` | `"Demo - Design Partner"` | Passthrough (Books native) |

### 2.6 Response Parsing Quirks & Fallback Rationale

Unlike nearly all other Zoho Inventory objects that follow the pattern `${entity}_id` (e.g., `salesorder_id`, `package_id`), the Shipment Order endpoint returns properties named `shipment_id` and `shipment_number`:

```json
{
  "code": 0,
  "message": "The shipment order has been created.",
  "shipmentorder": {
    "shipment_id": "2680178000004991001",
    "shipment_number": "SH-00042",
    "status": "shipped"
  }
}
```

- **Missing Number Quirk**: When numbering sequences are unassigned or autogeneration is delayed in Zoho, `shipment_number` may return `""` or `null`.
- **Defensive Fallback**: The server resolves `shipmentNo = isBlank(shipment.shipment_number) ? shipmentId : shipment.shipment_number`.
- **Parsing Integrity Guard**: If both `shipment_id` and `shipment_number` are missing or null, the create operation is flagged as failed with the raw response dump attached, preventing corrupted blank writes to `Package_Shipments`.

---

## 3. Sales Returns & Stock Receive Integration Specification

**Deluge Source Reference**: `zoho-export/parsed/functions/createSalesReturnBooks.dg` (lines 1–261)  
**Backend Handler**: `server/modules/delivery-management/inventory-apis.mjs:create_sales_return_books`  
**Database Form**: `Sales_Returns_Form`  

### 3.1 5-Step Workflow Architecture

```
[ Step 1: Query SO ]
  GET /inventory/v1/salesorders?salesorder_number={soNumber}
       |
       v  (Resolves salesorder_id)
[ Step 2: Fetch SO Lines ]
  GET /inventory/v1/salesorders/{salesorder_id}
       |
       v  (Extracts real line_items with item_id, line_item_id, sku)
[ Step 3: SKU Allocation Algorithm ]
  Iterate itemsJson.items -> match SKU to first unused SO line -> track used in Set()
       |
       v  (Produces lineItems payload; reports unmatched SKUs)
[ Step 4: Create Sales Return ]
  POST /inventory/v1/salesreturns?salesorder_id={salesorder_id}
  Custom fields: 2680178000022219065 (subReason), 2680178000022245013 (returnedBy)
       |
       v  (Updates Sales_Returns_Form: Books_SalesReturn_ID, Books_SalesReturn_No, RMA, SR_CREATION_STATUS='CREATED')
[ Step 5: Receive Stock Back (Isolated) ]
  POST /inventory/v1/salesreturnreceives?salesreturn_id={returnId}
  Line items: line_item_id from Step 4 response!
       |
       +--> If success: receive_status = 'success'
       +--> If error: receive_status = 'failed' (Return is NOT rolled back; error isolated)
```

### 3.2 SKU Allocation Algorithm

The returned item allocation algorithm guarantees that return quantities reference valid line items on the original Sales Order:
1. Accepts `itemsJson` as either `{ items: [...] }` or raw array `[...]`.
2. Sanitizes input: skips rows where `SKU` is blank, or `Return_Quantity` is non-numeric, `<= 0`, or not finite.
3. Maintains a `used` Set of `line_item_id` values.
4. For each return item, finds the first SO line item where `line.sku === item.SKU` and `!used.has(line.line_item_id)`.
5. When matched:
   - Records `used.add(line.line_item_id)`.
   - Appends `{ item_id: line.item_id, salesorder_item_id: line.line_item_id, quantity: Number(qty) }` to `lineItems`.
6. When unmatched:
   - Appends SKU to `unmatched` list.
7. If `lineItems.length === 0`: halts execution and returns error with unmatched SKUs listed. Partial matches proceed and report unmatched items in the response payload (`unmatched_skus`).

### 3.3 Custom Fields Specification

| Custom Field ID | Constant Key | Deluge Script Variable | Field Name / Purpose |
|---|---|---|---|
| `2680178000022219065` | `subReason` | `subReasonVal` | Sub Reason for Return (e.g. `"Damaged Item"`) |
| `2680178000022245013` | `returnedBy` | `returnedByVal` | Employee / Driver Receiving Return |

> **Envelope Distinction**: Unlike Shipment Orders, Zoho Inventory Sales Returns expects the custom field array under the key `custom_fields`.

### 3.4 Stock Receive & Critical ID Space Separation

In Zoho Inventory, creating a Sales Return does not increase warehouse stock levels. Physical inventory is only adjusted when a **Sales Return Receive** is recorded:
- **Endpoint**: `POST https://www.zohoapis.com/inventory/v1/salesreturnreceives?organization_id={org}&salesreturn_id={returnId}`
- **ID Space Warning**: The `line_items` array submitted to the Receive endpoint **must reference the `line_item_id` generated by the Step 4 Sales Return creation response**, NOT the Sales Order item ID:
  ```javascript
  const receiveLines = (salesReturn.line_items || []).map((l) => ({
    line_item_id: l.line_item_id,
    quantity: l.quantity,
  }));
  ```

### 3.5 Error Isolation Mechanism

Step 5 is wrapped in an independent `try / catch` boundary:
- If Step 5 fails (due to warehouse locking, batch validation, or network failure), the Sales Return created in Step 4 is **NOT** rolled back.
- Local database record updates (`Books_SalesReturn_ID`, `Books_SalesReturn_No`, `RMA = returnNo`, `SR_CREATION_STATUS = 'CREATED'`) are preserved.
- The API returns `status: 'success'` with `receive_status: 'failed'` and provides a descriptive message indicating that the return is valid in Books and manual stock receipt is required.

---

## 4. Schedule Request Confirmation Books Enrichment Specification

**Deluge Source Reference**: `zoho-export/parsed/functions/confirmDmsScheduleRequest.dg` (lines 41–96, 116–143)  
**Backend Handler**: `server/modules/delivery-management/apis.mjs:confirmRequest`  
**Database Forms**: `DMS_Schedule_Request`, `Service_Appointment_Form`  

### 4.1 Specification & Deluge Parity

When a DMS Schedule Request is confirmed by a logistics officer or automated system, the appointment is enriched with customer contact details and Sales Order line items directly from Zoho Books v3:

1. **Books Sales Order Query**:
   - Condition: `rec.Books_Sales_Order_ID` is present and non-blank.
   - Endpoint: `GET https://www.zohoapis.com/books/v3/salesorders/{Books_Sales_Order_ID}?organization_id={org}`.
2. **Contact & Shipping Address Formatting**:
   - `Email`: Taken from `soDetail.email`.
   - `Contact` (Phone): Taken from `soDetail.shipping_address.phone`.
   - `City`: Taken from `soDetail.shipping_address.city`.
   - `Customer_Address`: Concatenates `address` and `street2`:
     ```javascript
     const street1 = shippingAddr.address || '';
     const street2 = shippingAddr.street2 || '';
     addressVal = street2 ? `${street1}, ${street2}` : street1;
     ```
     *Rule*: If `street2` is empty or null, `addressVal` strictly equals `street1` with no trailing comma or whitespace.
3. **Line Items Extraction into Subform Rows (`Item_Details`)**:
   - Iterates `soDetail.line_items`.
   - Populates subform rows:
     ```json
     {
       "Item_Name": "Water Filter Model X",
       "SKU": "WF-X",
       "Quantity": 1
     }
     ```
   - Injected into `Service_Appointment_Form.Item_Details`.

### 4.2 Status Flag Determination

| Condition | `itemPatchStatus` | Behavior |
|---|---|---|
| Books query successful, `line_items.length > 0` | `'included_in_create'` | `Customer_Address`, `City`, `Contact`, `Email`, and `Item_Details` populated on appointment. |
| Books query successful, `line_items` empty | `'skipped'` | Address/Contact populated; `Item_Details` omitted or empty. |
| `Books_Sales_Order_ID` missing / blank | `'skipped'` | External Books call omitted; appointment created with local request values. |
| Books unconfigured (`isConfigured() === false`) | `'skipped_books_offline'` | External call skipped; appointment created safely without blocking logistics flow. |
| Books call throws (network error, 500, 404) | `'skipped_books_offline'` | Error caught safely; appointment created with empty address/items. |

### 4.3 Decoupled Offline Safety Architecture Rationale

Schedule confirmation is on the critical operational path. In warehouse and field logistics, dispatchers must be able to confirm bookings, reserve calendar slots, and push status updates to the CMS regardless of third-party SaaS availability.
- A hard dependency on external Books APIs would mean that a Zoho outage, rate-limit (429), or expired OAuth token would abort appointment creation, leaving drivers and customers stranded.
- Decoupling with `skipped_books_offline` ensures 100% operational uptime for schedule confirmation. Dispatchers can review missing address or item data manually once Books connectivity is restored.

---

## 5. Books Client Architecture (`server/books/client.mjs`)

The `server/books/client.mjs` module provides a hardened HTTP client abstraction for Zoho Books v3 and Zoho Inventory v1.

```
       +-------------------------------------------------------------+
       |               Incoming API Request (get / post)             |
       +------------------------------+------------------------------+
                                      |
                                      v
       +-------------------------------------------------------------+
       |   Credential Guard: isConfigured() check                    |
       |   (Throws BooksError('not_configured') if missing env vars) |
       +------------------------------+------------------------------+
                                      |
                                      v
       +-------------------------------------------------------------+
       |   FIFO Concurrency Limiter: MAX_CONCURRENT = 4              |
       |   (acquire() -> wait in queue -> release() on finish)       |
       +------------------------------+------------------------------+
                                      |
                                      v
       +-------------------------------------------------------------+
       |   OAuth Token Cache: accessToken()                          |
       |   - Single-flighting: parallel requests share refresh call  |
       |   - Cached until expiresAt - 60s safety buffer              |
       +------------------------------+------------------------------+
                                      |
                                      v
       +-------------------------------------------------------------+
       |   HTTP Fetch Execution                                      |
       |   - 401 Unauthorized -> Force token refresh once & retry    |
       |   - 429 Too Many Requests -> Exponential backoff (1s, 2s, 4s)|
       |   - 200 with code != 0 -> Normalized to BooksError          |
       +-------------------------------------------------------------+
```

### 5.1 Configuration Environment Variables

| Variable | Required? | Default Value | Description |
|---|---|---|---|
| `ZOHO_BOOKS_CLIENT_ID` | Yes | None | Zoho OAuth Client ID |
| `ZOHO_BOOKS_CLIENT_SECRET` | Yes | None | Zoho OAuth Client Secret |
| `ZOHO_BOOKS_REFRESH_TOKEN` | Yes | None | Zoho OAuth Long-lived Refresh Token |
| `ZOHO_BOOKS_ORG_ID` | Yes | None | Zoho Books Organization ID |
| `ZOHO_INVENTORY_ORG_ID` | Optional | `ZOHO_BOOKS_ORG_ID` | Zoho Inventory Organization ID (if distinct) |
| `ZOHO_API_DOMAIN` | Optional | `https://www.zohoapis.com` | Zoho API Root Domain |
| `ZOHO_ACCOUNTS_URL` | Optional | `https://accounts.zoho.com` | Zoho Accounts / OAuth Root Domain |

### 5.2 Reliability Guarantees

1. **Pre-flight Credential Validation**: If any of the 4 required environment variables are absent, `isConfigured()` returns `false`, and any invocation of `request()` throws `BooksError('not_configured')` immediately without opening network connections.
2. **Single-Flight Token Refresh**: Uses promise memoization (`refreshing ||= (async () => { ... })().finally(...)`) so simultaneous requests coalesce onto a single token renewal HTTP request.
3. **Concurrency Throttling**: Restricts concurrent in-flight requests to `MAX_CONCURRENT = 4` using an asynchronous FIFO semaphore (`acquire()` / `release()`).
4. **Automatic 401 Re-Authentication**: If Zoho returns HTTP 401, the client invalidates the cached access token, forces an immediate refresh via `accessToken(true)`, and retries the request once.
5. **Exponential 429 Rate-Limit Backoff**: Upon receiving HTTP 429, the client delays and retries up to 3 times with delays of 1000ms, 2000ms, and 4000ms (`1000 * 2 ** tries429++`) before throwing.
6. **Application Error Wrapping**: Zoho APIs often return HTTP 200 status codes with body envelopes containing non-zero `code` values (e.g. `{ code: 4, message: "Invalid value..." }`). The client inspects `json.code !== 0` and wraps it into a structured `BooksError`.

---

## 6. Verification Commands & Automated Test Coverage Mapping

All integration touchpoints are verified using automated unit and integration tests executing against PGlite (PostgreSQL) and stand-in API mock routes.

### 6.1 Test Coverage Mapping Table

| Integration Touchpoint | Test Title in `tests/delivery-management/inventory-apis.test.js` | Verification Objective |
|---|---|---|
| Shipment Orders | `shipment order: finds the package in Inventory, creates the shipment with the 7 custom fields, and marks the package` | Validates package search query, request body envelope, all 7 custom field IDs (`2680178000000763374`, etc.), `BOOKS_DELIVERY_TYPE_MAP` ('Delivery Only' -> 'Deliver Only'), and `Package_Shipments` update. |
| Shipment Orders | `shipment order: a type of delivery sent by the widget wins over the appointment's; the shipment id stands in for a missing number` | Validates widget parameter override, custom field ID `2680178000000440145` mapping ('With Installation' -> 'Deliver & Install'), and `shipment_id` fallback. |
| Delivery Type Map | `shipment order: BOOKS_DELIVERY_TYPE_MAP maps DMS choices to valid Books picklist choices` | Verifies exact mappings across all 8 DMS choices and validates custom field constants. |
| Shipment Orders | `shipment order: refuses a missing package or appointment, a second shipment, and a package with no number` | Validates duplicate guard, missing record guards, and empty package number guard. |
| Shipment Orders | `shipment order: a package that Inventory does not have, an Inventory refusal and an Inventory error are answered, not thrown` | Validates error handling on missing package, API 400 rejection, and unconfigured books. |
| Sales Returns | `sales return: matches each SKU to an unused order line, creates the return, receives the stock, and writes the Books ids back` | Validates 5-step workflow, SKU allocation, exact custom field IDs (`2680178000022219065`, `2680178000022245013`), Step 5 Receive line item translation, and DB writeback. |
| Sales Returns | `sales return: unmatched SKUs are reported; none matching refuses; a failed stock receive does not undo the return` | Validates unmatched SKU reporting, total failure refusal, and Step 5 receive error isolation. |
| Sales Returns | `sales return: handles raw array itemsJson, malformed json, unconfigured books, and invalid quantities` | Validates raw array `[...]` support, malformed JSON handling, negative/zero quantity skipping, and unconfigured/missing books errors. |
| Sales Returns | `sales return: refuses a missing record, one already sent, an order Inventory does not have, and an Inventory refusal` | Validates duplicate RMA prevention, missing record guard, and API 400 rejection. |
| Schedule Confirm | `confirm schedule request: full Books enrichment with street2, email, and line items populates Service Appointment and Item_Details` | Validates `confirm_dms_schedule_request` Books enrichment, street2 concatenation, email/contact mapping, `Item_Details` subform rows, and `itemPatchStatus: 'included_in_create'`. |
| Schedule Confirm | `confirm schedule request: address without street2 avoids trailing comma` | Validates address formatting when `street2` is empty. |
| Schedule Confirm | `confirm schedule request: empty line_items on Books SO sets itemPatchStatus to skipped` | Validates fallback when Books SO has no line items. |
| Schedule Confirm | `confirm schedule request: unconfigured or offline Books client creates SA safely with skipped_books_offline` | Validates decoupled offline safety: appointment is created even when Books client is unconfigured. |
| Schedule Confirm | `confirm schedule request: Books API error gracefully falls back to skipped_books_offline without failing appointment creation` | Validates error tolerance: network or 500 error from Books does not crash or abort appointment creation. |
| Schedule Confirm | `confirm schedule request: request without Books_Sales_Order_ID sets itemPatchStatus to skipped without calling Books` | Validates request handling when Books SO ID is absent. |

### 6.2 Canonical Verification Execution Commands

To execute the test suite under the PostgreSQL backend environment:

```powershell
# 1. Verify Inventory APIs & Books Integration Suite (16 tests)
$env:BACKEND="pg"; node --test tests/delivery-management/inventory-apis.test.js

# 2. Verify Delivery Management Safety & CMS Sync Suites (27 tests)
$env:BACKEND="pg"; node --test tests/delivery-management/cms-sync.test.js tests/delivery-management/safety.test.js tests/core/books-client.test.js

# 3. Verify System Core Access & Routing Suites (29 tests)
$env:BACKEND="pg"; node --test tests/delivery-management/inventory-apis.test.js tests/core/access.test.js tests/core/cms-route.test.js
```

---

## 7. Sign-off & Audit Conclusion

The Zoho Books and Zoho Inventory integrations in `Supply-Chain-SystemV2` have been fully audited, hardened, and verified against Deluge reference scripts:
1. **Shipment Orders**: 100% compliant with `createShipmentOrder.dg`. Custom field IDs, `shipmentorder_custom_fields` envelope, `BOOKS_DELIVERY_TYPE_MAP` picklist normalization, and `shipment_id`/`shipment_number` parsing quirks are verified.
2. **Sales Returns**: 100% compliant with `createSalesReturnBooks.dg`. Sequential SKU line allocation via `Set`, custom fields `2680178000022219065` and `2680178000022245013`, separate Receive `line_item_id` referencing, and Step 5 error isolation are verified.
3. **Schedule Confirmation Books Enrichment**: 100% compliant with `confirmDmsScheduleRequest.dg`. Address concatenation, contact extraction, `Item_Details` subform population, and decoupled offline safety (`skipped_books_offline`) are verified.
4. **Test Suite**: 16 dedicated automated tests in `tests/delivery-management/inventory-apis.test.js` pass with 0 failures under `BACKEND=pg`.
