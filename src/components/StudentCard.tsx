import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Plus, AlertCircle, Layers, Instagram, CreditCard, ChevronDown, ChevronUp, ChevronRight } from 'lucide-react';
import type { Subscription, Student, Group } from '../types';
import { BuySubscriptionModal } from './BuySubscriptionModal';
import { SubscriptionDetailSheet } from './SubscriptionDetailSheet';
import { BalanceAuditSheet } from './BalanceAuditSheet';
import { PassCard } from './PassCard';
import { useData } from '../DataProvider';
import { addStudentToGroup, removeStudentFromGroup } from '../db-server';
import * as api from '../api';
import { calculateStudentGroupBalance, calculateStudentGroupBalanceWithAudit } from '../utils/balance';
import type { BalanceAuditResult } from '../utils/balance';
import { TelegramIcon } from './Icons';

interface StudentCardProps {
    isOpen: boolean;
    student: Student | null;
    subscriptions: Subscription[];
    onClose: () => void;
    onBuySubscription: (sub: Omit<Subscription, 'id'>) => void;
    readOnly?: boolean;
}

export const StudentCard: React.FC<StudentCardProps> = ({
    isOpen,
    student,
    subscriptions,
    onClose,
    onBuySubscription,
    readOnly = false
}) => {
    const { t } = useTranslation();

    const [isBuyModalOpen, setIsBuyModalOpen] = useState(false);
    const [addingToGroup, setAddingToGroup] = useState(false);
    const [selectedGroupId, setSelectedGroupId] = useState('');

    // Edit state for all fields
    const [editName, setEditName] = useState('');
    const [editTelegram, setEditTelegram] = useState('');
    const [editInstagram, setEditInstagram] = useState('');
    const [editNotes, setEditNotes] = useState('');
    const [editingSub, setEditingSub] = useState<Subscription | null>(null);
    const [isArchiveOpen, setIsArchiveOpen] = useState(false);
    const [auditingGroup, setAuditingGroup] = useState<{ groupId: string; group: Group; auditResult: BalanceAuditResult } | null>(null);

    const { groups: allGroupsRaw, studentGroups, refreshStudentGroups, refreshStudents, subscriptions: allSubscriptions, lessons, passes, attendance } = useData();
    const activeGroups = allGroupsRaw.filter(g => g.status === 'active');

    // Reset edit state when student changes or sheet opens
    useEffect(() => {
        if (student && isOpen) {
            setEditName(student.name || '');
            setEditTelegram(student.telegram_username || '');
            setEditInstagram(student.instagram_username || '');
            setEditNotes(student.notes || '');
            setEditingSub(null);
        }
    }, [student, isOpen]);

    // Keep audit result in sync with live data
    useEffect(() => {
        if (auditingGroup && student && student.id) {
            const freshResult = calculateStudentGroupBalanceWithAudit(
                student.id, auditingGroup.groupId, allSubscriptions, attendance, lessons
            );
            // Check if result actually changed to avoid unnecessary re-renders
            if (JSON.stringify(freshResult) !== JSON.stringify(auditingGroup.auditResult)) {
                setAuditingGroup(prev => prev ? { ...prev, auditResult: freshResult } : null);
            }
        }
    }, [attendance, allSubscriptions, lessons, student, auditingGroup?.groupId]);

    if (!student) return null;

    const memberAssignments = studentGroups.filter(sg => String(sg.student_id) === String(student.id));
    const memberGroupIds = memberAssignments.map(a => String(a.group_id));
    const studentGroupsList = activeGroups.filter(g => memberGroupIds.includes(String(g.id)));

    const handleAddToGroup = async () => {
        if (selectedGroupId && student.id) {
            await addStudentToGroup(student.id, selectedGroupId);
            await refreshStudentGroups();
            setAddingToGroup(false);
            setSelectedGroupId('');
        }
    };

    const handleSave = async () => {
        if (!editName.trim()) {
            await handleCancel(); // If name is cleared, treat as cancel/delete if it was empty
            return;
        }

        await api.update<Student>('students', student.id!, {
            name: editName.trim(),
            telegram_username: editTelegram.replace(/@/g, '').trim() || undefined,
            instagram_username: editInstagram.replace(/@/g, '').trim() || undefined,
            notes: editNotes.trim() || undefined
        });

        await refreshStudents();
        onClose();
    };

    const handleCancel = async () => {
        // Cleanup: If EVERYTHING is empty, delete this record.
        // This covers new "ghost" students created on 'Add'.
        const isEmpty = !editName.trim() &&
            !editTelegram.trim() &&
            !editInstagram.trim() &&
            !editNotes.trim();

        if (student.id && isEmpty) {
            await api.remove('students', student.id);
            await refreshStudents();
        }
        onClose();
    };

    const today = new Date().toISOString().split('T')[0];
    const studentIdStr = String(student.id);

    // In the new balance-based system, active passes are those that are not archived/expired
    const activeSubs = allSubscriptions.filter(s => {
        const isStudent = String(s.user_id) === studentIdStr;
        const isActive = s.status === 'active' || !s.status;
        const isNotExpired = !s.expiry_date || today <= s.expiry_date;
        return isStudent && isActive && isNotExpired;
    });

    const historySubs = allSubscriptions.filter(s => {
        const isStudent = String(s.user_id) === studentIdStr;
        const isArchived = s.status === 'archived';
        const isExpired = s.expiry_date && s.expiry_date < today;
        // Show in history if it's explicitly archived OR if it's expired
        return isStudent && (isArchived || isExpired);
    });

    // handleDeleteSub and handleArchiveSub removed as they are now handled by SubscriptionDetailSheet

    return (
        <>
            <div className={`fixed inset-0 z-[90] flex items-end sm:items-center justify-center transition-opacity duration-300 ${isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
                <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={handleCancel} />

                <div className={`relative w-full max-lg max-w-lg max-h-[90vh] bg-ios-card dark:bg-zinc-900 rounded-t-3xl sm:rounded-3xl shadow-2xl transition-transform duration-300 transform flex flex-col overflow-hidden overscroll-y-contain ${isOpen ? 'translate-y-0' : 'translate-y-full'}`}>
                    {/* Header */}
                    <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-zinc-800">
                        <button onClick={handleCancel} className="p-1">
                            <X className="w-6 h-6 text-ios-gray" />
                        </button>
                        <h2 className="font-bold text-lg dark:text-white truncate max-w-[200px]">
                            {student.name || t('add_student')}
                        </h2>
                        {!readOnly && (
                            <button
                                onClick={handleSave}
                                disabled={!editName.trim()}
                                className="text-ios-blue font-semibold disabled:opacity-50"
                            >
                                {t('save')}
                            </button>
                        )}
                    </div>

                    <div className="flex-1 overflow-y-auto p-4 space-y-4">
                        {/* Name & Telegram */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                                <label className="text-[10px] font-black text-ios-gray uppercase tracking-widest px-1">{t('student_name')}</label>
                                <input
                                    type="text"
                                    value={editName}
                                    autoFocus={!student.name}
                                    onChange={(e) => setEditName(e.target.value)}
                                    readOnly={readOnly}
                                    className="w-full mt-1 px-3 py-2 rounded-xl bg-ios-background dark:bg-zinc-800 dark:text-white text-sm"
                                    placeholder={t('student_name')}
                                />
                            </div>
                            <div>
                                <label className="text-[10px] font-black text-ios-gray uppercase tracking-widest px-1">{t('tg_username')}</label>
                                <div className="flex gap-2 mt-1">
                                    <div className="relative flex-1">
                                        <TelegramIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-ios-gray" />
                                        <input
                                            type="text"
                                            value={editTelegram}
                                            onChange={(e) => setEditTelegram(e.target.value)}
                                            readOnly={readOnly}
                                            className="w-full pl-8 pr-3 py-2 rounded-xl bg-ios-background dark:bg-zinc-800 dark:text-white text-sm"
                                            placeholder="username"
                                        />
                                    </div>
                                    {editTelegram && (
                                        <a
                                            href={`https://t.me/${editTelegram.replace('@', '')}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="flex items-center gap-2 px-2 text-ios-blue rounded-xl font-bold active:scale-95 transition-transform"
                                        >
                                            <TelegramIcon className="w-4 h-4" />
                                            <span className="text-xs uppercase tracking-tight">{t('open_chat')}</span>
                                        </a>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Read-only notes if present */}
                        {readOnly && editNotes && (
                            <div className="p-3 bg-ios-background dark:bg-zinc-800 rounded-xl">
                                <label className="text-[10px] font-black text-ios-gray uppercase tracking-widest block mb-1">{t('note')}</label>
                                <p className="text-sm dark:text-white whitespace-pre-wrap">{editNotes}</p>
                            </div>
                        )}

                        {/* Instagram Field */}
                        <div>
                            <label className="text-[10px] font-black text-ios-gray uppercase tracking-widest px-1">{t('ig_username')}</label>
                            <div className="flex gap-2 mt-1">
                                <div className="relative flex-1">
                                    <Instagram className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-ios-gray" />
                                    <input
                                        type="text"
                                        value={editInstagram}
                                        onChange={(e) => setEditInstagram(e.target.value)}
                                        readOnly={readOnly}
                                        className="w-full pl-8 pr-3 py-2 rounded-xl bg-ios-background dark:bg-zinc-800 dark:text-white text-sm"
                                        placeholder="username"
                                    />
                                </div>
                                {editInstagram && (
                                    <a
                                        href={`https://instagram.com/${editInstagram.replace('@', '')}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="flex items-center gap-2 px-2 text-[#E1306C] rounded-xl font-bold active:scale-95 transition-transform"
                                    >
                                        <Instagram className="w-4 h-4" />
                                        <span className="text-xs uppercase tracking-tight">{t('open_chat')}</span>
                                    </a>
                                )}
                            </div>
                        </div>

                        {/* Notes Section */}
                        {!readOnly && (
                            <section>
                                <label className="text-[10px] font-black text-ios-gray uppercase tracking-widest px-1 mb-1 block">{t('note')}</label>
                                <textarea
                                    value={editNotes}
                                    onChange={(e) => setEditNotes(e.target.value)}
                                    readOnly={readOnly}
                                    className="w-full px-3 py-2 text-sm dark:text-white bg-ios-background dark:bg-zinc-800 border border-transparent dark:border-zinc-800 rounded-xl resize-none"
                                    placeholder={t('note') || 'Note'}
                                    rows={2}
                                />
                            </section>
                        )}

                        {/* Groups Section */}
                        <section>
                            <h3 className="text-[10px] font-black text-ios-gray uppercase tracking-widest flex items-center gap-1 mb-3 px-1">
                                <Layers className="w-3 h-3" />
                                {t('groups')}
                            </h3>

                            <div className="flex flex-wrap gap-2">
                                {studentGroupsList.map(group => (
                                    <div
                                        key={group.id}
                                        className="flex items-center gap-2 px-3 py-2 bg-ios-background dark:bg-zinc-800 rounded-xl"
                                    >
                                        <div
                                            className="w-3 h-3 rounded-full"
                                            style={{ backgroundColor: group.color }}
                                        />
                                        <span className="text-sm font-medium dark:text-white">{group.name}</span>
                                        {!readOnly && (
                                            <button
                                                onClick={async () => {
                                                    await removeStudentFromGroup(student.id!, group.id!);
                                                    await refreshStudentGroups();
                                                }}
                                                className="p-1 text-ios-gray hover:text-ios-red"
                                            >
                                                <X className="w-3 h-3" />
                                            </button>
                                        )}
                                    </div>
                                ))}

                                {/* Add group button */}
                                {!readOnly && !addingToGroup && (
                                    <button
                                        onClick={() => setAddingToGroup(true)}
                                        className="flex items-center gap-1 px-3 py-2 bg-ios-background dark:bg-zinc-800 rounded-xl text-ios-blue active:scale-95 transition-transform"
                                    >
                                        <Plus className="w-4 h-4" />
                                    </button>
                                )}

                                {addingToGroup && (
                                    <div className="w-full p-3 bg-ios-background dark:bg-zinc-800 rounded-xl space-y-3">
                                        <select
                                            value={selectedGroupId}
                                            onChange={(e) => setSelectedGroupId(e.target.value)}
                                            className="w-full px-3 py-2 rounded-lg bg-ios-card dark:bg-zinc-700 dark:text-white"
                                        >
                                            <option value="">{t('select_group')}</option>
                                            {activeGroups.map(g => {
                                                const isAssigned = memberGroupIds.includes(String(g.id));
                                                return (
                                                    <option
                                                        key={g.id}
                                                        value={g.id}
                                                        disabled={isAssigned}
                                                    >
                                                        {g.name}{isAssigned ? ` (${t('already_added') || 'added'})` : ''}
                                                    </option>
                                                );
                                            })}
                                        </select>
                                        <div className="flex gap-2">
                                            <button
                                                onClick={() => setAddingToGroup(false)}
                                                className="flex-1 py-2 rounded-lg bg-gray-200 dark:bg-zinc-600 dark:text-white text-sm"
                                            >
                                                {t('cancel')}
                                            </button>
                                            <button
                                                onClick={handleAddToGroup}
                                                disabled={!selectedGroupId}
                                                className="flex-1 py-2 rounded-lg bg-ios-blue text-white font-semibold text-sm disabled:opacity-50"
                                            >
                                                {t('add')}
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </section>

                        {/* Balance Section */}
                        {student && student.id && (() => {
                            // Get all groups the student has transactions in (passes or attendance)
                            const studentGroupIds = new Set<string>();
                            subscriptions
                                .filter(s => String(s.user_id) === String(student.id))
                                .forEach(s => studentGroupIds.add(String(s.group_id)));
                            attendance
                                .filter(a => String(a.student_id) === String(student.id))
                                .forEach(a => {
                                    const lesson = lessons.find(l => String(l.id) === String(a.lesson_id));
                                    if (lesson) studentGroupIds.add(String(lesson.group_id));
                                });

                            // Show all groups with any transactions (don't filter by balance)
                            const groupBalances = Array.from(studentGroupIds).map(groupId => {
                                const group = allGroupsRaw.find(g => String(g.id) === String(groupId));
                                const { balance } = calculateStudentGroupBalance(student.id!, groupId, allSubscriptions, attendance, lessons);
                                return { groupId, group, balance };
                            }).filter(gb => gb.group); // Only filter out if group not found

                            if (groupBalances.length === 0) return null;

                            return (
                                <section>
                                    <h3 className="text-[10px] font-black text-ios-gray uppercase tracking-widest flex items-center gap-1 mb-3 px-1">
                                        <CreditCard className="w-3 h-3" />
                                        {t('surplus') || 'Balance'}
                                    </h3>
                                    <div className="space-y-2">
                                        {groupBalances.map(({ groupId, group, balance }) => (
                                            <button
                                                key={groupId}
                                                onClick={() => {
                                                    if (group) {
                                                        const auditResult = calculateStudentGroupBalanceWithAudit(
                                                            student.id!, groupId, allSubscriptions, attendance, lessons
                                                        );
                                                        setAuditingGroup({ groupId, group, auditResult });
                                                    }
                                                }}
                                                className="w-full flex items-center justify-between p-3 bg-ios-background dark:bg-zinc-800 rounded-xl active:scale-[0.98] transition-transform"
                                            >
                                                <div className="flex items-center gap-2">
                                                    <div
                                                        className="w-3 h-3 rounded-full"
                                                        style={{ backgroundColor: group?.color || '#888' }}
                                                    />
                                                    <span className="font-medium dark:text-white text-sm">{group?.name || 'Unknown'}</span>
                                                </div>
                                                <div className="flex items-center gap-1">
                                                    <span className={`font-bold ${balance > 0 ? 'text-ios-green' : 'text-ios-red'}`}>
                                                        {balance > 0 ? `+${balance}` : balance}
                                                    </span>
                                                    <ChevronRight className="w-4 h-4 text-ios-gray" />
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                </section>
                            );
                        })()}

                        {/* Subscriptions Section (visible only if not blank new student) */}
                        {student.name && (
                            <>
                                {/* Active Subscriptions */}
                                <section>
                                    <div className="flex items-center justify-between mb-3 px-1">
                                        <div className="flex items-center gap-1.5 text-ios-gray">
                                            <CreditCard className="w-3.5 h-3.5" />
                                            <h3 className="text-[10px] font-black uppercase tracking-widest">{t('passes')}</h3>
                                        </div>
                                        {!readOnly && (
                                            <button
                                                onClick={() => setIsBuyModalOpen(true)}
                                                className="flex items-center gap-1 text-ios-blue text-xs font-bold active:scale-95 transition-transform"
                                            >
                                                <Plus className="w-4 h-4" />
                                                {t('add')}
                                            </button>
                                        )}
                                    </div>

                                    <div className="space-y-3">
                                        {activeSubs.map(sub => {
                                            const group = allGroupsRaw.find(g => String(g.id) === String(sub.group_id));
                                            const originalPass = passes.find(p => String(p.id) === String(sub.tariff_id));
                                            return (
                                                <PassCard
                                                    key={sub.id}
                                                    pass={{
                                                        id: String(sub.id),
                                                        name: originalPass?.name || '',
                                                        price: sub.price,
                                                        lessons_count: sub.lessons_total,
                                                        is_consecutive: sub.is_consecutive,
                                                        duration_days: sub.duration_days || originalPass?.duration_days
                                                    }}
                                                    groupsList={group ? [group] : []}
                                                    onClick={() => setEditingSub(sub)}
                                                    showChevron={true}
                                                    startDate={sub.purchase_date}
                                                    endDate={sub.expiry_date}
                                                />
                                            );
                                        })}

                                        {activeSubs.length === 0 && (
                                            <div className="py-8 text-center bg-ios-background dark:bg-zinc-800 rounded-[24px] border-2 border-dashed border-gray-100 dark:border-zinc-700">
                                                <AlertCircle className="w-8 h-8 text-ios-gray/30 mx-auto mb-2" />
                                                <p className="text-ios-gray text-sm font-medium">{t('no_active_subscriptions')}</p>
                                            </div>
                                        )}
                                    </div>
                                </section>

                                {/* Archive */}
                                {historySubs.length > 0 && (
                                    <section className="mt-4">
                                        <button
                                            onClick={() => setIsArchiveOpen(!isArchiveOpen)}
                                            className="w-full flex items-center justify-between py-2 px-1 text-ios-gray hover:text-ios-blue transition-colors group"
                                        >
                                            <div className="flex items-center gap-1.5 ">
                                                <h3 className="text-[10px] font-black uppercase tracking-widest">{t('archive')}</h3>
                                                <span className="text-[10px] font-bold opacity-50">({historySubs.length})</span>
                                            </div>
                                            {isArchiveOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                                        </button>

                                        {isArchiveOpen && (
                                            <div className="space-y-3 mt-2 opacity-60 hover:opacity-100 transition-opacity">
                                                {historySubs.map(sub => {
                                                    const group = allGroupsRaw.find(g => String(g.id) === String(sub.group_id));
                                                    const originalPass = passes.find(p => String(p.id) === String(sub.tariff_id));
                                                    return (
                                                        <PassCard
                                                            key={sub.id}
                                                            pass={{
                                                                id: String(sub.id),
                                                                name: originalPass?.name || '',
                                                                price: sub.price,
                                                                lessons_count: sub.lessons_total,
                                                                is_consecutive: sub.is_consecutive,
                                                                duration_days: sub.duration_days || originalPass?.duration_days
                                                            }}
                                                            groupsList={group ? [group] : []}
                                                            onClick={() => setEditingSub(sub)}
                                                            showChevron={true}
                                                            startDate={sub.purchase_date}
                                                            endDate={sub.expiry_date}
                                                        />
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </section>
                                )}
                            </>
                        )}
                    </div>
                </div >
            </div >

            <BuySubscriptionModal
                isOpen={isBuyModalOpen}
                student={student}
                activeSubscriptions={allSubscriptions}
                onClose={() => setIsBuyModalOpen(false)}
                onBuy={onBuySubscription}
            />

            {
                editingSub && (
                    <SubscriptionDetailSheet
                        isOpen={!!editingSub}
                        onClose={() => setEditingSub(null)}
                        subscription={editingSub}
                    />
                )
            }

            {
                auditingGroup && (
                    <BalanceAuditSheet
                        isOpen={!!auditingGroup}
                        onClose={() => setAuditingGroup(null)}
                        auditResult={auditingGroup.auditResult}
                        group={auditingGroup.group}
                        subscriptions={allSubscriptions}
                    />
                )
            }
        </>
    );
};
