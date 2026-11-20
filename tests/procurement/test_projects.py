import pytest


@pytest.fixture
async def raw(db_conn):
    from app.schema import ensure_schema
    from app.store import create_store
    await ensure_schema(db_conn)
    return create_store(db_conn)


@pytest.fixture
def store(raw):
    from app.workflows import create_hooked_store
    import app.procurement.projects  # noqa: F401
    return create_hooked_store(raw)


# Node: 'Projects: a new project gets PRJ-nnnnn after the highest code, even when the widget sent one'
@pytest.mark.asyncio
async def test_project_code_autonumber_follows_highest_code_even_when_widget_sent_one(raw, store):
    a = await store.add_record("Projects", {"Project_Name": "Hotel", "Project_Code": "X"})
    b = await store.add_record("Projects", {"Project_Name": "Office"})

    async def code(id_):
        return (await raw.get_record_by_id("Projects", id_, raw=True))["Project_Code"]

    assert [await code(a), await code(b)] == ["PRJ-00001", "PRJ-00002"]
