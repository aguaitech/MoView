import { useEffect, useState } from 'react';
import type { AutomationState } from '@shared/types';

export function useAutomationState() {
  const [state, setState] = useState<AutomationState | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribeState = window.moView.automation.onState((snapshot) => {
      setState(snapshot);
    });
    const unsubscribeError = window.moView.automation.onError((payload) => {
      setError(payload.message);
    });

    return () => {
      unsubscribeState();
      unsubscribeError();
    };
  }, []);

  return { state, error };
}
