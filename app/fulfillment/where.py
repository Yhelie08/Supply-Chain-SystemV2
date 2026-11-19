# A Zoho criteria string for "field == value", for store.find(form, test, criteria=...): Postgres
# filters, so only the matching rows are read instead of the whole table. Ported from
# server/modules/fulfillment/where.mjs.
def eq(field: str, value) -> str:
    v = str(value if value is not None else "").replace("\\", "\\\\").replace('"', '\\"')
    return f'({field} == "{v}")'
