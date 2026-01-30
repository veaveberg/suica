import React, { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Search, Check, UserPlus } from 'lucide-react';
import { useTelegram } from './TelegramProvider';
import { useData } from '../DataProvider';
import * as api from '../api';
import { useSearchParams } from '../hooks/useSearchParams';
import type { Student } from '../types';
import { cn } from '../utils/cn';

interface StudentSelectorProps {
    isOpen: boolean;
    onClose: () => void;
    onSelect: (studentIds: string[]) => void;
    allStudents: Student[];
    initialSelectedIds: string[];
}

export const StudentSelector: React.FC<StudentSelectorProps> = ({
    isOpen,
    onClose,
    onSelect,
    allStudents,
    initialSelectedIds
}) => {
    const { t } = useTranslation();
    const { refreshStudents } = useData();
    const { userId: currentTgId } = useTelegram();
    const { setParam } = useSearchParams();
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set(initialSelectedIds));
    const [isCreating, setIsCreating] = useState(false);

    // Reset selection when opening if needed, but here we use initialSelectedIds
    useMemo(() => {
        if (isOpen) {
            setSelectedIds(new Set(initialSelectedIds));
        }
    }, [isOpen, initialSelectedIds]);

    const filteredStudents = useMemo(() => {
        return allStudents.filter(s =>
            s.name.trim().length > 0 && (
                s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                s.telegram_username?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                s.instagram_username?.toLowerCase().includes(searchQuery.toLowerCase())
            )
        ).sort((a, b) => a.name.localeCompare(b.name));
    }, [allStudents, searchQuery]);

    const toggleStudent = (id: string) => {
        const newSelected = new Set(selectedIds);
        if (newSelected.has(id)) {
            newSelected.delete(id);
        } else {
            newSelected.add(id);
        }
        setSelectedIds(newSelected);
    };

    const handleCreateStudent = async () => {
        if (isCreating) return;
        setIsCreating(true);
        try {
            const newStudent = await api.create<Student>('students', {
                name: '',
            });

            if (currentTgId) {
                newStudent.userId = String(currentTgId);
            }

            await refreshStudents();
            setParam('studentId', String(newStudent.id));
        } finally {
            setIsCreating(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center">
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

            <div className="relative w-full max-w-lg h-[90vh] bg-ios-background dark:bg-black rounded-t-3xl sm:rounded-3xl overflow-hidden flex flex-col shadow-2xl animate-in slide-in-from-bottom duration-300">
                {/* Header */}
                <div className="shrink-0 flex items-center justify-between px-4 py-3 bg-ios-card dark:bg-zinc-900 border-b border-gray-200 dark:border-zinc-800">
                    <button onClick={onClose} className="text-ios-blue text-lg px-2 active:opacity-50">
                        {t('cancel')}
                    </button>
                    <h2 className="font-bold text-lg dark:text-white">
                        {t('students')}
                    </h2>
                    <button
                        onClick={() => {
                            onSelect(Array.from(selectedIds));
                            onClose();
                        }}
                        className="text-ios-blue font-bold text-lg px-2 active:opacity-50"
                    >
                        {t('done')}
                    </button>
                </div>

                {/* Search Bar */}
                <div className="shrink-0 p-4 bg-ios-background dark:bg-black flex gap-3">
                    <div className="relative flex-1">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-ios-gray" />
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder={t('search')}
                            className="w-full pl-12 pr-4 py-3 rounded-2xl bg-ios-card dark:bg-zinc-900 border border-gray-100 dark:border-zinc-800 focus:ring-2 focus:ring-ios-blue dark:text-white shadow-sm outline-none"
                        />
                    </div>
                    <button
                        onClick={handleCreateStudent}
                        disabled={isCreating}
                        className="p-3 rounded-2xl bg-ios-blue text-white active:scale-90 transition-transform disabled:opacity-50"
                    >
                        <UserPlus className="w-5 h-5" />
                    </button>
                </div>

                {/* Students List in Grouped Style */}
                <div className="flex-1 overflow-y-auto">
                    <div className="mx-4 mt-2 bg-ios-card dark:bg-zinc-900 rounded-xl overflow-hidden shadow-sm">
                        {filteredStudents.map((student, index) => {
                            const isSelected = selectedIds.has(String(student.id));
                            return (
                                <button
                                    key={student.id}
                                    onClick={() => toggleStudent(String(student.id))}
                                    className={cn(
                                        "w-full flex items-center justify-between p-4 transition-all active:bg-gray-100 dark:active:bg-zinc-800 text-left",
                                        index !== 0 && "border-t border-gray-100 dark:border-zinc-800"
                                    )}
                                >
                                    <div className="flex flex-col">
                                        <span className="text-[17px] font-medium dark:text-white leading-tight">{student.name}</span>
                                        {student.telegram_username && (
                                            <span className="text-[13px] text-ios-gray">@{student.telegram_username}</span>
                                        )}
                                    </div>
                                    {isSelected ? (
                                        <div className="w-6 h-6 rounded-full bg-ios-blue flex items-center justify-center">
                                            <Check className="w-4 h-4 text-white" />
                                        </div>
                                    ) : (
                                        <div className="w-6 h-6 rounded-full border-2 border-gray-200 dark:border-zinc-700" />
                                    )}
                                </button>
                            );
                        })}

                        {filteredStudents.length === 0 && (
                            <div className="text-center py-12 text-ios-gray">
                                <p>{t('nothing_found')}</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};
