import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Plus, Instagram, ChevronDown, ChevronUp, Trash2, Archive, RotateCcw, Calendar, XCircle, CheckCircle2, Check } from 'lucide-react';
import type { Subscription, Student, Lesson, AttendanceStatus } from '../types';
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
import { formatDate, formatDateRange, formatTimeRange } from '../utils/formatting';
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
    const [isUpcomingOpen, setIsUpcomingOpen] = useState(false);
    const [isPaidLessonsOpen, setIsPaidLessonsOpen] = useState(false);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [selectedFinanceGroupId, setSelectedFinanceGroupId] = useState<string | null>(null);
    const [lessonStatusOverrides, setLessonStatusOverrides] = useState<Record<string, AttendanceStatus | 'not_marked'>>({});
    const [lessonAttendanceSaving, setLessonAttendanceSaving] = useState<Record<string, boolean>>({});
    const lastInitializedId = React.useRef<string | null>(null);
    const initialAttendanceSnapshotRef = React.useRef<Record<string, { id?: string, status: AttendanceStatus | 'not_marked', payment_amount?: number }>>({});
    const changedLessonIdsRef = React.useRef<Set<string>>(new Set());

    const { groups: allGroupsRaw, studentGroups, refreshStudentGroups, refreshStudents, refreshAttendance, subscriptions: allSubscriptions, lessons, passes, passGroups, attendance } = useData();
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
                setIsUpcomingOpen(false);
                setIsPaidLessonsOpen(false);
                setLessonStatusOverrides({});
                setLessonAttendanceSaving({});
                setSelectedFinanceGroupId(null);
                initialAttendanceSnapshotRef.current = Object.fromEntries(
                    attendance
                        .filter(item => String(item.student_id) === String(student.id))
                        .map(item => [String(item.lesson_id), {
                            id: item.id,
                            status: item.status,
                            payment_amount: item.payment_amount
                        }])
                );
                changedLessonIdsRef.current = new Set();
                lastInitializedId.current = student.id || null;
            }
        } else if (!isOpen) {
            lastInitializedId.current = null;
            setIsPassPickerOpen(false);
            setShowDeleteConfirm(false);
            setAddingToGroup(false);
            setIsUpcomingOpen(false);
            setIsPaidLessonsOpen(false);
            setLessonStatusOverrides({});
            setLessonAttendanceSaving({});
            setSelectedFinanceGroupId(null);
            initialAttendanceSnapshotRef.current = {};
            changedLessonIdsRef.current = new Set();
        }
    }, [student, isOpen, attendance]);

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

        if (student?.id && changedLessonIdsRef.current.size > 0) {
            const currentAttendanceByLessonId = new Map(
                attendance
                    .filter(item => String(item.student_id) === String(student.id))
                    .map(item => [String(item.lesson_id), item])
            );

            for (const lessonId of changedLessonIdsRef.current) {
                const initial = initialAttendanceSnapshotRef.current[lessonId];
                const current = currentAttendanceByLessonId.get(lessonId);

                if (!initial || initial.status === 'not_marked') {
                    if (current?.id) {
                        await api.remove('attendance', current.id);
                    }
                    continue;
                }

                await api.markAttendance({
                    lesson_id: lessonId,
                    student_id: student.id,
                    status: initial.status,
                    payment_amount: initial.payment_amount
                });
            }

            await refreshAttendance();
            changedLessonIdsRef.current = new Set();
        }

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
    const selectedGroupLessons = selectedFinanceGroup
        ? lessons
            .filter(lesson => String(lesson.group_id) === String(selectedFinanceGroup.id))
            .sort((a, b) => b.date.localeCompare(a.date) || b.time.localeCompare(a.time))
        : [];
    const selectedAttendanceByLessonId = new Map(
        attendance
            .filter(item => String(item.student_id) === studentIdStr)
            .map(item => [String(item.lesson_id), item])
    );
    const lessonAuditEntryByLessonId = new Map(
        (selectedFinanceAudit?.auditEntries || []).map(entry => [entry.lessonId, entry])
    );

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
    const passCoversLessonDate = (sub: Subscription, lessonDate: string) => {
        const cardDates = getSubscriptionCardDates(sub);
        const afterStart = lessonDate >= (cardDates.startDate || sub.purchase_date);
        const beforeExpiry = !cardDates.endDate || lessonDate <= cardDates.endDate;
        if (!afterStart || !beforeExpiry) return false;
        if (sub.status === 'archived' && lessonDate >= today) return false;
        if (cardDates.endDate && cardDates.endDate < today && lessonDate >= today) return false;
        return true;
    };
    const findCoveringPassForLessonDate = (lessonDate: string) =>
        selectedActiveSubs.find(sub => passCoversLessonDate(sub, lessonDate));
    const getSubscriptionRangeLabel = (sub: Subscription) => {
        const cardDates = getSubscriptionCardDates(sub);

        if (cardDates.startDate && cardDates.endDate) {
            return formatDateRange(cardDates.startDate, cardDates.endDate, i18n);
        }

        if (cardDates.startDate) {
            return t('from_only', { date: formatDate(cardDates.startDate, i18n, { includeWeekday: false }) });
        }

        return cardDates.endDateText;
    };
    const getSubscriptionMetaLabel = (sub: Subscription) => {
        const lessonsWord = t('lessons', { count: sub.lessons_total }) || 'lessons';
        const lessonsLabel = sub.is_consecutive
            ? `${sub.lessons_total} ${lessonsWord} ${t('in_a_row') || 'in a row'}`
            : sub.duration_days
                ? `${sub.lessons_total} ${lessonsWord}, ${sub.duration_days} ${t('days', { count: sub.duration_days }) || 'days'}`
                : `${sub.lessons_total} ${lessonsWord}`;
        const rangeLabel = getSubscriptionRangeLabel(sub);
        return rangeLabel ? `${lessonsLabel}, ${rangeLabel}` : lessonsLabel;
    };

    const lessonAuditEntries = selectedGroupLessons.map<BalanceAuditEntry>(lesson => {
        const existingEntry = lessonAuditEntryByLessonId.get(String(lesson.id));
        if (existingEntry) return existingEntry;

        const attendanceRecord = selectedAttendanceByLessonId.get(String(lesson.id));
        const matchingPass = findCoveringPassForLessonDate(lesson.date);
        const hasMatchingPass = !!matchingPass;

        if (lesson.status === 'cancelled') {
            return {
                lessonId: String(lesson.id),
                lessonDate: lesson.date,
                lessonTime: lesson.time,
                attendanceStatus: attendanceRecord?.status ?? null,
                status: 'not_counted',
                reason: 'not_counted_cancelled'
            };
        }

        if (attendanceRecord?.status === 'absence_valid') {
            return {
                lessonId: String(lesson.id),
                lessonDate: lesson.date,
                lessonTime: lesson.time,
                attendanceStatus: attendanceRecord.status,
                status: 'not_counted',
                reason: 'not_counted_valid_skip'
            };
        }

        return {
            lessonId: String(lesson.id),
            lessonDate: lesson.date,
            lessonTime: lesson.time,
            attendanceStatus: attendanceRecord?.status ?? null,
            status: 'not_counted',
            reason: hasMatchingPass ? 'not_counted_no_attendance' : 'uncovered_no_matching_pass',
            coveredByPassId: matchingPass?.id
        };
    });
    const totalPassCredit = selectedFinanceAudit
        ? selectedFinanceAudit.passUsage.reduce((sum, passUsage) => sum + passUsage.lessonsTotal, 0)
        : 0;
    const totalUsedLessons = selectedFinanceAudit
        ? selectedFinanceAudit.lessonsOwed
        : 0;
    const attendedLessonsCount = selectedFinanceAudit
        ? selectedFinanceAudit.auditEntries.filter(entry =>
            entry.status === 'counted' && entry.attendanceStatus === 'present'
        ).length
        : 0;
    const skippedLessonsCount = selectedFinanceAudit
        ? selectedFinanceAudit.auditEntries.filter(entry =>
            entry.status === 'counted' && entry.attendanceStatus === 'absence_invalid'
        ).length
        : 0;
    const unmarkedDebtLessonsCount = selectedFinanceAudit
        ? selectedFinanceAudit.auditEntries.filter(entry =>
            entry.status === 'counted' && entry.attendanceStatus === null
        ).length
        : 0;
    const nbsp = '\u00A0';
    const attendanceSummaryText = i18n.language.toUpperCase() === 'RU'
        ? `На${nbsp}${attendedLessonsCount}${nbsp}были, ${skippedLessonsCount}${nbsp}пропустили, на${nbsp}${unmarkedDebtLessonsCount}${nbsp}не${nbsp}отмечены`
        : `${attendedLessonsCount} ${t('attended') || 'attended'}, ${skippedLessonsCount} ${t('skipped') || 'skipped'}, ${unmarkedDebtLessonsCount} ${t('unmarked') || 'unmarked'}`;
    const usageSummaryText = i18n.language.toUpperCase() === 'RU'
        ? `${totalPassCredit}${nbsp}${t('covered') || 'покрыто'}, ${totalUsedLessons}${nbsp}${t('used') || 'использовано'}. ${attendanceSummaryText}`
        : `${totalPassCredit} ${t('covered') || 'covered'}, ${totalUsedLessons} ${t('used') || 'used'}. ${attendanceSummaryText}`;
    const upcomingLessonEntries = lessonAuditEntries.filter(entry => entry.lessonDate > today);
    const currentAndPastLessonEntries = lessonAuditEntries.filter(entry => entry.lessonDate <= today);
    const twoMonthsAgo = (() => {
        const [year, month, day] = today.split('-').map(Number);
        const date = new Date(year, month - 1, day);
        date.setMonth(date.getMonth() - 2);
        const nextYear = date.getFullYear();
        const nextMonth = String(date.getMonth() + 1).padStart(2, '0');
        const nextDay = String(date.getDate()).padStart(2, '0');
        return `${nextYear}-${nextMonth}-${nextDay}`;
    })();
    const recentCurrentAndPastLessonEntries = currentAndPastLessonEntries.filter(entry => entry.lessonDate >= twoMonthsAgo);
    const earlierLessonEntries = currentAndPastLessonEntries.filter(entry => entry.lessonDate < twoMonthsAgo);
    const areEarlierLessonsContinuouslyPaid = earlierLessonEntries.length > 0 && earlierLessonEntries.every(entry => {
        if (entry.reason === 'uncovered_pass_depleted') {
            return false;
        }

        if (entry.status !== 'counted') {
            return true;
        }

        if (!entry.coveredByPassId) {
            return false;
        }

        const pass = allSubscriptions.find(subscription => subscription.id === entry.coveredByPassId);
        return !!pass && pass.is_paid !== false;
    });

    const LessonCard: React.FC<{ entry: BalanceAuditEntry }> = ({ entry }) => {
        const sub = entry.coveredByPassId
            ? allSubscriptions.find(subscription => subscription.id === entry.coveredByPassId)
            : undefined;
        const lesson = lessons.find(item => String(item.id) === entry.lessonId);
        const isCounted = entry.status === 'counted';
        const existingAttendance = selectedAttendanceByLessonId.get(String(entry.lessonId));
        const status = lessonStatusOverrides[entry.lessonId]
            ?? existingAttendance?.status
            ?? 'not_marked';
        const isSavingAttendance = !!lessonAttendanceSaving[entry.lessonId];
        const skipTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
        const isLongPressRef = React.useRef(false);

        const syncEntryAttendance = async (newStatus: AttendanceStatus | 'not_marked') => {
            if (!student?.id || !lesson?.id) return;
            if (lessonAttendanceSaving[entry.lessonId]) return;

            const previousStatus = status;
            const initialStatus = initialAttendanceSnapshotRef.current[entry.lessonId]?.status ?? 'not_marked';
            setLessonStatusOverrides(prev => ({ ...prev, [entry.lessonId]: newStatus }));
            setLessonAttendanceSaving(prev => ({ ...prev, [entry.lessonId]: true }));
            if (newStatus !== initialStatus) {
                changedLessonIdsRef.current.add(entry.lessonId);
            } else {
                changedLessonIdsRef.current.delete(entry.lessonId);
            }

            try {
                if (newStatus !== 'not_marked') {
                    await api.markAttendance({
                        lesson_id: lesson.id,
                        student_id: student.id,
                        status: newStatus,
                        payment_amount: existingAttendance?.status === newStatus ? existingAttendance.payment_amount : undefined
                    });
                } else if (existingAttendance?.id) {
                    await api.remove('attendance', existingAttendance.id);
                }
                await refreshAttendance();
            } catch (error) {
                console.error('Failed to update attendance:', error);
                setLessonStatusOverrides(prev => ({ ...prev, [entry.lessonId]: previousStatus }));
                if (previousStatus !== initialStatus) {
                    changedLessonIdsRef.current.add(entry.lessonId);
                } else {
                    changedLessonIdsRef.current.delete(entry.lessonId);
                }
            } finally {
                setLessonAttendanceSaving(prev => ({ ...prev, [entry.lessonId]: false }));
            }
        };

        const handleSkipPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
            e.stopPropagation();
            isLongPressRef.current = false;
            skipTimerRef.current = setTimeout(() => {
                isLongPressRef.current = true;
                const nextSkipStatus = status === 'absence_valid' ? 'absence_invalid' : 'absence_valid';
                void syncEntryAttendance(nextSkipStatus);
                if (navigator.vibrate) navigator.vibrate(50);
            }, 500);
        };

        const handleSkipPointerUp = (e?: React.PointerEvent<HTMLButtonElement> | React.MouseEvent<HTMLButtonElement>) => {
            e?.stopPropagation();
            if (skipTimerRef.current) {
                clearTimeout(skipTimerRef.current);
                skipTimerRef.current = null;
            }
        };

        const handleSkipClick = (e: React.MouseEvent<HTMLButtonElement>) => {
            e.stopPropagation();
            if (isLongPressRef.current) return;
            void syncEntryAttendance(status === 'absence_invalid' || status === 'absence_valid' ? 'not_marked' : 'absence_invalid');
        };

        const handlePresentClick = (e: React.MouseEvent<HTMLButtonElement>) => {
            e.stopPropagation();
            void syncEntryAttendance(status === 'present' ? 'not_marked' : 'present');
        };

        return (
            <div
                role={lesson ? "button" : undefined}
                tabIndex={lesson ? 0 : undefined}
                onClick={() => lesson && setSelectedLesson(lesson)}
                onKeyDown={(e) => {
                    if (!lesson) return;
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setSelectedLesson(lesson);
                    }
                }}
                className={cn(
                    "w-full px-4 py-3 bg-ios-card dark:bg-zinc-900",
                    "flex items-start justify-between gap-4 active:scale-[0.98] transition-all text-left"
                )}
            >
                <div className="flex flex-col min-w-0">
                    <div className="dark:text-white text-sm leading-tight">
                        {formatDate(entry.lessonDate, i18n)}, {lesson ? formatTimeRange(entry.lessonTime, lesson.duration_minutes) : entry.lessonTime}
                    </div>
                    {sub ? (
                        <div className="text-[10px] text-ios-gray font-medium mt-0.5 opacity-80">
                            {getSubscriptionMetaLabel(sub)}
                        </div>
                    ) : (entry.reason === 'uncovered_no_matching_pass' || entry.reason === 'uncovered_pass_depleted') ? (
                        <div className={cn(
                            "text-[10px] font-medium mt-0.5 opacity-80",
                            entry.status === 'counted' ? 'text-ios-red' : 'text-ios-gray'
                        )}>
                            {getReasonLabel(entry.reason)}
                        </div>
                    ) : entry.reason !== 'counted_present' && entry.reason !== 'counted_absence_invalid' && entry.reason !== 'counted_no_attendance_consecutive' && (
                        <div className="text-[10px] text-ios-gray font-medium mt-0.5 opacity-80">
                            {getReasonLabel(entry.reason)}
                        </div>
                    )}
                </div>

                <div className="flex items-center gap-3 shrink-0 self-center">
                    <div className="flex shrink-0">
                        <button
                            onPointerDown={handleSkipPointerDown}
                            onPointerUp={handleSkipPointerUp}
                            onPointerLeave={handleSkipPointerUp}
                            onClick={handleSkipClick}
                            disabled={isSavingAttendance}
                            className={`p-1.5 rounded-l-xl flex items-center justify-center transition-all select-none ${(status === 'absence_invalid' || status === 'absence_valid')
                                ? 'bg-white dark:bg-zinc-700 shadow-sm'
                                : ''
                                } ${isSavingAttendance ? 'opacity-50 pointer-events-none' : ''}`}
                        >
                            {status === 'absence_invalid' ? (
                                <div className="w-6 h-6 rounded-full bg-ios-red flex items-center justify-center">
                                    <X className="w-4 h-4 text-white dark:text-zinc-700" strokeWidth={4} />
                                </div>
                            ) : status === 'absence_valid' ? (
                                <div className="w-6 h-6 rounded-full bg-ios-blue flex items-center justify-center">
                                    <X className="w-4 h-4 text-white dark:text-zinc-700" strokeWidth={4} />
                                </div>
                            ) : (
                                <XCircle className="w-6 h-6 text-gray-300 dark:text-zinc-600" />
                            )}
                        </button>

                        <button
                            onClick={handlePresentClick}
                            disabled={isSavingAttendance}
                            className={`p-1.5 rounded-r-xl flex items-center justify-center transition-all select-none ${status === 'present'
                                ? 'bg-white dark:bg-zinc-700 shadow-sm'
                                : ''
                                } ${isSavingAttendance ? 'opacity-50 pointer-events-none' : ''}`}
                        >
                            {status === 'present' ? (
                                <div className="w-6 h-6 rounded-full bg-ios-green flex items-center justify-center">
                                    <Check className="w-4 h-4 text-white dark:text-zinc-700" strokeWidth={4} />
                                </div>
                            ) : (
                                <CheckCircle2 className="w-6 h-6 text-gray-300 dark:text-zinc-600" />
                            )}
                        </button>
                    </div>

                    <div className="flex items-center justify-center w-8 h-8 rounded-full bg-ios-background dark:bg-black border border-black/[0.03] dark:border-white/[0.03]">
                        <span className={cn(
                            "text-sm font-black",
                            isCounted ? "dark:text-white text-black" : "text-ios-gray opacity-40"
                        )}>
                            {isCounted ? "-1" : "0"}
                        </span>
                    </div>
                </div>
            </div>
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
                                                className={`flex items-center justify-center gap-2 px-3 py-2 rounded-2xl border active:scale-[0.98] transition-transform ${financeTabGroups.length === 0 ? 'w-full' : 'shrink-0'} ${addingToGroup
                                                    ? 'bg-ios-card dark:bg-zinc-900 border-gray-200 dark:border-zinc-700 text-ios-blue shadow-sm'
                                                    : 'bg-ios-background dark:bg-zinc-800 border-transparent text-ios-blue'
                                                    }`}
                                                aria-label={financeTabGroups.length === 0 ? (t('add_group') || 'Add group') : t('add')}
                                            >
                                                <Plus className="w-4 h-4" />
                                                {financeTabGroups.length === 0 && (
                                                    <span className="text-sm font-semibold">{t('add_group') || 'Add group'}</span>
                                                )}
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
                                            <div className="mb-3 px-1 text-sm text-ios-gray dark:text-zinc-300">
                                                {usageSummaryText}
                                            </div>
                                            <section className="overflow-hidden rounded-2xl border border-gray-100 dark:border-zinc-800 bg-ios-card dark:bg-zinc-900">
                                                {!readOnly && (
                                                    <button
                                                        onClick={() => setIsPassPickerOpen(open => !open)}
                                                        className="w-full flex items-center justify-center gap-2 px-4 py-3 text-sm text-black dark:text-white active:bg-ios-background dark:active:bg-zinc-800 transition-colors"
                                                    >
                                                        <Plus className="w-4 h-4" />
                                                        <span>{t('add_pass') || 'Add pass'}</span>
                                                    </button>
                                                )}

                                                {!readOnly && isPassPickerOpen && (
                                                    <div className="border-t border-gray-100 dark:border-zinc-800 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
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

                                                {selectedActiveSubs.length > 0 && (
                                                    <div className={cn(
                                                        "divide-y divide-gray-100 dark:divide-zinc-800",
                                                        !readOnly || isPassPickerOpen ? "border-t border-gray-100 dark:border-zinc-800" : ""
                                                    )}>
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
                                                                    flat
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
                                                    </div>
                                                )}

                                                {selectedUsedSubs.length > 0 && (
                                                    <>
                                                        <button
                                                            onClick={() => setIsArchiveOpen(!isArchiveOpen)}
                                                            className="w-full flex items-center justify-between px-4 py-3 border-t border-gray-100 dark:border-zinc-800 text-ios-gray hover:text-ios-blue transition-colors group"
                                                        >
                                                            <div className="flex items-center gap-1.5">
                                                                <h3 className="text-[10px] font-black uppercase tracking-widest">{t('used_passes')}</h3>
                                                                <span className="text-[10px] font-bold opacity-50">({selectedUsedSubs.length})</span>
                                                            </div>
                                                            {isArchiveOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                                                        </button>

                                                        {isArchiveOpen && (
                                                            <div className="border-t border-gray-100 dark:border-zinc-800 divide-y divide-gray-100 dark:divide-zinc-800 opacity-60 hover:opacity-100 transition-opacity">
                                                                {selectedUsedSubs.map((sub: Subscription) => {
                                                                    const group = allGroupsRaw.find(g => String(g.id) === String(sub.group_id));
                                                                    const originalPass = passes.find(p => String(p.id) === String(sub.tariff_id));
                                                                    const cardDates = getSubscriptionCardDates(sub);
                                                                    return (
                                                                        <PassCard
                                                                            key={sub.id}
                                                                            flat
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
                                                    </>
                                                )}
                                            </section>

                                            {lessonAuditEntries.length > 0 && (
                                                <section className="mt-4">
                                                    <div className="overflow-hidden rounded-2xl border border-gray-100 dark:border-zinc-800">
                                                        {upcomingLessonEntries.length > 0 && (
                                                            <button
                                                                onClick={() => setIsUpcomingOpen(!isUpcomingOpen)}
                                                                className="w-full flex items-center justify-between px-4 py-3 text-ios-gray hover:text-ios-blue transition-colors group"
                                                            >
                                                                <div className="flex items-center gap-1.5">
                                                                    <h3 className="text-[10px] font-black uppercase tracking-widest">{t('upcoming') || 'Upcoming'}</h3>
                                                                    <span className="text-[10px] font-bold opacity-50">({upcomingLessonEntries.length})</span>
                                                                </div>
                                                                {isUpcomingOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                                                            </button>
                                                        )}

                                                        {upcomingLessonEntries.length > 0 && isUpcomingOpen && (
                                                            <div className="border-t border-gray-100 dark:border-zinc-800 divide-y divide-gray-100 dark:divide-zinc-800">
                                                                {upcomingLessonEntries.map(entry => (
                                                                    <LessonCard key={entry.lessonId} entry={entry} />
                                                                ))}
                                                            </div>
                                                        )}

                                                        {recentCurrentAndPastLessonEntries.length > 0 && (
                                                            <div className={cn(
                                                                "divide-y divide-gray-100 dark:divide-zinc-800",
                                                                upcomingLessonEntries.length > 0 ? "border-t border-gray-100 dark:border-zinc-800" : ""
                                                            )}>
                                                                {recentCurrentAndPastLessonEntries.map(entry => (
                                                                    <LessonCard key={entry.lessonId} entry={entry} />
                                                                ))}
                                                            </div>
                                                        )}

                                                        {earlierLessonEntries.length > 0 && (
                                                            areEarlierLessonsContinuouslyPaid ? (
                                                                <>
                                                                    <button
                                                                        onClick={() => setIsPaidLessonsOpen(!isPaidLessonsOpen)}
                                                                        className={cn(
                                                                            "w-full flex items-center justify-between px-4 py-3 text-ios-gray hover:text-ios-blue transition-colors group",
                                                                            upcomingLessonEntries.length > 0 || recentCurrentAndPastLessonEntries.length > 0 ? "border-t border-gray-100 dark:border-zinc-800" : ""
                                                                        )}
                                                                    >
                                                                        <div className="flex items-center gap-1.5">
                                                                            <h3 className="text-[10px] font-black uppercase tracking-widest">{t('earlier') || 'Earlier'}</h3>
                                                                            <span className="text-[10px] font-bold opacity-50">({earlierLessonEntries.length})</span>
                                                                        </div>
                                                                        {isPaidLessonsOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                                                                    </button>

                                                                    {isPaidLessonsOpen && (
                                                                        <div className="border-t border-gray-100 dark:border-zinc-800 divide-y divide-gray-100 dark:divide-zinc-800">
                                                                            {earlierLessonEntries.map(entry => (
                                                                                <LessonCard key={entry.lessonId} entry={entry} />
                                                                            ))}
                                                                        </div>
                                                                    )}
                                                                </>
                                                            ) : (
                                                                <div className={cn(
                                                                    "divide-y divide-gray-100 dark:divide-zinc-800",
                                                                    upcomingLessonEntries.length > 0 || recentCurrentAndPastLessonEntries.length > 0 ? "border-t border-gray-100 dark:border-zinc-800" : ""
                                                                )}>
                                                                    {earlierLessonEntries.map(entry => (
                                                                        <LessonCard key={entry.lessonId} entry={entry} />
                                                                    ))}
                                                                </div>
                                                            )
                                                        )}
                                                    </div>
                                                </section>
                                            )}

                                            {lessonAuditEntries.length === 0 && (
                                                <div className="py-12 text-center">
                                                    <Calendar className="w-12 h-12 text-ios-gray/30 mx-auto mb-3" />
                                                    <p className="text-ios-gray text-sm">{t('no_lessons_covered') || 'No attendance records yet'}</p>
                                                </div>
                                            )}
                                        </>
                                    ) : null}
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
