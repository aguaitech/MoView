import { useEffect, useState } from 'react';
export function useAutomationState() {
    const [state, setState] = useState(null);
    const [error, setError] = useState(null);
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
