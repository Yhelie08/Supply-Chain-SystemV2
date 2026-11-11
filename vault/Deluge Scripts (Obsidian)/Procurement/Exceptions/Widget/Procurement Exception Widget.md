---
title: "Procurement Exception Widget"
module: "Procurement"
stage: "Procurement Exceptions"
tags:
  - widget
  - procurement
---

# 🧩 Procurement Exception Widget

> [!INFO] Widget Overview
> - **Module:** `Procurement`
> - **System Stage:** `Procurement Exceptions`
> - **Frontend UI File:** [`Widget/Proc/Exception/app/index.html`](file:///C:/Users/Enduser/Desktop/Deluge script/Procurement/Exceptions/Widget/app/index.html)
> - **Creator Forms & Reports:** `Exceptions`, `Exceptions_Report`
> - **Total Deluge Scripts Connected:** **0**

---

## 📖 Description & Purpose
Flags procurement discrepancies, delayed shipments, damaged goods, and routes to replacement.

---

## 🔄 Architecture & Data Flow
```mermaid
graph LR
    HTML["🖥️ Procurement Exception Widget (UI)"] -->|Calls / Triggers| Deluge["⚙️ Deluge Scripts (0)"]
    Deluge -->|Syncs / Writes| Forms["📋 Forms: Exceptions, Exceptions_Report"]
```

---

## 💻 Frontend HTML Interface
- **HTML Path:** [`Widget/Proc/Exception/app/index.html`](file:///C:/Users/Enduser/Desktop/Deluge script/Procurement/Exceptions/Widget/app/index.html)
- **Window Title:** `Exceptions`

---

## ⚙️ Backing Deluge Scripts (0)

The following Deluge scripts directly power or listen to this widget's lifecycle events:

| Script Name | Source File | Category | Lines |
| :--- | :--- | :--- | :--- |
| *(No dedicated scripts classified directly)* | - | - | - |

---

## 📋 Associated Creator Forms & Reports
- `Exceptions`
- `Exceptions_Report`
