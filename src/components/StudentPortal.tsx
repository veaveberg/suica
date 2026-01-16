import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useData } from '../DataProvider';
import { useTelegram } from './TelegramProvider';
import { Calendar, User, BookOpen, LogOut } from 'lucide-react';
import { StudentCard } from './StudentCard';

import { useSearchParams } from '../hooks/useSearchParams';

export const StudentPortal: React.FC = () => {
    const { t } = useTranslation();
    const { logout } = useTelegram();
    const { lessons, subscriptions, students } = useData();
    const { getParam, setParam } = useSearchParams();

    const tabParam = getParam('tab');
    const isValidTab = (t: string | null): t is 'lessons' | 'profile' => t === 'lessons' || t === 'profile';
    const activeTab = isValidTab(tabParam) ? tabParam : 'lessons';
    const setActiveTab = (tab: 'lessons' | 'profile') => setParam('tab', tab);

    // Find "Me" in the students list (fetched via API as restricted list)
    // The students list for a student user only contains themselves.
    const me = students[0];

    // Filter upcoming lessons
    const myLessons = lessons.filter(l => l.status === 'upcoming').sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));

    return (
        <div className="h-full flex flex-col bg-ios-background dark:bg-black text-black dark:text-white">
            <header className="p-4 bg-ios-card/80 dark:bg-zinc-900/80 backdrop-blur-xl border-b border-gray-200 dark:border-zinc-800 flex items-center justify-between">
                <h1 className="text-xl font-bold">
                    {t('welcome')}, {me?.name || t('student')}
                </h1>
                <button
                    onClick={logout}
                    className="p-2 text-ios-red hover:bg-ios-red/10 rounded-xl transition-colors"
                >
                    <LogOut className="w-5 h-5" />
                </button>
            </header>

            <main className="flex-1 overflow-y-auto p-4 space-y-6">
                {activeTab === 'lessons' && (
                    <div className="space-y-4">
                        <h2 className="text-lg font-semibold flex items-center gap-2">
                            <Calendar className="w-5 h-5 text-ios-blue" />
                            {t('upcoming_lessons') || 'Upcoming Lessons'}
                        </h2>
                        {myLessons.length === 0 ? (
                            <div className="text-gray-500 text-center py-8">No upcoming lessons</div>
                        ) : (
                            <div className="space-y-2">
                                {myLessons.map(lesson => (
                                    <div key={lesson.id} className="p-4 rounded-xl bg-ios-card dark:bg-zinc-900 border border-gray-100 dark:border-zinc-800 shadow-sm">
                                        <div className="flex justify-between items-center">
                                            <span className="font-medium">{new Date(lesson.date).toLocaleDateString()}</span>
                                            <span className="font-bold text-lg">{lesson.time}</span>
                                        </div>
                                        <div className="text-sm text-gray-500 mt-1">
                                            Duration: {lesson.duration_minutes} min
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {activeTab === 'profile' && me && (
                    <div className="space-y-4">
                        <StudentCard
                            isOpen={true} // Always open in profile view effectively
                            student={me}
                            subscriptions={subscriptions}
                            onClose={() => { }}
                            onBuySubscription={async () => { }}
                            readOnly={true}
                        />
                    </div>
                )}
            </main>

            <nav className="shrink-0 grid grid-cols-2 bg-ios-card/80 dark:bg-zinc-900/80 backdrop-blur-xl border-t border-gray-200 dark:border-zinc-800 pb-[env(safe-area-inset-bottom)]">
                <button
                    onClick={() => setActiveTab('lessons')}
                    className={`flex flex-col items-center py-2 ${activeTab === 'lessons' ? 'text-ios-blue' : 'text-gray-500'}`}
                >
                    <BookOpen className="w-6 h-6" />
                    <span className="text-[10px] font-medium mt-1">Lessons</span>
                </button>
                <button
                    onClick={() => setActiveTab('profile')}
                    className={`flex flex-col items-center py-2 ${activeTab === 'profile' ? 'text-ios-blue' : 'text-gray-500'}`}
                >
                    <User className="w-6 h-6" />
                    <span className="text-[10px] font-medium mt-1">Profile</span>
                </button>
            </nav>
        </div>
    );
};
