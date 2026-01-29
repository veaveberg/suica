import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Search, UserPlus } from 'lucide-react';
import { useTelegram } from './TelegramProvider';
import { useData } from '../DataProvider';
import * as api from '../api';
import type { Student, Subscription } from '../types';
import { StudentCard } from './StudentCard';
import { calculateStudentGroupBalance } from '../utils/balance';

interface StudentsViewProps {
    students: Student[];
    subscriptions: Subscription[];
}

export const StudentsView: React.FC<StudentsViewProps> = ({
    students,
    subscriptions
}) => {
    const { t } = useTranslation();
    const [search, setSearch] = useState('');
    const [isCardOpen, setIsCardOpen] = useState(false);
    const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
    const { convexUser, userId: currentTgId } = useTelegram();
    const isStudent = convexUser?.role === 'student';
    const isAdmin = convexUser?.role === 'admin';

    const { groups, studentGroups, refreshStudents, refreshSubscriptions, attendance, lessons } = useData();
    const activeGroups = groups.filter(g => g.status === 'active');

    // Filter out completely empty ghost students and apply search
    const filteredStudents = students
        .filter(s => {
            // Keep if ANY field has content
            return (s.name || '').trim() !== '' ||
                (s.telegram_username || '').trim() !== '' ||
                (s.instagram_username || '').trim() !== '';
        })
        .filter(s => {
            return s.name.toLowerCase().includes(search.toLowerCase()) ||
                s.telegram_username?.toLowerCase().includes(search.toLowerCase()) ||
                s.instagram_username?.toLowerCase().includes(search.toLowerCase());
        });

    const getStudentGroups = (studentId: string) => {
        const groupIds = studentGroups.filter(sg => String(sg.student_id) === String(studentId)).map(sg => sg.group_id);
        return activeGroups.filter(g => groupIds.map(String).includes(String(g.id)));
    };

    const handleBuySubscription = async (newSub: Omit<Subscription, 'id'>) => {
        await api.create<Subscription>('subscriptions', newSub);
        await refreshSubscriptions();
    };

    const openCreateMode = async () => {
        // 1. Create a blank student
        const newStudent = await api.create<Student>('students', {
            name: '',
        });

        // Implicitly assign ownership so it's editable immediately
        if (currentTgId) {
            newStudent.userId = String(currentTgId);
        }

        // 2. Refresh and Open
        await refreshStudents();
        setSelectedStudent(newStudent);
        setIsCardOpen(true);
    };

    const openEditMode = (student: Student) => {
        setSelectedStudent(student);
        setIsCardOpen(true);
    };

    return (
        <div className="p-4 space-y-4">
            {/* Header Actions */}
            <div className="flex gap-3">
                {/* Search */}
                <div className="relative flex-1">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-ios-gray" />
                    <input
                        type="text"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="w-full pl-12 pr-4 py-3 rounded-2xl bg-ios-card dark:bg-zinc-900 border border-gray-100 dark:border-zinc-800 focus:ring-2 focus:ring-ios-blue dark:text-white shadow-sm"
                        placeholder={t('search') || 'Search...'}
                    />
                </div>
                {/* Add Button */}
                {!isStudent && (
                    <button
                        onClick={openCreateMode}
                        className="p-3 rounded-2xl bg-ios-blue text-white active:scale-90 transition-transform"
                    >
                        <UserPlus className="w-5 h-5" />
                    </button>
                )}
            </div>

            {/* Students List */}
            <div className="space-y-2">
                {filteredStudents.map(student => {
                    const studentGroupsList = getStudentGroups(student.id!);

                    return (
                        <button
                            key={student.id}
                            onClick={() => openEditMode(student)}
                            className="w-full text-left ios-card dark:bg-zinc-900 border border-gray-100 dark:border-zinc-800 flex items-center justify-between group active:scale-[0.98] transition-all"
                        >
                            <div className="flex-1">
                                <div className="flex items-baseline gap-2">
                                    <h3 className="font-bold dark:text-white group-active:text-ios-blue">{student.name}</h3>
                                    {student.telegram_username && (
                                        <span className="text-xs text-ios-gray">@{student.telegram_username}</span>
                                    )}
                                </div>
                                {studentGroupsList.length > 0 && (
                                    <div className="flex items-center gap-1.5 mt-0.5">
                                        {studentGroupsList.map(g => (
                                            <span
                                                key={g.id}
                                                className="text-[10px] font-semibold px-1.5 py-0.5 rounded"
                                                style={{
                                                    color: g.color,
                                                    backgroundColor: `${g.color}20`
                                                }}
                                            >
                                                {g.name}
                                            </span>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* Per-Group Balance Info */}
                            <div className="flex flex-col items-end gap-1">
                                {(() => {
                                    // Get all groups for this student
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

                                    const groupBalances = Array.from(studentGroupIds).map(groupId => {
                                        const group = activeGroups.find(g => String(g.id) === groupId);
                                        const { balance } = calculateStudentGroupBalance(student.id!, groupId, subscriptions, attendance, lessons);
                                        return { groupId, group, balance };
                                    }).filter(gb => gb.balance !== 0);

                                    if (groupBalances.length === 0) return null;

                                    return groupBalances.map(({ groupId, group, balance }) => (
                                        <div
                                            key={groupId}
                                            className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold ${balance > 0 ? 'bg-ios-green/10 text-ios-green' : 'bg-ios-red/10 text-ios-red'
                                                }`}
                                        >
                                            <div
                                                className="w-2 h-2 rounded-full"
                                                style={{ backgroundColor: group?.color || '#888' }}
                                            />
                                            <span>{balance > 0 ? `+${balance}` : balance}</span>
                                        </div>
                                    ));
                                })()}
                            </div>
                        </button>
                    );
                })}

                {filteredStudents.length === 0 && (
                    <div className="text-center py-12 text-ios-gray">
                        {search ? t('nothing_found') : t('no_students')}
                    </div>
                )}
            </div>

            <StudentCard
                isOpen={isCardOpen}
                student={selectedStudent}
                subscriptions={subscriptions}
                onClose={() => setIsCardOpen(false)}
                onBuySubscription={handleBuySubscription}
                readOnly={!isAdmin && (isStudent || (!!selectedStudent && !!currentTgId && selectedStudent.userId !== String(currentTgId)))}
            />
        </div>
    );
};
