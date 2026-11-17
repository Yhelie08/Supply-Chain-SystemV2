-- ONE-TIME, NOT RUN. Owner decision 2026-11-17: "Tony" and "Tony Fan" are one supplier, "Fenteng" and "Fenteng Lighting" are one; the full
-- names are used everywhere. The code already reads both names, so this script only makes the stored values match, and it matters most for
-- the three message tables (the chat of the widgets asks for the full name, so old messages stored as "Tony" / "Fenteng" would not show).
--
-- Read from production on 2026-11-17 (read-only): Shipments 'Tony' 8 | Receiving 'Tony' 8 | Replacement_Request 'Tony' 3 | Purchase_Request1
-- Selected_Supplier 'Tony' 17 | Inquiry_Messages 'Tony' 1 + 'Fenteng' 1 | PO_Messages 'Tony' 1 | PR_Messages 'Tony' 8 + 'Fenteng' 2.
--
-- NOT touched (they are read tolerantly by the code, and are JSON inside a row): the supplier names inside the line subforms
-- (PO_Line_Items.Supplier, Supplier_Selected.Suppliers, Supplier_Quotes.Suppliers).
--
-- Run it only after a backup and with the owner's go, in one transaction. Each UPDATE only matches the two short values exactly.
BEGIN;

-- messages first: this is where an old row would otherwise vanish from the chat
UPDATE "Inquiry_Messages" SET "Supplier" = 'Tony Fan'          WHERE "Supplier" = 'Tony';
UPDATE "Inquiry_Messages" SET "Supplier" = 'Fenteng Lighting'  WHERE "Supplier" = 'Fenteng';
UPDATE "PO_Messages"      SET "Supplier" = 'Tony Fan'          WHERE "Supplier" = 'Tony';
UPDATE "PO_Messages"      SET "Supplier" = 'Fenteng Lighting'  WHERE "Supplier" = 'Fenteng';
UPDATE "PR_Messages"      SET "Supplier" = 'Tony Fan'          WHERE "Supplier" = 'Tony';
UPDATE "PR_Messages"      SET "Supplier" = 'Fenteng Lighting'  WHERE "Supplier" = 'Fenteng';

-- then the records that show the name
UPDATE "Shipments"            SET "Supplier"          = 'Tony Fan'         WHERE "Supplier" = 'Tony';
UPDATE "Shipments"            SET "Supplier"          = 'Fenteng Lighting' WHERE "Supplier" = 'Fenteng';
UPDATE "Receiving"            SET "Supplier"          = 'Tony Fan'         WHERE "Supplier" = 'Tony';
UPDATE "Receiving"            SET "Supplier"          = 'Fenteng Lighting' WHERE "Supplier" = 'Fenteng';
UPDATE "Replacement_Request"  SET "RR_Supplier"       = 'Tony Fan'         WHERE "RR_Supplier" = 'Tony';
UPDATE "Replacement_Request"  SET "RR_Supplier"       = 'Fenteng Lighting' WHERE "RR_Supplier" = 'Fenteng';
UPDATE "Purchase_Request1"    SET "Selected_Supplier" = 'Tony Fan'         WHERE "Selected_Supplier" = 'Tony';
UPDATE "Purchase_Request1"    SET "Selected_Supplier" = 'Fenteng Lighting' WHERE "Selected_Supplier" = 'Fenteng';
UPDATE "Exception_Control1"   SET "Supplier"          = 'Tony Fan'         WHERE "Supplier" = 'Tony';
UPDATE "Exception_Control1"   SET "Supplier"          = 'Fenteng Lighting' WHERE "Supplier" = 'Fenteng';

-- check before COMMIT: no row should still say the short name in the columns above
SELECT 'left' AS what, 'Shipments' AS t, count(*) FROM "Shipments" WHERE "Supplier" IN ('Tony','Fenteng')
UNION ALL SELECT 'left','PR_Messages', count(*) FROM "PR_Messages" WHERE "Supplier" IN ('Tony','Fenteng');

COMMIT;
