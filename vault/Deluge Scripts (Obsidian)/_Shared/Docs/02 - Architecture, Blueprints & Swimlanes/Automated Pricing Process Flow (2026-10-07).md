---
title: "Automated Pricing System — End-to-End Process Flow"
module: "Procurement & Pricing Automation"
type: "System Process Flow / Swimlane"
tags:
  - process-flow
  - pricing-automation
  - architecture
  - html
---

# 🌐 Automated Pricing System — End-to-End Process Flow

> [!INFO] Document Details
> - **Title:** `Automated Pricing System — End-to-End Process Flow`
> - **Target Systems:** Supply Chain App (Creator) ↔ Automated Pricing Engine (External App)
> - **Interactive HTML File:** [`Proposals/Automated_Pricing_Process_Flow_2026-10-07.html`](file:///C:/Users/Enduser/Desktop/Deluge script/_Shared/Docs/Proposals/Automated_Pricing_Process_Flow_2026-10-07.html)
> - **Connected Plan:** [[_Shared/Docs/02 - Architecture, Blueprints & Swimlanes/Automated Pricing System Plan (2026-10-07)|Automated Pricing System Plan (2026-10-07)]]
> - **Connected Widgets:** [[Procurement/Purchase Request/Widget/Purchase Request Widget|Purchase Request Widget]], [[Procurement/Purchase Order/Widget/Purchase Order Widget|Purchase Order Widget]]

---

## 🚀 View Interactive Flow Diagram in Browser
Click below to open the full interactive sequence diagram and summary cards in your default web browser:
👉 **[Open Automated Pricing Process Flow in Browser](file:///C:/Users/Enduser/Desktop/Deluge script/_Shared/Docs/Proposals/Automated_Pricing_Process_Flow_2026-10-07.html)**

---

## 🔄 End-to-End Sequence Diagram

```mermaid
sequenceDiagram
    autonumber
    actor Officer as Purchasing / Sales Officer
    participant SC as Supply Chain App (Creator)
    participant GW as Creator Deluge Webhook Gateway
    participant Engine as Automated Pricing Engine (New App)
    participant Supplier as Supplier Portal / Tony / Fenteng

    Note over Officer, SC: STEP 1: PR INITIATION
    Officer->>SC: Create Purchase Request (PR) with Items / Specs
    SC->>SC: Validate Items require Pricing (Needs_Pricing = true)

    Note over SC, Engine: STEP 2: PRICING DISPATCH & RESOLUTION
    SC->>GW: Trigger On-Add / On-Edit Workflow
    GW->>Engine: POST /api/v1/price-pr (SKU, Specs, Qty, Category)
    activate Engine
    Engine->>Engine: Check Tier 1: Active Master Rate Card / Price Book
    alt Exact Match Found
        Engine->>Engine: Resolve Supplier Cost & Markup
    else Not in Rate Card
        Engine->>Engine: Check Tier 2: Historical PO Costs (Last 90-180 Days)
        alt Recent PO Cost Found
            Engine->>Engine: Apply Inflation / Currency Adjustment
        else Not in Historical POs
            Engine->>Engine: Check Tier 3: Parametric Formula (Landed Cost + Specs)
        end
    end

    Note over Engine, SC: STEP 3: DECISION GATEWAY & RESPONSE
    alt Applicable Price Found & Margin Valid
        Engine->>Engine: Calculate Approved SRP = Cost * (1 + Landed% + Target Margin%)
        Engine->>SC: POST /custom-api/pr-pricing-callback (Approved SRP, Cost, Status="Auto-Priced")
        deactivate Engine
        SC->>SC: Populate PR.Approved_SRP & PR.Selected_Final_Cost
        SC->>SC: Automatically Advance PR_Status to "Ready for PO"
        SC->>Officer: Display Notification: "PR-XXXX Auto-Priced & Ready for PO"
    else Price Not Found / Margin Below Threshold
        Engine->>SC: POST /custom-api/pr-pricing-callback (Status="Needs Manual Quote")
        SC->>SC: Update PR.Pricing_Status = "Needs Manual Quote"
        SC->>Supplier: Forward Item to Supplier Portal (Tony Fan / Fenteng RFQ)
        SC->>Officer: Alert Purchasing Team: Manual Quotation Required
    end

    Note over Officer, SC: STEP 4: DOWNSTREAM CONVERSION
    Officer->>SC: Group Approved PRs into Purchase Order (PO)
    SC->>SC: Trigger approvePOMain -> Generate Zoho Books PO
```
