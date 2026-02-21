import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { X, Instagram } from 'lucide-react';
import { TelegramIcon } from './Icons';
import { getAuthToken } from '../auth-store';

interface ProfileDetailSheetProps {
    isOpen: boolean;
    onClose: () => void;
    user: any; // We'll type this loosely or import User type if available
}

export const ProfileDetailSheet: React.FC<ProfileDetailSheetProps> = ({
    isOpen,
    onClose,
    user
}) => {
    const { t } = useTranslation();
    const updateProfile = useMutation(api.users.updateProfile);

    const [name, setName] = useState('');
    const [tgUsername, setTgUsername] = useState('');
    const [igUsername, setIgUsername] = useState('');

    useEffect(() => {
        if (user && isOpen) {
            setName(user.name || '');
            setTgUsername(user.username || '');
            setIgUsername(user.instagram_username || '');
        }
    }, [user, isOpen]);

    if (!user) return null;

    const handleSave = async () => {
        const authToken = getAuthToken();
        if (!authToken) return;
        await updateProfile({
            userId: user._id,
            authToken,
            updates: {
                name: name.trim() || undefined,
                username: tgUsername.replace(/@/g, '').trim() || undefined,
                instagram_username: igUsername.replace(/@/g, '').trim() || undefined,
            }
        });
        onClose();
    };

    return (
        <div className={`fixed inset-0 z-[60] flex items-end sm:items-center justify-center transition-opacity duration-300 ${isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

            <div className={`relative w-full max-w-lg bg-ios-card dark:bg-zinc-900 rounded-t-3xl sm:rounded-3xl shadow-2xl p-6 pb-12 space-y-6 transition-transform duration-300 transform ${isOpen ? 'translate-y-0' : 'translate-y-full'}`}>
                {/* Header */}
                <div className="flex items-center justify-between">
                    <button onClick={onClose} className="p-1">
                        <X className="w-6 h-6 text-ios-gray" />
                    </button>
                    <h2 className="text-xl font-bold dark:text-white">{t('edit_profile')}</h2>
                    <button
                        onClick={handleSave}
                        className="text-ios-blue font-semibold"
                    >
                        {t('save')}
                    </button>
                </div>

                <div className="space-y-4">
                    {/* Name */}
                    <div>
                        <label className="text-[10px] font-black text-ios-gray uppercase tracking-widest px-1">{t('student_name') || 'Name'}</label>
                        <input
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            className="w-full mt-1 px-3 py-2 rounded-xl bg-ios-background dark:bg-zinc-800 dark:text-white text-sm"
                            placeholder={t('your_name') || 'Your Name'}
                        />
                    </div>

                    {/* Telegram */}
                    <div>
                        <label className="text-[10px] font-black text-ios-gray uppercase tracking-widest px-1">{t('tg_username')}</label>
                        <div className="relative mt-1">
                            <TelegramIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ios-gray" />
                            <input
                                type="text"
                                value={tgUsername}
                                onChange={(e) => setTgUsername(e.target.value)}
                                className="w-full pl-9 px-3 py-2 rounded-xl bg-ios-background dark:bg-zinc-800 dark:text-white text-sm"
                                placeholder="username"
                            />
                        </div>
                    </div>

                    {/* Instagram */}
                    <div>
                        <label className="text-[10px] font-black text-ios-gray uppercase tracking-widest px-1">{t('ig_username')}</label>
                        <div className="relative mt-1">
                            <Instagram className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ios-gray" />
                            <input
                                type="text"
                                value={igUsername}
                                onChange={(e) => setIgUsername(e.target.value)}
                                className="w-full pl-9 px-3 py-2 rounded-xl bg-ios-background dark:bg-zinc-800 dark:text-white text-sm"
                                placeholder="username"
                            />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
