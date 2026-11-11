---
title: chatSend
tags: [action, procurement]
module: Procurement
source: "src/domain/actions.js:434"
---

# chatSend

Sends a message in a supplier conversation. Only Fenteng and Tony have threads, and only when they are quoted on the inquiry.

**Source:** `src/domain/actions.js:434`

## Offered on
- [[Inquiry List]] (Procurement)
- [[Tony Fan - Inquiries]] (Tony Fan)
- [[Fenteng Lighting - Inquiries]] (Fenteng Lighting)

## Creates records in
- [[messages]]
- [[timeline]]

## Rules
- [[INQ.CHAT]]: A message needs text, and only a supplier that is quoted on the inquiry (Fenteng or Tony) has a conversation thread.

## How it behaves
A step runs on a copy of the data. If any rule refuses, the copy is thrown away and nothing changes. See [[How the engine works]].
