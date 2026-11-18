# Fulfillment Process — paano ito gumagana sa Zoho (para sa review mo)

> **Hindi pa ito naa-apply.** Listahan lang ito ng proseso na nakuha ko sa mga Deluge script, para mabasa mo muna at masabi mo kung alin ang gagawin natin sa app.
>
> Pinagkunan: `00 - Deluge Scripts Master Index.md`, `00 - Supply Chain Widget & Deluge System Map.md`, at ang mismong mga script sa `Desktop\Deluge script\Fulfillment\*\Deluge\*.txt` (+ `_Docs\CLAUDE.md`).
> Ang bawat hakbang ay may **Status sa app natin ngayon**: ✅ naka-port na · ⚠️ naka-port pero iba · ❌ hindi pa.

---

## 1. Buong daloy (isang tingin)

```
Books: Sales Order (approved/invoiced)  ──►  Sales_Order_Fulfillment   (stage: Waiting For Package)
Books/Inventory: gumawa ng Package (PAC#) ─►  nilalagay ang PAC# sa Sales_Order_Fulfillment
Books Invoice  (cf_paid Yes/No/Partial)  ──►  Status (bayad) ng Sales_Order_Fulfillment

Sales_Order_Fulfillment  ──(may PAC#)──►  Sales_Order_Readiness_Gate  (Order Readiness)
Pre_Order_FF (Received + may PAC#) ─────►  Sales_Order_Readiness_Gate

Readiness Gate  ──(Release ✔ + Assign Picker)──►  Pick1         (stage: Picking)
Pick1           ──(Mark Picked ✔)──►  Checker_Checklist = Pack & QC   (stage: Quality Checking)

Checker_Checklist (QC_Status):
    Approved + For_Crate     ──►  Crate_Checklist
    Approved + hindi crate   ──►  Order_Aggregation1  (= "To Ship")
    Rejected                 ──►  Exception_Control1   (isang record bawat sirang unit)

Crate_Checklist (Crating Status = Done) ──►  Order_Aggregation1 (To Ship)
Order_Aggregation1 (Dispatch Selected ✔) ──►  stage "For Delivery"  ──►  DMS / Delivery

Exception_Control1  ──►  Replacement Request (RR) ──► Procurement ──► Receiving ──► Pre_Order_FF ──► balik sa Readiness Gate
```

Isang **Sales_Order_Fulfillment record = isang package** (isang PAC#). Ang bawat item sa loob nito ay nasa subform na `Item_Details1`.

---

## 2. Hakbang-hakbang

### Hakbang 1 — Sales Order → Sales_Order_Fulfillment
- **Script:** `so_fulfillment_sync` / `so_creation_sync` / `so_kanban_sync` (Books Workflow Rule sa Sales Order).
- **Kailan:** kapag ang SO ay hindi `draft`, `pending_approval`, `void`, o `cancelled`.
- **Ginagawa:** gumagawa ng Sales_Order_Fulfillment record na may customer, address, order type (`cf_type_of_transaction`), `For_Crate` (`cf_for_crate`), target delivery date (`cf_target_delivery_date`), at mga item. **Stage = "Waiting For Package"**.
- Ang mga item na **Pre Order** / **Partly Pre Order** (walang stock) ay gumagawa rin ng record sa **Pre_Order_FF**.
- **Status sa app:** ⚠️ Wala tayong Books, kaya ang SO records ay galing sa seed/widget. Walang hakbang na ito sa server natin.

### Hakbang 2 — Package (PAC#) at Bayad
- **Script:** `syncpackagetofulfillment` (Zoho **Inventory** workflow, hindi Books). Kapag may package na ginawa para sa SO, nilalagay nito ang **Package (PAC#)** at **Delivery_Type** sa Sales_Order_Fulfillment record.
- **Bayad:** `invoice_payment_status_to_so_fulfillment_sync` — kinukuha ang `cf_paid` ng lahat ng invoice ng SO: lahat Yes = **Yes**, may Yes/Partial pero hindi lahat = **Partial**, wala = **No**. Isinusulat sa `Status` ng lahat ng record ng SO.
- **Status sa app:** ⚠️ Ang Package at Status ay galing sa widget/seed (walang Books). Ang rule sa stage ay nabago na (tingnan ang Hakbang 3).

### Hakbang 3 — Sales_Order_Fulfillment → Order Readiness
- **Script:** `so_fulfillment_to_readiness_gate` ("SO to Readiness"). Trigger: record ay Created **o** Edited.
- **Package guard:** kapag **walang PAC# pa → wala itong ginagawa** (nananatiling "Waiting For Package").
- **Kapag may PAC#:** ginagawa o ina-update ang **isang Sales_Order_Readiness_Gate record kada item** (key: SO + SKU). Kinokopya ang order type, package, delivery type, for_crate, target date, payment status (`Yes/No/Partial`, direktang kopya), customer name/type/address, PR#, RR#, item, SKU, qty, bin.
- **Stage:** "Waiting For Package" → **"Order Readiness"** (2026-09-02, bumps lang mula sa Waiting; hindi umaatras).
- **Hindi tinitingnan ng Zoho ang bayad** dito: may PAC# lang ay papasok na sa Readiness kahit Partial/No ang bayad.
- Ang **Check Payment Status** button sa Readiness Gate ay tumatawag sa Books (`invoices?reference_number=<SO>`) at ina-update ang `payment_status` ng Gate record.
- **Status sa app:**
  - ✅ Stage rule na pinalit natin ngayon (2026-11-14): walang PAC# = Waiting For Package; may PAC# = Order Readiness kahit anong bayad.
  - ⚠️ Pero sa app, ang **Gate records ay ginagawa lang kapag PAID** (rule mo dati, 2026-11-13). Sa Zoho, ginagawa ito kahit hindi paid. **Tanong A sa baba.**
  - ❌ Check Payment Status button (kailangan ng Books).

### Hakbang 4 — Pre_Order_FF → Readiness Gate (pre-order na dumating na)
- **Script:** `preorder_to_readiness_gate`. Kapag ang Pre_Order_FF record ay **Received** at may **Package_Number**, ginagawa/ina-update ang Gate record nito (parehong key at mga field).
- **Package creation:** `preorder_create_package` (`createPackageFF`) — pinipili sa Pre Order widget ang mga item (`Select_To_Package`), gumagawa ng **isang Books package kada SO** (magkakasama ang mga item), at isinusulat ang Package_Number sa Pre_Order_FF.
- **RR (replacement) rows:** hindi dumadaan sa Books; diretso sa Readiness Gate gamit ang **orihinal na package number**, may sariling RR#, payment = Yes.
- **Status sa app:** ❌ Hindi pa naka-port (Pre-Order → Gate, createPackageFF).

### Hakbang 5 — Readiness Gate → Pick
- **Script:** `readiness_gate_release_to_pick1_direct` / `release_records_to_pick1_sync`. Gate record na may **Release ✔** at **Assign Picker** (ang "Assign to Pick" ay naka-disable hangga't walang picker, `assign_to_pick_gate`).
- **Ginagawa:** gumagawa/ina-update ng **Pick1 record** (key: SO + SKU + Item + PAC + RR) at **Pick_Notifications** row. Kinokopya ang picker, PAC, PR, RR, demo, delivery/order type, target date, for_crate, item, bin, SKU, qty (`Quantity_to_Pick`), customer.
- **Stage:** → **"Picking"** (bawat save ng Gate record ay sineseguro munang "Order Readiness" ang item hangga't wala pang Pick).
- **Status sa app:** ✅ naka-port (`pipeline.mjs`).

### Hakbang 6 — Pick → Pack & QC
- **Script:** `pick1_to_qc_sync` (pumalit sa Pick → Pack; tinanggal na ang Pack, 2026-10-29).
- **Kapag Mark Picked ✔:** gumagawa/ina-update ng **Checker_Checklist (Pack & QC)** record (key: SO + SKU + PAC + RR + QC_Status blangko). Kinokopya ang lahat ng detalye; **Quality_Checker ay sinasadyang blangko** — pipiliin ang packer/checker sa QC widget (naka-disable ang QC button hangga't wala).
- **Stage:** "Picking" kapag naka-Pick1 pa lang; **"Quality Checking"** (sa app: "Pack & QC") kapag Marked na.
- Hindi dine-delete ang Pick1; itinatago lang sa report (criteria: Marked is not checked).
- **Status sa app:** ✅ naka-port.

### Hakbang 7 — QC Approved / Rejected (ang pinaka-importante)
- **Script:** `checker_checklist_qc_approved_sync` / `checker_checklist_qc_sync`. Trigger: Checker_Checklist Created o Edited; tumatakbo lang kapag `QC_Status` ay **Approved** o **Rejected**.
- **Approved + For_Crate ✔ → Crate_Checklist.** Isang record kada SO + SKU + Package. Kinokopya ang PR, RR, order type, target date, delivery type, customer, item, qty, `Assigned_Checker` (= QC checker), forecast, at ang litrato/video.
- **Approved + hindi crate → Order_Aggregation1 (To Ship).** **Isang record lang kada SO**; ang bawat item ay row sa `Item_Details` (Item_Name, SKU, QTY, Bin_Location, PAC). Kung may record na ang SO: dinadagdag ang bagong row, o ina-update ang row ng parehong SKU. Ang top-level na mga field ay nire-refresh; ang `For_Crate` at `Dispatch_Selected` ay **hindi ginagalaw** (manual ang mga iyon).
- **Rejected → Exception_Control1.** Isang record kada **sirang unit** (Qty = 1 bawat isa), key: SO + SKU + PAC. Hindi na duduplicate sa re-save (bilang lang ng kulang ang idadagdag; hanggang 5 kada save). Numero: `EXC-FF-00001`. May `ExceptionControl_Notifications` row. Kinokopya ang item to replace (Whole Fixture / Spare Parts), mga spare part at qty nila, quantity of damage, remarks, checker, customer, supplier (hinahanap sa Purchase Request), source = "Checker_Checklist (QC Rejected)".
- **Split (hal. 3 unit: 2 pasado, 1 sira):** dalawang save mula sa Pack & QC widget — Rejected (qty 1) at Approved (qty 2). Bawat isa ay ruruta ng sarili niyang bahagi: 1 sa Exception, 2 sa Crate/To Ship.
- **Qty ng Approved sa To Ship:** ang kabuuan ng lahat ng Approved na QC record ng item (kaya ang pangalawang batch ay dinadagdag, hindi pinapalitan).
- **Stage:** Quality Checking ang stage hangga't nasa QC. Ang pag-abot sa Crate/To Ship ay itinatakda ng mga sumusunod na hakbang.
- **Pagkakaiba ng Zoho:** kapag Approved, **ina-update din ng Zoho ang `Quantity` ng Readiness Gate** record ng SKU sa aktuwal na approved qty. **Sinadya ko itong hindi i-port** (rule mo: ang values ay kinokopya lang nang walang binabago). **Tanong B.**
- **Status sa app:** ✅ ginawa natin ngayon (`qc-routing.mjs`, may 7 test). Ang stage sa app ay umuusad sa "Crate" o "Order Aggregation" pagkatapos ng Approved.

### Hakbang 8 — Crate
- **Script:** `crate_checklist_to_order_aggregation_sync`.
- Sa **bawat save** ng Crate_Checklist record, ang stage ng item ay nagiging **"To Ship"** (sa Zoho, hindi pa kailangang Done).
- Kapag **Crating Status = Done** → dinadagdag ang item sa **Order_Aggregation1** ng SO (parehong "isang record kada SO, row kada item" na patakaran). `For_Crate = true` ang record. Ang Bin Location ay blangko (walang field nito sa Crate form).
- **Status sa app:** ❌ Hindi pa naka-port (Crate → To Ship pagkatapos ng Done).

### Hakbang 9 — Order Aggregation = To Ship → Dispatch
- **Script:** `order_aggregation1_dispatch_stage_sync`. Trigger: Order_Aggregation1 Created o Edited.
- Kapag **Dispatch_Selected ✔** → stage ng **lahat ng item sa grid** = **"For Delivery"**; kung hindi pa → **"To Ship"**.
- Ito ang **huling signal** ng Fulfillment; pagkatapos nito ay ang DMS (DeliveryQueue) na ang kukuha.
- **"Awaiting Items":** ang To Ship page ay nagpapakita kung ano pa ang naiwan sa SO — Pre-order na hindi pa dumarating, dumating pero hindi pa naka-package, **QC Rejected**, at RR na nasa QC recheck. Hangga't may awaiting, ang SO ay "Partial" at hindi "Done".
- **Status sa app:** ⚠️ Ang To Ship page at ang pagpili ng item (circle) ay ayos na; ❌ wala pang server rule na nag-a-update ng stage sa "For Delivery" kapag nag-Dispatch, at ❌ wala pang papuntang DMS.

### Hakbang 10 — Exception Control → Replacement
- Ang Exception_Control1 record (galing sa Rejected QC) ay may Status (hal. *Unrepairable*). Sa **+ Create RR** (naka-enable lang kapag Unrepairable): gumagawa ng **Replacement_Request** at (kapag may supplier) supplier-side RR (Fenteng/Tony).
- Pagdating ng replacement sa Receiving (RR), gumagawa ito ng **Pre_Order_FF** (hindi na dumadaan sa unang QC) → Readiness Gate → Pick → **QC ulit** (ang "pangalawang" QC record). Kapag Approved, babalik sa Crate / To Ship.
- Sa Exception widget naman, ang Status = Completed (naayos/napalitan) ay gumagawa ng Checker_Checklist record para ma-QC ulit.
- **Status sa app:** ❌ Wala pang RR / replacement loop (Procurement ang may hawak ng RR).

---

## 3. Mga stage value

| Zoho (Fulfillment_Stage) | App natin ngayon | Kailan |
|---|---|---|
| Waiting For Package | Waiting For Package | walang PAC# pa |
| Order Readiness | Order Readiness | may PAC# (kahit anong bayad) |
| Picking | Picking | may Pick1 na |
| Pack (luma, wala na) | — | — |
| Quality Checking | Pack & QC | Marked Picked / nasa QC |
| (Crate) | Crate | Approved + For Crate |
| To Ship | Order Aggregation | Approved (hindi crate) / Crate Done |
| For Delivery | For Delivery | Dispatch Selected ✔ |

Ang stage ay **laging pasulong lang** sa app (hindi umaatras); sa Zoho, ang ilang script ay umaatras (hal. Gate save ay nagse-set ng "Order Readiness" kahit nasa Picking na).

---

## 4. Buod: ano ang naka-port, ano ang hindi pa

| Bahagi | Status |
|---|---|
| Waiting For Package ↔ Order Readiness (stage rule) | ✅ (na-update ngayon) |
| SO package → Readiness Gate (isang record kada item) | ✅ (paid lang) |
| Gate Release → Pick1, notification, stage Picking | ✅ |
| Pick Mark Picked → Pack & QC, stage | ✅ |
| QC Approved → Crate / To Ship; Rejected → Exception (per unit) | ✅ |
| Gate Qty rewrite pagkatapos ng QC | ❌ (sinadya) |
| Pre_Order_FF → Readiness Gate; createPackageFF | ❌ |
| Crate Done → To Ship; stage "To Ship" | ❌ |
| Dispatch Selected → stage "For Delivery" → DMS | ❌ |
| Check Payment Status (Books) | ❌ |
| Exception → Replacement Request → loop pabalik | ❌ |
| Books: SO / Package / Invoice syncs | ❌ (walang Books sa app) |
| KANBAN `so_kanban_sync`, Warehouse Request, Transfer Warehouse | ❌ (hindi ko pa nabasa nang detalyado) |

---

## 5. Mga tanong bago ko i-apply

**A. Gate records ng hindi pa fully paid.** Sa Zoho, may PAC# lang ay gagawa na ng Readiness Gate records (kahit Partial/No ang bayad; makikita lang sa Gate ang payment status). Sa app natin, Paid lang. Ngayong "Order Readiness" na ang stage kahit Partial, alin ang gusto mo?
 1. Gate records agad kapag may PAC# (tulad ng Zoho; ang Pick ay mapipigilan lang ng payment status), o
 2. Paid lang (kasalukuyan).

**B. Gate Quantity pagkatapos ng QC.** Ina-update ng Zoho ang Gate Qty sa approved qty (hal. 3 → 2). Gusto mo bang gawin din natin, o panatilihing orihinal na qty ang Gate?

**C. Stage sa Crate.** Sa Zoho, "To Ship" na ang stage sa bawat save ng Crate record (kahit hindi pa Done). Sa app, gusto mo bang "Crate" ang stage hangga't hindi Done, at saka lang "To Ship" (Order Aggregation)?

**D. Dispatch.** Pagkatapos mag-Dispatch sa To Ship: stage = "For Delivery" at status sa item = "Dispatched" (kasalukuyan) o "Delivered"? At ipapasa ba natin sa Delivery module (DMS) ang record?

**E. Ano ang susunod na isasama:** Crate Done → To Ship, Dispatch → For Delivery, Pre-Order → Gate, Exception/RR loop? Sabihin mo ang pagkakasunod-sunod.

> Reminder: Fulfillment lang ang gagalawin ko; hindi ko gagalawin ang Procurement/DMS maliban kung sabihin mo.
