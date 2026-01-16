import { useState, useEffect, useCallback } from 'react';

export const useSearchParams = () => {
    // We keep a local state to trigger re-renders when URL changes
    const [searchParams, setSearchParams] = useState(new URLSearchParams(window.location.search));

    useEffect(() => {
        const handlePopState = () => {
            setSearchParams(new URLSearchParams(window.location.search));
        };

        window.addEventListener('popstate', handlePopState);
        return () => window.removeEventListener('popstate', handlePopState);
    }, []);

    const getParam = useCallback((key: string) => {
        return searchParams.get(key);
    }, [searchParams]);

    const setParam = useCallback((key: string, value: string | null) => {
        const url = new URL(window.location.href);
        if (value === null) {
            url.searchParams.delete(key);
        } else {
            url.searchParams.set(key, value);
        }

        // Use pushState so back button works for navigation changes
        window.history.pushState({}, '', url.toString());
        setSearchParams(url.searchParams);
    }, []);

    return { getParam, setParam };
};
