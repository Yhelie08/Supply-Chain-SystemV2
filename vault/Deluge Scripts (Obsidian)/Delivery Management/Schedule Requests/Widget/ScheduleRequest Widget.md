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
> Tinanggal nang tuluyan ang Schedule Requests tab sa app (desisyon ng owner): ang bagong process ay **lahat ng galing CMS ay pumapasok sa Service Request**. Ang widget na ito ay hindi na naka-serve. Reference lang ang doc na ito. Pending: i-retarget ang CMS inbound route (`/api/integrations/cms/*`) sa Service Request bago i-enable ang `CMS_API_KEY`.

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
