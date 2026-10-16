import { useEffect, useState } from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db, appId } from "../lib/firebase";

export function useAdvances(projectId: string | null | undefined) {
  const [state, setState] = useState<{ projectId: string | null | undefined; advances: any[]; loading: boolean; error: string | null }>({ projectId, advances: [], loading: !!projectId, error: null });
  useEffect(() => {
    setState({ projectId, advances: [], loading: !!projectId, error: null });
    if (!projectId) return;
    let active = true;
    const unsubscribe = onSnapshot(
      query(collection(db, "artifacts", appId, "public", "data", "advances"), where("projectId", "==", projectId)),
      snapshot => {
        if (active) setState({ projectId, advances: snapshot.docs.map(row => ({ ...row.data(), id: row.id })), loading: false, error: null });
      },
      error => {
        if (active) setState({ projectId, advances: [], loading: false, error: error.message });
      },
    );
    return () => { active = false; unsubscribe(); };
  }, [projectId]);
  // Hide the previous project's rows immediately, before the new effect runs.
  return state.projectId === projectId ? { advances: state.advances, loading: state.loading, error: state.error } : { advances: [], loading: !!projectId, error: null };
}

export default useAdvances;

/** Project-only query avoids a composite index; select the advance locally. */
export function useAdvanceTransactions(projectId: string | null | undefined, advanceId: string) {
  const [state, setState] = useState<{ projectId: string | null | undefined; rows: any[]; loading: boolean; error: string | null }>({ projectId: null, rows: [], loading: false, error: null });
  const enabled = !!advanceId;
  useEffect(() => {
    setState({ projectId, rows: [], loading: !!projectId && enabled, error: null });
    if (!projectId || !enabled) return;
    let active = true;
    const unsubscribe = onSnapshot(query(collection(db, "artifacts", appId, "public", "data", "advanceTransactions"), where("projectId", "==", projectId)), snapshot => {
      if (active) setState({ projectId, rows: snapshot.docs.map(row => ({ ...row.data(), id: row.id })), loading: false, error: null });
    }, error => {
      if (active) setState({ projectId, rows: [], loading: false, error: error.message });
    });
    return () => { active = false; unsubscribe(); };
  }, [projectId, enabled]);
  const current = enabled && state.projectId === projectId;
  return {
    transactions: current ? state.rows.filter(row => row.advanceId === advanceId && ["recovery", "reversal"].includes(row.type)).sort((a, b) => (a.createdAt?.toMillis?.() || 0) - (b.createdAt?.toMillis?.() || 0)) : [],
    loading: !!projectId && enabled && (!current || state.loading),
    error: current ? state.error : null,
  };
}
