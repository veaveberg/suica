import { useCallback, useSyncExternalStore } from 'react';

// Global subscription model for URL params.
// Instead of each component having its own popstate listener + useState,
// we use a single external store that components subscribe to.
// Components that use useParam(key) only re-render when their specific key changes.

type Listener = () => void;
const listeners = new Set<Listener>();

function subscribe(listener: Listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

function notifyAll() {
    listeners.forEach(l => l());
}

function getSearchString() {
    return window.location.search;
}

// Stable setParam that can be used without a hook
export function setParam(key: string, value: string | null) {
    setParams({ [key]: value });
}

export function setParams(changes: Record<string, string | null>) {
    const url = new URL(window.location.href);
    for (const [key, value] of Object.entries(changes)) {
        if (value === null) {
            url.searchParams.delete(key);
        } else {
            url.searchParams.set(key, value);
        }
    }
    window.history.pushState({}, '', url.toString());
    notifyAll();
}

// Listen for browser back/forward
if (typeof window !== 'undefined') {
    window.addEventListener('popstate', () => {
        notifyAll();
    });
}

/**
 * Hook that returns a single URL param value.
 * Only triggers re-render when the specific param's value changes.
 */
export function useParam(key: string): string | null {
    // getSnapshot returns a primitive (string|null), so useSyncExternalStore
    // will only trigger a re-render when the value actually changes.
    const getSnapshot = useCallback(() => {
        return new URLSearchParams(window.location.search).get(key);
    }, [key]);

    return useSyncExternalStore(subscribe, getSnapshot);
}

/**
 * Hook that returns a stable setParam function.
 * Does NOT subscribe to any param changes — never causes re-renders.
 */
export function useSetParam() {
    return setParam;
}

/**
 * Legacy hook for backwards compatibility.
 * Components that use this will re-render on ANY param change.
 * Prefer useParam(key) + useSetParam() for better performance.
 */
export const useSearchParams = () => {
    const search = useSyncExternalStore(subscribe, getSearchString);

    const getParam = useCallback((key: string) => {
        return new URLSearchParams(search).get(key);
    }, [search]);

    return { getParam, setParam };
};
