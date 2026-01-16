import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Ban, Calendar, Clock, Users, Trash2, Circle, XCircle, CheckCircle2, Check } from 'lucide-react';
import type { Lesson, Student, AttendanceStatus } from '../types';
import { useData } from '../DataProvider';
import * as api from '../api';
import { cancelLesson, uncancelLesson, deleteLesson } from '../db-server';
import { formatDate, formatTimeRange } from '../utils/formatting';

interface LessonDetailSheetProps {
    lesson: Lesson | null;
    onClose: () => void;
}

export const LessonDetailSheet: React.FC<LessonDetailSheetProps> = ({ lesson, onClose }) => {
    const { t, i18n } = useTranslation();
    const { groups, students, studentGroups, refreshLessons, refreshAttendance } = useData();
    const [attendanceData, setAttendanceData] = useState<Record<string, AttendanceStatus | 'not_marked'>>({});
    const [initialAttendance, setInitialAttendance] = useState<Record<string, AttendanceStatus | 'not_marked'>>({});
    const [notes, setNotes] = useState('');
    const [isCompleted, setIsCompleted] = useState(false);
    const [showReschedule, setShowReschedule] = useState(false);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [newDate, setNewDate] = useState(lesson?.date || '');
    const [newTime, setNewTime] = useState('');
    const skipTimerRef = useRef<any>(null);
    const isLongPressRef = useRef(false);

    // Get group info
    const group = lesson ? groups.find(g => String(g.id) === String(lesson.group_id)) : null;

    // Get students in this group
    const groupStudentIds = studentGroups
        .filter(sg => lesson && String(sg.group_id) === String(lesson.group_id))
        .map(sg => String(sg.student_id));
    const groupStudents = students.filter(s =>
        groupStudentIds.includes(String(s.id)) &&
        s.name && s.name.trim().length > 0
    );

    // Load existing data
    useEffect(() => {
        if (lesson) {
            setNotes(lesson.notes || '');
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
                    setInitialAttendance(map);
                })
                .catch(() => {
                    setAttendanceData({});
                    setInitialAttendance({});
                });
        } else {
            setAttendanceData({});
            setInitialAttendance({});
            setNotes('');
            setIsCompleted(false);
        }
    }, [lesson]);

    if (!lesson) return null;

    const cycleStatus = (studentId: string) => {
        const statuses: (AttendanceStatus | 'not_marked')[] = ['not_marked', 'present', 'absence_valid', 'absence_invalid'];
        const current = attendanceData[studentId] || 'not_marked';
        const nextIndex = (statuses.indexOf(current) + 1) % statuses.length;
        setAttendanceData(prev => ({
            ...prev,
            [studentId]: statuses[nextIndex]
        }));
    };

    // Count students marked as present
    const selected = Object.entries(attendanceData).filter(([_, status]) => status === 'present');

    const handleSave = async () => {
        try {
            // Sync attendance records with DB
            // 1. Delete all for this lesson
            const existing = await api.queryByField<{ id: number }>('attendance', 'lesson_id', lesson.id!);
            for (const rec of existing) {
                await api.remove('attendance', rec.id);
            }

            // 2. Create new records (only for non 'not_marked' statuses)
            const recordsToCreate = Object.entries(attendanceData)
                .filter(([_, status]) => status !== 'not_marked')
                .map(([studentId, status]) => ({
                    lesson_id: lesson.id!,
                    student_id: studentId,
                    status: status as AttendanceStatus
                }));

            if (recordsToCreate.length > 0) {
                await api.bulkCreate('attendance', recordsToCreate);
            }

            // Update lesson status
            await api.update('lessons', lesson.id!, {
                status: isCompleted ? 'completed' : 'upcoming',
                students_count: selected.length,
                notes
            });

            await refreshLessons();
            await refreshAttendance();
            onClose();
        } catch (error) {
            console.error('Failed to save:', error);
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
                    <button onClick={handleSave} className="text-ios-blue font-semibold">
                        {t('save')}
                    </button>
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
                                    onClick={() => setIsCompleted(false)}
                                    className={`flex-1 py-3 rounded-lg font-medium transition-all ${!isCompleted
                                        ? 'bg-white dark:bg-zinc-700 text-ios-blue shadow-sm'
                                        : 'text-ios-gray'
                                        }`}
                                >
                                    {t('not_marked') || 'Not marked'}
                                </button>
                                <button
                                    onClick={() => setIsCompleted(true)}
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
                                            if (!silent && navigator.vibrate) navigator.vibrate(10);
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
                                            if (isLongPressRef.current) return;
                                            if (status === 'absence_invalid' || status === 'absence_valid') {
                                                setStatus('not_marked');
                                            } else {
                                                setStatus('absence_invalid');
                                            }
                                        };

                                        const handlePresentClick = () => {
                                            if (status === 'present') {
                                                setStatus('not_marked');
                                            } else {
                                                setStatus('present');
                                            }
                                        };

                                        return (
                                            <div
                                                key={student.id}
                                                className="flex items-center justify-between gap-3 p-1.5 pl-4 rounded-2xl bg-ios-background dark:bg-zinc-800"
                                            >
                                                <span className="font-medium dark:text-gray-200 truncate">{student.name}</span>

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
                                    className="w-full p-4 rounded-2xl bg-ios-background dark:bg-zinc-800 border-none focus:ring-2 focus:ring-ios-blue min-h-[80px] resize-none dark:text-white"
                                    placeholder="..."
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
                </div>
            </div>
        </div>
    );
};
