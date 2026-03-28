import React from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, ChevronRight } from 'lucide-react';
import type { Pass, Group } from '../types';
import { getPassDisplayName } from '../utils/passUtils';
import { cn } from '../utils/cn';
import { formatDate, formatDateRange } from '../utils/formatting';

function parseDateString(dateStr: string): Date {
    const [year, month, day] = dateStr.split('-').map(Number);
    return new Date(year, month - 1, day);
}

function getInclusiveDayDiff(startDateStr: string, endDateStr: string): number {
    const start = parseDateString(startDateStr);
    const end = parseDateString(endDateStr);
    const diffMs = end.getTime() - start.getTime();
    return Math.max(Math.floor(diffMs / 86400000) + 1, 0);
}

function getTodayLocalDate(): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function withNonBreakingSpaces(value: string): string {
    return value.replace(/ /g, '\u00A0');
}

function keepRangeBoundaryTight(value: string): string {
    const parts = value.split(' – ');
    if (parts.length !== 2) return withNonBreakingSpaces(value);

    const [start, end] = parts;
    return `${withNonBreakingSpaces(start)}\u00A0– ${withNonBreakingSpaces(end)}`;
}

function getDaysLeftLabel(remainingDays: number, totalDays: number, lang: string, t: (key: string, options?: any) => string): string {
    const upperLang = lang.toUpperCase();

    if (upperLang === 'RU') {
        return `Осталось ${remainingDays}\u00A0${t('days', { count: remainingDays })}\u00A0из\u00A0${totalDays}`;
    }

    if (upperLang === 'KA') {
        return `დარჩა ${remainingDays}\u00A0${t('days', { count: remainingDays })} ${totalDays}-დან`;
    }

    return `${remainingDays}\u00A0${t('days', { count: remainingDays })} left out of ${totalDays}`;
}

interface PassCardProps {
    pass: Pass;
    groupsList: Group[];
    onClick?: () => void;
    showChevron?: boolean;
    flat?: boolean;
    totalLessons?: number;
    startDate?: string;
    endDate?: string;
    endDateText?: string;
    endDatePending?: boolean;
    warningLabel?: string;
}

export const PassCard: React.FC<PassCardProps> = ({
    pass,
    groupsList,
    onClick,
    showChevron = true,
    flat = false,
    totalLessons,
    startDate,
    endDate,
    endDateText,
    endDatePending,
    warningLabel
}) => {
    const { t, i18n } = useTranslation();

    const isInteractive = !!onClick;
    const CardComponent = isInteractive ? 'button' : 'div';
    const isUsageCard = typeof totalLessons === 'number' && totalLessons > 0;
    const usedLessons = totalLessons ? Math.max(totalLessons - pass.lessons_count, 0) : 0;
    const usageAccentColor = groupsList.length > 0 ? groupsList[0].color : '#34C759';
    const nextUnusedSegmentStart = totalLessons && pass.lessons_count > 0
        ? Math.min(Math.max((usedLessons / totalLessons) * 100, 0), 100)
        : null;
    const usageMetaParts = [
        pass.name?.trim() ? pass.name.trim() : undefined,
        startDate && endDate
            ? keepRangeBoundaryTight(formatDateRange(startDate, endDate, i18n))
            : startDate
                ? withNonBreakingSpaces(formatDate(startDate, i18n, { includeWeekday: false }))
                : endDateText,
    ].filter(Boolean);
    const canShowDayBar = !pass.is_consecutive && !!pass.duration_days;
    const totalDays = canShowDayBar ? pass.duration_days! : 0;
    const today = getTodayLocalDate();
    const remainingDays = canShowDayBar
        ? (startDate && endDate
            ? (today <= endDate
                ? getInclusiveDayDiff(today > startDate ? today : startDate, endDate)
                : 0)
            : totalDays)
        : 0;
    const remainingDaysPercent = canShowDayBar && totalDays > 0
        ? Math.min(Math.max((remainingDays / totalDays) * 100, 0), 100)
        : 0;
    const ringRadius = 7;
    const ringCircumference = 2 * Math.PI * ringRadius;
    const ringOffset = ringCircumference * (1 - remainingDaysPercent / 100);
    const daysLeftLabel = canShowDayBar
        ? getDaysLeftLabel(remainingDays, totalDays, i18n.language, t)
        : '';

    return (
        <CardComponent
            onClick={onClick}
            className={cn(
                "w-full bg-ios-card dark:bg-zinc-900 px-4 py-2.5 transition-transform text-left",
                flat
                    ? "rounded-none shadow-none border-0"
                    : "rounded-2xl shadow-sm border border-gray-100 dark:border-zinc-800",
                isInteractive ? "active:scale-[0.98] cursor-pointer" : "cursor-text scale-100 select-text"
            )}
        >
            {isUsageCard ? (
                <>
                    <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                            <div className="min-w-0">
                                {endDateText && !endDate && (
                                    <div className={cn("text-sm mb-0.5", endDatePending ? "text-ios-red" : "text-ios-gray")}>
                                        {endDateText}
                                    </div>
                                )}
                                <div className="flex items-start justify-between gap-2">
                                    <div className="min-w-0 flex-1 text-sm text-black dark:text-white leading-snug whitespace-normal break-words">
                                        {usageMetaParts.map((part, index) => (
                                            <span key={`${part}-${index}`}>
                                                {part}
                                                {index < usageMetaParts.length - 1 ? ', ' : ''}
                                            </span>
                                        ))}
                                        {usageMetaParts.length > 0 && <span>, </span>}
                                        <span className={warningLabel ? 'text-yellow-600 dark:text-yellow-300' : ''}>
                                            {withNonBreakingSpaces(`${pass.price} ₾`)}
                                            {warningLabel ? ' ⚠️' : ''}
                                        </span>
                                    </div>
                                    {canShowDayBar && (
                                        <div className="min-w-0 max-w-[45%] flex items-center justify-end gap-1 self-start">
                                            <div className="min-w-0 text-[10px] font-medium text-ios-gray text-right leading-tight whitespace-normal break-words">
                                                {daysLeftLabel}
                                            </div>
                                            <div className="relative top-px h-4 w-4 flex-shrink-0">
                                                <svg className="h-4 w-4 -rotate-90" viewBox="0 0 20 20" aria-hidden="true">
                                                    <circle
                                                        cx="10"
                                                        cy="10"
                                                        r={ringRadius}
                                                        fill="none"
                                                        stroke="currentColor"
                                                        strokeWidth="2"
                                                        className="text-gray-300 dark:text-zinc-700"
                                                    />
                                                    <circle
                                                        cx="10"
                                                        cy="10"
                                                        r={ringRadius}
                                                        fill="none"
                                                        stroke={usageAccentColor}
                                                        strokeWidth="2"
                                                        strokeLinecap="round"
                                                        strokeDasharray={ringCircumference}
                                                        strokeDashoffset={ringOffset}
                                                    />
                                                </svg>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="mt-2">
                                <div className="flex gap-1.5">
                                    {Array.from({ length: totalLessons }, (_, index) => (
                                        <div
                                            key={index}
                                            className={cn(
                                                "h-1.5 flex-1 rounded-full transition-colors",
                                                index < usedLessons
                                                    ? "bg-gray-300 dark:bg-zinc-700"
                                                    : ""
                                            )}
                                            style={index < usedLessons ? undefined : { backgroundColor: usageAccentColor }}
                                        />
                                    ))}
                                </div>
                                <div className="relative h-4 mt-0.5">
                                    <span className="absolute left-0 text-[11px] font-semibold text-ios-gray">
                                        {totalLessons}
                                    </span>
                                    {nextUnusedSegmentStart !== null && (
                                        <span
                                            className="absolute top-0 text-[11px] font-semibold text-black dark:text-white whitespace-nowrap"
                                            style={{ left: `${nextUnusedSegmentStart}%` }}
                                        >
                                            {pass.lessons_count}
                                        </span>
                                    )}
                                </div>
                            </div>
                        </div>
                        {showChevron && <ChevronRight className="w-5 h-5 text-ios-gray/30 flex-shrink-0 mt-0.5" />}
                    </div>
                </>
            ) : (
                <>
                    <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-4 min-w-0">
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
                                <div className="absolute inset-0 border-2 border-white/30 rounded-xl z-20 pointer-events-none" />
                                <div className="absolute inset-0 bg-gradient-to-br from-white/30 to-transparent opacity-40 z-10" />
                                <div className="absolute inset-0 shadow-[inset_0_0_8px_rgba(0,0,0,0.3)] rounded-lg z-10" />
                                <div className="absolute inset-0 opacity-20 bg-[radial-gradient(circle_at_center,_white_1px,_transparent_1px)] bg-[length:5px_5px] z-10" />
                                <span className="text-2xl font-black text-white drop-shadow-[0_0_8px_rgba(255,255,255,0.4)] z-30">
                                    {pass.lessons_count}
                                </span>
                            </div>
                            <div className="min-w-0">
                                <h3 className="font-semibold text-lg dark:text-white truncate">
                                    {getPassDisplayName({ ...pass, lessons_total: totalLessons }, t)}
                                </h3>
                                <div className="mt-1 flex items-center flex-wrap gap-2">
                                    <div className="flex items-center gap-2">
                                        <span className="text-sm font-bold text-ios-gray">{pass.price} ₾</span>
                                    </div>
                                    {warningLabel && (
                                        <div className="inline-flex items-center gap-1 rounded-md bg-yellow-400/15 px-2 py-1 text-[10px] font-bold uppercase text-yellow-700 dark:text-yellow-300">
                                            <AlertTriangle className="h-3 w-3" />
                                            <span>{warningLabel}</span>
                                        </div>
                                    )}
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
                                </div>
                            </div>
                        </div>
                        {showChevron && <ChevronRight className="w-5 h-5 text-ios-gray/30 flex-shrink-0 mt-1" />}
                    </div>
                </>
            )}
        </CardComponent>
    );
};
