---
title: "Inquiry Widget"
module: "Procurement"
stage: "Stage 1: Inquiry"
tags:
  - widget
  - procurement
---

# 🧩 Inquiry Widget

> [!INFO] Widget Overview
> - **Module:** `Procurement`
> - **System Stage:** `Stage 1: Inquiry`
> - **Frontend UI File:** [`Widget/Proc/Inquiry/app/index.html`](file:///C:/Users/Enduser/Desktop/Deluge script/Procurement/Inquiry/Widget/app/index.html)
> - **Creator Forms & Reports:** `Inquiry`, `Inquiry_Items`, `Inquiries_Report`
> - **Total Deluge Scripts Connected:** **42**

---

## 📖 Description & Purpose
Handles client inquiries, item requests, and generating Zoho Books estimates.

---

## 🔄 Architecture & Data Flow
```mermaid
graph LR
    HTML["🖥️ Inquiry Widget (UI)"] -->|Calls / Triggers| Deluge["⚙️ Deluge Scripts (42)"]
    Deluge -->|Syncs / Writes| Forms["📋 Forms: Inquiry, Inquiry_Items, Inquiries_Report"]
```

---

## 💻 Frontend HTML Interface
- **HTML Path:** [`Widget/Proc/Inquiry/app/index.html`](file:///C:/Users/Enduser/Desktop/Deluge script/Procurement/Inquiry/Widget/app/index.html)
- **Window Title:** `Procurement Inquiries`

---

## ⚙️ Backing Deluge Scripts (42)

The following Deluge scripts directly power or listen to this widget's lifecycle events:

| Script Name | Source File | Category | Lines |
| :--- | :--- | :--- | :--- |
| [[_Shared/Deluge/Deluge/add_item_by_id_custom_api|add_item_by_id_custom_api]] | `add_item_by_id_custom_api.txt` | `02 - Main DelugeScripts` | 381 |
| [[_Shared/Deluge/Deluge/add_item_by_id_custom_api|add_item_by_id_custom_api]] | `NEw/DelugeScripts\add_item_by_id_custom_api.txt` | `06 - Archive (Deluge Script & NEw)` | 381 |
| [[Procurement/Inquiry/Deluge/books_estimate_sync|books_estimate_sync]] | `books_estimate_sync.txt` | `02 - Main DelugeScripts` | 177 |
| [[Procurement/Inquiry/Deluge/books_estimate_sync|books_estimate_sync]] | `production\books_estimate_sync.txt` | `02 - Main DelugeScripts` | 181 |
| [[Procurement/Inquiry/Deluge/books_estimate_sync|books_estimate_sync]] | `NEw/DelugeScripts\books_estimate_sync.txt` | `06 - Archive (Deluge Script & NEw)` | 177 |
| [[Procurement/Inquiry/Deluge/books_estimate_sync|books_estimate_sync]] | `NEw/DelugeScripts\production\books_estimate_sync.txt` | `06 - Archive (Deluge Script & NEw)` | 181 |
| [[Procurement/Inquiry/Deluge/create_estimate_custom_api|create_estimate_custom_api]] | `create_estimate_custom_api.txt` | `02 - Main DelugeScripts` | 643 |
| [[Procurement/Inquiry/Deluge/create_estimate_custom_api|create_estimate_custom_api]] | `NEw/DelugeScripts\create_estimate_custom_api.txt` | `06 - Archive (Deluge Script & NEw)` | 643 |
| [[Procurement/Inquiry/Deluge/create_estimates_button|create_estimates_button]] | `create_estimates_button.txt` | `02 - Main DelugeScripts` | 523 |
| [[Procurement/Inquiry/Deluge/create_estimates_button|create_estimates_button]] | `NEw/DelugeScripts\create_estimates_button.txt` | `06 - Archive (Deluge Script & NEw)` | 523 |
| [[Procurement/Inquiry/Deluge/create_estimates_inq_action|create_estimates_inq_action]] | `create_estimates_inq_action.txt` | `02 - Main DelugeScripts` | 442 |
| [[Procurement/Inquiry/Deluge/create_estimates_inq_action|create_estimates_inq_action]] | `NEw/DelugeScripts\create_estimates_inq_action.txt` | `06 - Archive (Deluge Script & NEw)` | 442 |
| [[Procurement/Inquiry/Deluge/createEstimateForInquiry|createEstimateForInquiry]] | `createEstimateForInquiry` | `01 - Root Workflows` | 434 |
| [[_Shared/Deluge/Deluge/edit_counter_scripts|edit_counter_scripts]] | `edit_counter_scripts.txt` | `02 - Main DelugeScripts` | 589 |
| [[_Shared/Deluge/Deluge/edit_counter_scripts|edit_counter_scripts]] | `NEw/DelugeScripts\edit_counter_scripts.txt` | `06 - Archive (Deluge Script & NEw)` | 589 |
| [[_Shared/Deluge/Deluge/_variants/Main-DelugeScripts/error|error]] | `error.txt` | `02 - Main DelugeScripts` | 307 |
| [[_Shared/Deluge/Deluge/_variants/Archive-NEw/error|error]] | `NEw/DelugeScripts\error.txt` | `06 - Archive (Deluge Script & NEw)` | 307 |
| [[_Shared/Deluge/Deluge/finalization_scripts|finalization_scripts]] | `finalization_scripts.txt` | `02 - Main DelugeScripts` | 212 |
| [[_Shared/Deluge/Deluge/finalization_scripts|finalization_scripts]] | `NEw/DelugeScripts\finalization_scripts.txt` | `06 - Archive (Deluge Script & NEw)` | 212 |
| [[Procurement/Inquiry/Deluge/inquiry_autofill_product_image|inquiry_autofill_product_image]] | `inquiry_autofill_product_image.txt` | `02 - Main DelugeScripts` | 61 |
| [[Procurement/Inquiry/Deluge/inquiry_autofill_product_image|inquiry_autofill_product_image]] | `NEw/DelugeScripts\inquiry_autofill_product_image.txt` | `06 - Archive (Deluge Script & NEw)` | 61 |
| [[Procurement/Inquiry/Deluge/inquiry_check_readiness|inquiry_check_readiness]] | `inquiry_check_readiness.txt` | `02 - Main DelugeScripts` | 274 |
| [[Procurement/Inquiry/Deluge/inquiry_check_readiness|inquiry_check_readiness]] | `NEw/DelugeScripts\inquiry_check_readiness.txt` | `06 - Archive (Deluge Script & NEw)` | 274 |
| [[Procurement/Inquiry/Deluge/inquiry_generate_inq_no|inquiry_generate_inq_no]] | `inquiry_generate_inq_no.txt` | `02 - Main DelugeScripts` | 91 |
| [[Procurement/Inquiry/Deluge/inquiry_generate_inq_no|inquiry_generate_inq_no]] | `NEw/DelugeScripts\inquiry_generate_inq_no.txt` | `06 - Archive (Deluge Script & NEw)` | 91 |
| [[_Shared/Notifications/Deluge/Notify_on_supplier_Inquiry_response|Notify_on_supplier_Inquiry_response]] | `Deluge Script/Notification\Notify_on_supplier_Inquiry_response.txt` | `06 - Archive (Deluge Script & NEw)` | 32 |
| [[_Shared/Notifications/Deluge/Notify_Suppliers_on_Inquiry_Added|Notify_Suppliers_on_Inquiry_Added]] | `Deluge Script/Notification\Notify_Suppliers_on_Inquiry_Added.txt` | `06 - Archive (Deluge Script & NEw)` | 59 |
| [[_Shared/Notifications/Deluge/Notify_Tony_on_Inquiry_added|Notify_Tony_on_Inquiry_added]] | `Deluge Script/Notification\Notify_Tony_on_Inquiry_added.txt` | `06 - Archive (Deluge Script & NEw)` | 36 |
| [[Procurement/Inquiry/Deluge/PASTE_createEstimateForInquiry_2026-09-21|PASTE_createEstimateForInquiry_2026-09-21]] | `PASTE_createEstimateForInquiry_2026-09-21.txt` | `01 - Root Workflows` | 464 |
| [[Procurement/Inquiry/Deluge/PASTE_Stage_Inquiry_Changed|PASTE_Stage_Inquiry_Changed]] | `PASTE_Stage_Inquiry_Changed.txt` | `01 - Root Workflows` | 245 |
| [[Procurement/Inquiry/Deluge/PASTE_Stage_Inquiry_Changed_Production|PASTE_Stage_Inquiry_Changed_Production]] | `NEw/PASTE_Stage_Inquiry_Changed_Production.txt` | `06 - Archive (Deluge Script & NEw)` | 236 |
| [[Procurement/Inquiry/Deluge/PASTE_Supplier_Populate_From_INQ|PASTE_Supplier_Populate_From_INQ]] | `PASTE_Supplier_Populate_From_INQ.txt` | `01 - Root Workflows` | 267 |
| [[Procurement/Inquiry/Deluge/PASTE_Supplier_Populate_From_INQ_Production|PASTE_Supplier_Populate_From_INQ_Production]] | `NEw/PASTE_Supplier_Populate_From_INQ_Production.txt` | `06 - Archive (Deluge Script & NEw)` | 250 |
| [[Procurement/Inquiry/Deluge/PASTE_sync_inquiry_attachment_to_suppliers|PASTE_sync_inquiry_attachment_to_suppliers]] | `PASTE_sync_inquiry_attachment_to_suppliers.txt` | `02 - Main DelugeScripts` | 479 |
| [[Procurement/Inquiry/Deluge/Stage_Inquiry_Changed|Stage_Inquiry_Changed]] | `Stage_Inquiry_Changed` | `01 - Root Workflows` | 232 |
| [[Procurement/Inquiry/Deluge/stage_inquiry_changed_actions|stage_inquiry_changed_actions]] | `stage_inquiry_changed_actions.txt` | `02 - Main DelugeScripts` | 261 |
| [[Procurement/Inquiry/Deluge/stage_inquiry_changed_actions|stage_inquiry_changed_actions]] | `NEw/DelugeScripts\stage_inquiry_changed_actions.txt` | `06 - Archive (Deluge Script & NEw)` | 261 |
| [[Procurement/Inquiry/Deluge/supplier1_workflow_changes|supplier1_workflow_changes]] | `supplier1_workflow_changes.txt` | `02 - Main DelugeScripts` | 298 |
| [[Procurement/Inquiry/Deluge/supplier1_workflow_changes|supplier1_workflow_changes]] | `NEw/DelugeScripts\supplier1_workflow_changes.txt` | `06 - Archive (Deluge Script & NEw)` | 298 |
| [[Procurement/Inquiry/Deluge/Supplier_Populate_From_INQ|Supplier_Populate_From_INQ]] | `Supplier_Populate_From_INQ` | `01 - Root Workflows` | 246 |
| [[Procurement/Inquiry/Deluge/supplier_quotes_last_edited_scripts|supplier_quotes_last_edited_scripts]] | `supplier_quotes_last_edited_scripts.txt` | `02 - Main DelugeScripts` | 320 |
| [[Procurement/Inquiry/Deluge/supplier_quotes_last_edited_scripts|supplier_quotes_last_edited_scripts]] | `NEw/DelugeScripts\supplier_quotes_last_edited_scripts.txt` | `06 - Archive (Deluge Script & NEw)` | 320 |

---

## 📋 Associated Creator Forms & Reports
- `Inquiry`
- `Inquiry_Items`
- `Inquiries_Report`

---

## 📚 Associated Manuals & PDF Documentation

| Manual / Document | Type | Size |
| :--- | :--- | :--- |
| [[_Shared/Docs/01 - Staff & Operations Manuals/Procurement System Manual|Procurement System Manual]] | `Staff Operations Manual` | `1.7 MB` |
| [[_Shared/Docs/01 - Staff & Operations Manuals/Inquiry Operations Manual (English)|Inquiry Operations Manual (English)]] | `Staff Operations Manual` | `1.6 MB` |
| [[_Shared/Docs/01 - Staff & Operations Manuals/Inquiry Operations Manual|Inquiry Operations Manual]] | `Staff Operations Manual` | `1.6 MB` |
| [[_Shared/Docs/01 - Staff & Operations Manuals/Supply Chain App UAT Manual|Supply Chain App UAT Manual]] | `UAT Manual` | `1.6 MB` |
| [[_Shared/Docs/02 - Architecture, Blueprints & Swimlanes/End-to-End Process Flow Swimlane (PDF)|End-to-End Process Flow Swimlane (PDF)]] | `Swimlane Process Diagram` | `804.6 KB` |
| [[_Shared/Docs/02 - Architecture, Blueprints & Swimlanes/Procurement Swimlane Diagram (PDF)|Procurement Swimlane Diagram (PDF)]] | `Swimlane Process Diagram` | `395.9 KB` |
| [[_Shared/Docs/02 - Architecture, Blueprints & Swimlanes/Procurement End-to-End Process Flow (PDF)|Procurement End-to-End Process Flow (PDF)]] | `Process Flow Diagram` | `242.1 KB` |
| [[_Shared/Docs/04 - Zoho Reference Guides/Zoho Books — AI Features & Invoices|Zoho Books — AI Features & Invoices]] | `Official Reference Manual` | `24.3 MB` |
