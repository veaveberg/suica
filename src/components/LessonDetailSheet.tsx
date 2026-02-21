import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Ban, Users, Trash2, XCircle, CheckCircle2, Check, AlertTriangle, Plus, Settings, Calendar, Clock, Timer, CalendarClock, ChevronDown, ChevronRight, Archive } from 'lucide-react';
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
import { StudentSelector } from './StudentSelector';
import { addStudentToGroup, removeStudentFromGroup } from '../db-server';

interface LessonDetailSheetProps {
    lesson: Lesson | null;
    onClose: () => void;
    zIndexClass?: string;
}

export const LessonDetailSheet: React.FC<LessonDetailSheetProps> = ({ lesson: propLesson, onClose, zIndexClass }) => {
    const { t, i18n } = useTranslation();
    const { groups, students, studentGroups, refreshLessons, attendance: allAttendance, subscriptions, lessons } = useData();

    // Derive the latest version of the lesson from global data
    const lesson = useMemo(() => {
        if (!propLesson) return null;
        return lessons.find(l => l.id === propLesson.id) || propLesson;
    }, [propLesson, lessons]);

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
    const [newTime, setNewTime] = useState(lesson?.time || '');
    const [newDuration, setNewDuration] = useState<number | string>(lesson?.duration_minutes || 60);
    const skipTimerRef = useRef<any>(null);
    const isLongPressRef = useRef(false);
    const [showStudentSelector, setShowStudentSelector] = useState(false);
    const [showArchived, setShowArchived] = useState(false);

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
            setNewDuration(lesson.duration_minutes);
            setIsCompleted(lesson.status === 'completed');
            setShowDeleteConfirm(false);
            setShowReschedule(false);
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
            setShowDeleteConfirm(false);
            setShowReschedule(false);
        }
    }, [lesson]);

    if (!lesson) return null;



    // Count students marked as present
    const selected = Object.entries(attendanceData).filter(([_, status]) => status === 'present');

    const activeStudents = groupStudents.filter(s => s.status !== 'archived');
    const archivedStudents = groupStudents.filter(s => s.status === 'archived');


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
        if (!lesson?.id || !newDate || !newTime) return;

        await api.update('lessons', lesson.id, {
            date: newDate,
            time: newTime,
            duration_minutes: Number(newDuration)
        });
        await refreshLessons();
        setShowReschedule(false);
    };

    const handleStudentSelection = async (newSelectedIds: string[]) => {
        if (!lesson?.group_id) return;
        const currentIds = groupStudents.map(s => String(s.id));
        const toAdd = newSelectedIds.filter(id => !currentIds.includes(String(id)));
        const toRemove = currentIds.filter(id => !newSelectedIds.map(String).includes(String(id)));

        for (const id of toAdd) {
            await addStudentToGroup(id, lesson.group_id);
        }
        for (const id of toRemove) {
            await removeStudentFromGroup(id, lesson.group_id);
        }

        await refreshLessons();
    };


    const StudentRow = ({ student }: { student: Student }) => {
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
    };

    return (
        <div className={cn("fixed inset-0 flex items-end sm:items-center justify-center", zIndexClass || "z-[80]")}>
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

            <div className="relative w-full max-w-lg max-h-[90vh] bg-ios-card dark:bg-zinc-900 rounded-t-3xl sm:rounded-3xl overflow-hidden flex flex-col">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-zinc-800">
                    <button onClick={onClose} className="p-1">
                        <X className="w-6 h-6 text-ios-gray" />
                    </button>
                    <div className="flex-1 flex justify-center min-w-0 px-2">
                        <h2 className="font-bold text-lg dark:text-white flex items-center gap-2 truncate">
                            <div
                                className="w-3 h-3 rounded-full flex-shrink-0"
                                style={{ backgroundColor: group?.color || '#007AFF' }}
                            />
                            <span className="truncate">{group?.name || t('class')}</span>
                        </h2>
                    </div>
                    {!isStudent ? (
                        <button onClick={handleSave} className="text-ios-blue font-semibold">
                            {t('save')}
                        </button>
                    ) : (
                        <div className="w-12" />
                    )}
                </div>

                <div className="flex-1 overflow-y-auto p-4 pb-12 space-y-6">

                    {/* Date/Time Info & Action Buttons */}
                    <div className="space-y-4 px-1">
                        <div>
                            <p className="text-xl font-bold dark:text-white">
                                {(() => {
                                    const d = new Date();
                                    const todayStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
                                    const dateStr = lesson.date === todayStr ? `${t('today')}, ${formatDate(lesson.date, i18n)}` : formatDate(lesson.date, i18n);
                                    return dateStr;
                                })()}
                                &nbsp;&nbsp;
                                <span className="text-ios-gray font-normal text-lg">
                                    {formatTimeRange(lesson.time, lesson.duration_minutes)}, {lesson.duration_minutes} {t('minutes')}
                                </span>
                            </p>
                        </div>

                        {!isStudent && (
                            <div className="space-y-4">
                                {!showReschedule && !showDeleteConfirm && (
                                    <div className="grid grid-cols-2 gap-2">
                                        <button
                                            onClick={handleCancel}
                                            className={`flex items-center justify-center gap-2 py-3 rounded-xl font-medium active:scale-[0.98] transition-transform text-sm dark:text-white ${lesson.status === 'cancelled'
                                                ? 'bg-green-500/10'
                                                : 'bg-orange-500/10'
                                                }`}
                                        >
                                            <Ban className={`w-4 h-4 ${lesson.status === 'cancelled' ? 'text-ios-green' : 'text-ios-orange'}`} />
                                            {lesson.status === 'cancelled' ? (t('restore') || 'Restore') : (t('skip') || 'Skip')}
                                        </button>
                                        <button
                                            onClick={() => setShowReschedule(true)}
                                            className="flex items-center justify-center gap-2 py-3 rounded-xl bg-blue-500/10 font-medium active:scale-[0.98] transition-transform text-sm dark:text-white"
                                        >
                                            <CalendarClock className="w-4 h-4 text-ios-blue" />
                                            {t('reschedule') || 'Reschedule'}
                                        </button>
                                        <button
                                            onClick={() => setShowDeleteConfirm(true)}
                                            className="flex items-center justify-center gap-2 py-3 rounded-xl bg-red-500/10 text-ios-red font-medium active:scale-[0.98] transition-transform text-sm"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                            {t('delete')}
                                        </button>
                                        <button
                                            onClick={() => setParam('groupId', group?.id || null)}
                                            className="flex items-center justify-center gap-2 py-3 rounded-xl bg-gray-500/10 dark:bg-zinc-800 font-medium active:scale-[0.98] transition-transform text-sm dark:text-white"
                                        >
                                            <Settings className="w-4 h-4 text-ios-gray" />
                                            {t('edit_group') || 'Group'}
                                        </button>
                                    </div>
                                )}

                                {/* Reschedule Form - Moved here */}
                                {showReschedule && (
                                    <div className="space-y-4">
                                        <div className="grid grid-cols-[2fr_1.2fr_110px] gap-2">
                                            <div>
                                                <label className="text-sm text-ios-gray uppercase font-semibold block mb-1 pl-1">{t('date') || 'Date'}</label>
                                                <div className="relative flex items-center bg-ios-background dark:bg-zinc-800 rounded-xl px-3">
                                                    <Calendar className="w-4 h-4 text-ios-gray flex-shrink-0" />
                                                    <input
                                                        type="date"
                                                        value={newDate}
                                                        onChange={(e) => setNewDate(e.target.value)}
                                                        className="w-full py-2.5 pl-2 bg-transparent dark:text-white text-base border-none focus:ring-0 outline-none [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:inset-0 [&::-webkit-calendar-picker-indicator]:opacity-0 [&::-webkit-calendar-picker-indicator]:cursor-pointer"
                                                    />
                                                </div>
                                            </div>
                                            <div>
                                                <label className="text-sm text-ios-gray uppercase font-semibold block mb-1 pl-1">{t('time') || 'Time'}</label>
                                                <div className="relative flex items-center bg-ios-background dark:bg-zinc-800 rounded-xl px-3">
                                                    <Clock className="w-4 h-4 text-ios-gray flex-shrink-0" />
                                                    <input
                                                        type="time"
                                                        value={newTime}
                                                        onChange={(e) => setNewTime(e.target.value)}
                                                        className="w-full py-2.5 pl-2 bg-transparent dark:text-white text-base border-none focus:ring-0 outline-none [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:inset-0 [&::-webkit-calendar-picker-indicator]:opacity-0 [&::-webkit-calendar-picker-indicator]:cursor-pointer"
                                                    />
                                                </div>
                                            </div>
                                            <div>
                                                <label className="text-sm text-ios-gray uppercase font-semibold block mb-1 pl-1">&nbsp;</label>
                                                <div className="flex items-center bg-ios-background dark:bg-zinc-800 rounded-xl px-3">
                                                    <Timer className="w-4 h-4 text-ios-gray flex-shrink-0" />
                                                    <input
                                                        type="number"
                                                        inputMode="numeric"
                                                        pattern="[0-9]*"
                                                        value={newDuration}
                                                        onChange={(e) => setNewDuration(e.target.value)}
                                                        onFocus={(e) => e.target.select()}
                                                        onBlur={() => {
                                                            if (newDuration === '') setNewDuration(0);
                                                        }}
                                                        className="w-full py-2.5 pl-2 bg-transparent dark:text-white text-base border-none focus:ring-0 outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none text-left"
                                                    />
                                                    <span className="text-base text-ios-gray pointer-events-none ml-1">
                                                        {t('minutes') || 'min'}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="flex gap-2">
                                            <button
                                                onClick={() => setShowReschedule(false)}
                                                className="flex-1 py-3 rounded-xl bg-gray-200 dark:bg-zinc-800 font-medium dark:text-white text-sm"
                                            >
                                                {t('cancel')}
                                            </button>
                                            <button
                                                onClick={handleReschedule}
                                                className="flex-1 py-3 rounded-xl bg-ios-blue text-white font-medium text-sm shadow-lg shadow-ios-blue/20"
                                            >
                                                {t('save')}
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {showDeleteConfirm && (
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


                    {lesson.status === 'cancelled' && (
                        <div className="p-4 bg-ios-red/10 rounded-2xl text-center">
                            <span className="text-ios-red font-medium">{t('cancelled') || 'Skipped'}</span>
                        </div>
                    )}

                    {/* Students Section */}
                    {lesson.status !== 'cancelled' && (
                        <div className="space-y-3">
                            <div className="flex items-center justify-between px-1">
                                <div className="flex items-center gap-2">
                                    <Users className="w-4 h-4 text-ios-gray" />
                                    <span className="text-sm font-semibold text-ios-gray uppercase">
                                        {t('students')} ({selected.length}/{groupStudents.length})
                                    </span>
                                </div>
                                <div className="flex items-center gap-3">
                                    {!isStudent && (
                                        <button
                                            onClick={() => setShowStudentSelector(true)}
                                            className="text-ios-blue p-1 active:scale-90 transition-transform"
                                        >
                                            <Plus className="w-5 h-5" />
                                        </button>
                                    )}
                                </div>
                            </div>

                            <div className="space-y-2">
                                {activeStudents.length === 0 && archivedStudents.length === 0 ? (
                                    <p className="text-center py-4 text-ios-gray">
                                        {t('no_members') || 'No students in this group'}
                                    </p>
                                ) : (
                                    <>
                                        {activeStudents.map((student: Student) => (
                                            <StudentRow key={student.id} student={student} />
                                        ))}

                                        {archivedStudents.length > 0 && (
                                            <div className="pt-2">
                                                <button
                                                    onClick={() => setShowArchived(!showArchived)}
                                                    className="flex items-center gap-2 py-2 text-ios-gray px-1 active:opacity-60 transition-opacity"
                                                >
                                                    {showArchived ? (
                                                        <ChevronDown className="w-4 h-4" />
                                                    ) : (
                                                        <ChevronRight className="w-4 h-4" />
                                                    )}
                                                    <Archive className="w-4 h-4" />
                                                    <span className="text-sm font-medium">
                                                        {t('archived')} ({archivedStudents.length})
                                                    </span>
                                                </button>
                                                {showArchived && (
                                                    <div className="space-y-2 mt-2">
                                                        {archivedStudents.map((student: Student) => (
                                                            <StudentRow key={student.id} student={student} />
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </>
                                )
                                }
                            </div>

                            {/* Status Segmented Control (End of students section) */}
                            <div className="pt-2">
                                <div className="flex p-1 bg-ios-background dark:bg-zinc-800 rounded-xl">
                                    <button
                                        onClick={() => !isStudent && setIsCompleted(false)}
                                        className={`flex-1 py-3 rounded-lg font-medium transition-all ${!isCompleted
                                            ? 'bg-white dark:bg-zinc-700 text-ios-blue shadow-sm'
                                            : 'text-ios-gray'
                                            }`}
                                    >
                                        {t('status_not_marked_yet') || 'Not marked yet'}
                                    </button>
                                    <button
                                        onClick={() => !isStudent && setIsCompleted(true)}
                                        className={`flex-1 py-3 rounded-lg font-medium transition-all ${isCompleted
                                            ? 'bg-white dark:bg-zinc-700 text-ios-green shadow-sm'
                                            : 'text-ios-gray'
                                            }`}
                                    >
                                        {t('status_everyone_marked') || 'Everyone is marked'}
                                    </button>
                                </div>
                            </div>


                            {/* Notes */}
                            <div className="pt-2">
                                <label className="block text-sm font-semibold text-ios-gray mb-1 uppercase px-1">
                                    {t('my_note')}
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


                </div>
            </div>

            <StudentSelector
                isOpen={showStudentSelector}
                onClose={() => setShowStudentSelector(false)}
                onSelect={handleStudentSelection}
                allStudents={students}
                initialSelectedIds={groupStudents.map(s => String(s.id))}
            />
        </div >
    );
};
