import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { TelegramLoginWidget } from './TelegramLoginWidget';
import { SettingsSheet } from './SettingsSheet';

import { Settings, X } from 'lucide-react';

interface LoginPageProps {
    onTelegramAuth: (user: any) => void;
    securityNoticeKey?: string | null;
    // Settings props
    isDark: boolean;
    themeMode: 'auto' | 'light' | 'dark';
    onChangeThemeMode: (mode: 'auto' | 'light' | 'dark') => void;
    onChangeLanguage: (lang: any) => void;
}

export const LoginPage: React.FC<LoginPageProps> = ({
    onTelegramAuth,
    securityNoticeKey,
    isDark,
    themeMode,
    onChangeThemeMode,
    onChangeLanguage
}) => {
    const { t, i18n } = useTranslation();
    const [showSettings, setShowSettings] = useState(false);
    const [showTerms, setShowTerms] = useState(false);

    return (
        <div className="min-h-screen relative flex flex-col items-center justify-center p-6 text-center overflow-hidden bg-black">
            {/* Settings Button */}
            <button
                onClick={() => setShowSettings(true)}
                className="absolute top-0 right-4 z-50 p-2 mt-[calc(env(safe-area-inset-top)+1rem)] text-white/50 hover:text-white transition-colors bg-white/5 rounded-full backdrop-blur-md"
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
                    {securityNoticeKey && (
                        <div className="rounded-2xl bg-white/15 border border-white/30 p-3 text-left">
                            <p className="text-xs text-white/95 leading-relaxed">
                                {t(securityNoticeKey)}
                            </p>
                        </div>
                    )}
                    <div className="flex flex-col items-center gap-4">
                        <TelegramLoginWidget
                            botName="suica_ekabot"
                            onAuth={onTelegramAuth}
                            className="w-full flex justify-center"
                            lang={i18n.language.toLowerCase()}
                        />
                    </div>

                    <p className="text-xs text-white/50">
                        {t('by_logging_in') || 'By logging in, you agree to our'}{' '}
                        <button
                            onClick={() => setShowTerms(true)}
                            className="text-white hover:underline focus:outline-none"
                        >
                            {t('terms_of_service') || 'terms of service'}
                        </button>
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

            {/* Terms Overlay */}
            {showTerms && (
                <div className="fixed inset-0 z-50 flex items-center justify-center px-4 animate-in fade-in duration-200">
                    <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setShowTerms(false)} />
                    <div className="relative w-full max-w-sm bg-ios-card dark:bg-zinc-900 rounded-3xl p-6 text-left shadow-2xl animate-in zoom-in-95 duration-200">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-xl font-bold dark:text-white">{t('terms_title')}</h3>
                            <button onClick={() => setShowTerms(false)} className="p-1 text-ios-gray hover:text-white transition-colors">
                                <X className="w-6 h-6" />
                            </button>
                        </div>
                        <p className="text-base text-ios-gray dark:text-gray-300 leading-relaxed">
                            {t('terms_content')}
                        </p>
                    </div>
                </div>
            )}
        </div>
    );
};
