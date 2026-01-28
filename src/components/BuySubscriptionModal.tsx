import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Calendar } from 'lucide-react';
import { useData } from '../DataProvider';
import type { Subscription, Student, Pass } from '../types';
import { PassCard } from './PassCard';
import { getPassDisplayName } from '../utils/passUtils';

interface BuySubscriptionModalProps {
    isOpen: boolean;
    student: Student;
    activeSubscriptions: Subscription[];
    onClose: () => void;
    onBuy: (subscription: Omit<Subscription, 'id'>) => void;
}

export const BuySubscriptionModal: React.FC<BuySubscriptionModalProps> = ({
    isOpen,
    student,
    activeSubscriptions,
    onClose,
    onBuy
}) => {
    const { t } = useTranslation();
    const [selectedGroupId, setSelectedGroupId] = useState<string>('');

    const [purchaseDate, setPurchaseDate] = useState(new Date().toISOString().split('T')[0]);

    // Fetch groups, passes and passGroups from context
    const { groups: allGroups, passes, passGroups } = useData();
    const groups = allGroups.filter(g => g.status === 'active');

    // Set default group when groups load
    useEffect(() => {
        if (groups.length > 0 && !selectedGroupId) {
            setSelectedGroupId(groups[0].id?.toString() || '');
        }
    }, [groups, selectedGroupId]);

    if (!isOpen) return null;


    // Filter passes that are linked to the selected group via pass_groups
    const filteredPasses = passes.filter(pass => {
        const associatedGroupIds = passGroups
            .filter(pg => String(pg.pass_id) === String(pass.id))
            .map(pg => String(pg.group_id));

        return associatedGroupIds.includes(String(selectedGroupId));
    });


    // Check if student already has an active subscription for the first group (to apply discount)
    const hasActiveSubForMainGroup = groups.length > 0 && activeSubscriptions.some(
        s => s.group_id === groups[0].id?.toString() && s.lessons_total > 0
    );

    const getPrice = (pass: Pass) => {
        // Apply discount if student has active subscription for the main group
        if (hasActiveSubForMainGroup && selectedGroupId !== groups[0]?.id?.toString()) {
            return Math.round(pass.price * 0.85); // 15% discount
        }
        return pass.price;
    };

    const handleBuy = (pass: Pass) => {
        const price = getPrice(pass);
        let expiryDate: string | undefined = undefined;

        if (!(pass.is_consecutive || false) && pass.duration_days) {
            const expiry = new Date(purchaseDate);
            expiry.setDate(expiry.getDate() + pass.duration_days);
            expiryDate = expiry.toISOString().split('T')[0];
        }

        onBuy({
            user_id: student.id!,
            group_id: selectedGroupId,
            tariff_id: String(pass.id),
            type: getPassDisplayName(pass, t),
            lessons_total: pass.lessons_count,
            price: price,
            purchase_date: purchaseDate,
            expiry_date: expiryDate,
            is_consecutive: pass.is_consecutive || false,
            duration_days: pass.duration_days,
            status: 'active'
        });
        onClose();
    };

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
            <div className="w-full max-w-sm bg-ios-card rounded-[32px] p-6 shadow-2xl animate-in zoom-in-95 duration-200 dark:bg-zinc-900 border border-transparent dark:border-zinc-800 flex flex-col max-h-[90vh]">
                <div className="flex justify-between items-center mb-6 shrink-0">
                    <div>
                        <h2 className="text-xl font-bold dark:text-white">{t('buy_subscription')}</h2>
                        <p className="text-sm text-ios-gray">{student.name}</p>
                    </div>
                    <button onClick={onClose} className="p-2 rounded-full bg-ios-background dark:bg-zinc-800">
                        <X className="w-5 h-5 text-ios-gray" />
                    </button>
                </div>

                {/* Start Date Selector */}
                <div className="mb-4">
                    <label className="text-[10px] font-black text-ios-gray uppercase tracking-widest px-1 mb-1 block">
                        {t('start_date') || 'Start Date'}
                    </label>
                    <div className="relative">
                        <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ios-gray pointer-events-none" />
                        <input
                            type="date"
                            value={purchaseDate}
                            onChange={(e) => setPurchaseDate(e.target.value)}
                            className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-ios-background dark:bg-zinc-800 dark:text-white text-sm focus:ring-2 focus:ring-ios-blue outline-none"
                        />
                    </div>
                </div>

                {/* Group Selector */}
                <div className="flex p-1 bg-ios-background dark:bg-zinc-800 rounded-2xl mb-6 shrink-0 overflow-x-auto">
                    {groups.map(group => (
                        <button
                            key={group.id}
                            onClick={() => setSelectedGroupId(group.id?.toString() || '')}
                            className={`flex-1 min-w-[80px] py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${selectedGroupId === group.id?.toString()
                                ? 'bg-white shadow-sm dark:bg-zinc-700 dark:text-white'
                                : 'text-ios-gray'
                                }`}
                        >
                            <div
                                className="w-2 h-2 rounded-full flex-shrink-0"
                                style={{ backgroundColor: group.color }}
                            />
                            <span className="truncate">{group.name}</span>
                        </button>
                    ))}
                </div>

                {/* Passes List */}
                <div className="space-y-3 overflow-y-auto pr-1">
                    {filteredPasses.map((pass) => (
                        <PassCard
                            key={pass.id}
                            pass={pass}
                            groupsList={[]} // Passing empty groups list because we are in a group-filtered context
                            onClick={() => handleBuy(pass)}
                            showChevron={false}
                            priceOverride={getPrice(pass)}
                            hasDiscount={getPrice(pass) < pass.price}
                        />
                    ))}

                    {filteredPasses.length === 0 && (
                        <div className="text-center py-8 text-ios-gray text-sm italic">
                            {t('no_passes_found') || 'No passes available for this group'}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
