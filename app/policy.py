# Policy_Settings by key: the first record's value, or None when missing or empty. Duplicated out
# of server/modules/delivery-management/scheduling.mjs's policyReader (Delivery's own module isn't
# built yet) into this shared location since Fulfillment's sorter needs it too.
def _blank(v) -> bool:
    return v is None or v == ""


async def policy_reader(store):
    rows = await store.find("Policy_Settings")

    def read(key: str):
        row = next((r for r in rows if r.get("Policy_Key") == key), None)
        return str(row["Value"]) if row and not _blank(row.get("Value")) else None

    return read
