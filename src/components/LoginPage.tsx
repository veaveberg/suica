import { Send, Info } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { TelegramLoginWidget } from './TelegramLoginWidget';

interface LoginPageProps {
    onLogin: () => void;
    onTelegramAuth: (user: any) => void;
    isLoading?: boolean;
}

export const LoginPage: React.FC<LoginPageProps> = ({ onLogin, onTelegramAuth, isLoading }) => {
    const { t } = useTranslation();

    return (
        <div className="min-h-screen relative flex flex-col items-center justify-center p-6 text-center overflow-hidden bg-black">
            {/* Background Image */}
            <div className="absolute inset-0 z-0">
                <img
                    src="/suica bg.png"
                    alt="Background"
                    className="w-full h-full object-cover"
                />
                {/* Overlay to ensure legibility */}
                <div className="absolute inset-0 bg-black/30 backdrop-blur-[2px]" />
            </div>

            <div className="z-10 w-full max-w-sm space-y-12 animate-in fade-in zoom-in duration-700">
                {/* Logo/Icon */}
                <div className="mx-auto w-24 h-24 bg-ios-blue rounded-3xl shadow-2xl shadow-ios-blue/30 flex items-center justify-center transform hover:scale-105 transition-transform">
                    <Send className="w-12 h-12 text-white" />
                </div>

                <div className="space-y-2">
                    <h1 className="text-5xl font-black text-white tracking-tight drop-shadow-lg">Suica</h1>
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

                        <div className="flex items-center gap-2 text-white/40 text-[10px] uppercase font-bold tracking-widest py-2">
                            <div className="h-[1px] w-8 bg-white/10" />
                            <span>or developer mode</span>
                            <div className="h-[1px] w-8 bg-white/10" />
                        </div>

                        <button
                            onClick={onLogin}
                            disabled={isLoading}
                            className="w-full text-white/60 hover:text-white text-sm font-semibold transition-colors"
                        >
                            {t('login_with_mock') || 'Continue as Dev Admin'}
                        </button>
                    </div>

                    <div className="p-4 bg-white/5 backdrop-blur-md rounded-2xl border border-white/10 space-y-2 text-left">
                        <div className="flex items-center gap-2 text-ios-blue text-xs font-bold uppercase tracking-wider">
                            <Info className="w-3 h-3" />
                            <span>Setup Required</span>
                        </div>
                        <p className="text-[11px] text-white/60 leading-relaxed">
                            To use the real login, ensure <strong>@suica_ekabot</strong> has its domain set to your GitHub Pages URL via @BotFather.
                        </p>
                    </div>

                    <p className="text-xs text-white/50">
                        {t('by_logging_in') || 'By logging in, you agree to our terms of service'}
                    </p>
                </div>
            </div>
        </div>
    );
};
