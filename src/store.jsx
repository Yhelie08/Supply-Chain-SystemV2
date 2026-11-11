import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { run } from './domain/actions.js';
import { RuleError } from './domain/rules.js';
import { seedDb } from './domain/seed.js';
import { todayISO } from './domain/util.js';

const KEY = 'supply-chain-v2:db';
const Ctx = createContext(null);

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      // Version 3 added the forecast settings. Version 2 added customers, projects, the item catalog and the inquiry conversations.
      // Data saved by version 1 has the old inquiry shape, so it is replaced by the sample data.
      if (parsed && parsed.version === 4) return parsed;
    }
  } catch {
    /* storage can be blocked or corrupt; fall through to the sample data */
  }
  return seedDb();
}

export function StoreProvider({ children }) {
  const [db, setDb] = useState(load);
  const [toasts, setToasts] = useState([]);
  const dbRef = useRef(db);
  const toastId = useRef(0);

  useEffect(() => {
    dbRef.current = db;
    try {
      localStorage.setItem(KEY, JSON.stringify(db));
    } catch {
      /* the app still works in memory if storage is unavailable */
    }
  }, [db]);

  const dismiss = useCallback((id) => setToasts((t) => t.filter((x) => x.id !== id)), []);

  const toast = useCallback(
    (kind, text, rule) => {
      toastId.current += 1;
      const id = toastId.current;
      setToasts((t) => [...t.slice(-3), { id, kind, text, rule }]);
      if (kind === 'ok') setTimeout(() => dismiss(id), 4500);
    },
    [dismiss],
  );

  // Runs one workflow step. Returns the new database on success (so a caller can read what the step
  // just created through `.last`), or false when a rule refused it and showed why.
  const act = useCallback(
    (name, payload) => {
      try {
        const result = run(dbRef.current, name, payload);
        dbRef.current = result.db;
        setDb(result.db);
        toast('ok', result.msg);
        return result.db;
      } catch (e) {
        if (e instanceof RuleError) toast('refuse', e.message, e.ruleId);
        else toast('error', e.message);
        return false;
      }
    },
    [toast],
  );

  const reset = useCallback(() => {
    const fresh = seedDb();
    dbRef.current = fresh;
    setDb(fresh);
    toast('ok', 'Sample data restored.');
  }, [toast]);

  return <Ctx.Provider value={{ db, act, notify: toast, reset, toasts, dismiss, today: todayISO() }}>{children}</Ctx.Provider>;
}

export function useStore() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useStore must be used inside StoreProvider');
  return v;
}
