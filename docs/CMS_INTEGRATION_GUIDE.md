# CMS (Customer Service) Integration Guide

This guide describes how to connect the external **CMS Zoho Creator App** with the standalone **Supply Chain DMS (Delivery Management System)**.

---

## 1. Overview

- **CMS (Zoho Creator)**: Where customer support staff create and reschedule delivery requests.
- **DMS (Supply Chain System)**: Standalone web app running on Railway/Postgres where dispatchers review, confirm, or decline schedule requests.

### Data Flow

```
[Customer Support in CMS] 
       │ (Deluge postUrl)
       ▼
POST /api/integrations/cms/schedule-request (with x-api-key)
       │
       ▼
[DMS: DMS_Schedule_Request table (Status: Pending Review)]
       │
       ▼ [Dispatcher reviews & clicks "Confirm" or "Decline"]
       │ (DMS postToCms)
       ▼
CMS Webhook: receive_dms_schedule_request_status
```

---

## 2. Inbound Endpoints (CMS ➡️ DMS)

Base URL: `https://<your-railway-domain>` (or `http://localhost:4000` for local dev)

### Headers
Every request must include:
```http
Content-Type: application/json
x-api-key: <your_CMS_API_KEY>
```
*(Alternatively: `Authorization: Bearer <your_CMS_API_KEY>`)*

---

### Endpoint A: Create or Update Schedule Request

`POST /api/integrations/cms/schedule-request`

#### JSON Body Fields

| Field Name | Type | Required | Description |
|---|---|---|---|
| `cmsRecordId` | string | **Yes** | Unique Record ID from CMS (`input.ID.toString()`) |
| `salesOrderNumber` | string | No | Sales Order Number (e.g. `SO-10492`) |
| `customerName` | string | No | Name of customer |
| `requestedDate` | string | No | Date as `YYYY-MM-DD` or `DD-MMM-YYYY` |
| `requestedTime` | string | No | Time slot string (e.g. `09:00:00 AM`) |
| `requestedBy` | string | No | Name / email of CS agent |
| `notes` | string | No | Customer notes, gate codes, landmarks |
| `typeOfDelivery` | string | No | `Delivery Only`, `Installation Only`, or `Delivery with Installation` |
| `booksSalesOrderId` | string | No | Zoho Books Sales Order ID (used to fetch shipping address) |

#### Example Deluge Script for CMS (Form Workflow: On Success)

```deluge
headerMap = Map();
headerMap.put("Content-Type", "application/json");
headerMap.put("x-api-key", "YOUR_CMS_API_KEY_HERE");

payload = Map();
payload.put("cmsRecordId", input.ID.toString());
payload.put("salesOrderNumber", ifnull(input.Sales_Order_Number, ""));
payload.put("customerName", ifnull(input.Customer_Name, ""));
if (input.Requested_Date != null) {
    payload.put("requestedDate", input.Requested_Date.toString("yyyy-MM-dd"));
}
payload.put("requestedTime", ifnull(input.Requested_Time, ""));
payload.put("requestedBy", ifnull(input.Requested_By, zoho.loginuser));
payload.put("notes", ifnull(input.Notes, ""));
payload.put("typeOfDelivery", ifnull(input.Type_of_Delivery, "Delivery Only"));
payload.put("booksSalesOrderId", ifnull(input.Books_Sales_Order_ID, ""));

resp = postUrl("https://<your-railway-domain>/api/integrations/cms/schedule-request", payload.toString(), headerMap);
info resp;
```

#### Responses
- **200 OK**: `{"status": "success", "message": "Synced."}`
- **400 Bad Request**: `{"status": "error", "message": "cmsRecordId is required."}`
- **401 Unauthorized**: `{"status": "error", "message": "Unauthorized: Invalid or missing API key."}`
- **503 Service Unavailable**: `{"status": "error", "message": "CMS integration is not configured on this server (CMS_API_KEY unset)."}`

---

### Endpoint B: Send Chat Message / Note

`POST /api/integrations/cms/message`

#### JSON Body Fields

| Field Name | Type | Required | Description |
|---|---|---|---|
| `cmsRecordId` | string | **Yes** | Target CMS Schedule Request ID |
| `senderEmail` | string | No | CS Agent's email |
| `senderName` | string | No | CS Agent's display name |
| `message` | string | **Yes** | The message content |
| `sentOn` | string | No | Timestamp string |

#### Example Deluge Script

```deluge
headerMap = Map();
headerMap.put("Content-Type", "application/json");
headerMap.put("x-api-key", "YOUR_CMS_API_KEY_HERE");

payload = Map();
payload.put("cmsRecordId", input.CMS_Schedule_Request_ID.toString());
payload.put("senderEmail", zoho.loginuserid);
payload.put("senderName", zoho.loginuser);
payload.put("message", input.Message_Text);
payload.put("sentOn", zoho.currenttime.toString("yyyy-MM-dd HH:mm:ss"));

resp = postUrl("https://<your-railway-domain>/api/integrations/cms/message", payload.toString(), headerMap);
info resp;
```

---

## 3. Outbound Endpoints (DMS ➡️ CMS)

When a Dispatcher in DMS confirms/declines a request or replies to a chat, DMS posts back to the configured CMS Webhook URLs:

1. **Status Push (`CMS_STATUS_URL`)**:
   - Posts: `{"cmsRecordId": "...", "newStatus": "Confirmed" | "Declined"}`
   - CMS webhook function: `receive_dms_schedule_request_status`
2. **Message Push (`CMS_MESSAGE_URL`)**:
   - Posts: `{"cmsRecordId": "...", "senderEmail": "...", "senderName": "...", "message": "...", "sentOn": "..."}`
   - CMS webhook function: `receive_dms_schedule_request_message`

### Environment Configuration in DMS (`.env` and Railway Variables)
```env
CMS_API_KEY=choose_a_strong_random_secret_string
CMS_STATUS_URL=https://www.zohoapis.com/creator/custom/homecartel/receive_dms_schedule_request_status?publickey=Y0XaAQRwdaPYePT5mgpWmqGaG
CMS_MESSAGE_URL=https://www.zohoapis.com/creator/custom/homecartel/receive_dms_schedule_request_message?publickey=9y33dCCJqQ8DfMkqRTtxrAt66
```
