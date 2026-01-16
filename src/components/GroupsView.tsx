import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useData } from '../DataProvider';
import { createGroup } from '../db-server';
import { Plus, ChevronDown, ChevronRight, Archive } from 'lucide-react';
import type { Group } from '../types';
import { GroupDetailSheet } from './GroupDetailSheet';

export const GroupsView: React.FC = () => {
    const { t, i18n } = useTranslation();
    const [showArchived, setShowArchived] = useState(false);
    const [selectedGroup, setSelectedGroup] = useState<Group | null>(null);
    const [isCreating, setIsCreating] = useState(false);
    const [newGroupName, setNewGroupName] = useState('');

    const { groups, schedules, refreshGroups, refreshSchedules, refreshLessons } = useData();

    const activeGroups = groups.filter(g => g.status === 'active');
    const archivedGroups = groups.filter(g => g.status === 'archived');

    const getScheduleSummary = (group: Group) => {
        const groupSchedules = schedules.filter(s => String(s.group_id) === String(group.id) && s.is_active);
        if (groupSchedules.length === 0) return t('no_schedule');

        const lang = i18n.language.toUpperCase();
        const locale = lang === 'KA' ? 'ka-GE' : lang === 'RU' ? 'ru-RU' : 'en-US';

        // Helper to format day of week
        const getDayName = (day: number) => {
            const date = new Date(2024, 0, day + 7); // Jan 7, 2024 was a Sunday
            return date.toLocaleDateString(locale, { weekday: 'short' });
        };

        // Helper to format time (hide :00)
        const formatT = (h: number, m: number) => {
            return m === 0 ? `${h}` : `${h}:${m.toString().padStart(2, '0')}`;
        };

        const formatRange = (timeStr: string, durationMinutes: number) => {
            const [h, m] = timeStr.split(':').map(Number);
            const start = new Date();
            start.setHours(h, m, 0, 0);
            const end = new Date(start.getTime() + durationMinutes * 60000);
            return `${formatT(h, m)}–${formatT(end.getHours(), end.getMinutes())}`;
        };

        return groupSchedules
            .map(s => `${getDayName(s.day_of_week)} ${formatRange(s.time, s.duration_minutes || group.default_duration_minutes)}`)
            .join(', ');
    };

    const handleCreateGroup = async () => {
        if (!newGroupName.trim()) return;

        try {
            await createGroup(newGroupName.trim());
            setNewGroupName('');
            setIsCreating(false);
            await refreshGroups();
            await refreshSchedules();
            await refreshLessons();
        } catch (error) {
            alert(error instanceof Error ? error.message : 'Failed to create group');
        }
    };

    return (
        <div className="p-4">
            {/* Create New Group Button */}
            {!isCreating && (
                <button
                    onClick={() => setIsCreating(true)}
                    className="w-full flex items-center justify-center gap-2 p-4 mb-4 bg-ios-blue/10 text-ios-blue rounded-2xl font-semibold active:scale-[0.98] transition-transform"
                >
                    <Plus className="w-5 h-5" />
                    {t('create_group') || 'Create Group'}
                </button>
            )}

            {/* New Group Input */}
            {isCreating && (
                <div className="p-4 ios-card dark:bg-zinc-900 border border-gray-100 dark:border-zinc-800 rounded-2xl mb-4">
                    <input
                        type="text"
                        value={newGroupName}
                        onChange={(e) => setNewGroupName(e.target.value)}
                        placeholder={t('group_name')}
                        className="w-full px-4 py-3 rounded-xl bg-ios-background dark:bg-zinc-800 dark:text-white"
                        autoFocus
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') handleCreateGroup();
                            if (e.key === 'Escape') setIsCreating(false);
                        }}
                    />
                    <div className="flex gap-2 mt-3">
                        <button
                            onClick={() => setIsCreating(false)}
                            className="flex-1 py-2 px-4 rounded-xl bg-gray-200 dark:bg-zinc-700 dark:text-white"
                        >
                            {t('cancel')}
                        </button>
                        <button
                            onClick={handleCreateGroup}
                            className="flex-1 py-2 px-4 rounded-xl bg-ios-blue text-white font-semibold"
                        >
                            {t('create')}
                        </button>
                    </div>
                </div>
            )}

            {/* Active Groups */}
            <div className="space-y-2">
                {activeGroups.map(group => (
                    <button
                        key={group.id}
                        onClick={() => setSelectedGroup(group)}
                        className="w-full flex items-center gap-3 p-4 ios-card dark:bg-zinc-900 border border-gray-100 dark:border-zinc-800 rounded-2xl active:scale-[0.98] transition-transform text-left"
                    >
                        <div
                            className="w-4 h-4 rounded-full flex-shrink-0"
                            style={{ backgroundColor: group.color }}
                        />
                        <div className="flex-1 min-w-0">
                            <h3 className="font-semibold dark:text-white truncate">{group.name}</h3>
                            <p className="text-sm text-ios-gray truncate">
                                {getScheduleSummary(group)}
                            </p>
                        </div>
                        <ChevronRight className="w-5 h-5 text-ios-gray flex-shrink-0" />
                    </button>
                ))}

                {activeGroups.length === 0 && !isCreating && (
                    <div className="text-center py-12 text-ios-gray">
                        <p>{t('no_groups')}</p>
                    </div>
                )}
            </div>

            {/* Archived Groups */}
            {archivedGroups.length > 0 && (
                <div className="mt-6">
                    <button
                        onClick={() => setShowArchived(!showArchived)}
                        className="flex items-center gap-2 py-2 text-ios-gray"
                    >
                        {showArchived ? (
                            <ChevronDown className="w-4 h-4" />
                        ) : (
                            <ChevronRight className="w-4 h-4" />
                        )}
                        <Archive className="w-4 h-4" />
                        <span className="text-sm font-medium">
                            {t('archived')} ({archivedGroups.length})
                        </span>
                    </button>

                    {showArchived && (
                        <div className="space-y-2 mt-2">
                            {archivedGroups.map(group => (
                                <button
                                    key={group.id}
                                    onClick={() => setSelectedGroup(group)}
                                    className="w-full flex items-center gap-3 p-4 ios-card dark:bg-zinc-900/50 border border-gray-100/50 dark:border-zinc-800/50 rounded-2xl text-left opacity-60"
                                >
                                    <div
                                        className="w-4 h-4 rounded-full flex-shrink-0"
                                        style={{ backgroundColor: group.color }}
                                    />
                                    <div className="flex-1 min-w-0">
                                        <h3 className="font-semibold dark:text-white truncate">{group.name}</h3>
                                    </div>
                                    <ChevronRight className="w-5 h-5 text-ios-gray flex-shrink-0" />
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* Group Detail Sheet */}
            {selectedGroup && (
                <GroupDetailSheet
                    group={selectedGroup}
                    onClose={() => setSelectedGroup(null)}
                />
            )}
        </div>
    );
};
