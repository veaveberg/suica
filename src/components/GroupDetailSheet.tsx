import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useData } from '../DataProvider';
import { updateGroup, archiveGroup, restoreGroup, deleteGroup, addScheduleSlot, deleteScheduleSlot, updateScheduleSlot, addStudentToGroup, removeStudentFromGroup, generateFutureLessons, syncLessonsFromSchedule } from '../db-server';
import { X, Trash2, Archive, RotateCcw, Plus, Calendar, Users, AlignCenterHorizontal } from 'lucide-react';
import { StudentSelector } from './StudentSelector';
import type { Group } from '../types';
import { GROUP_COLORS } from '../constants/colors';

interface GroupDetailSheetProps {
    group: Group;
    onClose: () => void;
}

const DAYS = [
    { name: 'day_1', value: 1 },
    { name: 'day_2', value: 2 },
    { name: 'day_3', value: 3 },
    { name: 'day_4', value: 4 },
    { name: 'day_5', value: 5 },
    { name: 'day_6', value: 6 },
    { name: 'day_0', value: 0 },
];

export const GroupDetailSheet: React.FC<GroupDetailSheetProps> = ({ group, onClose }) => {
    const { t } = useTranslation();
    const [name, setName] = useState(group.name);
    const [color, setColor] = useState(group.color);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [addingSlot, setAddingSlot] = useState(false);
    const [newSlotDay, setNewSlotDay] = useState(1);
    const [newSlotTime, setNewSlotTime] = useState('19:00');
    const [newSlotFrequency, setNewSlotFrequency] = useState(1);
    const [newSlotOffset, setNewSlotOffset] = useState(0);
    const [newSlotDuration, setNewSlotDuration] = useState('60');
    const [editingSlotId, setEditingSlotId] = useState<string | null>(null);
    const [editSlotDay, setEditSlotDay] = useState(1);
    const [editSlotTime, setEditSlotTime] = useState('');
    const [editSlotFrequency, setEditSlotFrequency] = useState(1);
    const [editSlotOffset, setEditSlotOffset] = useState(0);
    const [editSlotDuration, setEditSlotDuration] = useState('60');
    const [showStudentSelector, setShowStudentSelector] = useState(false);
    const [isSyncing, setIsSyncing] = useState(false);
    const [showAlignSuccess, setShowAlignSuccess] = useState(false);
    const [showAddLessonsSuccess, setShowAddLessonsSuccess] = useState(false);

    const { schedules: allSchedules, students: allStudents, studentGroups, refreshAll } = useData();

    const schedules = allSchedules.filter(s => String(s.group_id) === String(group.id));
    const memberAssignments = studentGroups.filter(sg => String(sg.group_id) === String(group.id));

    const memberIds = memberAssignments.map(a => String(a.student_id));
    const members = allStudents.filter(s => memberIds.includes(String(s.id)));

    const handleAlignLessons = async () => {
        setIsSyncing(true);
        await syncLessonsFromSchedule(group.id!.toString());
        await refreshAll();
        setIsSyncing(false);
        setShowAlignSuccess(true);
        setTimeout(() => setShowAlignSuccess(false), 2000);
    };

    const handleAddLessons = async () => {
        setIsSyncing(true);
        await generateFutureLessons(group.id!.toString(), 4);
        await refreshAll();
        setIsSyncing(false);
        setShowAddLessonsSuccess(true);
        setTimeout(() => setShowAddLessonsSuccess(false), 2000);
    };

    const isArchived = group.status === 'archived';

    const handleSave = async () => {
        try {
            await updateGroup(group.id!, {
                name: name.trim(),
                color
            });
            await refreshAll();
            onClose();
        } catch (error) {
            alert(error instanceof Error ? error.message : 'Failed to save');
        }
    };

    const handleArchive = async () => {
        await archiveGroup(group.id!);
        await refreshAll();
        onClose();
    };

    const handleRestore = async () => {
        try {
            await restoreGroup(group.id!);
            await refreshAll();
            onClose();
        } catch (error) {
            alert(error instanceof Error ? error.message : 'Failed to restore');
        }
    };

    const handleDelete = async () => {
        try {
            await deleteGroup(group.id!);
            await refreshAll();
            onClose();
        } catch (error) {
            alert(error instanceof Error ? error.message : 'Failed to delete');
        }
    };

    const handleAddSlot = async () => {
        await addScheduleSlot(group.id!.toString(), newSlotDay, newSlotTime, parseInt(newSlotDuration) || 60, newSlotFrequency, newSlotOffset);
        await refreshAll();
        setAddingSlot(false);
        setNewSlotTime('19:00');
        setNewSlotFrequency(1);
        setNewSlotOffset(0);
    };

    const handleDeleteSlot = async (scheduleId: string) => {
        await deleteScheduleSlot(scheduleId);
        await refreshAll();
    };

    const handleUpdateSlot = async (scheduleId: string) => {
        await updateScheduleSlot(scheduleId, {
            day_of_week: editSlotDay,
            time: editSlotTime,
            duration_minutes: parseInt(editSlotDuration) || 60,
            frequency_weeks: editSlotFrequency,
            week_offset: editSlotOffset
        });
        await refreshAll();
        setEditingSlotId(null);
    };

    const startEditingSlot = (slot: any) => {
        setEditingSlotId(slot.id!);
        setEditSlotDay(slot.day_of_week);
        setEditSlotTime(slot.time);
        setEditSlotFrequency(slot.frequency_weeks || 1);
        setEditSlotOffset(slot.week_offset || 0);
        setEditSlotDuration((slot.duration_minutes || group.default_duration_minutes || 60).toString());
        setAddingSlot(false);
    };

    const handleStudentSelection = async (newSelectedIds: string[]) => {
        const currentIds = memberIds;
        const toAdd = newSelectedIds.filter(id => !currentIds.includes(String(id)));
        const toRemove = currentIds.filter(id => !newSelectedIds.map(String).includes(String(id)));

        for (const id of toAdd) {
            await addStudentToGroup(id, group.id!);
        }
        for (const id of toRemove) {
            await removeStudentFromGroup(id, group.id!);
        }

        await refreshAll();
    };

    return (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
            <div className="absolute inset-0 bg-black/50" onClick={onClose} />

            <div className="relative w-full max-w-lg max-h-[90vh] bg-ios-card dark:bg-zinc-900 rounded-t-3xl sm:rounded-3xl overflow-hidden flex flex-col overscroll-y-contain">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-zinc-800">
                    <button onClick={onClose} className="p-1">
                        <X className="w-6 h-6 text-ios-gray" />
                    </button>
                    <h2 className="font-bold text-lg dark:text-white">
                        {isArchived ? t('archived_group') : t('edit_group')}
                    </h2>
                    {!isArchived && (
                        <button onClick={handleSave} className="text-ios-blue font-semibold">
                            {t('save')}
                        </button>
                    )}
                    {isArchived && <div className="w-12" />}
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-6">
                    {/* Name */}
                    <div>
                        <label className="text-sm text-ios-gray uppercase tracking-wider">{t('name')}</label>
                        <input
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            disabled={isArchived}
                            className="w-full mt-1 px-4 py-3 rounded-xl bg-ios-background dark:bg-zinc-800 dark:text-white disabled:opacity-50"
                        />
                    </div>

                    {/* Color */}
                    <div>
                        <label className="text-sm text-ios-gray uppercase tracking-wider">{t('color')}</label>
                        <div className="flex gap-2 mt-2">
                            {GROUP_COLORS.map(c => (
                                <button
                                    key={c}
                                    onClick={() => !isArchived && setColor(c)}
                                    className={`w-8 h-8 rounded-full transition-transform ${color === c ? 'scale-125 ring-2 ring-offset-2 ring-ios-blue' : ''}`}
                                    style={{ backgroundColor: c }}
                                    disabled={isArchived}
                                />
                            ))}
                        </div>
                    </div>





                    {/* Schedule Slots */}
                    {!isArchived && (
                        <div>
                            <div className="flex items-center justify-between">
                                <label className="text-sm text-ios-gray uppercase tracking-wider">{t('template_schedule')}</label>
                                <button
                                    onClick={() => setAddingSlot(true)}
                                    className="text-ios-blue"
                                >
                                    <Plus className="w-5 h-5" />
                                </button>
                            </div>

                            <div className="space-y-2 mt-2">
                                {schedules.filter(s => s.is_active).map(schedule => (
                                    <div key={schedule.id}>
                                        {editingSlotId === schedule.id ? (
                                            <div className="p-3 bg-ios-background dark:bg-zinc-800 rounded-xl space-y-3 ring-2 ring-ios-blue">
                                                <div className="flex gap-2">
                                                    <select
                                                        value={editSlotDay}
                                                        onChange={(e) => setEditSlotDay(parseInt(e.target.value))}
                                                        className="flex-1 px-3 py-2 rounded-lg bg-white dark:bg-zinc-700 dark:text-white"
                                                    >
                                                        {DAYS.map((day) => (
                                                            <option key={day.value} value={day.value}>{t(day.name)}</option>
                                                        ))}
                                                    </select>
                                                    <input
                                                        type="time"
                                                        value={editSlotTime}
                                                        onChange={(e) => setEditSlotTime(e.target.value)}
                                                        className="flex-1 px-3 py-2 rounded-lg bg-white dark:bg-zinc-700 dark:text-white"
                                                    />
                                                    <div className="flex items-center gap-1 bg-white dark:bg-zinc-700 rounded-lg px-2">
                                                        <input
                                                            type="number"
                                                            value={editSlotDuration}
                                                            onChange={(e) => setEditSlotDuration(e.target.value)}
                                                            className="w-12 py-2 bg-transparent dark:text-white text-center"
                                                        />
                                                        <span className="text-xs text-ios-gray">min</span>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-2 px-1">
                                                    <label className="text-xs text-ios-gray uppercase font-semibold whitespace-nowrap">{t('frequency')}:</label>
                                                    <select
                                                        value={editSlotFrequency}
                                                        onChange={(e) => {
                                                            const freq = parseInt(e.target.value);
                                                            setEditSlotFrequency(freq);
                                                            if (editSlotOffset >= freq) setEditSlotOffset(0);
                                                        }}
                                                        className="flex-1 px-3 py-2 rounded-lg bg-white dark:bg-zinc-700 dark:text-white text-sm"
                                                    >
                                                        <option value={1}>{t('every_week')}</option>
                                                        <option value={2}>{t('every_2nd_week')}</option>
                                                        <option value={3}>{t('every_3rd_week')}</option>
                                                        <option value={4}>{t('every_4th_week')}</option>
                                                    </select>
                                                </div>
                                                {editSlotFrequency > 1 && (
                                                    <div className="flex items-center gap-2 px-1">
                                                        <label className="text-xs text-ios-gray uppercase font-semibold whitespace-nowrap">{t('start_week')}:</label>
                                                        <select
                                                            value={editSlotOffset}
                                                            onChange={(e) => setEditSlotOffset(parseInt(e.target.value))}
                                                            className="flex-1 px-3 py-2 rounded-lg bg-white dark:bg-zinc-700 dark:text-white text-sm"
                                                        >
                                                            <option value={0}>{t('this_week')}</option>
                                                            <option value={1}>{t('next_week')}</option>
                                                            {editSlotFrequency >= 3 && <option value={2}>{t('after_2_weeks')}</option>}
                                                            {editSlotFrequency >= 4 && <option value={3}>{t('after_3_weeks')}</option>}
                                                        </select>
                                                    </div>
                                                )}
                                                <div className="flex gap-2">
                                                    <button
                                                        onClick={() => setEditingSlotId(null)}
                                                        className="flex-1 py-2 rounded-lg bg-gray-200 dark:bg-zinc-600 dark:text-white"
                                                    >
                                                        {t('cancel')}
                                                    </button>
                                                    <button
                                                        onClick={() => handleUpdateSlot(schedule.id!)}
                                                        className="flex-1 py-2 rounded-lg bg-ios-blue text-white font-semibold"
                                                    >
                                                        {t('save')}
                                                    </button>
                                                </div>
                                            </div>
                                        ) : (
                                            <div
                                                className="flex items-center justify-between p-3 bg-ios-background dark:bg-zinc-800 rounded-xl group cursor-pointer active:scale-[0.99] transition-transform"
                                                onClick={() => startEditingSlot(schedule)}
                                            >
                                                <div className="flex items-center gap-2">
                                                    <Calendar className="w-4 h-4 text-ios-gray" />
                                                    <span className="dark:text-white font-medium">
                                                        {t(`day_${schedule.day_of_week}s`)}, {(() => {
                                                            const [h, m] = schedule.time.split(':').map(Number);
                                                            const dur = schedule.duration_minutes || 60;
                                                            const start = new Date();
                                                            start.setHours(h, m, 0);
                                                            const end = new Date(start.getTime() + dur * 60000);
                                                            const format = (d: Date) => {
                                                                const hh = d.getHours();
                                                                const mm = d.getMinutes();
                                                                return mm === 0 ? `${hh}` : `${hh}:${mm.toString().padStart(2, '0')}`;
                                                            };
                                                            return `${format(start)}–${format(end)}`;
                                                        })()}, {(schedule.frequency_weeks || 1) > 1 ? t(`every_${schedule.frequency_weeks}nd_week`) : t('every_week')}
                                                    </span>
                                                </div>
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleDeleteSlot(schedule.id!);
                                                    }}
                                                    className="text-ios-red p-1 pl-4"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                ))}

                                {schedules.filter(s => s.is_active).length === 0 && !addingSlot && (
                                    <p className="text-ios-gray text-sm py-2">{t('no_schedule')}</p>
                                )}

                                {addingSlot && (
                                    <div className="p-3 bg-ios-background dark:bg-zinc-800 rounded-xl space-y-3">
                                        <div className="flex gap-2">
                                            <select
                                                value={newSlotDay}
                                                onChange={(e) => setNewSlotDay(parseInt(e.target.value))}
                                                className="flex-1 px-3 py-2 rounded-lg bg-white dark:bg-zinc-700 dark:text-white"
                                            >
                                                {DAYS.map((day) => (
                                                    <option key={day.value} value={day.value}>{t(day.name)}</option>
                                                ))}
                                            </select>
                                            <input
                                                type="time"
                                                value={newSlotTime}
                                                onChange={(e) => setNewSlotTime(e.target.value)}
                                                className="flex-1 px-3 py-2 rounded-lg bg-white dark:bg-zinc-700 dark:text-white"
                                            />
                                            <div className="flex items-center gap-1 bg-white dark:bg-zinc-700 rounded-lg px-2">
                                                <input
                                                    type="number"
                                                    value={newSlotDuration}
                                                    onChange={(e) => setNewSlotDuration(e.target.value)}
                                                    className="w-12 py-2 bg-transparent dark:text-white text-center"
                                                />
                                                <span className="text-xs text-ios-gray">min</span>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2 px-1">
                                            <label className="text-xs text-ios-gray uppercase font-semibold whitespace-nowrap">{t('frequency')}:</label>
                                            <select
                                                value={newSlotFrequency}
                                                onChange={(e) => {
                                                    const freq = parseInt(e.target.value);
                                                    setNewSlotFrequency(freq);
                                                    if (newSlotOffset >= freq) setNewSlotOffset(0);
                                                }}
                                                className="flex-1 px-3 py-2 rounded-lg bg-white dark:bg-zinc-700 dark:text-white text-sm"
                                            >
                                                <option value={1}>{t('every_week')}</option>
                                                <option value={2}>{t('every_2nd_week')}</option>
                                                <option value={3}>{t('every_3rd_week')}</option>
                                                <option value={4}>{t('every_4th_week')}</option>
                                            </select>
                                        </div>
                                        {newSlotFrequency > 1 && (
                                            <div className="flex items-center gap-2 px-1">
                                                <label className="text-xs text-ios-gray uppercase font-semibold whitespace-nowrap">{t('start_week')}:</label>
                                                <select
                                                    value={newSlotOffset}
                                                    onChange={(e) => setNewSlotOffset(parseInt(e.target.value))}
                                                    className="flex-1 px-3 py-2 rounded-lg bg-white dark:bg-zinc-700 dark:text-white text-sm"
                                                >
                                                    <option value={0}>{t('this_week')}</option>
                                                    <option value={1}>{t('next_week')}</option>
                                                    {newSlotFrequency >= 3 && <option value={2}>{t('after_2_weeks')}</option>}
                                                    {newSlotFrequency >= 4 && <option value={3}>{t('after_3_weeks')}</option>}
                                                </select>
                                            </div>
                                        )}
                                        <div className="flex gap-2">
                                            <button
                                                onClick={() => setAddingSlot(false)}
                                                className="flex-1 py-2 rounded-lg bg-gray-200 dark:bg-zinc-600 dark:text-white"
                                            >
                                                {t('cancel')}
                                            </button>
                                            <button
                                                onClick={handleAddSlot}
                                                className="flex-1 py-2 rounded-lg bg-ios-blue text-white font-semibold"
                                            >
                                                {t('add')}
                                            </button>
                                        </div>
                                    </div>
                                )}

                                {/* Lesson Management Actions */}
                                {!isArchived && !addingSlot && !editingSlotId && (allSchedules.filter(s => String(s.group_id) === String(group.id) && s.is_active).length > 0) && (
                                    <div className="flex flex-col gap-2 pt-2">
                                        <button
                                            onClick={handleAlignLessons}
                                            disabled={isSyncing}
                                            className="w-full flex items-center justify-center gap-2 py-2 px-4 rounded-xl bg-ios-blue/10 text-ios-blue text-sm font-semibold active:scale-[0.98] transition-transform disabled:opacity-50"
                                        >
                                            {isSyncing ? (
                                                <RotateCcw className="w-4 h-4 animate-spin" />
                                            ) : (
                                                <AlignCenterHorizontal className="w-4 h-4" />
                                            )}
                                            {showAlignSuccess ? t('lessons_aligned') : t('align_future_lessons')}
                                        </button>
                                        <button
                                            onClick={handleAddLessons}
                                            disabled={isSyncing}
                                            className="w-full flex items-center justify-center gap-2 py-2 px-4 rounded-xl bg-ios-green/10 text-ios-green text-sm font-semibold active:scale-[0.98] transition-transform disabled:opacity-50"
                                        >
                                            <Plus className="w-4 h-4" />
                                            {showAddLessonsSuccess ? t('lessons_added') : t('add_4_lessons')}
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Members */}
                    {!isArchived && (
                        <div>
                            <div className="flex items-center justify-between">
                                <label className="text-sm text-ios-gray uppercase tracking-wider flex items-center gap-2">
                                    <Users className="w-4 h-4" />
                                    {t('students')} ({members.length})
                                </label>
                                <button
                                    onClick={() => setShowStudentSelector(true)}
                                    className="text-ios-blue"
                                >
                                    <Plus className="w-5 h-5" />
                                </button>
                            </div>

                            <div className="space-y-2 mt-2">
                                {members.map(student => (
                                    <div
                                        key={student.id}
                                        className="flex items-center justify-between p-3 bg-ios-background dark:bg-zinc-800 rounded-xl"
                                    >
                                        <span className="dark:text-white">{student.name}</span>
                                        <button
                                            onClick={() => removeStudentFromGroup(student.id!, group.id!)}
                                            className="text-ios-gray hover:text-ios-red p-1"
                                        >
                                            <X className="w-4 h-4" />
                                        </button>
                                    </div>
                                ))}

                                {members.length === 0 && (
                                    <p className="text-ios-gray text-sm py-2">{t('no_students')}</p>
                                )}
                            </div>
                        </div>
                    )}
                </div>

                <StudentSelector
                    isOpen={showStudentSelector}
                    onClose={() => setShowStudentSelector(false)}
                    onSelect={handleStudentSelection}
                    allStudents={allStudents}
                    initialSelectedIds={memberIds}
                />     {/* Footer Actions Inline */}
                <div className="pt-4 border-t border-gray-100 dark:border-zinc-800/50">
                    {!isArchived && (
                        <button
                            onClick={handleArchive}
                            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-ios-gray/10 text-ios-gray font-semibold active:opacity-60 transition-opacity"
                        >
                            <Archive className="w-5 h-5" />
                            {t('archive_group')}
                        </button>
                    )}
                </div>
                {/* Sticky Footer for archived actions only */}
                {isArchived && (
                    <div className="shrink-0 p-4 border-t border-gray-200 dark:border-zinc-800 bg-ios-card dark:bg-zinc-900">
                        <div className="space-y-2">
                            <button
                                onClick={handleRestore}
                                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-ios-green/10 text-ios-green font-semibold"
                            >
                                <RotateCcw className="w-5 h-5" />
                                {t('restore_group')}
                            </button>

                            {!showDeleteConfirm ? (
                                <button
                                    onClick={() => setShowDeleteConfirm(true)}
                                    className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-ios-red/10 text-ios-red font-semibold"
                                >
                                    <Trash2 className="w-5 h-5" />
                                    {t('delete_group')}
                                </button>
                            ) : (
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => setShowDeleteConfirm(false)}
                                        className="flex-1 py-3 rounded-xl bg-gray-200 dark:bg-zinc-700 dark:text-white"
                                    >
                                        {t('cancel')}
                                    </button>
                                    <button
                                        onClick={handleDelete}
                                        className="flex-1 py-3 rounded-xl bg-ios-red text-white font-semibold"
                                    >
                                        {t('confirm_delete')}
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
