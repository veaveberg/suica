import { useEffect, useState, createContext, useContext, useCallback, useRef } from 'react';
import type { ReactNode } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { setAuthUser, getAuthRole, clearAuthUser, getAuthUserId, getAuthToken, getAuthTokenExpiresAt, isAuthTokenExpired } from '../auth-store';

interface TelegramContextValue {
    isReady: boolean;
    isTelegram: boolean;
    colorScheme: 'light' | 'dark';
    userId?: number;
    username?: string;
    firstName?: string;
    lastName?: string;
    authError?: string;
    convexUser?: { _id: string; role: string; tokenIdentifier?: string };
    loginStandalone: () => Promise<void>;
    backdoorLogin: (targetTelegramId: number, accessSecret: string) => Promise<void>;
    onAuth: (user: any) => Promise<void>;
    logout: () => void;
}

const TelegramContext = createContext<TelegramContextValue>({
    isReady: false,
    isTelegram: false,
    colorScheme: 'light',
    loginStandalone: async () => { },
    backdoorLogin: async () => { },
    onAuth: async () => { },
    logout: () => { },
});

export const useTelegram = () => useContext(TelegramContext);

interface TelegramProviderProps {
    children: ReactNode;
}

// Type for Telegram WebApp global object
interface TelegramWebApp {
    ready: () => void;
    expand: () => void;
    close: () => void;
    isExpanded: boolean;
    colorScheme: 'light' | 'dark';
    platform: string;
    initData: string;
    themeParams: {
        bg_color?: string;
        text_color?: string;
        hint_color?: string;
        link_color?: string;
        button_color?: string;
        button_text_color?: string;
        secondary_bg_color?: string;
    };
    initDataUnsafe?: {
        user?: {
            id?: number;
            username?: string;
            first_name?: string;
            last_name?: string;
            photo_url?: string;
        };
    };
    onEvent: (eventType: string, callback: () => void) => void;
    offEvent: (eventType: string, callback: () => void) => void;
    disableVerticalSwipes: () => void;
}

declare global {
    interface Window {
        Telegram?: {
            WebApp?: TelegramWebApp;
        };
    }
}

export function TelegramProvider({ children }: TelegramProviderProps) {
    const SESSION_REAUTH_NOTICE_KEY = 'suica_security_reauth_notice';
    const MAX_SESSION_EXPIRY_TIMER_MS = 2_147_483_647;
    const [isReady, setIsReady] = useState(false);
    const [isTelegram, setIsTelegram] = useState(false);
    const [colorScheme, setColorScheme] = useState<'light' | 'dark'>('light');
    const [authError, setAuthError] = useState<string | undefined>();
    const sessionExpiryTimerRef = useRef<number | null>(null);
    const [userData, setUserData] = useState<{
        userId?: number;
        username?: string;
        firstName?: string;
        lastName?: string;
        convexUser?: { _id: string, role: string, tokenIdentifier?: string };
    }>({});

    const login = useMutation(api.users.login);
    const backdoorLoginMutation = useMutation((api.users as any).backdoorLogin);

    const clearSessionExpiryTimer = useCallback(() => {
        if (sessionExpiryTimerRef.current !== null) {
            window.clearTimeout(sessionExpiryTimerRef.current);
            sessionExpiryTimerRef.current = null;
        }
    }, []);

    const markSessionExpired = useCallback(() => {
        console.warn("[TelegramAuth] Session expiry timer fired; clearing auth");
        sessionStorage.setItem(SESSION_REAUTH_NOTICE_KEY, '1');
        clearSessionExpiryTimer();
        clearAuthUser();
        setUserData({});
    }, [clearSessionExpiryTimer]);

    const scheduleSessionExpiry = useCallback((authToken?: string | null) => {
        clearSessionExpiryTimer();
        const expiresAt = getAuthTokenExpiresAt(authToken || null);
        if (!expiresAt) return;

        const expiresInMs = expiresAt * 1000 - Date.now() - 5000;
        if (expiresInMs <= 0) {
            markSessionExpired();
            return;
        }

        const delay = Math.min(expiresInMs, MAX_SESSION_EXPIRY_TIMER_MS);
        console.log("[TelegramAuth] Scheduling session expiry", {
            expiresAt,
            delayMs: delay,
            remainingMs: expiresInMs
        });
        sessionExpiryTimerRef.current = window.setTimeout(() => {
            if (Date.now() >= expiresAt * 1000 - 5000) {
                markSessionExpired();
            } else {
                scheduleSessionExpiry(authToken);
            }
        }, delay);
    }, [clearSessionExpiryTimer, markSessionExpired]);

    const onAuth = useCallback(async (tgUser: any) => {
        console.log("[TelegramAuth] Callback received from widget:", tgUser);
        setAuthError(undefined);
        try {
            const user = await login({
                initData: "login_widget", // We flag this for backend to know it's a widget login
                userData: tgUser
            });
            console.log("[TelegramAuth] Convex login mutation result:", user);
            if (user) {
                if (!user.sessionToken) {
                    throw new Error("Login did not return a session token");
                }
                setAuthUser(user._id, user.role, user.studentId, user.sessionToken);
                scheduleSessionExpiry(user.sessionToken);
                setUserData({
                    userId: tgUser.id,
                    firstName: tgUser.first_name,
                    lastName: tgUser.last_name,
                    username: tgUser.username,
                    convexUser: { _id: user._id, role: user.role, tokenIdentifier: user.tokenIdentifier }
                });
                console.log("[TelegramAuth] User state updated successfully");
            }
        } catch (e) {
            console.error("[TelegramAuth] Auth failed during Convex mutation:", e);
            setAuthError(e instanceof Error ? e.message : "Login failed");
        }
    }, [login, scheduleSessionExpiry]);

    const loginStandalone = async () => {
        throw new Error("Standalone login is disabled. Use backdoor login with secret.");
    };

    const backdoorLogin = useCallback(async (targetTelegramId: number, accessSecret: string) => {
        setAuthError(undefined);
        const user = await backdoorLoginMutation({ targetTelegramId, accessSecret });
        if (!user) return;
        if (!user.sessionToken) {
            throw new Error("Login did not return a session token");
        }
        setAuthUser(user._id, user.role, user.studentId, user.sessionToken);
        scheduleSessionExpiry(user.sessionToken);
        setUserData({
            userId: targetTelegramId,
            firstName: user.name,
            username: user.username,
            convexUser: { _id: user._id, role: user.role, tokenIdentifier: user.tokenIdentifier }
        });
    }, [backdoorLoginMutation, scheduleSessionExpiry]);

    const logout = () => {
        clearSessionExpiryTimer();
        clearAuthUser();
        setUserData({});
        // Reload to clear all states
        window.location.reload();
    };

    const applyThemeVariables = useCallback((params: TelegramWebApp['themeParams']) => {
        const root = document.documentElement;
        if (params.bg_color) root.style.setProperty('--tg-theme-bg-color', params.bg_color);
        if (params.text_color) root.style.setProperty('--tg-theme-text-color', params.text_color);
        if (params.hint_color) root.style.setProperty('--tg-theme-hint-color', params.hint_color);
        if (params.link_color) root.style.setProperty('--tg-theme-link-color', params.link_color);
        if (params.button_color) root.style.setProperty('--tg-theme-button-color', params.button_color);
        if (params.button_text_color) root.style.setProperty('--tg-theme-button-text-color', params.button_text_color);
        if (params.secondary_bg_color) root.style.setProperty('--tg-theme-secondary-bg-color', params.secondary_bg_color);
    }, []);

    useEffect(() => {
        const initTelegram = async () => {
            const tgWebApp = window.Telegram?.WebApp;

            if (!tgWebApp || tgWebApp.platform === 'unknown') {
                setIsTelegram(false);
                // Check if already logged in via storage
                const storedUserId = getAuthUserId();
                if (storedUserId) {
                    const authToken = getAuthToken();
                    if (!authToken || isAuthTokenExpired(authToken)) {
                        console.warn("[TelegramAuth] Stored auth missing or expired during startup", {
                            hasAuthToken: !!authToken,
                            expiresAt: getAuthTokenExpiresAt(authToken),
                            now: Math.floor(Date.now() / 1000)
                        });
                        sessionStorage.setItem(SESSION_REAUTH_NOTICE_KEY, '1');
                        clearAuthUser();
                        setUserData({});
                    } else {
                        setUserData({
                            convexUser: { _id: storedUserId, role: getAuthRole()! }
                        });
                        scheduleSessionExpiry(authToken);
                    }
                }
                setIsReady(true);
                return;
            }

            try {
                setIsTelegram(true);
                tgWebApp.expand();
                if (typeof tgWebApp.disableVerticalSwipes === 'function') {
                    tgWebApp.disableVerticalSwipes();
                }
                setColorScheme(tgWebApp.colorScheme || 'light');

                const handleThemeChange = () => {
                    if (window.Telegram?.WebApp) {
                        setColorScheme(window.Telegram.WebApp.colorScheme || 'light');
                        applyThemeVariables(window.Telegram.WebApp.themeParams);
                    }
                };
                tgWebApp.onEvent('themeChanged', handleThemeChange);

                if (tgWebApp.initDataUnsafe?.user) {
                    const user = await login({
                        initData: tgWebApp.initData,
                        userData: {
                            id: tgWebApp.initDataUnsafe.user.id!,
                            first_name: tgWebApp.initDataUnsafe.user.first_name!,
                            last_name: tgWebApp.initDataUnsafe.user.last_name,
                            username: tgWebApp.initDataUnsafe.user.username,
                            photo_url: tgWebApp.initDataUnsafe.user.photo_url
                        }
                    });
                    if (user) {
                        if (!user.sessionToken) {
                            throw new Error("Login did not return a session token");
                        }
                        setAuthUser(user._id, user.role, user.studentId, user.sessionToken);
                        scheduleSessionExpiry(user.sessionToken);
                        setUserData({
                            userId: tgWebApp.initDataUnsafe.user.id,
                            username: tgWebApp.initDataUnsafe.user.username,
                            firstName: tgWebApp.initDataUnsafe.user.first_name,
                            lastName: tgWebApp.initDataUnsafe.user.last_name,
                            convexUser: { _id: user._id, role: user.role, tokenIdentifier: user.tokenIdentifier }
                        });
                    }
                }

                applyThemeVariables(tgWebApp.themeParams);
                tgWebApp.ready();
                setIsReady(true);

                return () => {
                    tgWebApp.offEvent('themeChanged', handleThemeChange);
                };
            } catch (error) {
                console.error('[Telegram] Failed to initialize:', error);
                setIsReady(true);
            }
        };

        initTelegram();
        return () => {
            clearSessionExpiryTimer();
        };
    }, [applyThemeVariables, clearSessionExpiryTimer, login, scheduleSessionExpiry]);

    const authToken = getAuthToken();
    const me = useQuery(
        api.users.getMe,
        userData.convexUser?._id && authToken && !isAuthTokenExpired(authToken)
            ? { userId: userData.convexUser._id as any, authToken }
            : "skip"
    );

    useEffect(() => {
        if (me) {
            const updates: Partial<typeof userData> = {};
            if (me.name && me.name !== userData.firstName) {
                updates.firstName = me.name;
            }
            if (me.tokenIdentifier && !userData.userId) {
                updates.userId = parseInt(me.tokenIdentifier);
            }
            if (Object.keys(updates).length > 0) {
                setUserData(prev => ({ ...prev, ...updates }));
            }
        }
    }, [me, userData.firstName, userData.userId]);

    const value: TelegramContextValue = {
        isReady,
        isTelegram,
        colorScheme,
        authError,
        ...userData,
        loginStandalone,
        backdoorLogin,
        onAuth,
        logout
    };

    if (!isReady) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-ios-background dark:bg-black">
                <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-ios-blue shadow-lg"></div>
            </div>
        );
    }

    return (
        <TelegramContext.Provider value={value}>
            {children}
        </TelegramContext.Provider>
    );
}
