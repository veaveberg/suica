import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Plus, AlertCircle, Instagram, ChevronDown, ChevronUp, Trash2, Archive, RotateCcw, CheckCircle2, XCircle, Calendar } from 'lucide-react';
import type { Subscription, Student, Lesson } from '../types';
import { SubscriptionDetailSheet } from './SubscriptionDetailSheet';
import { LessonDetailSheet } from './LessonDetailSheet';
import { PassCard } from './PassCard';
import { useData } from '../DataProvider';
import { addStudentToGroup, archiveStudent, restoreStudent } from '../db-server';
import * as api from '../api';
import { calculateStudentGroupBalance, calculateStudentGroupBalanceWithAudit } from '../utils/balance';
import type { BalanceAuditEntry, AuditReason } from '../utils/balance';
import { getConsecutiveSubscriptionExpiration } from '../utils/subscriptionDates';
import { TelegramIcon } from './Icons';
import { cn } from '../utils/cn';
import { formatDate, formatTimeRange } from '../utils/formatting';
import { getPassDisplayName } from '../utils/passUtils';

function getTodayLocalDate(): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

interface StudentCardProps {
    isOpen: boolean;
    student: Student | null;
    subscriptions: Subscription[];
    onClose: () => void;
    onBuySubscription: (sub: Omit<Subscription, 'id'>) => Promise<Subscription>;
    readOnly?: boolean;
}

export const StudentCard: React.FC<StudentCardProps> = ({
    isOpen,
    student,
    onClose,
    onBuySubscription,
    readOnly = false
}) => {
    const { t, i18n } = useTranslation();

    const [addingToGroup, setAddingToGroup] = useState(false);
    const [selectedGroupId, setSelectedGroupId] = useState('');

    // Edit state for all fields
    const [editName, setEditName] = useState('');
    const [editTelegram, setEditTelegram] = useState('');
    const [editInstagram, setEditInstagram] = useState('');
    const [editNotes, setEditNotes] = useState('');
    const [editingSub, setEditingSub] = useState<Subscription | null>(null);
    const [isPassPickerOpen, setIsPassPickerOpen] = useState(false);
    const [selectedLesson, setSelectedLesson] = useState<Lesson | null>(null);
    const [isArchiveOpen, setIsArchiveOpen] = useState(false);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [selectedFinanceGroupId, setSelectedFinanceGroupId] = useState<string | null>(null);
    const lastInitializedId = React.useRef<string | null>(null);

    const { groups: allGroupsRaw, studentGroups, refreshStudentGroups, refreshStudents, subscriptions: allSubscriptions, lessons, passes, passGroups, attendance } = useData();
    const activeGroups = allGroupsRaw.filter(g => g.status === 'active');

    // Reset edit state when student changes or sheet opens
    useEffect(() => {
        if (student && isOpen) {
            // Only initialize if it's a DIFFERENT student or if we haven't initialized yet
            if (lastInitializedId.current !== student.id) {
                setEditName(student.name || '');
                setEditTelegram(student.telegram_username || '');
                setEditInstagram(student.instagram_username || '');
                setEditNotes(student.notes || '');
                setEditingSub(null);
                setIsPassPickerOpen(false);
                setShowDeleteConfirm(false);
                setAddingToGroup(false);
                setSelectedFinanceGroupId(null);
                lastInitializedId.current = student.id || null;
            }
        } else if (!isOpen) {
            lastInitializedId.current = null;
            setIsPassPickerOpen(false);
            setShowDeleteConfirm(false);
            setAddingToGroup(false);
            setSelectedFinanceGroupId(null);
        }
    }, [student, isOpen]);

    const memberAssignments = studentGroups.filter(sg => String(sg.student_id) === String(student?.id));
    const memberGroupIds = memberAssignments.map(a => String(a.group_id));

    const handleAddToGroup = async () => {
        if (selectedGroupId && student?.id) {
            await addStudentToGroup(student.id, selectedGroupId);
            await refreshStudentGroups();
            setAddingToGroup(false);
            setSelectedGroupId('');
        }
    };

    const handleSave = async () => {
        if (!student?.id) return;

        if (!editName.trim()) {
            await handleCancel(); // If name is cleared, treat as cancel/delete if it was empty
            return;
        }

        await api.update<Student>('students', student.id, {
            name: editName.trim(),
            telegram_username: editTelegram.replace(/@/g, '').trim(),
            instagram_username: editInstagram.replace(/@/g, '').trim(),
            notes: editNotes.trim()
        });

        await refreshStudents();
        onClose();
    };

    const handleCancel = async () => {
        // Cleanup: If EVERYTHING is empty, delete this record.
        // This covers new "ghost" students created on 'Add'.
        const isEmpty = !editName.trim() &&
            !editTelegram.trim() &&
            !editInstagram.trim() &&
            !editNotes.trim();

        if (student?.id && isEmpty) {
            await api.remove('students', student.id);
            await refreshStudents();
        }
        setShowDeleteConfirm(false);
        onClose();
    };

    const handleDelete = async () => {
        if (!student?.id) return;
        try {
            await api.remove('students', student.id);
            await refreshStudents();
            onClose();
        } catch (error) {
            console.error('Failed to delete student:', error);
            alert('Failed to delete student');
        }
    };

    const handleArchive = async () => {
        if (!student?.id) return;
        try {
            await archiveStudent(student.id);
            await refreshStudents();
            onClose();
        } catch (error) {
            console.error('Failed to archive student:', error);
            alert('Failed to archive student');
        }
    };

    const handleRestore = async () => {
        if (!student?.id) return;
        try {
            await restoreStudent(student.id);
            await refreshStudents();
            onClose();
        } catch (error) {
            console.error('Failed to restore student:', error);
            alert('Failed to restore student');
        }
    };

    const handleBuySubscription = async (sub: Omit<Subscription, 'id'>): Promise<Subscription> => {
        const createdSub = await onBuySubscription(sub);
        return createdSub;
    };

    const handleStartSubscriptionDraft = (passId: string) => {
        if (!student?.id || !selectedFinanceGroup) return;

        const pass = passes.find(item => String(item.id) === String(passId));
        if (!pass) return;

        const purchaseDate = getTodayLocalDate();
        const expiryDate = !pass.is_consecutive && pass.duration_days
            ? (() => {
                const [year, month, day] = purchaseDate.split('-').map(Number);
                const date = new Date(year, month - 1, day);
                date.setDate(date.getDate() + Math.max(pass.duration_days - 1, 0));
                const nextYear = date.getFullYear();
                const nextMonth = String(date.getMonth() + 1).padStart(2, '0');
                const nextDay = String(date.getDate()).padStart(2, '0');
                return `${nextYear}-${nextMonth}-${nextDay}`;
            })()
            : undefined;

        setEditingSub({
            user_id: student.id,
            group_id: String(selectedFinanceGroup.id),
            tariff_id: String(pass.id),
            type: getPassDisplayName(pass, t),
            lessons_total: pass.lessons_count,
            price: pass.price,
            purchase_date: purchaseDate,
            expiry_date: expiryDate,
            is_paid: true,
            is_consecutive: pass.is_consecutive || false,
            duration_days: pass.duration_days,
            status: 'active'
        });
        setIsPassPickerOpen(false);
    };

    const today = getTodayLocalDate();
    const studentIdStr = String(student?.id ?? '');
    const isArchived = student?.status === 'archived';

    const studentSubs = allSubscriptions.filter(s => String(s.user_id) === studentIdStr);

    const transactionGroupIds = new Set<string>();
    allSubscriptions
        .filter(s => String(s.user_id) === String(student?.id))
        .forEach(s => transactionGroupIds.add(String(s.group_id)));
    attendance
        .filter(a => String(a.student_id) === String(student?.id))
        .forEach(a => {
            const lesson = lessons.find(l => String(l.id) === String(a.lesson_id));
            if (lesson) transactionGroupIds.add(String(lesson.group_id));
        });

    const financeTabGroups = allGroupsRaw.filter(group =>
        memberGroupIds.includes(String(group.id)) || transactionGroupIds.has(String(group.id))
    );

    useEffect(() => {
        if (financeTabGroups.length === 0) {
            if (selectedFinanceGroupId !== null) setSelectedFinanceGroupId(null);
            return;
        }

        const hasSelectedGroup = selectedFinanceGroupId &&
            financeTabGroups.some(group => String(group.id) === String(selectedFinanceGroupId));

        if (!hasSelectedGroup) {
            setSelectedFinanceGroupId(String(financeTabGroups[0].id));
        }
    }, [financeTabGroups, selectedFinanceGroupId]);

    const selectedFinanceGroup = financeTabGroups.find(group => String(group.id) === String(selectedFinanceGroupId)) || null;
    const selectedFinanceBalance = selectedFinanceGroup && student?.id
        ? calculateStudentGroupBalance(student.id, String(selectedFinanceGroup.id), allSubscriptions, attendance, lessons).balance
        : 0;
    const selectedFinanceAudit = selectedFinanceGroup && student?.id
        ? calculateStudentGroupBalanceWithAudit(student.id, String(selectedFinanceGroup.id), allSubscriptions, attendance, lessons)
        : null;
    const selectedGroupSubs = selectedFinanceGroup
        ? studentSubs.filter(sub => String(sub.group_id) === String(selectedFinanceGroup.id))
        : [];
    const selectedPassUsageById = new Map(
        (selectedFinanceAudit?.passUsage || []).map(item => [String(item.passId), item])
    );
    const selectedUsedSubs = selectedGroupSubs.filter(sub => {
        const usage = selectedPassUsageById.get(String(sub.id));
        const lessonsRemaining = usage
            ? Math.max(sub.lessons_total - usage.lessonsUsed, 0)
            : sub.lessons_total;
        const isArchived = sub.status === 'archived';
        const isExpired = !!(sub.expiry_date && sub.expiry_date < today);
        return isArchived || isExpired || lessonsRemaining === 0;
    }).sort((a, b) => b.purchase_date.localeCompare(a.purchase_date));
    const selectedActiveSubs = selectedGroupSubs.filter(sub => {
        const usage = selectedPassUsageById.get(String(sub.id));
        const lessonsRemaining = usage
            ? Math.max(sub.lessons_total - usage.lessonsUsed, 0)
            : sub.lessons_total;
        const isArchived = sub.status === 'archived';
        const isExpired = !!(sub.expiry_date && sub.expiry_date < today);
        return !isArchived && !isExpired && lessonsRemaining > 0;
    }).sort((a, b) => b.purchase_date.localeCompare(a.purchase_date));
    const selectedGroupPasses = selectedFinanceGroup
        ? passes.filter(pass =>
            passGroups.some(
                passGroup =>
                    String(passGroup.pass_id) === String(pass.id) &&
                    String(passGroup.group_id) === String(selectedFinanceGroup.id)
            )
        )
        : [];

    const getReasonLabel = (reason: AuditReason): string => {
        switch (reason) {
            case 'counted_present':
                return t('attendance_present') || 'Present';
            case 'counted_absence_invalid':
                return t('attendance_absence_invalid') || 'Invalid skip';
            case 'counted_no_attendance_consecutive':
                return t('reason_counted_no_attendance_consecutive') || 'Not marked (auto-counted)';
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

    const getSubscriptionCardDates = (sub: Subscription) => {
        if (!sub.is_consecutive) {
            return {
                startDate: sub.purchase_date,
                endDate: sub.expiry_date
            };
        }

        const { expirationDate, missingLessons } = getConsecutiveSubscriptionExpiration(sub, lessons, attendance);

        return {
            startDate: sub.purchase_date,
            endDate: expirationDate,
            endDateText: !expirationDate && missingLessons > 0
                ? t('lessons_not_assigned', { count: missingLessons })
                : undefined,
            endDatePending: !expirationDate
        };
    };

    const coveredEntries = selectedFinanceAudit
        ? selectedFinanceAudit.auditEntries.filter(entry =>
            entry.reason === 'counted_present' ||
            entry.reason === 'counted_absence_invalid' ||
            entry.reason === 'counted_no_attendance_consecutive'
        )
        : [];
    const uncoveredEntries = selectedFinanceAudit
        ? selectedFinanceAudit.auditEntries.filter(entry =>
            entry.reason === 'uncovered_pass_depleted' || entry.reason === 'uncovered_no_matching_pass'
        )
        : [];
    const notCountedEntries = selectedFinanceAudit
        ? selectedFinanceAudit.auditEntries.filter(entry =>
            entry.reason === 'not_counted_valid_skip' ||
            entry.reason === 'not_counted_cancelled' ||
            entry.reason === 'not_counted_no_attendance'
        )
        : [];
    const totalPassCredit = selectedFinanceAudit
        ? selectedFinanceAudit.passUsage.reduce((sum, passUsage) => sum + passUsage.lessonsTotal, 0)
        : 0;

    const LessonCard: React.FC<{ entry: BalanceAuditEntry }> = ({ entry }) => {
        const sub = entry.coveredByPassId
            ? allSubscriptions.find(subscription => subscription.id === entry.coveredByPassId)
            : undefined;
        const lesson = lessons.find(item => String(item.id) === entry.lessonId);
        const isCounted = entry.status === 'counted';

        return (
            <button
                onClick={() => lesson && setSelectedLesson(lesson)}
                className={cn(
                    "w-full px-4 py-3 rounded-2xl bg-ios-card dark:bg-zinc-900 border border-gray-100 dark:border-zinc-800",
                    "flex items-center justify-between active:scale-[0.98] transition-all text-left"
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
                        <div className={cn(
                            "text-sm font-bold",
                            entry.attendanceStatus === 'present' ? 'text-ios-green' :
                                entry.attendanceStatus === 'absence_invalid' ? 'text-ios-red' :
                                    entry.attendanceStatus === 'absence_valid' ? 'text-ios-blue' :
                                        entry.reason === 'counted_absence_invalid' || entry.reason === 'counted_no_attendance_consecutive'
                                            ? 'text-ios-orange'
                                            : 'text-ios-gray'
                        )}>
                            {entry.attendanceStatus === 'present' ? t('attendance_present') :
                                entry.attendanceStatus === 'absence_invalid' ? t('attendance_absence_invalid') :
                                    entry.attendanceStatus === 'absence_valid' ? t('attendance_absence_valid') :
                                        entry.reason === 'counted_absence_invalid'
                                            ? t('attendance_absence_invalid')
                                            : getReasonLabel(entry.reason)}
                        </div>

                        {sub ? (
                            <div className="text-[10px] text-ios-gray font-medium mt-0.5 opacity-80">
                                {getPassDisplayName(sub, t)}
                            </div>
                        ) : (
                            <div className="text-[10px] text-ios-gray font-medium mt-0.5 opacity-80">
                                {getReasonLabel(entry.reason)}
                            </div>
                        )}
                    </div>

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

    // handleDeleteSub and handleArchiveSub removed as they are now handled by SubscriptionDetailSheet

    if (!student) return null;

    return (
        <>
            <div className={`fixed inset-0 z-[90] flex items-end sm:items-center justify-center transition-opacity duration-300 ${isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
                <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={handleCancel} />

                <div className={`relative w-full max-lg max-w-lg max-h-[90vh] bg-ios-card dark:bg-zinc-900 rounded-t-3xl sm:rounded-3xl shadow-2xl transition-transform duration-300 transform flex flex-col overflow-hidden overscroll-y-contain ${isOpen ? 'translate-y-0' : 'translate-y-full'}`}>
                    {/* Header */}
                    <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-zinc-800">
                        <button onClick={handleCancel} className="p-1">
                            <X className="w-6 h-6 text-ios-gray" />
                        </button>
                        <h2 className="font-bold text-lg dark:text-white truncate max-w-[200px]">
                            {isArchived ? t('archived_student') || 'Archived' : (student.name || t('add_student'))}
                        </h2>
                        {!readOnly && (
                            <button
                                onClick={handleSave}
                                disabled={!editName.trim()}
                                className="text-ios-blue font-semibold disabled:opacity-50"
                            >
                                {t('save')}
                            </button>
                        )}
                        {isArchived && <div className="w-10" />}
                    </div>

                    <div className="flex-1 overflow-y-auto p-4 pb-12 space-y-4">
                        {/* Name & Telegram */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                                <label className="text-[10px] font-black text-ios-gray uppercase tracking-widest px-1">{t('student_name')}</label>
                                <input
                                    type="text"
                                    value={editName}
                                    autoFocus={!student.name}
                                    onChange={(e) => setEditName(e.target.value)}
                                    readOnly={readOnly}
                                    className="w-full mt-1 px-3 py-2 rounded-xl bg-ios-background dark:bg-zinc-800 dark:text-white text-sm disabled:opacity-50"
                                    placeholder={t('student_name')}
                                />
                            </div>
                            <div>
                                <label className="text-[10px] font-black text-ios-gray uppercase tracking-widest px-1">{t('tg_username')}</label>
                                <div className="flex gap-2 mt-1">
                                    <div className="relative flex-1">
                                        <TelegramIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-ios-gray" />
                                        <input
                                            type="text"
                                            value={editTelegram}
                                            onChange={(e) => setEditTelegram(e.target.value)}
                                            readOnly={readOnly}
                                            className="w-full pl-8 pr-3 py-2 rounded-xl bg-ios-background dark:bg-zinc-800 dark:text-white text-sm disabled:opacity-50"
                                            placeholder="username"
                                        />
                                    </div>
                                    {editTelegram && (
                                        <a
                                            href={`https://t.me/${editTelegram.replace('@', '')}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="flex items-center gap-2 px-2 text-ios-blue rounded-xl font-bold active:scale-95 transition-transform"
                                        >
                                            <TelegramIcon className="w-4 h-4" />
                                            <span className="text-xs uppercase tracking-tight">{t('open_chat')}</span>
                                        </a>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Read-only notes if present */}
                        {readOnly && editNotes && (
                            <div className="p-3 bg-ios-background dark:bg-zinc-800 rounded-xl">
                                <label className="text-[10px] font-black text-ios-gray uppercase tracking-widest block mb-1">{t('note')}</label>
                                <p className="text-sm dark:text-white whitespace-pre-wrap">{editNotes}</p>
                            </div>
                        )}

                        {/* Instagram Field */}
                        <div>
                            <label className="text-[10px] font-black text-ios-gray uppercase tracking-widest px-1">{t('ig_username')}</label>
                            <div className="flex gap-2 mt-1">
                                <div className="relative flex-1">
                                    <Instagram className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-ios-gray" />
                                    <input
                                        type="text"
                                        value={editInstagram}
                                        onChange={(e) => setEditInstagram(e.target.value)}
                                        readOnly={readOnly}
                                        className="w-full pl-8 pr-3 py-2 rounded-xl bg-ios-background dark:bg-zinc-800 dark:text-white text-sm disabled:opacity-50"
                                        placeholder="username"
                                    />
                                </div>
                                {editInstagram && (
                                    <a
                                        href={`https://instagram.com/${editInstagram.replace('@', '')}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="flex items-center gap-2 px-2 text-[#E1306C] rounded-xl font-bold active:scale-95 transition-transform"
                                    >
                                        <Instagram className="w-4 h-4" />
                                        <span className="text-xs uppercase tracking-tight">{t('open_chat')}</span>
                                    </a>
                                )}
                            </div>
                        </div>

                        {/* Notes Section */}
                        {!readOnly && (
                            <section>
                                <label className="text-[10px] font-black text-ios-gray uppercase tracking-widest px-1 mb-1 block">{t('note')}</label>
                                <textarea
                                    value={editNotes}
                                    onChange={(e) => setEditNotes(e.target.value)}
                                    readOnly={readOnly}
                                    className="w-full px-3 py-2 text-sm dark:text-white bg-ios-background dark:bg-zinc-800 border border-transparent dark:border-zinc-800 rounded-xl resize-none disabled:opacity-50"
                                    placeholder={t('note') || 'Note'}
                                    rows={2}
                                />
                            </section>
                        )}

                        {/* Grouped Finance Section */}
                        {student.name && (financeTabGroups.length > 0 || !readOnly) && (
                            <>
                                <section>
                                    <div className="flex gap-2 overflow-x-auto pb-1 mb-3">
                                        {financeTabGroups.map(group => {
                                            const balance = calculateStudentGroupBalance(
                                                student.id!,
                                                String(group.id),
                                                allSubscriptions,
                                                attendance,
                                                lessons
                                            ).balance;
                                            const isSelected = String(group.id) === String(selectedFinanceGroupId);

                                            return (
                                                <button
                                                    key={group.id}
                                                    onClick={() => setSelectedFinanceGroupId(String(group.id))}
                                                    className={`shrink-0 flex items-center gap-2 px-3 py-2 rounded-2xl border transition-all ${isSelected
                                                        ? 'border-transparent text-white shadow-sm'
                                                        : 'bg-ios-background dark:bg-zinc-800 border-transparent text-ios-gray'
                                                        }`}
                                                    style={isSelected ? { backgroundColor: group.color } : undefined}
                                                >
                                                    <div
                                                        className={`w-2.5 h-2.5 rounded-full ${isSelected ? 'ring-1 ring-white' : ''}`}
                                                        style={{ backgroundColor: group.color }}
                                                    />
                                                    <span className={`text-sm font-semibold ${isSelected ? 'text-white' : 'dark:text-white'}`}>{group.name}</span>
                                                    <span className={`text-sm font-bold ${isSelected ? 'text-white' : balance > 0 ? 'text-ios-green' : balance < 0 ? 'text-ios-red' : 'text-ios-gray'}`}>
                                                        {balance > 0 ? `+${balance}` : balance}
                                                    </span>
                                                </button>
                                            );
                                        })}

                                        {!readOnly && (
                                            <button
                                                onClick={() => setAddingToGroup(true)}
                                                className={`shrink-0 flex items-center justify-center px-3 py-2 rounded-2xl border active:scale-[0.98] transition-transform ${addingToGroup
                                                    ? 'bg-ios-card dark:bg-zinc-900 border-gray-200 dark:border-zinc-700 text-ios-blue shadow-sm'
                                                    : 'bg-ios-background dark:bg-zinc-800 border-transparent text-ios-blue'
                                                    }`}
                                                aria-label={t('add')}
                                            >
                                                <Plus className="w-4 h-4" />
                                            </button>
                                        )}
                                    </div>

                                    {addingToGroup && !readOnly && (
                                        <div className="w-full p-3 mb-3 bg-ios-background dark:bg-zinc-800 rounded-2xl space-y-3">
                                            <select
                                                value={selectedGroupId}
                                                onChange={(e) => setSelectedGroupId(e.target.value)}
                                                className="w-full px-3 py-2 rounded-lg bg-ios-card dark:bg-zinc-700 dark:text-white"
                                            >
                                                <option value="">{t('select_group')}</option>
                                                {activeGroups.map(g => {
                                                    const isAssigned = memberGroupIds.includes(String(g.id));
                                                    return (
                                                        <option
                                                            key={g.id}
                                                            value={g.id}
                                                            disabled={isAssigned}
                                                        >
                                                            {g.name}{isAssigned ? ` (${t('already_added') || 'added'})` : ''}
                                                        </option>
                                                    );
                                                })}
                                            </select>
                                            <div className="flex gap-2">
                                                <button
                                                    onClick={() => setAddingToGroup(false)}
                                                    className="flex-1 py-2 rounded-lg bg-gray-200 dark:bg-zinc-600 dark:text-white text-sm"
                                                >
                                                    {t('cancel')}
                                                </button>
                                                <button
                                                    onClick={handleAddToGroup}
                                                    disabled={!selectedGroupId}
                                                    className="flex-1 py-2 rounded-lg bg-ios-blue text-white font-semibold text-sm disabled:opacity-50"
                                                >
                                                    {t('add')}
                                                </button>
                                            </div>
                                        </div>
                                    )}

                                    {selectedFinanceGroup && selectedFinanceAudit ? (
                                        <>
                                            {!readOnly && (
                                                <button
                                                    onClick={() => setIsPassPickerOpen(open => !open)}
                                                    className={`w-full flex items-center justify-center gap-2 px-4 py-3 bg-ios-card dark:bg-zinc-900 text-sm text-black dark:text-white border border-gray-100 dark:border-zinc-800 rounded-2xl active:scale-[0.98] transition-transform ${isPassPickerOpen ? 'shadow-[0_8px_20px_rgba(0,0,0,0.08)] dark:shadow-[0_8px_20px_rgba(0,0,0,0.35)] relative z-10' : 'mb-2'}`}
                                                >
                                                    <Plus className="w-4 h-4" />
                                                    <span>{t('buy_pass')}</span>
                                                </button>
                                            )}

                                            {!readOnly && isPassPickerOpen && (
                                                <div className="mb-2 -mt-3 pt-3 rounded-b-2xl bg-ios-card dark:bg-zinc-900 border border-gray-100 dark:border-zinc-800 border-t-0 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
                                                    {selectedGroupPasses.map(pass => (
                                                        <button
                                                            key={pass.id}
                                                            onClick={() => handleStartSubscriptionDraft(String(pass.id))}
                                                            className="w-full px-4 py-3 text-left border-b last:border-b-0 border-gray-100 dark:border-zinc-800 active:bg-ios-background dark:active:bg-zinc-800 transition-colors"
                                                        >
                                                            <div className="min-w-0 text-sm text-black dark:text-white truncate">
                                                                {[getPassDisplayName(pass, t), `${pass.price} ₾`].filter(Boolean).join(', ')}
                                                            </div>
                                                        </button>
                                                    ))}
                                                    {selectedGroupPasses.length === 0 && (
                                                        <div className="px-4 py-3 text-sm text-ios-gray">
                                                            {t('no_passes_found') || 'No passes available for this group'}
                                                        </div>
                                                    )}
                                                </div>
                                            )}

                                            <div className="space-y-3">
                                                {selectedActiveSubs.map(sub => {
                                                    const group = allGroupsRaw.find(g => String(g.id) === String(sub.group_id));
                                                    const originalPass = passes.find(p => String(p.id) === String(sub.tariff_id));
                                                    const cardDates = getSubscriptionCardDates(sub);
                                                    const passUsage = selectedFinanceAudit.passUsage.find(item => item.passId === sub.id);
                                                    const lessonsUsed = passUsage?.lessonsUsed || 0;
                                                    const lessonsRemaining = Math.max(sub.lessons_total - lessonsUsed, 0);
                                                    return (
                                                        <PassCard
                                                            key={sub.id}
                                                            pass={{
                                                                id: String(sub.id),
                                                                name: originalPass?.name || '',
                                                                price: sub.price,
                                                                lessons_count: lessonsRemaining,
                                                                is_consecutive: sub.is_consecutive,
                                                                duration_days: sub.duration_days || originalPass?.duration_days
                                                            }}
                                                            groupsList={group ? [group] : []}
                                                            onClick={() => setEditingSub(sub)}
                                                            showChevron={false}
                                                            totalLessons={sub.lessons_total}
                                                            startDate={cardDates.startDate}
                                                            endDate={cardDates.endDate}
                                                            endDateText={cardDates.endDateText}
                                                            endDatePending={cardDates.endDatePending}
                                                            warningLabel={sub.is_paid === false ? t('unpaid') : undefined}
                                                        />
                                                    );
                                                })}

                                                {selectedActiveSubs.length === 0 && (
                                                    <div className="py-8 text-center bg-ios-background dark:bg-zinc-800 rounded-[24px] border-2 border-dashed border-gray-100 dark:border-zinc-700">
                                                        <AlertCircle className="w-8 h-8 text-ios-gray/30 mx-auto mb-2" />
                                                        <p className="text-ios-gray text-sm font-medium">{t('no_active_subscriptions')}</p>
                                                    </div>
                                                )}
                                            </div>

                                            {selectedUsedSubs.length > 0 && (
                                                <section className="mt-3">
                                                    <button
                                                        onClick={() => setIsArchiveOpen(!isArchiveOpen)}
                                                        className="w-full flex items-center justify-between px-3 py-3 rounded-2xl bg-ios-background dark:bg-zinc-800 text-ios-gray hover:text-ios-blue transition-colors group"
                                                    >
                                                        <div className="flex items-center gap-1.5">
                                                            <h3 className="text-[10px] font-black uppercase tracking-widest">{t('used_passes')}</h3>
                                                            <span className="text-[10px] font-bold opacity-50">({selectedUsedSubs.length})</span>
                                                        </div>
                                                        {isArchiveOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                                                    </button>

                                                    {isArchiveOpen && (
                                                        <div className="space-y-3 mt-2 opacity-60 hover:opacity-100 transition-opacity">
                                                            {selectedUsedSubs.map((sub: Subscription) => {
                                                                const group = allGroupsRaw.find(g => String(g.id) === String(sub.group_id));
                                                                const originalPass = passes.find(p => String(p.id) === String(sub.tariff_id));
                                                                const cardDates = getSubscriptionCardDates(sub);
                                                                return (
                                                                    <PassCard
                                                                        key={sub.id}
                                                                        pass={{
                                                                            id: String(sub.id),
                                                                            name: originalPass?.name || '',
                                                                            price: sub.price,
                                                                            lessons_count: 0,
                                                                            is_consecutive: sub.is_consecutive,
                                                                            duration_days: sub.duration_days || originalPass?.duration_days
                                                                        }}
                                                                        groupsList={group ? [group] : []}
                                                                        onClick={() => setEditingSub(sub)}
                                                                        showChevron={false}
                                                                        totalLessons={sub.lessons_total}
                                                                        startDate={cardDates.startDate}
                                                                        endDate={cardDates.endDate}
                                                                        endDateText={cardDates.endDateText}
                                                                        endDatePending={cardDates.endDatePending}
                                                                        warningLabel={sub.is_paid === false ? t('unpaid') : undefined}
                                                                    />
                                                                );
                                                            })}
                                                        </div>
                                                    )}
                                                </section>
                                            )}

                                            <div className="bg-ios-card dark:bg-zinc-900 rounded-2xl p-4 mt-4 shadow-sm border border-black/[0.02] dark:border-white/[0.02]">
                                                <div className="flex items-center justify-between text-sm">
                                                    <span className="text-ios-gray">{t('passes') || 'Passes'}</span>
                                                    <span className="font-medium text-ios-green">+{totalPassCredit}</span>
                                                </div>
                                                <div className="flex items-center justify-between text-sm mt-2">
                                                    <span className="text-ios-gray">{t('counted_lessons') || 'Sessions'}</span>
                                                    <span className="font-medium text-ios-red">-{selectedFinanceAudit.lessonsOwed}</span>
                                                </div>
                                                <div className="border-t border-gray-100 dark:border-zinc-700 mt-3 pt-3">
                                                    <div className="flex items-center justify-between">
                                                        <span className="font-bold dark:text-white">
                                                            {selectedFinanceAudit.balance >= 0 ? (t('surplus') || 'Remaining') : (t('debt') || 'Debt')}
                                                        </span>
                                                        <span className={cn(
                                                            "font-bold text-lg",
                                                            selectedFinanceBalance > 0 ? 'text-ios-green' : selectedFinanceBalance < 0 ? 'text-ios-red' : 'text-ios-gray'
                                                        )}>
                                                            {selectedFinanceBalance > 0 ? `+${selectedFinanceBalance}` : selectedFinanceBalance}
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>

                                            {coveredEntries.length > 0 && (
                                                <section className="mt-4">
                                                    <h3 className="text-[10px] font-black text-ios-green uppercase tracking-widest flex items-center gap-1 mb-3 px-1">
                                                        <CheckCircle2 className="w-3 h-3" />
                                                        {t('covered_lessons') || 'Covered'} ({coveredEntries.length})
                                                    </h3>
                                                    <div className="space-y-2">
                                                        {coveredEntries.map(entry => (
                                                            <LessonCard key={entry.lessonId} entry={entry} />
                                                        ))}
                                                    </div>
                                                </section>
                                            )}

                                            {uncoveredEntries.length > 0 && (
                                                <section className="mt-4">
                                                    <h3 className="text-[10px] font-black text-ios-red uppercase tracking-widest flex items-center gap-1 mb-3 px-1">
                                                        <AlertCircle className="w-3 h-3" />
                                                        {t('uncovered_lessons') || 'Uncovered'} ({uncoveredEntries.length})
                                                    </h3>
                                                    <div className="space-y-2">
                                                        {uncoveredEntries.map(entry => (
                                                            <LessonCard key={entry.lessonId} entry={entry} />
                                                        ))}
                                                    </div>
                                                </section>
                                            )}

                                            {notCountedEntries.length > 0 && (
                                                <section className="mt-4">
                                                    <h3 className="text-[10px] font-black text-ios-gray uppercase tracking-widest flex items-center gap-1 mb-3 px-1">
                                                        <XCircle className="w-3 h-3" />
                                                        {t('not_counted_lessons') || 'Not Counted'} ({notCountedEntries.length})
                                                    </h3>
                                                    <div className="space-y-2">
                                                        {notCountedEntries.map(entry => (
                                                            <LessonCard key={entry.lessonId} entry={entry} />
                                                        ))}
                                                    </div>
                                                </section>
                                            )}

                                            {selectedFinanceAudit.auditEntries.length === 0 && (
                                                <div className="py-12 text-center">
                                                    <Calendar className="w-12 h-12 text-ios-gray/30 mx-auto mb-3" />
                                                    <p className="text-ios-gray text-sm">{t('no_lessons_covered') || 'No attendance records yet'}</p>
                                                </div>
                                            )}
                                        </>
                                    ) : (
                                        <div className="py-8 text-center bg-ios-background dark:bg-zinc-800 rounded-[24px] border-2 border-dashed border-gray-100 dark:border-zinc-700">
                                            <AlertCircle className="w-8 h-8 text-ios-gray/30 mx-auto mb-2" />
                                            <p className="text-ios-gray text-sm font-medium">{t('groups')}</p>
                                        </div>
                                    )}
                                </section>
                            </>
                        )}

                        {/* Archive / Restore / Delete Section */}
                        {!readOnly && student.id && (
                            <div className="pt-4 border-t border-gray-100 dark:border-zinc-800 space-y-3">
                                {!isArchived ? (
                                    <button
                                        onClick={handleArchive}
                                        className="w-full py-3 flex items-center justify-center gap-2 bg-ios-gray/10 text-ios-gray rounded-xl font-semibold active:opacity-60 transition-opacity"
                                    >
                                        <Archive className="w-5 h-5" />
                                        <span>{t('archive_student') || 'Archive Student'}</span>
                                    </button>
                                ) : (
                                    <button
                                        onClick={handleRestore}
                                        className="w-full py-3 flex items-center justify-center gap-2 bg-ios-green/10 text-ios-green rounded-xl font-semibold active:opacity-60 transition-opacity"
                                    >
                                        <RotateCcw className="w-5 h-5" />
                                        <span>{t('restore_student') || 'Restore Student'}</span>
                                    </button>
                                )}

                                {showDeleteConfirm ? (
                                    <div className="flex gap-2 animate-in fade-in zoom-in duration-200">
                                        <button
                                            onClick={() => setShowDeleteConfirm(false)}
                                            className="flex-1 py-3 rounded-xl bg-gray-100 dark:bg-zinc-800 font-medium dark:text-white text-sm"
                                        >
                                            {t('cancel')}
                                        </button>
                                        <button
                                            onClick={handleDelete}
                                            className="flex-1 py-3 rounded-xl bg-ios-red text-white font-bold text-sm"
                                        >
                                            {t('confirm_delete')}
                                        </button>
                                    </div>
                                ) : (
                                    <button
                                        onClick={() => setShowDeleteConfirm(true)}
                                        className="w-full py-3 flex items-center justify-center gap-2 text-ios-red font-medium active:opacity-60 transition-opacity"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                        <span>{t('delete_student')}</span>
                                    </button>
                                )
                                }
                            </div>
                        )}
                    </div>
                </div >
            </div >

            {
                editingSub && (
                    <SubscriptionDetailSheet
                        isOpen={!!editingSub}
                        onClose={() => setEditingSub(null)}
                        subscription={editingSub}
                        onCreate={handleBuySubscription}
                    />
                )
            }

            <LessonDetailSheet
                lesson={selectedLesson}
                onClose={() => setSelectedLesson(null)}
                zIndexClass="z-[120]"
            />
        </>
    );
};
