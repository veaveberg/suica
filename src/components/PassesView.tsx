import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, CreditCard, Instagram } from 'lucide-react';
import { useTelegram } from './TelegramProvider';
import { useData } from '../DataProvider';
import { TelegramIcon } from './Icons';
import { PassDetailSheet } from './PassDetailSheet';
import { PassCard } from './PassCard';

import { useSearchParams } from '../hooks/useSearchParams';
import type { Pass } from '../types';

export const PassesView: React.FC = () => {
    const { t } = useTranslation();
    const { getParam, setParam } = useSearchParams();
    const { passes, groups, passGroups, loading } = useData();
    const { convexUser, userId: currentTgId } = useTelegram();
    const [selectedPassId, setSelectedPassId] = useState<string | null>(null);

    const isStudentGlobal = convexUser?.role === 'student';

    const isCreateOpen = getParam('sheet') === 'create_pass';
    const setIsCreateOpen = (val: boolean) => {
        if (val) setParam('sheet', 'create_pass');
        else setParam('sheet', null);
    };

    if (loading && passes.length === 0) {
        return (
            <div className="flex items-center justify-center min-h-[50vh]">
                <div className="animate-pulse text-ios-gray">{t('loading')}...</div>
            </div>
        );
    }

    const getPassGroupsList = (passId: string) => {
        const relevantGroupIds = passGroups
            .filter(pg => String(pg.pass_id) === String(passId))
            .map(pg => pg.group_id);

        return groups.filter(g => relevantGroupIds.includes(String(g.id)));
    };

    const myPasses = passes.filter(p => !currentTgId || p.userId === String(currentTgId));
    const studentPasses = passes.filter(p => currentTgId && p.userId !== String(currentTgId));


    return (
        <div className="p-4 space-y-8 max-w-2xl mx-auto">
            {/* Management Section */}
            {!isStudentGlobal && (
                <div className="space-y-4">
                    {studentPasses.length > 0 && (
                        <h3 className="text-xl font-bold dark:text-white px-1">
                            {t('my_passes')}
                        </h3>
                    )}
                    <button
                        onClick={() => setIsCreateOpen(true)}
                        className="w-full flex items-center justify-center gap-2 p-4 bg-ios-blue/10 text-ios-blue rounded-2xl font-semibold active:scale-[0.98] transition-transform"
                    >
                        <Plus className="w-5 h-5" />
                        <span>{t('create_pass')}</span>
                    </button>
                    {myPasses.length > 0 && (
                        <div className="space-y-3">
                            {myPasses.map((pass) => (
                                <PassCard
                                    key={pass.id}
                                    pass={pass}
                                    groupsList={getPassGroupsList(String(pass.id))}
                                    onClick={() => setSelectedPassId(String(pass.id))}
                                />
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* Empty State (Only if absolutely nothing to show) */}
            {passes.length === 0 && (
                <div className="text-center py-12 text-ios-gray bg-ios-card dark:bg-zinc-900 rounded-3xl">
                    <CreditCard className="w-12 h-12 text-ios-gray/30 mx-auto mb-3" />
                    <p>{t('no_passes_yet') || 'No passes created yet'}</p>
                </div>
            )}

            {/* Student Section (For everyone if they have such passes) */}
            {studentPasses.length > 0 && (() => {
                const teachersMap = new Map<string, Pass[]>();

                studentPasses.forEach(pass => {
                    const teacherName = pass.teacherName || "Teacher";
                    if (!teachersMap.has(teacherName)) {
                        teachersMap.set(teacherName, []);
                    }
                    teachersMap.get(teacherName)!.push(pass);
                });

                return Array.from(teachersMap.entries()).map(([teacherName, groupPasses]) => {
                    const firstPass = groupPasses[0];
                    const tgUsername = firstPass.teacherUsername;
                    const igUsername = firstPass.teacherInstagram;
                    const teacherId = firstPass.userId;

                    let tgUrl = null;
                    if (tgUsername) {
                        tgUrl = `https://t.me/${tgUsername.replace('@', '')}`;
                    } else if (teacherId) {
                        tgUrl = `tg://user?id=${teacherId}`;
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
                                        >
                                            <TelegramIcon className="w-4 h-4" />
                                            <span className="text-xs font-bold">
                                                {tgUsername ? `@${tgUsername.replace('@', '')}` : t('chat_in_telegram')}
                                            </span>
                                        </a>
                                    )}
                                    {igUsername && (
                                        <a
                                            href={`https://instagram.com/${igUsername.replace('@', '')}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="flex items-center gap-1.5 px-3 py-1.5 bg-[#E1306C]/10 text-[#E1306C] rounded-xl font-bold active:scale-95 transition-transform"
                                        >
                                            <Instagram className="w-4 h-4" />
                                            <span className="text-xs font-bold">
                                                @{igUsername.replace('@', '')}
                                            </span>
                                        </a>
                                    )}
                                </div>
                            </div>
                            <div className="space-y-3">
                                {groupPasses.map(pass => (
                                    <PassCard
                                        key={pass.id}
                                        pass={pass}
                                        groupsList={getPassGroupsList(String(pass.id))}
                                        showChevron={false}
                                    />
                                ))}
                            </div>
                        </div>
                    );
                });
            })()}

            {/* Edit / Create Sheets */}
            <PassDetailSheet
                isOpen={isCreateOpen}
                onClose={() => setIsCreateOpen(false)}
            />

            {selectedPassId && (
                <PassDetailSheet
                    isOpen={!!selectedPassId}
                    onClose={() => setSelectedPassId(null)}
                    pass={passes.find(p => String(p.id) === selectedPassId)}
                />
            )}

            {/* Student Interest Popup - REMOVED per user request */}
        </div>
    );
};
