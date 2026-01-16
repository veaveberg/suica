import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { X, AtSign, Instagram } from 'lucide-react';
import type { Student } from '../types';
import { useData } from '../DataProvider';
import * as api from '../api';
import { addStudentToGroup } from '../db-server';

interface AddStudentModalProps {
    isOpen: boolean;
    onClose: () => void;
    _onAdd: (student: Omit<Student, 'id'>) => void;
}

export const AddStudentModal: React.FC<AddStudentModalProps> = ({ isOpen, onClose }) => {
    const { t } = useTranslation();
    const [name, setName] = useState('');
    const [tgUsername, setTgUsername] = useState('');
    const [igUsername, setIgUsername] = useState('');
    const [notes, setNotes] = useState('');
    const [groupId, setGroupId] = useState('');

    const { groups, refreshStudents, refreshStudentGroups } = useData();
    const activeGroups = groups.filter(g => g.status === 'active');

    // Set default group when groups are loaded
    useEffect(() => {
        if (activeGroups.length > 0 && !groupId) {
            setGroupId(activeGroups[0].id?.toString() || '');
        }
    }, [activeGroups, groupId]);

    // Reset fields when opening
    useEffect(() => {
        if (isOpen) {
            setName('');
            setTgUsername('');
            setIgUsername('');
            setNotes('');
            if (activeGroups.length > 0) {
                setGroupId(activeGroups[0].id?.toString() || '');
            } else {
                setGroupId('');
            }
        }
    }, [isOpen, activeGroups]);

    const handleSave = async () => {
        if (!name.trim()) return;

        const newStudent: Omit<Student, 'id'> = {
            name: name.trim(),
            telegram_username: tgUsername.trim() || undefined,
            instagram_username: igUsername.trim() || undefined,
            notes: notes.trim() || undefined
        };

        const addedStudent = await api.create<Student>('students', newStudent);

        if (groupId && addedStudent.id) {
            await addStudentToGroup(addedStudent.id.toString(), groupId);
            await refreshStudentGroups();
        }

        await refreshStudents();
        onClose();
    };

    return (
        <div className={`fixed inset-0 z-50 flex items-end sm:items-center justify-center transition-opacity duration-300 ${isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

            <div className={`relative w-full max-w-lg max-h-[90vh] bg-ios-card dark:bg-zinc-900 rounded-t-3xl sm:rounded-3xl shadow-2xl transition-transform duration-300 transform flex flex-col ${isOpen ? 'translate-y-0' : 'translate-y-full'}`}>
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-zinc-800">
                    <button onClick={onClose} className="p-1">
                        <X className="w-6 h-6 text-ios-gray" />
                    </button>
                    <h2 className="font-bold text-lg dark:text-white">
                        {t('add_student')}
                    </h2>
                    <button
                        onClick={handleSave}
                        disabled={!name.trim()}
                        className="text-ios-blue font-semibold disabled:opacity-50"
                    >
                        {t('save')}
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-4 space-y-6">
                    {/* Basic Info Grid */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <label className="text-[10px] font-black text-ios-gray uppercase tracking-widest px-1">
                                {t('student_name')}
                            </label>
                            <input
                                autoFocus
                                type="text"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                className="w-full mt-1 px-4 py-3 rounded-xl bg-ios-background dark:bg-zinc-800 dark:text-white"
                                placeholder={t('student_name')}
                                required
                            />
                        </div>

                        {activeGroups.length > 0 && (
                            <div>
                                <label className="text-[10px] font-black text-ios-gray uppercase tracking-widest px-1">
                                    {t('groups')}
                                </label>
                                <div className="relative mt-1">
                                    <select
                                        value={groupId}
                                        onChange={(e) => setGroupId(e.target.value)}
                                        className="w-full pl-3 pr-3 py-3 rounded-xl bg-ios-background dark:bg-zinc-800 dark:text-white appearance-none border-none focus:ring-0"
                                    >
                                        <option value="">{t('select_group')}</option>
                                        {activeGroups.map(g => (
                                            <option key={g.id} value={g.id?.toString()}>
                                                {g.name}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Socials Grid */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <label className="text-[10px] font-black text-ios-gray uppercase tracking-widest px-1">
                                {t('tg_username')}
                            </label>
                            <div className="relative mt-1">
                                <AtSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ios-gray" />
                                <input
                                    type="text"
                                    value={tgUsername}
                                    onChange={(e) => setTgUsername(e.target.value)}
                                    className="w-full pl-9 pr-3 py-3 rounded-xl bg-ios-background dark:bg-zinc-800 dark:text-white"
                                    placeholder="username"
                                />
                            </div>
                        </div>

                        <div>
                            <label className="text-[10px] font-black text-ios-gray uppercase tracking-widest px-1">
                                {t('ig_username')}
                            </label>
                            <div className="relative mt-1">
                                <Instagram className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ios-gray" />
                                <input
                                    type="text"
                                    value={igUsername}
                                    onChange={(e) => setIgUsername(e.target.value)}
                                    className="w-full pl-9 pr-3 py-3 rounded-xl bg-ios-background dark:bg-zinc-800 dark:text-white"
                                    placeholder="username"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Notes Section */}
                    <section>
                        <label className="text-[10px] font-black text-ios-gray uppercase tracking-widest px-1 mb-1 block">
                            {t('note')}
                        </label>
                        <textarea
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            className="w-full px-4 py-3 text-sm dark:text-white bg-ios-background dark:bg-zinc-800 border border-transparent dark:border-zinc-800 rounded-2xl resize-none"
                            placeholder={t('note') || 'Note'}
                            rows={3}
                        />
                    </section>
                </div>
            </div>
        </div>
    );
};
