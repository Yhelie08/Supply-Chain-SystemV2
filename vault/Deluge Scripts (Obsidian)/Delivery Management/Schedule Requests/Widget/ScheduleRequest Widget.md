---
title: "ScheduleRequest Widget"
module: "Delivery Management System (DMS)"
stage: "Client Schedule Requests"
tags:
  - widget
  - delivery-management-system-dms
---

# 🧩 ScheduleRequest Widget

> [!WARNING] REMOVED 2026-11-14
> The Schedule Requests tab was removed from the app for good (owner decision): in the new process **everything from the CMS comes in as a Service Request**. This widget is no longer served; this doc is for reference only. Pending: point the CMS inbound route (`/api/integrations/cms/*`) at Service Request before `CMS_API_KEY` is enabled.

> [!INFO] Widget Overview
> - **Module:** `Delivery Management System (DMS)`
> - **System Stage:** `Client Schedule Requests`
> - **Frontend UI File:** [`Widget/DMS/ScheduleRequest/_extract_tmp/app/dms-schedule-request.html`](file:///C:/Users/Enduser/Desktop/Deluge script/Delivery Management/Schedule Requests/Widget/_extract_tmp/app/dms-schedule-request.html)
> - **Creator Forms & Reports:** `Schedule_Request`
> - **Total Deluge Scripts Connected:** **0**

---

## 📖 Description & Purpose
Customer-requested delivery timeframes and coordination requests.

---

## 🔄 Architecture & Data Flow
```mermaid
graph LR
    HTML["🖥️ ScheduleRequest Widget (UI)"] -->|Calls / Triggers| Deluge["⚙️ Deluge Scripts (0)"]
    Deluge -->|Syncs / Writes| Forms["📋 Forms: Schedule_Request"]
```

---

## 💻 Frontend HTML Interface
- **HTML Path:** [`Widget/DMS/ScheduleRequest/_extract_tmp/app/dms-schedule-request.html`](file:///C:/Users/Enduser/Desktop/Deluge script/Delivery Management/Schedule Requests/Widget/_extract_tmp/app/dms-schedule-request.html)
- **Window Title:** `Schedule Requests`

---

## ⚙️ Backing Deluge Scripts (0)

The following Deluge scripts directly power or listen to this widget's lifecycle events:

| Script Name | Source File | Category | Lines |
| :--- | :--- | :--- | :--- |
| *(No dedicated scripts classified directly)* | - | - | - |

---

## 📋 Associated Creator Forms & Reports
- `Schedule_Request`
