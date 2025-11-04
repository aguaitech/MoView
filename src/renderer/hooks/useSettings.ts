import { useCallback, useEffect, useState } from 'react';
import type { AppSettings } from '@shared/types';

export function useSettings() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    window.moView.settings
      .get()
      .then((snapshot) => {
        if (!mounted) {
          return;
        }
        setSettings(snapshot);
        setLoading(false);
      })
      .catch((err) => {
        if (!mounted) {
          return;
        }
        setError(err instanceof Error ? err.message : String(err));
        setLoading(false);
      });

    const unsubscribe = window.moView.settings.onDidChange((snapshot) => {
      setSettings(snapshot);
    });

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  const updateSettings = useCallback(async (next: AppSettings) => {
    setSettings(next);
    const saved = await window.moView.settings.update(next);
    setSettings(saved);
    return saved;
  }, []);

  return {
    settings,
    loading,
    error,
    updateSettings
  };
}
