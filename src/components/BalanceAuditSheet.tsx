import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { X, CheckCircle2, XCircle, AlertTriangle, Calendar, CreditCard } from 'lucide-react';
import type { BalanceAuditResult, BalanceAuditEntry, PassUsage, AuditReason } from '../utils/balance';
import type { Group, Subscription, Pass, Lesson } from '../types';
import { PassCard } from './PassCard';
import { useData } from '../DataProvider';
import { LessonDetailSheet } from './LessonDetailSheet';
import { getPassDisplayName } from '../utils/passUtils';
import { cn } from '../utils/cn';
import { formatDate, formatTimeRange } from '../utils/formatting';

interface BalanceAuditSheetProps {
    isOpen: boolean;
    onClose: () => void;
    auditResult: BalanceAuditResult;
    group: Group;
    subscriptions: Subscription[];
}

export const BalanceAuditSheet: React.FC<BalanceAuditSheetProps> = ({
    isOpen,
    onClose,
    auditResult,
    group,
    subscriptions
}) => {
    const { t, i18n } = useTranslation();
    const { passes, lessons } = useData();
    const [selectedLesson, setSelectedLesson] = useState<Lesson | null>(null);

    if (!isOpen) return null;

    const getReasonLabel = (reason: AuditReason): string => {
        switch (reason) {
            case 'counted_present':
                return t('attendance_present') || 'Present';
            case 'counted_absence_invalid':
                return t('attendance_absence_invalid') || 'Invalid skip';
            case 'not_counted_valid_skip':
                return t('attendance_absence_valid') || 'Valid skip';
            case 'not_counted_cancelled':
                return t('cancelled') || 'Cancelled';
            case 'not_counted_no_attendance':
                return t('not_marked') || 'Not marked';
            case 'uncovered_pass_depleted':
                return t('reason_pass_depleted') || 'Pass depleted';
            case 'uncovered_no_matching_pass':
                return t('reason_no_matching_pass') || 'No pass';
            default:
                return reason;
        }
    };


    // Split into 3 categories now (Covered, Uncovered/Debt, Not Counted)
    const coveredEntries = auditResult.auditEntries.filter(e =>
        e.reason === 'counted_present' || e.reason === 'counted_absence_invalid'
    );
    const uncoveredEntries = auditResult.auditEntries.filter(e =>
        e.reason === 'uncovered_pass_depleted' || e.reason === 'uncovered_no_matching_pass'
    );
    const notCountedEntries = auditResult.auditEntries.filter(e =>
        e.reason === 'not_counted_valid_skip' ||
        e.reason === 'not_counted_cancelled' ||
        e.reason === 'not_counted_no_attendance'
    );

    // Calculate totals for the breakdown
    const totalPassCredit = auditResult.passUsage.reduce((sum, pu) => sum + pu.lessonsTotal, 0);

    // Helper to get subscription details for a pass usage entry
    const getSubscriptionForPass = (passId: string): Subscription | undefined => {
        return subscriptions.find(s => s.id === passId);
    };

    // Helper to get Pass template for a subscription
    const getPassTemplate = (sub: Subscription): Pass | undefined => {
        return passes.find(p => p.name === sub.type || p.id === sub.type);
    };

    // Lesson card component
    const LessonCard: React.FC<{ entry: BalanceAuditEntry; showPass?: boolean }> = ({ entry, showPass: _showPass = true }) => {
        const sub = entry.coveredByPassId ? getSubscriptionForPass(entry.coveredByPassId) : undefined;
        const lesson = lessons.find(l => String(l.id) === entry.lessonId);
        const isCounted = entry.status === 'counted';

        return (
            <button
                onClick={() => lesson && setSelectedLesson(lesson)}
                className={cn(
                    "w-full px-4 py-3 rounded-2xl ios-card dark:bg-zinc-900 border border-gray-100 dark:border-zinc-800",
                    "flex items-center justify-between active:scale-[0.98] transition-all text-left group"
                )}
            >
                <div className="flex flex-col min-w-0">
                    <div className="font-bold dark:text-white text-base leading-tight">
                        {formatDate(entry.lessonDate, i18n)}
                    </div>
                    <div className="text-xs text-ios-gray mt-0.5">
                        {lesson ? formatTimeRange(entry.lessonTime, lesson.duration_minutes) : entry.lessonTime}
                    </div>
                </div>

                <div className="flex items-center gap-4">
                    <div className="text-right">
                        {/* Primary line: Attendance Status */}
                        <div className={cn(
                            "text-sm font-bold",
                            entry.attendanceStatus === 'present' ? 'text-ios-green' :
                                entry.attendanceStatus === 'absence_invalid' ? 'text-ios-red' :
                                    entry.attendanceStatus === 'absence_valid' ? 'text-ios-blue' :
                                        entry.reason === 'counted_absence_invalid' ? 'text-ios-orange' : 'text-ios-gray'
                        )}>
                            {entry.attendanceStatus === 'present' ? t('attendance_present') :
                                entry.attendanceStatus === 'absence_invalid' ? t('attendance_absence_invalid') :
                                    entry.attendanceStatus === 'absence_valid' ? t('attendance_absence_valid') :
                                        entry.reason === 'counted_absence_invalid' ? t('attendance_absence_invalid') : getReasonLabel(entry.reason)}
                        </div>

                        {/* Secondary line: Context (Pass or Reason) */}
                        {sub ? (
                            <div className="text-[10px] text-ios-gray font-medium mt-0.5 opacity-80">
                                {getPassDisplayName(sub, t)}
                            </div>
                        ) : (entry.reason === 'uncovered_no_matching_pass' || entry.reason === 'uncovered_pass_depleted') ? (
                            <div className="text-[10px] text-ios-red font-medium mt-0.5 opacity-80">
                                {getReasonLabel(entry.reason)}
                            </div>
                        ) : entry.reason !== 'counted_present' && entry.reason !== 'counted_absence_invalid' && (
                            <div className="text-[10px] text-ios-gray font-medium mt-0.5 opacity-80">
                                {getReasonLabel(entry.reason)}
                            </div>
                        )}
                    </div>

                    {/* Balance Effect */}
                    <div className="flex items-center justify-center w-8 h-8 rounded-full bg-ios-background dark:bg-black border border-black/[0.03] dark:border-white/[0.03] shrink-0">
                        <span className={cn(
                            "text-sm font-black",
                            isCounted ? "dark:text-white text-black" : "text-ios-gray opacity-40"
                        )}>
                            {isCounted ? "-1" : "0"}
                        </span>
                    </div>
                </div>
            </button>
        );
    };

    return (
        <>
            <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center">
                <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

                <div className="relative w-full max-w-lg bg-ios-background dark:bg-black rounded-t-3xl sm:rounded-3xl flex flex-col max-h-[90vh] overflow-hidden shadow-2xl">
                    {/* Header */}
                    <div className="flex items-center justify-between p-4 border-b border-gray-100 dark:border-zinc-800 bg-ios-card/80 dark:bg-zinc-900/80 backdrop-blur-xl sticky top-0 z-10">
                        <button onClick={onClose} className="p-1 active:scale-90 transition-transform">
                            <X className="w-6 h-6 text-ios-gray" />
                        </button>
                        <div className="flex items-center gap-2">
                            <div
                                className="w-3 h-3 rounded-full shadow-[0_0_8px_rgba(0,0,0,0.2)]"
                                style={{ backgroundColor: group.color }}
                            />
                            <h2 className="text-lg font-bold dark:text-white">{group.name}</h2>
                        </div>
                        <div className={`font - bold text - lg ${auditResult.balance > 0 ? 'text-ios-green' : auditResult.balance < 0 ? 'text-ios-red' : 'text-ios-gray'} `}>
                            {auditResult.balance > 0 ? `+ ${auditResult.balance} ` : auditResult.balance}
                        </div>
                    </div>

                    {/* Content */}
                    <div className="flex-1 overflow-y-auto p-4 pb-12 space-y-6">
                        {/* Balance Breakdown */}
                        <div className="bg-ios-card dark:bg-zinc-900 rounded-2xl p-4 shadow-sm border border-black/[0.02] dark:border-white/[0.02]">
                            <div className="flex items-center justify-between text-sm">
                                <span className="text-ios-gray">{t('passes') || 'Passes'}</span>
                                <span className="font-medium text-ios-green">+{totalPassCredit}</span>
                            </div>
                            <div className="flex items-center justify-between text-sm mt-2">
                                <span className="text-ios-gray">{t('counted_lessons') || 'Sessions'}</span>
                                <span className="font-medium text-ios-red">−{auditResult.lessonsOwed}</span>
                            </div>
                            <div className="border-t border-gray-100 dark:border-zinc-700 mt-3 pt-3">
                                <div className="flex items-center justify-between">
                                    <span className="font-bold dark:text-white">{auditResult.balance >= 0 ? (t('surplus') || 'Remaining') : (t('debt') || 'Debt')}</span>
                                    <span className={`font - bold text - lg ${auditResult.balance > 0 ? 'text-ios-green' : auditResult.balance < 0 ? 'text-ios-red' : 'text-ios-gray'} `}>
                                        {auditResult.balance > 0 ? `+ ${auditResult.balance} ` : auditResult.balance}
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* Pass Usage Section - Using PassCard */}
                        {auditResult.passUsage.length > 0 && (
                            <section>
                                <h3 className="text-[10px] font-black text-ios-gray uppercase tracking-widest flex items-center gap-1 mb-3 px-1">
                                    <CreditCard className="w-3 h-3" />
                                    {t('passes') || 'Passes'}
                                </h3>
                                <div className="space-y-2">
                                    {auditResult.passUsage.map((pu: PassUsage) => {
                                        const sub = getSubscriptionForPass(pu.passId);
                                        const passTemplate = sub ? getPassTemplate(sub) : undefined;

                                        if (passTemplate) {
                                            return (
                                                <PassCard
                                                    key={pu.passId}
                                                    pass={{ ...passTemplate, lessons_count: pu.lessonsTotal - pu.lessonsUsed }}
                                                    groupsList={[group]}
                                                    showChevron={false}
                                                    totalLessons={pu.lessonsTotal}
                                                    startDate={pu.purchaseDate}
                                                    endDate={pu.expiryDate}
                                                />
                                            );
                                        }

                                        // Fallback if no pass template found
                                        return (
                                            <div key={pu.passId} className="bg-ios-card dark:bg-zinc-900 rounded-xl p-3 shadow-sm">
                                                <div className="flex items-center justify-between mb-2">
                                                    <span className="font-medium dark:text-white text-sm">
                                                        {sub ? getPassDisplayName(sub, t) : `Pass #${pu.passId} `}
                                                    </span>
                                                    <span className="text-xs text-ios-gray">
                                                        {pu.lessonsTotal - pu.lessonsUsed}/{pu.lessonsTotal} {t('lessons_remaining_count') || 'remaining'}
                                                    </span>
                                                </div>
                                                <div className="h-2 bg-gray-200 dark:bg-zinc-700 rounded-full overflow-hidden">
                                                    <div
                                                        className="h-full bg-ios-blue rounded-full"
                                                        style={{ width: `${((pu.lessonsTotal - pu.lessonsUsed) / pu.lessonsTotal) * 100}% ` }}
                                                    />
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </section>
                        )}

                        {/* Covered Lessons Section (green) */}
                        {coveredEntries.length > 0 && (
                            <section>
                                <h3 className="text-[10px] font-black text-ios-green uppercase tracking-widest flex items-center gap-1 mb-3 px-1">
                                    <CheckCircle2 className="w-3 h-3" />
                                    {t('covered_lessons') || 'Covered'} ({coveredEntries.length})
                                </h3>
                                <div className="space-y-2">
                                    {coveredEntries.map((entry: BalanceAuditEntry) => (
                                        <LessonCard key={entry.lessonId} entry={entry} />
                                    ))}
                                </div>
                            </section>
                        )}

                        {/* Uncovered Lessons Section (red - debt) */}
                        {uncoveredEntries.length > 0 && (
                            <section>
                                <h3 className="text-[10px] font-black text-ios-red uppercase tracking-widest flex items-center gap-1 mb-3 px-1">
                                    <AlertTriangle className="w-3 h-3" />
                                    {t('uncovered_lessons') || 'Uncovered'} ({uncoveredEntries.length})
                                </h3>
                                <div className="space-y-2">
                                    {uncoveredEntries.map((entry: BalanceAuditEntry) => (
                                        <LessonCard key={entry.lessonId} entry={entry} showPass={true} />
                                    ))}
                                </div>
                            </section>
                        )}

                        {/* Not Counted Lessons Section (gray/blue - skips) */}
                        {notCountedEntries.length > 0 && (
                            <section>
                                <h3 className="text-[10px] font-black text-ios-gray uppercase tracking-widest flex items-center gap-1 mb-3 px-1">
                                    <XCircle className="w-3 h-3" />
                                    {t('not_counted_lessons') || 'Not Counted'} ({notCountedEntries.length})
                                </h3>
                                <div className="space-y-2">
                                    {notCountedEntries.map((entry: BalanceAuditEntry) => (
                                        <LessonCard key={entry.lessonId} entry={entry} showPass={false} />
                                    ))}
                                </div>
                            </section>
                        )}

                        {/* Empty state */}
                        {auditResult.auditEntries.length === 0 && (
                            <div className="py-12 text-center">
                                <Calendar className="w-12 h-12 text-ios-gray/30 mx-auto mb-3" />
                                <p className="text-ios-gray text-sm">{t('no_lessons_covered') || 'No attendance records yet'}</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <LessonDetailSheet
                lesson={selectedLesson}
                onClose={() => setSelectedLesson(null)}
            />
        </>
    );
};
