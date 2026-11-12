---
title: "Actions Execution & Zoho Adapter Routing"
tags:
  - actions
  - zoho-adapter
  - workflow
  - architecture
date: 2026-11-12
---

# Actions Execution & Zoho Adapter Routing

> [!INFO] Live Hybrid Backend (Option B)
> All 80 supply chain actions listed in this folder are executed through the 42 original Zoho Creator widgets in `modules/`. In the cloud deployment (Railway), instead of storing data in an offline mock or local SQLite, every action call is intercepted by `server/public/zoho-shim.js` and routed through the **Zoho Adapter (`server/zoho/adapter.mjs`)** directly to **Zoho Creator REST API v2.1**.

## How Actions Flow Through the Architecture

```mermaid
flowchart TD
    UI["Staff / Supplier in Browser<br/>(Railway Cloud App)"] -->|Clicks Action Button<br/>(e.g. Approve PR, Ack PO)| WIDGET["Widget Code<br/>(modules/*/*/app/*.js)"]
    WIDGET -->|"ZOHO.CREATOR.API (post/get)"| SHIM["server/public/zoho-shim.js"]
    SHIM -->|"POST /api/:operation"| SERVER["server/index.mjs"]
    SERVER -->|"BACKEND=zoho (Default)"| ADAPTER["server/zoho/adapter.mjs"]
    ADAPTER --> LIMITS["server/zoho/limits.mjs<br/>Cache + In-Flight Deduplication + Rate Queue"]
    LIMITS --> AUTH["server/zoho/auth.mjs<br/>OAuth Service Account Token"]
    AUTH -->|"Zoho Creator REST v2.1 API<br/>(/form/* or /report/*)"| ZOHO["Zoho Creator Engine<br/>(Development / Production)"]
    ZOHO -->|"Triggers Deluge Workflows<br/>(on success, validations)"| AUTOMATION["165 Workflows, Schedules<br/>Zoho Books & Inventory Links"]
```

## Operation Mappings for Workflow Actions

Every workflow action in `vault/Actions/*.md` falls into one of the following API patterns handled by the adapter:

| Action Category | Examples | Widget Shim Call | Zoho Adapter Route | Deluge Behavior in Zoho |
| :--- | :--- | :--- | :--- | :--- |
| **Creation** | `inquiryCreate`, `prCreate`, `customerCreate`, `exceptionRaise` | `addRecords({ form_name, data })` | `POST /creator/v2.1/data/homecartel/supply-chain-app/form/{form_name}` | Triggers form *on success* workflow; stamps `Added_User = zoho.loginuser` (Service Account); generates system IDs. |
| **State Transitions & Updates** | `poAcknowledge`, `supplierAckPO`, `shipmentTransit`, `exceptionResolve` | `updateRecordById({ report_name, id, data })` | `PATCH /creator/v2.1/data/homecartel/supply-chain-app/report/{report_name}/{id}` | Executes field *on update* scripts, status validation rules, and child record synchronization. |
| **Bulk Updates** | `prGroupCreatePO`, `prHold`, `updateRecords` | `updateRecords({ report_name, criteria, data })` | `PATCH /creator/v2.1/data/homecartel/supply-chain-app/report/{report_name}?criteria=...` | Bulk updates matching records in Zoho, invalidating relevant cached reports. |
| **Custom Automations** | `Create_Estimates_Inq`, `Acknowledged_PO_Supplier1`, `Create_RR` | `invokeCustomApi({ api_name, payload })` | Custom API execution via Deluge functions or fallback in `server/custom-apis.mjs`. | Runs server-side Deluge logic with full database access. |
| **Deletions** | `inquiryDelete`, `deleteRecordById` | `deleteRecordById({ report_name, id })` | `DELETE /creator/v2.1/data/homecartel/supply-chain-app/report/{report_name}/{id}` | Deletes record in Zoho and triggers cascade or delete validation scripts. |

## Protective Layer (`server/zoho/limits.mjs`)
To ensure high-speed performance and prevent exceeding Zoho API rate limits (50 calls/min, 6 concurrent, daily limits):
1. **Short-TTL Cache (15s):** Read queries are cached; second requests for the same report criteria return in **0 ms**.
2. **Auto-Invalidation:** Any write action (`addRecords`, `updateRecordById`, `deleteRecordById`) automatically invalidates cached data for the affected form and reports.
3. **In-Flight Request Deduplication:** If multiple users or widget components fetch the same table simultaneously, only 1 actual request is sent to Zoho.
4. **Queue & Throttling Guard:** Limits active requests to 5 concurrent connections and a maximum of 45 calls per minute.
