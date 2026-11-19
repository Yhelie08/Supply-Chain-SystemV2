# Server-side version of Zoho's form workflows. Zoho ran them when a record was written through a
# form or the API; here they run when a widget writes through the /api/* HTTP layer. Ported from
# server/workflows/index.mjs.
#
# Only the events that run for API writes are ported: "on validate" (before) and "on success"
# (after). "on load", "field rules" and "on user input" only drive Zoho's own forms, not used here.
#
# A hook is a function taking one dict:
#   before*  { form, input, id?, previous?, store, books, user }   input is the data about to be
#            saved; mutate it to alter what is saved, raise to refuse the write (NOT swallowed).
#   after*   { form, id, record, previous?, store, books, user }   record is the saved row with
#            lookup fields as plain IDs (raw=True shape); an error is logged and does not undo the
#            write (swallowed).
#
# Writes a hook makes through `store` are plain writes: they do not fire hooks again, because
# `store` here is always the RAW store the wrapper closes over, never the wrapper itself.
import logging

from app.model import form_by_name, form_of_report

logger = logging.getLogger(__name__)

PHASES = ["beforeAdd", "afterAdd", "beforeUpdate", "afterUpdate", "beforeDelete", "afterDelete"]

# The default registry the server uses; each module file adds its forms here.
WORKFLOWS: dict = {}


def register(form: str, hooks: dict, registry: dict = WORKFLOWS) -> None:
    form_by_name(form)
    entry = registry.setdefault(form, {})
    for phase, fns in hooks.items():
        if phase not in PHASES:
            raise ValueError(f'Unknown workflow phase "{phase}" for {form}')
        fn_list = fns if isinstance(fns, list) else [fns]
        entry.setdefault(phase, []).extend(fn_list)


class HookedStore:
    """Wraps a store so widget writes run the registered hooks. Reads are passed through untouched."""

    def __init__(self, store, registry: dict, books=None):
        self._store = store
        self._registry = registry
        self._books = books
        for name in ("get_records", "get_record_by_id", "find", "next_number", "table_counts"):
            setattr(self, name, getattr(store, name))

    def _has(self, form: str, *phases: str) -> bool:
        entry = self._registry.get(form, {})
        return any(entry.get(p) for p in phases)

    async def _run(self, form: str, phase: str, args: dict, swallow: bool = False) -> None:
        for fn in self._registry.get(form, {}).get(phase, []):
            if not swallow:
                await fn(args)
                continue
            try:
                await fn(args)
            except Exception as e:
                logger.error(f"[workflow {form}.{phase}] {e}")

    def _base(self, user: str) -> dict:
        return {"store": self._store, "books": self._books, "user": user}

    async def add_record(self, form_name: str, data: dict, user: str = "") -> str:
        form = form_by_name(form_name)
        input_ = dict(data)
        await self._run(form, "beforeAdd", {"form": form, "input": input_, **self._base(user)})
        record_id = await self._store.add_record(form, input_, user)
        if self._has(form, "afterAdd"):
            record = await self._store.get_record_by_id(form, record_id, raw=True)
            await self._run(form, "afterAdd", {"form": form, "id": record_id, "record": record, **self._base(user)}, swallow=True)
        return record_id

    async def update_record(self, report_or_form: str, id, data: dict, *, by_form: bool = False, user: str = "") -> str:
        form = form_by_name(report_or_form) if by_form else form_of_report(report_or_form)[0]
        watched = self._has(form, "beforeUpdate", "afterUpdate")
        previous = await self._store.get_record_by_id(form, id, raw=True) if watched else None
        input_ = dict(data)
        await self._run(form, "beforeUpdate", {"form": form, "id": str(id), "input": input_, "previous": previous, **self._base(user)})
        out = await self._store.update_record(report_or_form, id, input_, by_form=by_form)
        if self._has(form, "afterUpdate"):
            record = await self._store.get_record_by_id(form, id, raw=True)
            await self._run(form, "afterUpdate", {"form": form, "id": str(id), "record": record, "previous": previous, **self._base(user)}, swallow=True)
        return out

    async def delete_record(self, report_name: str, id, *, user: str = "") -> str:
        form, _ = form_of_report(report_name)
        watched = self._has(form, "beforeDelete", "afterDelete")
        previous = await self._store.get_record_by_id(form, id, raw=True) if watched else None
        await self._run(form, "beforeDelete", {"form": form, "id": str(id), "previous": previous, **self._base(user)})
        out = await self._store.delete_record(report_name, id)
        # Unconditional in the Node source (no has()-gate on afterDelete, unlike afterAdd/afterUpdate)
        # -- harmless either way since _run() is a no-op on an empty hook list, but matched exactly.
        await self._run(form, "afterDelete", {"form": form, "id": str(id), "previous": previous, **self._base(user)}, swallow=True)
        return out


def create_hooked_store(store, registry: dict = WORKFLOWS, *, books=None) -> HookedStore:
    return HookedStore(store, registry, books)
