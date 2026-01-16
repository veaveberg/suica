import React, { useEffect, useRef } from 'react';

interface TelegramUser {
    id: number;
    first_name: string;
    last_name?: string;
    username?: string;
    photo_url?: string;
    auth_date: number;
    hash: string;
}

interface TelegramLoginWidgetProps {
    botName: string;
    onAuth: (user: TelegramUser) => void;
    buttonSize?: 'large' | 'medium' | 'small';
    cornerRadius?: number;
    requestAccess?: boolean;
    usePic?: boolean;
    className?: string;
    lang?: string;
}

declare global {
    interface Window {
        onTelegramAuth: (user: TelegramUser) => void;
    }
}

export const TelegramLoginWidget: React.FC<TelegramLoginWidgetProps> = ({
    botName,
    onAuth,
    buttonSize = 'large',
    cornerRadius = 16,
    requestAccess = true,
    usePic = true,
    className,
    lang = 'en'
}) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const onAuthRef = useRef(onAuth);

    // Keep ref synced with latest callback
    useEffect(() => {
        onAuthRef.current = onAuth;
    }, [onAuth]);

    useEffect(() => {
        // Define the global callback safely
        // ensuring we don't overwrite if it exists, or just overwrite to point to our ref
        window.onTelegramAuth = (user: TelegramUser) => {
            console.log("[TelegramWidget] Global window.onTelegramAuth hit!", user);
            if (onAuthRef.current) {
                onAuthRef.current(user);
            } else {
                console.error("[TelegramWidget] onAuthRef is missing!");
            }
        };

        console.log("[TelegramWidget] Widget mounting, creating script...");

        const script = document.createElement('script');
        script.src = 'https://telegram.org/js/telegram-widget.js?22';
        script.setAttribute('data-telegram-login', botName);
        script.setAttribute('data-size', buttonSize);
        script.setAttribute('data-userpic', usePic.toString());
        script.setAttribute('data-radius', cornerRadius.toString());
        script.setAttribute('data-onauth', 'onTelegramAuth(user)'); // Reverting to call syntax as per some docs
        script.setAttribute('data-lang', lang);
        if (requestAccess) {
            script.setAttribute('data-request-access', 'write');
        }
        script.async = true;

        if (containerRef.current) {
            containerRef.current.innerHTML = ''; // Clear previous
            containerRef.current.appendChild(script);
        }

        return () => {
            // Cleanup if needed
            // We deliberately treat the script as managed by the container's innerHTML
        };
    }, [botName, buttonSize, cornerRadius, requestAccess, usePic, lang]); // Removed onAuth from dependency to avoid remounts

    return (
        <div ref={containerRef} className={className} />
    );
};
