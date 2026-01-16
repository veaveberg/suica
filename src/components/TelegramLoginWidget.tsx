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
    className
}) => {
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        // Define the global callback
        window.onTelegramAuth = (user: TelegramUser) => {
            console.log("[TelegramWidget] Global window.onTelegramAuth hit!");
            onAuth(user);
        };

        const script = document.createElement('script');
        script.src = 'https://telegram.org/js/telegram-widget.js?22';
        script.setAttribute('data-telegram-login', botName);
        script.setAttribute('data-size', buttonSize);
        script.setAttribute('data-userpic', usePic.toString());
        script.setAttribute('data-radius', cornerRadius.toString());
        script.setAttribute('data-onauth', 'onTelegramAuth');
        if (requestAccess) {
            script.setAttribute('data-request-access', 'write');
        }
        script.async = true;

        if (containerRef.current) {
            containerRef.current.appendChild(script);
        }

        return () => {
            if (containerRef.current) {
                containerRef.current.innerHTML = '';
            }
            // We don't delete the global callback to avoid issues if a late script execution happens
        };
    }, [botName, onAuth, buttonSize, cornerRadius, requestAccess, usePic]);

    return (
        <div ref={containerRef} className={className} />
    );
};
