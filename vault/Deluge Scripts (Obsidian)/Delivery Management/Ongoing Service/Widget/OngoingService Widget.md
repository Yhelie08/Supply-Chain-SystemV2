---
title: "OngoingService Widget"
module: "Delivery Management System (DMS)"
stage: "Stage 2: In-Transit & Field Delivery"
tags:
  - widget
  - delivery-management-system-dms
---

# 🧩 OngoingService Widget

> [!INFO] Widget Overview
> - **Module:** `Delivery Management System (DMS)`
> - **System Stage:** `Stage 2: In-Transit & Field Delivery`
> - **Frontend UI File:** [`Widget/DMS/OngoingService/app/index.html`](file:///C:/Users/Enduser/Desktop/Deluge script/Delivery Management/Ongoing Service/Widget/app/index.html)
> - **Creator Forms & Reports:** `Field_Work`, `Ongoing_Service_Report`
> - **Total Deluge Scripts Connected:** **0**

---

## 📖 Description & Purpose
Mobile view for delivery drivers: live navigation, photo/video evidence upload, and client signatures.

---

## 🔄 Architecture & Data Flow
```mermaid
graph LR
    HTML["🖥️ OngoingService Widget (UI)"] -->|Calls / Triggers| Deluge["⚙️ Deluge Scripts (0)"]
    Deluge -->|Syncs / Writes| Forms["📋 Forms: Field_Work, Ongoing_Service_Report"]
```

---

## 💻 Frontend HTML Interface
- **HTML Path:** [`Widget/DMS/OngoingService/app/index.html`](file:///C:/Users/Enduser/Desktop/Deluge script/Delivery Management/Ongoing Service/Widget/app/index.html)
- **Window Title:** `Ongoing Service`

---

## ⚙️ Backing Deluge Scripts (0)

The following Deluge scripts directly power or listen to this widget's lifecycle events:

| Script Name | Source File | Category | Lines |
| :--- | :--- | :--- | :--- |
| *(No dedicated scripts classified directly)* | - | - | - |

---

## 📋 Associated Creator Forms & Reports
- `Field_Work`
- `Ongoing_Service_Report`

---

## 📚 Associated Manuals & PDF Documentation

| Manual / Document | Type | Size |
| :--- | :--- | :--- |
| [[_Shared/Docs/01 - Staff & Operations Manuals/Delivery Management System Manual (Tagalog)|Delivery Management System Manual (Tagalog)]] | `Staff Operations Manual` | `9.7 MB` |
| [[_Shared/Docs/01 - Staff & Operations Manuals/Delivery Management System Manual (English)|Delivery Management System Manual (English)]] | `Staff Operations Manual` | `9.7 MB` |
| [[_Shared/Docs/02 - Architecture, Blueprints & Swimlanes/Delivery Confirmation Policy — Client Not On Site (PDF)|Delivery Confirmation Policy — Client Not On Site (PDF)]] | `Operational Policy` | `107.0 KB` |
| [[_Shared/Docs/02 - Architecture, Blueprints & Swimlanes/Remote Client Signature Proposal (PDF)|Remote Client Signature Proposal (PDF)]] | `Feature Proposal` | `111.6 KB` |
