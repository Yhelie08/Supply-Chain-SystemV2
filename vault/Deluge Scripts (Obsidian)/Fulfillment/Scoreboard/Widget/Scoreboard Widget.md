---
title: "Scoreboard Widget"
module: "Fulfillment"
stage: "Fulfillment Metrics"
tags:
  - widget
  - fulfillment
---

# 🧩 Scoreboard Widget

> [!INFO] Widget Overview
> - **Module:** `Fulfillment`
> - **System Stage:** `Fulfillment Metrics`
> - **Frontend UI File:** [`Widget/Fulfillment/Scoreboard/app/index.html`](file:///C:/Users/Enduser/Desktop/Deluge script/Fulfillment/Scoreboard/Widget/app/index.html)
> - **Creator Forms & Reports:** `Fulfillment_Scoreboard`
> - **Total Deluge Scripts Connected:** **0**

---

## 📖 Description & Purpose
Daily fulfillment throughput, packer/picker efficiency, and SLA leaderboards.

---

## 🔄 Architecture & Data Flow
```mermaid
graph LR
    HTML["🖥️ Scoreboard Widget (UI)"] -->|Calls / Triggers| Deluge["⚙️ Deluge Scripts (0)"]
    Deluge -->|Syncs / Writes| Forms["📋 Forms: Fulfillment_Scoreboard"]
```

---

## 💻 Frontend HTML Interface
- **HTML Path:** [`Widget/Fulfillment/Scoreboard/app/index.html`](file:///C:/Users/Enduser/Desktop/Deluge script/Fulfillment/Scoreboard/Widget/app/index.html)
- **Window Title:** `Fulfillment Scoreboard`

---

## ⚙️ Backing Deluge Scripts (0)

The following Deluge scripts directly power or listen to this widget's lifecycle events:

| Script Name | Source File | Category | Lines |
| :--- | :--- | :--- | :--- |
| *(No dedicated scripts classified directly)* | - | - | - |

---

## 📋 Associated Creator Forms & Reports
- `Fulfillment_Scoreboard`
