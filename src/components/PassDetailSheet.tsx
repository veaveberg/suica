import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Trash2, Hash, Clock, Tag, ChevronsRight } from 'lucide-react';
import { useTelegram } from './TelegramProvider';
import { useData } from '../DataProvider';
import { createPass, updatePass, deletePass } from '../db-server';
import type { Pass } from '../types';
import { cn } from '../utils/cn';

interface PassDetailSheetProps {
    isOpen: boolean;
    onClose: () => void;
    pass?: Pass;
}

export const PassDetailSheet: React.FC<PassDetailSheetProps> = ({ isOpen, onClose, pass }) => {
    const { t } = useTranslation();
    const { groups, passGroups, refreshPasses, refreshPassGroups } = useData();
    const { convexUser, userId: currentTgId } = useTelegram();
    const isAdmin = convexUser?.role === 'admin';
    const isOwner = pass?.userId === String(currentTgId);
    const isStudent = !isAdmin && (convexUser?.role === 'student' || (pass && !!currentTgId && !isOwner));

    const [name, setName] = useState('');
    const [price, setPrice] = useState('');
    const [lessonsCount, setLessonsCount] = useState('');
    const [isConsecutive, setIsConsecutive] = useState(false);
    const [durationDays, setDurationDays] = useState('');
    const [selectedGroups, setSelectedGroups] = useState<string[]>([]);
    const [isDeleting, setIsDeleting] = useState(false);

    useEffect(() => {
        if (pass) {
            setName(pass.name);
            setPrice(String(pass.price));
            setLessonsCount(String(pass.lessons_count));
            setIsConsecutive(pass.is_consecutive || false);
            setDurationDays(String(pass.duration_days || ''));

            const relevantGroupIds = passGroups
                .filter(pg => String(pg.pass_id) === String(pass.id))
                .map(pg => pg.group_id);
            setSelectedGroups(relevantGroupIds);
        } else {
            setName('');
            setPrice('');
            setLessonsCount('');
            setIsConsecutive(false);
            setDurationDays('');
            setSelectedGroups([]);
        }
        setIsDeleting(false);
    }, [pass, passGroups, isOpen]);

    if (!isOpen) return null;

    const handleSave = async () => {
        const passData = {
            name,
            price: Number(price),
            lessons_count: Number(lessonsCount),
            is_consecutive: isConsecutive,
            duration_days: durationDays ? Number(durationDays) : undefined,
        };

        if (pass?.id) {
            await updatePass(pass.id, passData, selectedGroups);
        } else {
            await createPass(passData, selectedGroups);
        }

        await refreshPasses();
        await refreshPassGroups();
        onClose();
    };

    const handleDelete = async () => {
        if (!isDeleting) {
            setIsDeleting(true);
            return;
        }
        if (pass?.id) {
            await deletePass(pass.id);
            await refreshPasses();
            await refreshPassGroups();
            onClose();
        }
    };

    const toggleGroup = (groupId: string) => {
        setSelectedGroups(prev =>
            prev.includes(groupId)
                ? prev.filter(id => id !== groupId)
                : [...prev, groupId]
        );
    };

    return (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

            <div className="relative w-full max-w-lg bg-ios-background dark:bg-black rounded-t-3xl sm:rounded-3xl flex flex-col max-h-[90vh] overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-gray-100 dark:border-zinc-800 bg-ios-card/80 dark:bg-zinc-900/80 backdrop-blur-xl sticky top-0 z-10">
                    <button onClick={onClose} className="text-ios-blue font-medium">{t('cancel')}</button>
                    <h2 className="text-lg font-bold dark:text-white">
                        {pass ? t('edit_pass') : t('create_pass')}
                    </h2>
                    {!isStudent ? (
                        <button
                            onClick={handleSave}
                            disabled={!price || !lessonsCount}
                            className="text-ios-blue font-bold disabled:opacity-30"
                        >
                            {t('save')}
                        </button>
                    ) : (
                        <div className="w-12" />
                    )}
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-4 pb-12 space-y-6">
                    {/* Main Properties Section */}
                    <div className="bg-ios-card dark:bg-zinc-900 rounded-2xl overflow-hidden divide-y divide-gray-100 dark:divide-zinc-800">
                        <div className="flex items-center px-4 py-3 gap-3">
                            <div className="w-8 h-8 rounded-lg bg-ios-blue/10 flex items-center justify-center">
                                <Tag className="w-5 h-5 text-ios-blue" />
                            </div>
                            <input
                                type="text"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                readOnly={isStudent}
                                placeholder={t('pass_nickname')}
                                className="flex-1 bg-transparent border-none focus:ring-0 font-medium dark:text-white"
                            />
                        </div>

                        <div className="flex items-center px-4 py-3 gap-3">
                            <div className="w-8 h-8 rounded-lg bg-ios-green/10 flex items-center justify-center font-bold text-ios-green">
                                ₾
                            </div>
                            <input
                                type="number"
                                value={price}
                                onChange={(e) => setPrice(e.target.value)}
                                readOnly={isStudent}
                                placeholder={t('price')}
                                className="flex-1 bg-transparent border-none focus:ring-0 font-medium dark:text-white"
                            />
                        </div>

                        <div className="flex items-center px-4 py-3 gap-3">
                            <div className="w-8 h-8 rounded-lg bg-ios-blue/10 flex items-center justify-center">
                                <Hash className="w-5 h-5 text-ios-blue" />
                            </div>
                            <input
                                type="number"
                                value={lessonsCount}
                                onChange={(e) => setLessonsCount(e.target.value)}
                                readOnly={isStudent}
                                placeholder={t('lessons_included')}
                                className="flex-1 bg-transparent border-none focus:ring-0 font-medium dark:text-white"
                            />
                        </div>

                        <button
                            onClick={() => !isStudent && setIsConsecutive(!isConsecutive)}
                            className="w-full flex items-center justify-between px-4 py-3 text-left"
                        >
                            <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-lg bg-ios-orange/10 flex items-center justify-center">
                                    <ChevronsRight className="w-5 h-5 text-ios-orange" />
                                </div>
                                <span className="font-medium dark:text-white">{t('consecutive')}</span>
                            </div>
                            <div className={cn(
                                "w-12 h-7 rounded-full p-1 transition-colors",
                                isConsecutive ? "bg-ios-green" : "bg-gray-300 dark:bg-zinc-700"
                            )}>
                                <div className={cn(
                                    "w-5 h-5 bg-white rounded-full shadow transition-transform",
                                    isConsecutive ? "translate-x-5" : "translate-x-0"
                                )} />
                            </div>
                        </button>

                        {!isConsecutive && (
                            <div className="flex items-center px-4 py-3 gap-3 animate-in fade-in slide-in-from-top-2">
                                <div className="w-8 h-8 rounded-lg bg-ios-blue/10 flex items-center justify-center">
                                    <Clock className="w-5 h-5 text-ios-blue" />
                                </div>
                                <input
                                    type="number"
                                    value={durationDays}
                                    onChange={(e) => setDurationDays(e.target.value)}
                                    readOnly={isStudent}
                                    placeholder={t('duration_days') || 'Duration (days)'}
                                    className="flex-1 bg-transparent border-none focus:ring-0 font-medium dark:text-white"
                                />
                            </div>
                        )}
                    </div>

                    {/* Groups Section */}
                    <div className="space-y-2">
                        <label className="text-xs font-semibold text-ios-gray uppercase tracking-wider px-1">
                            {t('apply_to_groups')}
                        </label>
                        <div className="bg-ios-card dark:bg-zinc-900 rounded-2xl overflow-hidden divide-y divide-gray-100 dark:divide-zinc-800">
                            {groups.map((group) => (
                                <button
                                    key={group.id}
                                    onClick={() => !isStudent && toggleGroup(String(group.id))}
                                    className="w-full flex items-center justify-between px-4 py-3 text-left"
                                >
                                    <div className="flex items-center gap-3">
                                        <div
                                            className="w-3 h-3 rounded-full"
                                            style={{ backgroundColor: group.color }}
                                        />
                                        <span className="font-medium dark:text-white">{group.name}</span>
                                    </div>
                                    <div className={cn(
                                        "w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors",
                                        selectedGroups.includes(String(group.id))
                                            ? "bg-ios-blue border-ios-blue"
                                            : "border-gray-200 dark:border-zinc-700"
                                    )}>
                                        <Check className={cn("w-4 h-4 text-white", !selectedGroups.includes(String(group.id)) && "invisible")} />
                                    </div>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Delete Section */}
                    {pass && !isStudent && (
                        <button
                            onClick={handleDelete}
                            className={cn(
                                "w-full flex items-center justify-center gap-2 p-4 rounded-2xl font-bold transition-all",
                                isDeleting
                                    ? "bg-ios-red text-white scale-[0.98]"
                                    : "bg-ios-red/10 text-ios-red"
                            )}
                        >
                            <Trash2 className="w-5 h-5" />
                            <span>{isDeleting ? t('confirm_reset') : t('delete_pass') || 'Delete Pass'}</span>
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};
