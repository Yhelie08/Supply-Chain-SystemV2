---
title: "Open Decisions - Delivery Management"
tags:
  - plan
  - delivery-management
  - open-items
status: open — waiting for the owner's answers before editing the flow
date: 2026-11-13
---

> [!INFO] Where this fits
> The five decisions that block the flow edits. The full question list: [[Clarifications - Delivery Management]]. The one signed decision: [[Decision - Delivery Clock Divergence]]. What was already done: [[Progress - Delivery Safety]]. The build plan: [[Plan - Delivery Management]].

# Delivery Management — Ang Limang Desisyon Bago Mag-edit ng Flow

- **Status:** Bukas — naghihintay ng sagot
- **Petsa:** 2026-11-13
- **Sino ang magsasagot:** may-ari ng Delivery module
- **Naka-link:** [[Clarifications - Delivery Management]] (lahat ng tanong A1–D5), [[Decision - Delivery Clock Divergence]] (ang isang napirmahang desisyon)

## Paano gamitin ang file na ito

Tatlong paraan:

1. **Isa-isa** — sagutin ang "Sagot" line.
2. **"Default lahat"** — gagamitin ko lahat ng recommendation sa ibaba.
3. **"Hindi ko alam"** — magiging listahan ng blocker, hindi hula.

---

## 1. Scope ng CMS at Books (A1)

**Ano ito:** Ang bagong app ay pumapalit sa Zoho Creator para sa Delivery. Pero may dalawang bagay na Zoho pa rin:

- **CMS** — hiwalay na Zoho Creator app kung saan nagtataas ng schedule request ang customer service.
- **Books** — Zoho Books/Inventory, para sa shipment at sales return.

**Ang tanong:** Papayagan ba nating manatili ang dalawang ito bilang "external" (A), o tatangkain nating alisin lahat ng Zoho (B)?

| Option | Ibig sabihin | Trabaho |
|---|---|---|
| **A** | Wala nang Delivery data sa Creator, pero **OK lang** ang CMS at Books | Maliit: isang "pinto" para makapasok ang CMS |
| **B** | Tanggalin **lahat** ng Zoho, including CMS at Books | Malaki: rebuild ng CMS at replacement ng Books — hindi na Delivery-only |

**Recommendation ko:** **A**. Ang Books ay accounting system — hindi dapat galawin ng Delivery team. Ang CMS ay pwedeng manatili habang may pinto.

**Sagot:** ______________________

---

## 2. Schedule Requests display (A2) — RESOLVED 2026-11-14: removed for good

**Desisyon ng owner (2026-11-14):** **Tinanggal nang tuluyan ang Schedule Requests tab.** Hindi na ito babalik — ang bagong process ay **lahat ng galing CMS ay pumapasok sa Service Request**. Ang dating tanong (show read-only o hide habang walang CMS door) ay moot na.

**Applied sa merge (2026-11-14, `e444d32`):** alisin ang tab sa `pages.json` + `import-widgets.mjs`; 12 admin / 11 user delivery tabs. Ang CMS inbound route (`/api/integrations/cms/*`) ay **kailangan pang i-retarget sa Service Request** bago i-enable ang `CMS_API_KEY` — follow-up na nakalista sa Change Log at sa merge plan.

**Sagot:** Removed — CMS enters Service Request (owner, 2026-11-14).

---

## 3. Site follow-up (A3)

**Ano ito:** Sa Zoho, may automatic follow-up para sa mga site na hindi pa nagko-confirm. **Inactive ito ngayon.** Kung buhayin, ito ang gagawin:

- Mag-e-email sa customer
- Bibilangin ang attempts
- Kapag lumampas sa max, mark na **"Unreachable"** at gagawa ng high-severity exception

**Ang tanong:** Iport ba o skip?

| Option | Ibig sabihin | Kailangan |
|---|---|---|
| **Port** | Gawin sa bagong app | Email service, bagong schedule, tests |
| **Skip** | Hayaan ang staff na mag-follow up manually | Dokumento lang ng manual process |

**Recommendation ko:** **Skip muna.** Inactive naman sa Zoho, at walang email service sa app ngayon. Kung hihingin ng staff, doon lang natin gawin.

**Sagot:** ______________________ (kung port: sino ang may-ari ng email?)

---

## 4. Widget ownership (A6)

**Ano ito:** Ang 13 tabs ay maliliit na web pages (widgets). Kung may sirang button o maling field sa bagong app, **sino ang mag-aayos?**

| Option | Ibig sabihin |
|---|---|
| **Ikaw: UI + backend** | Ikaw ang may hawak ng lahat ng Delivery — mas mabilis, isang tao ang may alam |
| **Backend only** | Ikaw lang ang backend; may ibang tao sa UI — kailangan i-assign at i-coordinate |

**Bakit mahalaga:** Hindi matatapos ang UAT kung walang may-ari ng UI bugs. Kapag may nag-edit ng widget, kailangan din niyang maintindihan ang data.

**Recommendation ko:** **Ikaw: UI + backend** para sa Delivery.

**Sagot:** ______________________

---

## 5. Data contract (A10)

**Ano ito:** Ang Delivery ay gumagamit ng **shared forms** — Service Request, Sales Order Fulfillment, Items, Customer, Sales Order, Policy Settings. Ginagamit din ito ng ibang modules.

Ang "contract" ay isang simpleng listahan:

- Aling fields ang binabasa/isinusulat ng Delivery
- Anong values/status ang expected
- Sino ang pwedeng magbago

**Bakit mahalaga:** Parang shared kwarto. Kung may mag-rearrange ng furniture (mag-rename ng field o magpalit ng status word) nang walang abiso, **matitipa ang Delivery** — at hindi agad halata.

**Ang tanong:** Sino ang pipirma, at ano ang rule kapag may magbago?

| Option | Ibig sabihin |
|---|---|
| **Core owner signs** | Isang tao ang may final say sa shared schema; may PR + Delivery tests bago magbago |
| **Each module owner signs their own** | Mas mabilis, pero pwedeng magka-conflict |
| **No contract** | Pinakamabilis, pero risky |

**Recommendation ko:** **Core owner signs; anumang shared-field change ay may PR + Delivery tests.** Ikaw ang mag-aayos kung may masira sa Delivery side, pero ang change ay may review.

**Sagot:** ______________________ (pangalan + rule)

---

## Buod

| # | Tanong | Recommendation | Sagot |
|---|---|---|---|
| A1 | CMS/Books: A o B? | **A** | |
| A2 | Schedule Requests: show o hide? | **Removed for good** (2026-11-14: CMS → Service Request) | |
| A3 | Site follow-up: port o skip? | **Skip muna** | |
| A6 | Widgets: ikaw lahat o may UI owner? | **Ikaw: UI + backend** | |
| A10 | Data contract: sino ang pipirma? | **Core owner + PR rule** | |

---

## Ano ang nangyayari pagkatapos ng mga sagot

| Kung ang sagot ay... | Ang mangyayari sa build |
|---|---|
| **A1 = A** | Mananatili ang Books at CMS. Isang inbound route lang ang bubuksan (kailangan ng API key). |
| **A1 = B** | Bagong malaking proyekto: CMS rebuild + Books replacement. Hindi na Delivery-only — kailangan ng bagong plano. |
| **A2 = Show** | Read-only list + banner sa tab. Kasama sa UAT (13 tabs). |
| **A2 = Hide** | Nakatago ang tab. UAT = 12 tabs. Ipapakita kapag may pinto na. |
| **A3 = Skip** | Walang bagong code. Isusulat ang manual follow-up process sa docs. |
| **A3 = Port** | Bagong email service + schedule + tests. Kailangan ng owner ng email. |
| **A6 = Ikaw lahat** | Walang koordinasyon. Ikaw ang aayos ng UI bugs sa UAT. |
| **A6 = Backend only** | Kailangan ng pangalan ng UI owner bago mag-UAT. |
| **A10 = Core owner** | Isusulat ang field list bilang `Delivery Data Contract.md`, may PR rule. |

## Ano ang HINDI kasama sa file na ito

Ang mga ito ay kailangan bago mag-live, pero hindi kailangan bago mag-edit ng flow:

- Production export (B1)
- Books OAuth, Geoapify key, CMS URLs/API key (B2–B4)
- CMS inbound route (B5)
- Files at Railway env (B6–B7)
- Rollback, backup, monitoring, timezone (C1–C6)
- Private repo + key rotation (C7)
- UAT participants, reviewer, sign-off (D3–D5)

Nasa [[Clarifications - Delivery Management]] ang buong listahan.

## Isang linya lang kung ayaw mong mag-isip

> **"Default lahat"** — A1 = A, A2 = Show read-only, A3 = Skip, A6 = Ikaw lahat, A10 = Core owner + PR rule.
