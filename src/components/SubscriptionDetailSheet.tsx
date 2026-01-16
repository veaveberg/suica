import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Trash2, Clock, Calendar, ChevronsRight } from 'lucide-react';
import { useData } from '../DataProvider';
import type { Subscription } from '../types';
import * as api from '../api';

interface SubscriptionDetailSheetProps {
    isOpen: boolean;
    onClose: () => void;
    subscription: Subscription;
}

export const SubscriptionDetailSheet: React.FC<SubscriptionDetailSheetProps> = ({ isOpen, onClose, subscription }) => {
    const { t, i18n } = useTranslation();
    const { refreshSubscriptions } = useData();

    const [price, setPrice] = useState('');
    const [lessonsTotal, setLessonsTotal] = useState('');
    const [purchaseDate, setPurchaseDate] = useState('');
    const [durationDays, setDurationDays] = useState('');
    const [isConsecutive, setIsConsecutive] = useState(false);
    const [expiryDate, setExpiryDate] = useState<string | undefined>('');
    const [isDeleting, setIsDeleting] = useState(false);

    useEffect(() => {
        if (subscription && isOpen) {
            setPrice(String(subscription.price));
            setLessonsTotal(String(subscription.lessons_total));
            setPurchaseDate(subscription.purchase_date);
            setDurationDays(String(subscription.duration_days || ''));
            setIsConsecutive(subscription.is_consecutive || false);
            setExpiryDate(subscription.expiry_date);
            setIsDeleting(false);
        }
    }, [subscription, isOpen]);

    // Update expiry date whenever purchase date or duration changes
    useEffect(() => {
        if (!isConsecutive && purchaseDate && durationDays) {
            const expiry = new Date(purchaseDate);
            expiry.setDate(expiry.getDate() + Number(durationDays));
            setExpiryDate(expiry.toISOString().split('T')[0]);
        } else if (isConsecutive) {
            setExpiryDate(undefined);
        }
    }, [purchaseDate, durationDays, isConsecutive]);

    if (!isOpen) return null;

    const handleSave = async () => {
        const today = new Date().toISOString().split('T')[0];
        let newStatus = subscription.status;

        // Archive if expired, reactivate if valid date
        if (expiryDate && expiryDate < today) {
            newStatus = 'archived';
        } else if (!expiryDate || expiryDate >= today) {
            newStatus = 'active';
        }

        await api.update<Subscription>('subscriptions', subscription.id!, {
            price: Number(price),
            lessons_total: Number(lessonsTotal),
            purchase_date: purchaseDate,
            duration_days: !isConsecutive ? Number(durationDays) : undefined,
            is_consecutive: isConsecutive,
            expiry_date: expiryDate,
            status: newStatus
        });

        await refreshSubscriptions();
        onClose();
    };

    const handleDelete = async () => {
        if (!isDeleting) {
            setIsDeleting(true);
            return;
        }
        await api.remove('subscriptions', subscription.id!);
        await refreshSubscriptions();
        onClose();
    };

    return (
        <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center">
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

            <div className="relative w-full max-w-lg bg-ios-background dark:bg-black rounded-t-3xl sm:rounded-3xl flex flex-col max-h-[90vh] overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-gray-100 dark:border-zinc-800 bg-ios-card/80 dark:bg-zinc-900/80 backdrop-blur-xl sticky top-0 z-10">
                    <button onClick={onClose} className="text-ios-blue font-medium">{t('cancel')}</button>
                    <h2 className="text-lg font-bold dark:text-white">
                        {t('edit')} {subscription.type}
                    </h2>
                    <button
                        onClick={handleSave}
                        disabled={!price || !lessonsTotal || !purchaseDate}
                        className="text-ios-blue font-bold disabled:opacity-30"
                    >
                        {t('save')}
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-4 space-y-6">
                    <div className="bg-ios-card dark:bg-zinc-900 rounded-2xl overflow-hidden divide-y divide-gray-100 dark:divide-zinc-800">
                        {/* Price */}
                        <div className="flex items-center px-4 py-3 gap-3">
                            <div className="w-8 h-8 rounded-lg bg-ios-green/10 flex items-center justify-center font-bold text-ios-green">
                                ₾
                            </div>
                            <div className="flex-1">
                                <label className="text-[10px] font-black text-ios-gray uppercase tracking-widest block mb-0.5">{t('price')}</label>
                                <input
                                    type="number"
                                    value={price}
                                    onChange={(e) => setPrice(e.target.value)}
                                    className="w-full bg-transparent border-none p-0 focus:ring-0 font-medium dark:text-white"
                                />
                            </div>
                        </div>

                        {/* Lessons Total */}
                        <div className="flex items-center px-4 py-3 gap-3">
                            <div className="w-8 h-8 rounded-lg bg-ios-blue/10 flex items-center justify-center font-bold text-ios-blue">
                                #
                            </div>
                            <div className="flex-1">
                                <label className="text-[10px] font-black text-ios-gray uppercase tracking-widest block mb-0.5">{t('lessons_included')}</label>
                                <input
                                    type="number"
                                    value={lessonsTotal}
                                    onChange={(e) => setLessonsTotal(e.target.value)}
                                    className="w-full bg-transparent border-none p-0 focus:ring-0 font-medium dark:text-white"
                                />
                            </div>
                        </div>

                        {/* Purchase Date */}
                        <div className="flex items-center px-4 py-3 gap-3">
                            <div className="w-8 h-8 rounded-lg bg-ios-blue/10 flex items-center justify-center">
                                <Calendar className="w-5 h-5 text-ios-blue" />
                            </div>
                            <div className="flex-1">
                                <label className="text-[10px] font-black text-ios-gray uppercase tracking-widest block mb-0.5">{t('start_date')}</label>
                                <input
                                    type="date"
                                    value={purchaseDate}
                                    onChange={(e) => setPurchaseDate(e.target.value)}
                                    className="w-full bg-transparent border-none p-0 focus:ring-0 text-sm font-medium dark:text-white"
                                />
                            </div>
                        </div>

                        {/* Consecutive Toggle */}
                        <button
                            onClick={() => setIsConsecutive(!isConsecutive)}
                            className="w-full flex items-center justify-between px-4 py-3 text-left"
                        >
                            <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-lg bg-ios-orange/10 flex items-center justify-center">
                                    <ChevronsRight className="w-5 h-5 text-ios-orange" />
                                </div>
                                <span className="font-medium dark:text-white">{t('consecutive')}</span>
                            </div>
                            <div className={`w-12 h-7 rounded-full p-1 transition-colors ${isConsecutive ? "bg-ios-green" : "bg-gray-300 dark:bg-zinc-700"}`}>
                                <div className={`w-5 h-5 bg-white rounded-full shadow transition-transform ${isConsecutive ? "translate-x-5" : "translate-x-0"}`} />
                            </div>
                        </button>

                        {/* Duration Days */}
                        {!isConsecutive && (
                            <div className="flex items-center px-4 py-3 gap-3 animate-in fade-in slide-in-from-top-2">
                                <div className="w-8 h-8 rounded-lg bg-ios-blue/10 flex items-center justify-center">
                                    <Clock className="w-5 h-5 text-ios-blue" />
                                </div>
                                <div className="flex-1">
                                    <label className="text-[10px] font-black text-ios-gray uppercase tracking-widest block mb-0.5">{t('duration_days') || 'Duration (days)'}</label>
                                    <input
                                        type="number"
                                        value={durationDays}
                                        onChange={(e) => setDurationDays(e.target.value)}
                                        placeholder="30"
                                        className="w-full bg-transparent border-none p-0 focus:ring-0 text-sm font-medium dark:text-white"
                                    />
                                </div>
                            </div>
                        )}
                        {/* End Date Preview */}
                        {!isConsecutive && expiryDate && (
                            <div className="flex items-center px-4 py-3 gap-3 bg-ios-background/30 dark:bg-zinc-800/30">
                                <div className="w-8 h-8 rounded-lg bg-ios-blue/10 flex items-center justify-center">
                                    <Calendar className="w-5 h-5 text-ios-blue" />
                                </div>
                                <div className="flex-1 text-left">
                                    <label className="text-[10px] font-black text-ios-gray uppercase tracking-widest block mb-0.5">{t('end_date') || 'End Date'}</label>
                                    <div className="text-sm font-medium dark:text-white">
                                        {(() => {
                                            const [y, m, d] = expiryDate.split('-').map(Number);
                                            const date = new Date(y, m - 1, d);
                                            const lang = i18n.language.toUpperCase();
                                            const options: Intl.DateTimeFormatOptions = { weekday: 'short', month: 'long', day: 'numeric', year: 'numeric' };
                                            const locale = lang === 'KA' ? 'ka-GE' : lang === 'RU' ? 'ru' : 'en-US';
                                            return date.toLocaleDateString(locale, options);
                                        })()}
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Delete Section */}
                    <button
                        onClick={handleDelete}
                        className={`w-full flex items-center justify-center gap-2 p-4 rounded-2xl font-bold transition-all ${isDeleting
                            ? "bg-ios-red text-white scale-[0.98]"
                            : "bg-ios-red/10 text-ios-red"
                            }`}
                    >
                        <Trash2 className="w-5 h-5" />
                        <span>{isDeleting ? t('confirm_delete') : t('delete')}</span>
                    </button>
                </div>
            </div>
        </div>
    );
};
