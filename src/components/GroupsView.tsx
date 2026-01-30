import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useData } from '../DataProvider';

import { ChevronDown, ChevronRight, Archive, Instagram } from 'lucide-react';
import { TelegramIcon } from './Icons';
import { useTelegram } from './TelegramProvider';
import type { Group } from '../types';
import { GroupDetailSheet } from './GroupDetailSheet';
import { BalanceAuditSheet } from './BalanceAuditSheet';
import { useMemo } from 'react';
import { getScheduleSummary } from '../utils/formatting';
import { calculateStudentGroupBalanceWithAudit } from '../utils/balance';
import { useSearchParams } from '../hooks/useSearchParams';

export const GroupsView: React.FC = () => {
    const { t, i18n } = useTranslation();
    const { getParam, setParam } = useSearchParams();
    const [showArchived, setShowArchived] = useState(false);
    const { convexUser, userId: currentTgId } = useTelegram();
    const isStudentGlobal = convexUser?.role === 'student';
    const isAdmin = convexUser?.role === 'admin';

    const isCreating = getParam('sheet') === 'create_group';

    const { groups, schedules, students, studentGroups, subscriptions, attendance, lessons } = useData();

    // Calculate enrolled group IDs for everyone (including Teachers who are students)
    const enrolledGroupIds = useMemo(() => {
        if (!currentTgId) return null;
        const myStudentIds = students
            .filter(s => s.telegram_id === String(currentTgId))
            .map(s => s.id);

        const groupIds = new Set<string>();

        // 1. Explicit enrollments
        studentGroups
            .filter(sg => myStudentIds.includes(String(sg.student_id)))
            .forEach(sg => groupIds.add(String(sg.group_id)));

        // 2. Implied enrollments via Subscriptions/Passes
        subscriptions
            .filter(sub => myStudentIds.includes(String(sub.user_id)))
            .forEach(sub => groupIds.add(String(sub.group_id)));

        return groupIds;
    }, [currentTgId, students, studentGroups, subscriptions]);

    const activeGroups = groups.filter(g => {
        if (g.status !== 'active') return false;

        // 1. I own the group -> Show it
        if (g.userId === String(currentTgId)) return true;

        // 2. I am enrolled in the group -> Show it
        if (enrolledGroupIds && enrolledGroupIds.has(String(g.id))) return true;

        // Otherwise hide it (e.g. groups from my teachers that I haven't joined yet)
        return false;
    });

    // Split into "My Groups" and "Student Groups" (where I am a student)
    const myGroups = activeGroups.filter(g => g.userId === String(currentTgId));
    const studentGroupsList = activeGroups.filter(g => g.userId !== String(currentTgId));

    const archivedGroups = groups.filter(g => g.status === 'archived');

    const groupIdParam = getParam('groupId');
    const selectedGroup = groups.find(g => String(g.id) === groupIdParam) || null;

    const isOwner = selectedGroup?.userId === String(currentTgId);
    const shouldShowAudit = selectedGroup && !isAdmin && (isStudentGlobal || !isOwner);

    // ... existing auditData ...
    const auditData = useMemo(() => {
        if (!shouldShowAudit || !selectedGroup || !currentTgId) return null;

        // Find the student record for this user under this teacher (group owner)
        const studentRec = students.find(s =>
            s.telegram_id === String(currentTgId) &&
            s.userId === selectedGroup.userId
        );

        if (!studentRec?.id) return null;

        return {
            result: calculateStudentGroupBalanceWithAudit(
                studentRec.id,
                selectedGroup.id!,
                subscriptions,
                attendance,
                lessons
            ),
            studentSubscriptions: subscriptions.filter(s => String(s.user_id) === String(studentRec.id))
        };
    }, [shouldShowAudit, selectedGroup, currentTgId, students, subscriptions, attendance, lessons]);






    // Helper has to be updated to rely on group owner, not global role
    const getGroupBalance = (group: Group) => {
        // If I own the group, no balance to show (unless I'm also a student in my own group? Unlikely/Edge case)
        if (group.userId === String(currentTgId)) return null;

        // I am likely a student in this group
        const studentRec = students.find(s =>
            s.telegram_id === String(currentTgId) &&
            s.userId === group.userId
        );

        if (!studentRec) return null;

        const { balance } = calculateStudentGroupBalanceWithAudit(
            studentRec.id!,
            group.id!,
            subscriptions,
            attendance,
            lessons
        );

        return balance;
    };

    return (
        <div className="p-4">

            {/* Active Groups */}
            {/* Active Groups Section */}
            <div className="space-y-8">
                {/* 1. My Groups (Created by me) */}
                {(myGroups.length > 0 || !isStudentGlobal) && (
                    <div className="space-y-4">
                        {/* Only show title if we have both types of groups, to distinguish */}
                        {(studentGroupsList.length > 0) && (
                            <h3 className="text-xl font-bold dark:text-white px-1">
                                {t('my_groups') || 'My Groups'}
                            </h3>
                        )}

                        {/* Wrapper for list of my groups */}
                        <div className="space-y-2">
                            {myGroups.map(group => (
                                <button
                                    key={group.id}
                                    onClick={() => setParam('groupId', String(group.id))}
                                    className="w-full flex items-center justify-between p-4 ios-card dark:bg-zinc-900 border border-gray-100 dark:border-zinc-800 rounded-2xl active:scale-[0.98] transition-transform text-left"
                                >
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-3 mb-1">
                                            <div
                                                className="w-4 h-4 rounded-full flex-shrink-0"
                                                style={{ backgroundColor: group.color }}
                                            />
                                            <h3 className="text-xl font-bold dark:text-white leading-none truncate">{group.name}</h3>
                                        </div>
                                        <p className="text-sm text-ios-gray pl-7 truncate">
                                            {getScheduleSummary(group, schedules, t, i18n)}
                                        </p>
                                    </div>
                                    <ChevronRight className="w-5 h-5 text-ios-gray flex-shrink-0 ml-2" />
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {/* 2. Student Groups (Categorized by Teacher) */}
                {studentGroupsList.length > 0 && (() => {
                    const teachersMap = new Map<string, Group[]>();

                    studentGroupsList.forEach(g => {
                        const teacherName = g.teacherName || "Teacher";
                        if (!teachersMap.has(teacherName)) {
                            teachersMap.set(teacherName, []);
                        }
                        teachersMap.get(teacherName)!.push(g);
                    });

                    return Array.from(teachersMap.entries()).map(([teacherName, groupList]) => {
                        const firstGroup = groupList[0];
                        const tgUsername = firstGroup.teacherUsername;
                        const igUsername = firstGroup.teacherInstagram;

                        let tgUrl = null;
                        if (tgUsername) {
                            tgUrl = `https://t.me/${tgUsername.replace('@', '')}`;
                        }

                        return (
                            <div key={teacherName} className="space-y-4">
                                <div className="flex items-center justify-between px-1">
                                    <h3 className="text-xl font-bold dark:text-white">
                                        {teacherName}
                                    </h3>
                                    <div className="flex gap-2">
                                        {tgUrl && (
                                            <a
                                                href={tgUrl}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="flex items-center gap-1.5 px-3 py-1.5 bg-[#007AFF]/10 text-ios-blue rounded-xl font-bold active:scale-95 transition-transform"
                                                onClick={(e) => e.stopPropagation()}
                                            >
                                                <TelegramIcon className="w-4 h-4" />
                                                <span className="text-xs font-bold">
                                                    {tgUsername ? `@${tgUsername.replace('@', '')}` : t('chat')}
                                                </span>
                                            </a>
                                        )}
                                        {igUsername && (
                                            <a
                                                href={`https://instagram.com/${igUsername.replace('@', '')}`}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="flex items-center gap-1.5 px-3 py-1.5 bg-[#E1306C]/10 text-[#E1306C] rounded-xl font-bold active:scale-95 transition-transform"
                                                onClick={(e) => e.stopPropagation()}
                                            >
                                                <Instagram className="w-4 h-4" />
                                                <span className="text-xs font-bold">
                                                    @{igUsername.replace('@', '')}
                                                </span>
                                            </a>
                                        )}
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    {groupList.map(group => {
                                        const balance = getGroupBalance(group);

                                        return (
                                            <button
                                                key={group.id}
                                                onClick={() => setParam('groupId', String(group.id))}
                                                className="w-full flex items-center justify-between p-4 ios-card dark:bg-zinc-900 border border-gray-100 dark:border-zinc-800 rounded-2xl active:scale-[0.98] transition-transform text-left"
                                            >
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-3 mb-1">
                                                        <div
                                                            className="w-4 h-4 rounded-full flex-shrink-0"
                                                            style={{ backgroundColor: group.color }}
                                                        />
                                                        <h3 className="text-xl font-bold dark:text-white leading-none truncate">{group.name}</h3>
                                                    </div>
                                                    <p className="text-sm text-ios-gray pl-7 truncate">
                                                        {group.teacherName}
                                                    </p>
                                                </div>

                                                <div className="flex items-center gap-2">
                                                    {balance !== null && (
                                                        <div className={`text-sm font-bold px-2 py-1 rounded-lg ${balance > 0 ? 'bg-ios-green/10 text-ios-green' : 'bg-ios-red/10 text-ios-red'
                                                            }`}>
                                                            {balance > 0 ? `+${balance}` : balance}
                                                        </div>
                                                    )}
                                                    <ChevronRight className="w-5 h-5 text-ios-gray flex-shrink-0" />
                                                </div>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        );
                    });
                })()}

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
                                    onClick={() => setParam('groupId', String(group.id))}
                                    className="w-full flex items-center gap-3 p-4 ios-card dark:bg-zinc-900/50 border border-gray-100/50 dark:border-zinc-800/50 rounded-2xl text-left opacity-60"
                                >
                                    <div
                                        className="w-4 h-4 rounded-full flex-shrink-0"
                                        style={{ backgroundColor: group.color }}
                                    />
                                    <div className="flex-1 min-w-0">
                                        <h3 className="font-semibold dark:text-white truncate">{group.name}</h3>
                                        {isStudentGlobal && group.teacherName && (
                                            <p className="text-xs text-ios-gray/70 truncate">{group.teacherName}</p>
                                        )}
                                    </div>
                                    <ChevronRight className="w-5 h-5 text-ios-gray flex-shrink-0" />
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* Group Detail Sheet or Balance Audit */}
            {selectedGroup && (
                shouldShowAudit && auditData ? (
                    <BalanceAuditSheet
                        isOpen={!!selectedGroup}
                        onClose={() => setParam('groupId', null)}
                        auditResult={auditData.result}
                        group={selectedGroup}
                        subscriptions={auditData.studentSubscriptions}
                    />
                ) : (
                    <GroupDetailSheet
                        group={selectedGroup}
                        onClose={() => setParam('groupId', null)}
                    />
                )
            )}
        </div>
    );
};
