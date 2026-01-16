import { useEffect, useState, createContext, useContext } from 'react';
import type { ReactNode } from 'react';
import { useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { setAuthUser, getAuthUserId, getAuthRole, clearAuthUser, currentUserId as storedUserId } from '../auth-store';

interface TelegramContextValue {
    isReady: boolean;
    isTelegram: boolean;
    colorScheme: 'light' | 'dark';
    userId?: number;
    username?: string;
    firstName?: string;
    lastName?: string;
    convexUser?: { _id: string; role: string };
    loginStandalone: () => Promise<void>;
    onAuth: (user: any) => Promise<void>;
    logout: () => void;
}

const TelegramContext = createContext<TelegramContextValue>({
    isReady: false,
    isTelegram: false,
    colorScheme: 'light',
    loginStandalone: async () => { },
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
    const [isReady, setIsReady] = useState(false);
    const [isTelegram, setIsTelegram] = useState(false);
    const [colorScheme, setColorScheme] = useState<'light' | 'dark'>('light');
    const [userData, setUserData] = useState<{
        userId?: number;
        username?: string;
        firstName?: string;
        lastName?: string;
        convexUser?: { _id: string, role: string };
    }>({});

    const login = useMutation(api.users.login);

    const onAuth = async (tgUser: any) => {
        try {
            const user = await login({
                initData: "login_widget", // We flag this for backend to know it's a widget login
                userData: tgUser
            });
            setAuthUser(user._id, user.role, user.studentId);
            setUserData({
                userId: tgUser.id,
                firstName: tgUser.first_name,
                lastName: tgUser.last_name,
                username: tgUser.username,
                convexUser: { _id: user._id, role: user.role }
            });
        } catch (e) {
            console.error("Auth failed", e);
        }
    };

    const loginStandalone = async () => {
        const devUser = {
            id: 111111,
            first_name: "Dev Admin",
            username: "dev_admin",
        };
        await onAuth(devUser);
    };

    const logout = () => {
        clearAuthUser();
        setUserData({});
        // Reload to clear all states
        window.location.reload();
    };

    useEffect(() => {
        const initTelegram = async () => {
            const tgWebApp = window.Telegram?.WebApp;

            if (!tgWebApp || tgWebApp.platform === 'unknown') {
                setIsTelegram(false);
                // Check if already logged in via storage
                if (storedUserId) {
                    setUserData({
                        convexUser: { _id: storedUserId, role: getAuthRole()! }
                    });
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
                            id: tgWebApp.initDataUnsafe.user.id,
                            first_name: tgWebApp.initDataUnsafe.user.first_name,
                            last_name: tgWebApp.initDataUnsafe.user.last_name,
                            username: tgWebApp.initDataUnsafe.user.username,
                            photo_url: tgWebApp.initDataUnsafe.user.photo_url
                        }
                    });
                    setAuthUser(user._id, user.role, user.studentId);
                    setUserData({
                        userId: tgWebApp.initDataUnsafe.user.id,
                        username: tgWebApp.initDataUnsafe.user.username,
                        firstName: tgWebApp.initDataUnsafe.user.first_name,
                        lastName: tgWebApp.initDataUnsafe.user.last_name,
                        convexUser: { _id: user._id, role: user.role }
                    });
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
    }, [login]);

    const applyThemeVariables = (params: TelegramWebApp['themeParams']) => {
        const root = document.documentElement;
        if (params.bg_color) root.style.setProperty('--tg-theme-bg-color', params.bg_color);
        if (params.text_color) root.style.setProperty('--tg-theme-text-color', params.text_color);
        if (params.hint_color) root.style.setProperty('--tg-theme-hint-color', params.hint_color);
        if (params.link_color) root.style.setProperty('--tg-theme-link-color', params.link_color);
        if (params.button_color) root.style.setProperty('--tg-theme-button-color', params.button_color);
        if (params.button_text_color) root.style.setProperty('--tg-theme-button-text-color', params.button_text_color);
        if (params.secondary_bg_color) root.style.setProperty('--tg-theme-secondary-bg-color', params.secondary_bg_color);
    };

    const value: TelegramContextValue = {
        isReady,
        isTelegram,
        colorScheme,
        ...userData,
        loginStandalone,
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
