import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';

export type AssistantMode = 'auto' | 'sales' | 'procurement';

type Ctx = {
  mode: AssistantMode;
  setMode: (m: AssistantMode) => void;
  scope: 'dashboard' | 'contacts' | 'companies' | 'deals' | 'other';
};

const AssistantCtx = createContext<Ctx | undefined>(undefined);

export function AssistantProvider({ children }: { children: React.ReactNode }) {
  const loc = useLocation();
  const [mode, setMode] = useState<AssistantMode>(() => (localStorage.getItem('assistant.mode') as AssistantMode) || 'auto');

  useEffect(() => {
    localStorage.setItem('assistant.mode', mode);
  }, [mode]);

  const scope = useMemo<Ctx['scope']>(() => {
    const p = loc.pathname;
    if (p.startsWith('/contacts')) return 'contacts';
    if (p.startsWith('/companies')) return 'companies';
    if (p.startsWith('/deals')) return 'deals';
    if (p === '/' || p.startsWith('/dashboard')) return 'dashboard';
    return 'other';
  }, [loc.pathname]);

  const value: Ctx = { mode, setMode, scope };
  return <AssistantCtx.Provider value={value}>{children}</AssistantCtx.Provider>;
}

export function useAssistantContext() {
  const v = useContext(AssistantCtx);
  if (!v) throw new Error('useAssistantContext must be used within AssistantProvider');
  return v;
}
