import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, CreditCard } from 'lucide-react';
import { useData } from '../DataProvider';
import { PassDetailSheet } from './PassDetailSheet';
import { PassCard } from './PassCard';

export const PassesView: React.FC = () => {
    const { t } = useTranslation();
    const { passes, groups, passGroups, loading } = useData();
    const [selectedPassId, setSelectedPassId] = useState<string | null>(null);
    const [isCreateOpen, setIsCreateOpen] = useState(false);

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

    return (
        <div className="p-4 space-y-4 max-w-2xl mx-auto">
            {/* Create New Pass Button */}
            <button
                onClick={() => setIsCreateOpen(true)}
                className="w-full flex items-center justify-center gap-2 p-4 bg-ios-blue/10 text-ios-blue rounded-2xl font-semibold active:scale-[0.98] transition-transform"
            >
                <Plus className="w-5 h-5" />
                <span>{t('create_pass')}</span>
            </button>

            {/* Passes List */}
            <div className="space-y-3">
                {passes.length === 0 ? (
                    <div className="text-center py-12 text-ios-gray bg-ios-card dark:bg-zinc-900 rounded-3xl">
                        <CreditCard className="w-12 h-12 text-ios-gray/30 mx-auto mb-3" />
                        <p>{t('no_passes_yet') || 'No passes created yet'}</p>
                    </div>
                ) : (
                    passes.map((pass) => (
                        <PassCard
                            key={pass.id}
                            pass={pass}
                            groupsList={getPassGroupsList(String(pass.id))}
                            onClick={() => setSelectedPassId(String(pass.id))}
                        />
                    ))
                )}
            </div>

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
        </div>
    );
};
