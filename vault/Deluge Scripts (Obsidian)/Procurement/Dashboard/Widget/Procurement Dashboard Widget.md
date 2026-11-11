---
title: "Procurement Dashboard Widget"
module: "Procurement"
stage: "Procurement Analytics"
tags:
  - widget
  - procurement
---

# 🧩 Procurement Dashboard Widget

> [!INFO] Widget Overview
> - **Module:** `Procurement`
> - **System Stage:** `Procurement Analytics`
> - **Frontend UI File:** [`Widget/Proc/Procurement Dashboard/app/index.html`](file:///C:/Users/Enduser/Desktop/Deluge script/Procurement/Dashboard/Widget/app/index.html)
> - **Creator Forms & Reports:** `Procurement_Dashboard`
> - **Total Deluge Scripts Connected:** **0**

---

## 📖 Description & Purpose
High-level overview of supplier performance, open PRs, pending POs, and shipment metrics.

---

## 🔄 Architecture & Data Flow
```mermaid
graph LR
    HTML["🖥️ Procurement Dashboard Widget (UI)"] -->|Calls / Triggers| Deluge["⚙️ Deluge Scripts (0)"]
    Deluge -->|Syncs / Writes| Forms["📋 Forms: Procurement_Dashboard"]
```

---

## 💻 Frontend HTML Interface
- **HTML Path:** [`Widget/Proc/Procurement Dashboard/app/index.html`](file:///C:/Users/Enduser/Desktop/Deluge script/Procurement/Dashboard/Widget/app/index.html)
- **Window Title:** `Procurement Dashboard`

---

## ⚙️ Backing Deluge Scripts (0)

The following Deluge scripts directly power or listen to this widget's lifecycle events:

| Script Name | Source File | Category | Lines |
| :--- | :--- | :--- | :--- |
| *(No dedicated scripts classified directly)* | - | - | - |

---

## 📋 Associated Creator Forms & Reports
- `Procurement_Dashboard`
