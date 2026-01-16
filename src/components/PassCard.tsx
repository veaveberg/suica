import React from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronRight, Sparkles } from 'lucide-react';
import type { Pass, Group } from '../types';
import { getPassDisplayName } from '../utils/passUtils';

interface PassCardProps {
    pass: Pass;
    groupsList: Group[];
    onClick: () => void;
    showChevron?: boolean;
    priceOverride?: number;
    hasDiscount?: boolean;
    totalLessons?: number;
    startDate?: string;
    endDate?: string;
}

export const PassCard: React.FC<PassCardProps> = ({
    pass,
    groupsList,
    onClick,
    showChevron = true,
    priceOverride,
    hasDiscount = false,
    totalLessons,
    startDate,
    endDate
}) => {
    const { t, i18n } = useTranslation();
    const displayPrice = priceOverride !== undefined ? priceOverride : pass.price;

    return (
        <button
            onClick={onClick}
            className="w-full bg-ios-card dark:bg-zinc-900 p-4 rounded-2xl flex items-center justify-between shadow-sm active:scale-[0.98] transition-transform text-left border border-gray-100 dark:border-zinc-800"
        >
            <div className="flex items-center gap-4 min-w-0">
                {/* Postage Stamp Icon */}
                <div
                    className="w-16 h-12 flex-shrink-0 flex items-center justify-center relative rounded-xl shadow-[0_4px_12px_rgba(0,0,0,0.4)] overflow-hidden"
                    style={{
                        background: groupsList.length === 0
                            ? '#8E8E93'
                            : groupsList.length === 1
                                ? groupsList[0].color
                                : `linear-gradient(to bottom, ${groupsList.map(g => g.color).join(', ')})`,
                        backgroundClip: 'padding-box'
                    }}
                >
                    {/* Seamless Inner Border */}
                    <div className="absolute inset-0 border-2 border-white/30 rounded-xl z-20 pointer-events-none" />

                    {/* Premium Overlays */}
                    <div className="absolute inset-0 bg-gradient-to-br from-white/30 to-transparent opacity-40 z-10" />
                    <div className="absolute inset-0 shadow-[inset_0_0_8px_rgba(0,0,0,0.3)] rounded-lg z-10" />

                    {/* Strong Stamp Texture */}
                    <div className="absolute inset-0 opacity-20 bg-[radial-gradient(circle_at_center,_white_1px,_transparent_1px)] bg-[length:5px_5px] z-10" />

                    <span className={`${totalLessons ? 'text-lg' : 'text-2xl'} font-black text-white drop-shadow-[0_0_8px_rgba(255,255,255,0.4)] z-30`}>
                        {totalLessons ? `${pass.lessons_count}/${totalLessons}` : pass.lessons_count}
                    </span>
                </div>
                <div className="min-w-0">
                    <h3 className="font-semibold text-lg dark:text-white truncate">
                        {getPassDisplayName({ ...pass, lessons_total: totalLessons }, t)}
                    </h3>
                    <div className="mt-1 flex items-center flex-wrap gap-2">
                        {hasDiscount && (
                            <div className="flex items-center gap-1 text-[8px] text-ios-green font-bold uppercase">
                                <Sparkles className="w-2.5 h-2.5" />
                                {t('price_with_discount')}
                            </div>
                        )}
                        <div className="flex items-center gap-2">
                            {hasDiscount && (
                                <span className="text-sm text-ios-gray line-through">{pass.price} ₾</span>
                            )}
                            <span className={`text-sm font-bold ${hasDiscount ? 'text-ios-green' : 'text-ios-gray'}`}>
                                {displayPrice} ₾
                            </span>
                        </div>
                        {groupsList.length > 0 && (
                            <div className="flex flex-wrap gap-1">
                                {groupsList.map(g => (
                                    <span
                                        key={g.id}
                                        className="text-[10px] font-bold px-1.5 py-0.5 rounded-md"
                                        style={{
                                            color: g.color,
                                            backgroundColor: `${g.color}15`
                                        }}
                                    >
                                        {g.name}
                                    </span>
                                ))}
                            </div>
                        )}
                        {(startDate || endDate) && (() => {
                            const formatDate = (dateStr: string) => {
                                const [y, m, d] = dateStr.split('-').map(Number);
                                const date = new Date(y, m - 1, d);
                                const lang = i18n.language.toUpperCase();
                                let options: Intl.DateTimeFormatOptions;

                                if (lang === 'KA') {
                                    options = { day: 'numeric', month: 'long' };
                                } else if (lang === 'RU') {
                                    options = { weekday: 'short', day: 'numeric', month: 'long' };
                                } else {
                                    options = { weekday: 'short', month: 'long', day: 'numeric' };
                                }

                                const locale = lang === 'KA' ? 'ka-GE' : lang === 'RU' ? 'ru' : 'en-US';
                                return date.toLocaleDateString(locale, options);
                            };

                            const startFormatted = startDate ? formatDate(startDate) : '';
                            const endFormatted = endDate ? formatDate(endDate) : '';

                            return (
                                <div className="w-full mt-1">
                                    <div className="text-sm text-ios-gray">
                                        {startDate && endDate
                                            ? `${startFormatted} – ${endFormatted}`
                                            : startDate
                                                ? t('from_only', { date: startFormatted })
                                                : endFormatted
                                        }
                                    </div>
                                </div>
                            );
                        })()}
                    </div>
                </div>
            </div>
            {showChevron && <ChevronRight className="w-5 h-5 text-ios-gray/30 flex-shrink-0" />}
        </button>
    );
};
