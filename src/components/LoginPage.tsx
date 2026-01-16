import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { TelegramLoginWidget } from './TelegramLoginWidget';
import { SettingsSheet } from './SettingsSheet';

import { Settings } from 'lucide-react';

interface LoginPageProps {
    onTelegramAuth: (user: any) => void;
    // Settings props
    isDark: boolean;
    themeMode: 'auto' | 'light' | 'dark';
    onChangeThemeMode: (mode: 'auto' | 'light' | 'dark') => void;
    onChangeLanguage: (lang: any) => void;
}

export const LoginPage: React.FC<LoginPageProps> = ({
    onTelegramAuth,
    isDark,
    themeMode,
    onChangeThemeMode,
    onChangeLanguage
}) => {
    const { t } = useTranslation();
    const [showSettings, setShowSettings] = useState(false);

    return (
        <div className="min-h-screen relative flex flex-col items-center justify-center p-6 text-center overflow-hidden bg-black">
            {/* Settings Button */}
            <button
                onClick={() => setShowSettings(true)}
                className="absolute top-4 right-4 z-50 p-2 text-white/50 hover:text-white transition-colors bg-white/5 rounded-full backdrop-blur-md"
            >
                <Settings className="w-5 h-5" />
            </button>

            {/* Background Image */}
            <div className="absolute inset-0 z-0">
                <img
                    src="suica bg.png"
                    alt="Background"
                    className="w-full h-full object-cover"
                />
                {/* Overlay to ensure legibility */}
                <div className="absolute inset-0 bg-black/30 backdrop-blur-[2px]" />
            </div>

            <div className="z-10 w-full max-w-sm space-y-12 animate-in fade-in zoom-in duration-700">
                <div className="space-y-2">
                    <h1 className="text-5xl font-black text-white tracking-tight drop-shadow-lg">SUiCA</h1>
                    <p className="text-white/80 font-medium text-lg drop-shadow-md">{t('app_tagline') || 'Your intelligent class manager'}</p>
                </div>

                {/* Login Button Area */}
                <div className="pt-8 space-y-6">
                    <div className="flex flex-col items-center gap-4">
                        <TelegramLoginWidget
                            botName="suica_ekabot"
                            onAuth={onTelegramAuth}
                            className="w-full flex justify-center"
                        />
                    </div>

                    <p className="text-xs text-white/50">
                        {t('by_logging_in') || 'By logging in, you agree to our terms of service'}
                    </p>
                </div>
            </div>

            <SettingsSheet
                isOpen={showSettings}
                onClose={() => setShowSettings(false)}
                isDark={isDark}
                themeMode={themeMode}
                onChangeThemeMode={onChangeThemeMode}
                onChangeLanguage={onChangeLanguage}
                minimal={true}
            />
        </div>
    );
};
