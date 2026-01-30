import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Ban, Calendar, Clock, Users, Trash2, XCircle, CheckCircle2, Check, AlertTriangle } from 'lucide-react';
import { useTelegram } from './TelegramProvider';
import type { Lesson, Student, AttendanceStatus } from '../types';
import { useData } from '../DataProvider';
import * as api from '../api';
import { api as convexApi } from '../../convex/_generated/api';
import { useQuery } from 'convex/react';
import { cancelLesson, uncancelLesson, deleteLesson } from '../db-server';
import { formatDate, formatTimeRange, formatCurrency } from '../utils/formatting';
import { useSearchParams } from '../hooks/useSearchParams';
import { cn } from '../utils/cn';
import { calculateStudentGroupBalanceWithAudit } from '../utils/balance';
import type { Attendance } from '../types';

interface LessonDetailSheetProps {
    lesson: Lesson | null;
    onClose: () => void;
}

export const LessonDetailSheet: React.FC<LessonDetailSheetProps> = ({ lesson, onClose }) => {
    const { t, i18n } = useTranslation();
    const { groups, students, studentGroups, refreshLessons, attendance: allAttendance, subscriptions, lessons } = useData();
    const { setParam } = useSearchParams();
    const { convexUser, userId: currentTgId } = useTelegram();
    const isAdmin = convexUser?.role === 'admin';
    const isOwner = lesson?.userId === String(currentTgId);
    const isStudent = !isAdmin && (convexUser?.role === 'student' || (!!lesson && !!currentTgId && !isOwner));
    const [attendanceData, setAttendanceData] = useState<Record<string, AttendanceStatus | 'not_marked'>>({});
    const [notes, setNotes] = useState('');
    const [infoForStudents, setInfoForStudents] = useState('');
    const [isCompleted, setIsCompleted] = useState(false);
    const [showReschedule, setShowReschedule] = useState(false);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [newDate, setNewDate] = useState(lesson?.date || '');
    const [newTime, setNewTime] = useState('');
    const skipTimerRef = useRef<any>(null);
    const isLongPressRef = useRef(false);

    // Get group info
    const group = lesson ? groups.find(g => String(g.id) === String(lesson.group_id)) : null;

    // Memoize students in this group
    const groupStudents = useMemo(() => {
        const groupStudentIds = studentGroups
            .filter(sg => lesson && String(sg.group_id) === String(lesson.group_id))
            .map(sg => String(sg.student_id));
        return students.filter(s =>
            groupStudentIds.includes(String(s.id)) &&
            s.name && s.name.trim().length > 0
        );
    }, [students, studentGroups, lesson?.group_id]);

    // Memoize if a student has a pass specifically for THIS lesson
    const studentStatusMap = useMemo(() => {
        if (!lesson) return {};
        const map: Record<string, {
            hasActivePass: boolean;
            isUncoveredPresent: boolean;
            isUncoveredSkip: boolean;
            presentPaymentAmount?: number;
            skipPaymentAmount?: number;
        }> = {};

        groupStudents.forEach(s => {
            // Virtual 'present' check
            const resPresent = calculateStudentGroupBalanceWithAudit(
                s.id!, lesson.group_id, subscriptions,
                [...allAttendance, { student_id: s.id!, lesson_id: lesson.id!, status: 'present' } as Attendance],
                lessons
            );
            const entryPresent = resPresent.auditEntries.find(e => String(e.lessonId) === String(lesson.id));

            // Calculate cost for present if covered
            let presentCost = 0;
            if (entryPresent?.coveredByPassId) {
                const pass = subscriptions.find(sub => String(sub.id) === String(entryPresent.coveredByPassId));
                if (pass && pass.lessons_total > 0) {
                    presentCost = pass.price / pass.lessons_total;
                }
            }

            // Virtual 'absence_invalid' check
            const resSkip = calculateStudentGroupBalanceWithAudit(
                s.id!, lesson.group_id, subscriptions,
                [...allAttendance, { student_id: s.id!, lesson_id: lesson.id!, status: 'absence_invalid' } as Attendance],
                lessons
            );
            const entrySkip = resSkip.auditEntries.find(e => String(e.lessonId) === String(lesson.id));

            // Calculate cost for skip if covered
            let skipCost = 0;
            if (entrySkip?.coveredByPassId) {
                const pass = subscriptions.find(sub => String(sub.id) === String(entrySkip.coveredByPassId));
                if (pass && pass.lessons_total > 0) {
                    skipCost = pass.price / pass.lessons_total;
                }
            }

            map[String(s.id)] = {
                hasActivePass: !!(entryPresent && entryPresent.coveredByPassId),
                isUncoveredPresent: !!(entryPresent && !entryPresent.coveredByPassId && entryPresent.status === 'counted'),
                isUncoveredSkip: !!(entrySkip && !entrySkip.coveredByPassId && entrySkip.status === 'counted'),
                presentPaymentAmount: presentCost > 0 ? presentCost : undefined,
                skipPaymentAmount: skipCost > 0 ? skipCost : undefined,
            };
        });
        return map;
    }, [groupStudents, lesson, subscriptions, allAttendance, lessons]);

    // Fetch revenue stats (Equation)
    const revenueStats = useQuery(convexApi.revenue.getRevenueStatsForLesson,
        lesson ? { lessonId: lesson.id as any, groupId: lesson.group_id as any } : "skip"
    );

    // Load existing data
    useEffect(() => {
        if (lesson) {
            setNotes(lesson.notes || '');
            setInfoForStudents(lesson.info_for_students || '');
            setNewDate(lesson.date);
            setNewTime(lesson.time);
            setIsCompleted(lesson.status === 'completed');
            // Load attendance records
            api.queryByField<{ student_id: string, status: AttendanceStatus }>('attendance', 'lesson_id', lesson.id!)
                .then(records => {
                    const map: Record<string, AttendanceStatus | 'not_marked'> = {};
                    records.forEach(r => {
                        map[r.student_id] = r.status;
                    });
                    setAttendanceData(map);
                })
                .catch(() => {
                    setAttendanceData({});
                });
        } else {
            setAttendanceData({});
            setNotes('');
            setInfoForStudents('');
            setIsCompleted(false);
        }
    }, [lesson]);

    if (!lesson) return null;


    // Count students marked as present
    const selected = Object.entries(attendanceData).filter(([_, status]) => status === 'present');

    const handleSave = async () => {
        try {
            // 1. Prepare attendance data for sync
            const attendance = Object.entries(attendanceData)
                .filter(([_, status]) => status !== 'not_marked')
                .map(([studentId, status]) => {
                    const info = studentStatusMap[studentId];
                    const amount = status === 'present' ? info?.presentPaymentAmount :
                        status === 'absence_invalid' ? info?.skipPaymentAmount : undefined;

                    return {
                        student_id: studentId as any,
                        status: status as AttendanceStatus,
                        payment_amount: amount
                    };
                });

            // 2. Close immediately for a felt-instant response
            onClose();

            // 3. Sync attendance and update lesson in background
            Promise.all([
                api.syncAttendance(lesson.id!, attendance),
                api.update('lessons', lesson.id!, {
                    status: isCompleted ? 'completed' : 'upcoming',
                    students_count: selected.length,
                    notes,
                    info_for_students: infoForStudents
                })
            ]).catch(error => {
                console.error('Failed to save in background:', error);
                alert(t('failed_to_save') || 'Failed to save changes. Please check your connection.');
            });
        } catch (error) {
            console.error('Failed to prepare save:', error);
        }
    };

    const handleCancel = async () => {
        if (!lesson?.id) return;
        if (lesson.status === 'cancelled') {
            await uncancelLesson(lesson.id);
        } else {
            await cancelLesson(lesson.id);
        }
        await refreshLessons();
        onClose();
    };

    const handleDelete = async () => {
        if (!lesson?.id) return;
        try {
            await deleteLesson(lesson.id);
            await refreshLessons();
            onClose();
        } catch (error) {
            alert('Failed to delete lesson');
        }
    };

    const handleReschedule = async () => {
        if (!newDate || !newTime) return;

        await api.update('lessons', lesson.id!, {
            date: newDate,
            time: newTime
        });
        await refreshLessons();
        setShowReschedule(false);
        onClose();
    };

    return (
        <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center">
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

            <div className="relative w-full max-w-lg max-h-[90vh] bg-ios-card dark:bg-zinc-900 rounded-t-3xl sm:rounded-3xl overflow-hidden flex flex-col">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-zinc-800">
                    <button onClick={onClose} className="p-1">
                        <X className="w-6 h-6 text-ios-gray" />
                    </button>
                    <h2 className="font-bold text-lg dark:text-white">
                        {group?.name || 'Lesson'}
                    </h2>
                    {!isStudent ? (
                        <button onClick={handleSave} className="text-ios-blue font-semibold">
                            {t('save')}
                        </button>
                    ) : (
                        <div className="w-12" />
                    )}
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-6">
                    {/* Date/Time Info */}
                    <div className="flex items-center gap-4 p-4 bg-ios-background dark:bg-zinc-800 rounded-2xl">
                        <div
                            className="w-12 h-12 rounded-2xl flex items-center justify-center"
                            style={{ backgroundColor: group?.color || '#007AFF' }}
                        >
                            <Calendar className="w-6 h-6 text-white" />
                        </div>
                        <div>
                            <p className="font-bold dark:text-white">
                                {(() => {
                                    const d = new Date();
                                    const todayStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
                                    return lesson.date === todayStr;
                                })() ? `${t('today')}, ${formatDate(lesson.date, i18n)}`
                                    : formatDate(lesson.date, i18n)}
                            </p>
                            <p className="text-ios-gray">
                                {formatTimeRange(lesson.time, lesson.duration_minutes)}, {lesson.duration_minutes} {t('minutes')}
                            </p>
                        </div>
                    </div>

                    {/* Status Segmented Control */}
                    {lesson.status !== 'cancelled' && (
                        <div className="space-y-2">
                            <span className="text-sm font-semibold text-ios-gray uppercase px-1">
                                {t('status') || 'Status'}
                            </span>
                            <div className="flex p-1 bg-ios-background dark:bg-zinc-800 rounded-xl">
                                <button
                                    onClick={() => !isStudent && setIsCompleted(false)}
                                    className={`flex-1 py-3 rounded-lg font-medium transition-all ${!isCompleted
                                        ? 'bg-white dark:bg-zinc-700 text-ios-blue shadow-sm'
                                        : 'text-ios-gray'
                                        }`}
                                >
                                    {t('not_marked') || 'Not marked'}
                                </button>
                                <button
                                    onClick={() => !isStudent && setIsCompleted(true)}
                                    className={`flex-1 py-3 rounded-lg font-medium transition-all ${isCompleted
                                        ? 'bg-white dark:bg-zinc-700 text-ios-green shadow-sm'
                                        : 'text-ios-gray'
                                        }`}
                                >
                                    {t('completed')}
                                </button>
                            </div>
                        </div>
                    )}

                    {lesson.status === 'cancelled' && (
                        <div className="p-4 bg-ios-red/10 rounded-2xl text-center">
                            <span className="text-ios-red font-medium">{t('cancelled') || 'Skipped'}</span>
                        </div>
                    )}

                    {/* Attendance */}
                    {lesson.status !== 'cancelled' && (
                        <div className="space-y-3">
                            <div className="flex items-center gap-2 px-1">
                                <Users className="w-4 h-4 text-ios-gray" />
                                <span className="text-sm font-semibold text-ios-gray uppercase">
                                    {t('attendance')} ({selected.length}/{groupStudents.length})
                                </span>
                            </div>

                            <div className="space-y-2">
                                {groupStudents.length === 0 ? (
                                    <p className="text-center py-4 text-ios-gray">
                                        {t('no_members') || 'No students in this group'}
                                    </p>
                                ) : (
                                    groupStudents.map((student: Student) => {
                                        const status = attendanceData[student.id!] || 'not_marked';

                                        const setStatus = (newStatus: AttendanceStatus | 'not_marked', silent = false) => {
                                            setAttendanceData(prev => ({
                                                ...prev,
                                                [student.id!]: newStatus
                                            }));
                                            if (!isStudent && !silent && navigator.vibrate) navigator.vibrate(10);
                                        };

                                        const handleSkipPointerDown = () => {
                                            isLongPressRef.current = false;
                                            skipTimerRef.current = setTimeout(() => {
                                                isLongPressRef.current = true;
                                                const nextSkipStatus = status === 'absence_valid' ? 'absence_invalid' : 'absence_valid';
                                                setStatus(nextSkipStatus, true);
                                                if (navigator.vibrate) navigator.vibrate(50);
                                            }, 500);
                                        };

                                        const handleSkipPointerUp = () => {
                                            if (skipTimerRef.current) {
                                                clearTimeout(skipTimerRef.current);
                                                skipTimerRef.current = null;
                                            }
                                        };

                                        const handleSkipClick = () => {
                                            if (isStudent || isLongPressRef.current) return;
                                            if (status === 'absence_invalid' || status === 'absence_valid') {
                                                setStatus('not_marked');
                                            } else {
                                                setStatus('absence_invalid');
                                            }
                                        };

                                        const handlePresentClick = () => {
                                            if (isStudent || status === 'present') {
                                                if (!isStudent) setStatus('not_marked');
                                            } else {
                                                setStatus('present');
                                            }
                                        };

                                        return (
                                            <div
                                                key={student.id}
                                                className="flex items-center justify-between gap-3 p-1.5 pl-4 rounded-2xl bg-ios-background dark:bg-zinc-800"
                                            >
                                                <div className="flex flex-col min-w-0 pr-2 py-0.5">
                                                    <button
                                                        onClick={() => setParam('studentId', String(student.id))}
                                                        className="font-medium dark:text-gray-200 truncate hover:text-ios-blue transition-colors text-left"
                                                    >
                                                        {student.name}
                                                    </button>
                                                    <div className="flex flex-wrap items-start gap-2 mt-1">
                                                        {(() => {
                                                            const studentInfo = studentStatusMap[String(student.id)] || { hasActivePass: true, isUncoveredPresent: false, isUncoveredSkip: false };
                                                            const localStatus = attendanceData[student.id!];
                                                            const isMarked = localStatus && localStatus !== 'not_marked';

                                                            // Get revenue info from Query
                                                            const revInfo = revenueStats?.[String(student.id)];

                                                            if (!isMarked && !studentInfo.hasActivePass) {
                                                                return (
                                                                    <span className="text-[10px] text-ios-gray leading-[1.1] py-0.5 block">
                                                                        {t('no_pass')}
                                                                    </span>
                                                                );
                                                            }

                                                            const record = allAttendance.find(a =>
                                                                String(a.lesson_id) === String(lesson?.id) &&
                                                                String(a.student_id) === String(student.id)
                                                            );

                                                            const showWarning = isMarked && (
                                                                (localStatus === 'present' && studentInfo.isUncoveredPresent) ||
                                                                (localStatus === 'absence_invalid' && studentInfo.isUncoveredSkip) ||
                                                                (record?.is_uncovered)
                                                            );

                                                            if (!isMarked) {
                                                                return null;
                                                            }

                                                            return (
                                                                <div className="flex items-start gap-1.5 min-w-0">
                                                                    {showWarning && (
                                                                        <div className={cn(
                                                                            "flex gap-1 bg-ios-orange/10 px-1.5 -ml-1.5 py-0.5 rounded-md min-w-0",
                                                                            localStatus === 'present' ? "items-center" : "items-start"
                                                                        )}>
                                                                            <AlertTriangle className={cn("w-3 h-3 text-ios-orange flex-shrink-0", localStatus === 'present' ? "" : "mt-0.5")} />
                                                                            <span className="text-[10px] text-ios-orange font-medium leading-[1.1]">
                                                                                {localStatus === 'present' ? t('no_pass_short') : t('no_pass')}
                                                                            </span>
                                                                        </div>
                                                                    )}
                                                                    {(() => {
                                                                        // 1. Start with values from local virtual audit (most up-to-date with current UI state)
                                                                        let amount = (localStatus === 'present' ? studentInfo.presentPaymentAmount :
                                                                            localStatus === 'absence_invalid' ? studentInfo.skipPaymentAmount : undefined);

                                                                        // 2. If local audit doesn't have a value, check the record from DB (historical)
                                                                        // BUT only if it's not explicitly uncovered according to our current logic
                                                                        if (amount === undefined && !showWarning) {
                                                                            amount = record?.payment_amount;
                                                                        }

                                                                        // 3. Override with live revenue calculation from Convex if available and marked
                                                                        if (revInfo && (localStatus === 'present' || localStatus === 'absence_invalid')) {
                                                                            // Only override if we actually have a pass covering it according to revInfo
                                                                            // (or if we trust revInfo's judgment on 0-cost uncovered)
                                                                            if (revInfo.cost > 0 || studentInfo.hasActivePass) {
                                                                                amount = revInfo.cost;
                                                                            } else if (showWarning) {
                                                                                amount = 0; // Explicitly 0 if uncovered
                                                                            }
                                                                        }

                                                                        if (amount !== undefined && amount > 0) {
                                                                            return (
                                                                                <div className="flex items-center gap-2 mt-1">
                                                                                    <span className="text-[10px] font-bold text-ios-gray leading-none flex-shrink-0">
                                                                                        {formatCurrency(amount)} ₾
                                                                                    </span>
                                                                                    {revInfo && studentInfo.hasActivePass && (
                                                                                        <span className="text-[10px] font-normal text-ios-gray leading-none">
                                                                                            {revInfo.equation}
                                                                                        </span>
                                                                                    )}
                                                                                </div>
                                                                            );
                                                                        }
                                                                        return null;
                                                                    })()}
                                                                </div>
                                                            );
                                                        })()}
                                                    </div>
                                                </div>

                                                {/* Attendance Controls */}
                                                <div className="flex shrink-0">
                                                    {/* Skip Button */}
                                                    <button
                                                        onPointerDown={handleSkipPointerDown}
                                                        onPointerUp={handleSkipPointerUp}
                                                        onPointerLeave={handleSkipPointerUp}
                                                        onClick={handleSkipClick}
                                                        className={`p-3 rounded-l-xl flex items-center justify-center transition-all select-none ${(status === 'absence_invalid' || status === 'absence_valid')
                                                            ? 'bg-white dark:bg-zinc-700 shadow-sm'
                                                            : ''
                                                            }`}
                                                    >
                                                        {status === 'absence_invalid' ? (
                                                            <div className="w-8 h-8 rounded-full bg-ios-red flex items-center justify-center">
                                                                <X className="w-5 h-5 text-white dark:text-zinc-700" strokeWidth={4} />
                                                            </div>
                                                        ) : status === 'absence_valid' ? (
                                                            <div className="w-8 h-8 rounded-full bg-ios-blue flex items-center justify-center">
                                                                <X className="w-5 h-5 text-white dark:text-zinc-700" strokeWidth={4} />
                                                            </div>
                                                        ) : (
                                                            <XCircle className="w-8 h-8 text-gray-300 dark:text-zinc-600" />
                                                        )}
                                                    </button>

                                                    {/* Present Button */}
                                                    <button
                                                        onClick={handlePresentClick}
                                                        className={`p-3 rounded-r-xl flex items-center justify-center transition-all select-none ${status === 'present'
                                                            ? 'bg-white dark:bg-zinc-700 shadow-sm'
                                                            : ''
                                                            }`}
                                                    >
                                                        {status === 'present' ? (
                                                            <div className="w-8 h-8 rounded-full bg-ios-green flex items-center justify-center">
                                                                <Check className="w-5 h-5 text-white dark:text-zinc-700" strokeWidth={4} />
                                                            </div>
                                                        ) : (
                                                            <CheckCircle2 className="w-8 h-8 text-gray-300 dark:text-zinc-600" />
                                                        )}
                                                    </button>
                                                </div>
                                            </div>
                                        );
                                    })
                                )}
                            </div>

                            {/* Notes */}
                            <div className="pt-2">
                                <label className="block text-sm font-semibold text-ios-gray mb-1 uppercase px-1">
                                    {t('notes')}
                                </label>
                                <textarea
                                    value={notes}
                                    onChange={(e) => setNotes(e.target.value)}
                                    readOnly={isStudent}
                                    className="w-full p-4 rounded-2xl bg-ios-background dark:bg-zinc-800 border-none focus:ring-2 focus:ring-ios-blue min-h-[80px] resize-none dark:text-white"
                                    placeholder="..."
                                />
                            </div>

                            {/* Info for Students */}
                            <div className="pt-2">
                                <label className="block text-sm font-semibold text-ios-gray mb-1 uppercase px-1">
                                    {t('info_for_students')}
                                </label>
                                <textarea
                                    value={infoForStudents}
                                    onChange={(e) => setInfoForStudents(e.target.value)}
                                    readOnly={isStudent}
                                    className="w-full p-4 rounded-2xl bg-ios-background dark:bg-zinc-800 border-none focus:ring-2 focus:ring-ios-blue min-h-[80px] resize-none dark:text-white"
                                    placeholder={t('info_for_students_placeholder') || '...'}
                                />
                            </div>
                        </div>
                    )}

                    {/* Reschedule Section */}
                    {showReschedule && (
                        <div className="p-4 bg-ios-background dark:bg-zinc-800 rounded-2xl space-y-4">
                            <h3 className="font-semibold dark:text-white">{t('reschedule')}</h3>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="text-xs text-ios-gray uppercase">{t('new_date')}</label>
                                    <input
                                        type="date"
                                        value={newDate}
                                        onChange={(e) => setNewDate(e.target.value)}
                                        className="w-full p-3 rounded-xl bg-ios-card dark:bg-zinc-700 dark:text-white"
                                    />
                                </div>
                                <div>
                                    <label className="text-xs text-ios-gray uppercase">{t('new_time')}</label>
                                    <input
                                        type="time"
                                        value={newTime}
                                        onChange={(e) => setNewTime(e.target.value)}
                                        className="w-full p-3 rounded-xl bg-ios-card dark:bg-zinc-700 dark:text-white"
                                    />
                                </div>
                            </div>
                            <div className="flex gap-2">
                                <button
                                    onClick={() => setShowReschedule(false)}
                                    className="flex-1 py-3 rounded-xl bg-gray-200 dark:bg-zinc-700 font-medium dark:text-white"
                                >
                                    {t('cancel')}
                                </button>
                                <button
                                    onClick={handleReschedule}
                                    className="flex-1 py-3 rounded-xl bg-ios-blue text-white font-medium"
                                >
                                    {t('save')}
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Action Buttons */}
                    {!isStudent && (
                        <div className="space-y-3 pt-2">
                            {!showReschedule && (
                                <button
                                    onClick={() => setShowReschedule(true)}
                                    className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl bg-ios-background dark:bg-zinc-800 font-medium dark:text-white active:scale-[0.98] transition-transform"
                                >
                                    <Clock className="w-5 h-5 text-ios-blue" />
                                    {t('reschedule') || 'Reschedule'}
                                </button>
                            )}

                            <button
                                onClick={handleCancel}
                                className={`w-full flex items-center justify-center gap-2 py-4 rounded-2xl font-medium active:scale-[0.98] transition-transform ${lesson.status === 'cancelled'
                                    ? 'bg-ios-green/10 text-ios-green'
                                    : 'bg-ios-red/10 text-ios-red'
                                    }`}
                            >
                                <Ban className="w-5 h-5" />
                                {lesson.status === 'cancelled' ? (t('uncancel_lesson') || 'Restore') : (t('cancel_lesson') || 'Skip')}
                            </button>

                            {!showDeleteConfirm ? (
                                <button
                                    onClick={() => setShowDeleteConfirm(true)}
                                    className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl bg-ios-red/10 text-ios-red font-medium active:scale-[0.98] transition-transform"
                                >
                                    <Trash2 className="w-5 h-5" />
                                    {t('delete_lesson')}
                                </button>
                            ) : (
                                <div className="bg-ios-red/10 p-4 rounded-2xl space-y-3">
                                    <p className="text-ios-red text-sm font-medium text-center">
                                        {t('confirm_delete_lesson')}
                                    </p>
                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => setShowDeleteConfirm(false)}
                                            className="flex-1 py-3 rounded-xl bg-white dark:bg-zinc-800 font-medium dark:text-white shadow-sm"
                                        >
                                            {t('cancel')}
                                        </button>
                                        <button
                                            onClick={handleDelete}
                                            className="flex-1 py-3 rounded-xl bg-ios-red text-white font-medium shadow-sm"
                                        >
                                            {t('confirm_delete')}
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
