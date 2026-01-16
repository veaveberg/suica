import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { CheckCircle2, Ban, Users, Circle, Trash2, ArrowUp, ArrowDown, Loader2 } from 'lucide-react';
import type { Lesson, Student } from '../types';
import { LessonDetailSheet } from './LessonDetailSheet';
import { useData } from '../DataProvider';
import { deleteLessons } from '../db-server';
import { cn } from '../utils/cn';
import { formatDate, formatTimeRange } from '../utils/formatting';
import { getCachedEvents, fetchAllExternalEvents, getExternalEventsForDate, openExternalEvent } from '../utils/ical';
import type { ExternalEvent } from '../types';

interface DashboardProps {
    students: Student[];
    lessons: Lesson[];
    isSelectionMode?: boolean;
    onSelectionModeChange?: (mode: boolean) => void;
    externalEventsRefresh?: number;
    isActive?: boolean;
}

const BATCH_SIZE = 20;

export const Dashboard: React.FC<DashboardProps> = ({ lessons: fallbackLessons, isSelectionMode = false, onSelectionModeChange, externalEventsRefresh, isActive }) => {
    const { t, i18n } = useTranslation();
    const [selectedLesson, setSelectedLesson] = useState<Lesson | null>(null);
    const [pastLessonsCount, setPastLessonsCount] = useState(BATCH_SIZE);
    const { lessons: dataLessons, groups, studentGroups, students, refreshLessons, externalCalendars } = useData();

    // Prioritize lessons from useData, but fallback to props if needed for some reason
    const lessons = dataLessons || fallbackLessons;
    const containerRef = useRef<HTMLDivElement>(null);
    const todayRef = useRef<HTMLDivElement>(null);
    const [isLoadingMore, setIsLoadingMore] = useState(false);

    // Selection state
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [todayButton, setTodayButton] = useState<{ show: boolean, direction: 'up' | 'down' }>({ show: false, direction: 'up' });

    const [isReady, setIsReady] = useState(false);
    const [isFetchingExternal, setIsFetchingExternal] = useState(true);
    const hasInteracted = useRef(false);
    const isProgrammaticScroll = useRef(false);
    const [externalEvents, setExternalEvents] = useState<ExternalEvent[]>([]);

    const todayDate = new Date();
    const today = `${todayDate.getFullYear()}-${String(todayDate.getMonth() + 1).padStart(2, '0')}-${String(todayDate.getDate()).padStart(2, '0')}`;

    // Fetch external calendar events
    useEffect(() => {
        if (!externalCalendars) return;

        const cached = getCachedEvents();
        setExternalEvents(cached);

        fetchAllExternalEvents(externalCalendars).then(events => {
            setExternalEvents(events);
            setIsFetchingExternal(false);
        }).catch(err => {
            console.error('Dashboard: Failed to fetch external events:', err);
            setIsFetchingExternal(false);
        });
    }, [externalEventsRefresh, externalCalendars]);


    // Clear selection when mode is turned off
    useEffect(() => {
        if (!isSelectionMode) {
            setSelectedIds(new Set());
        }
    }, [isSelectionMode]);

    const toggleLessonSelection = (id: string) => {
        const newSelected = new Set(selectedIds);
        if (newSelected.has(id)) {
            newSelected.delete(id);
        } else {
            newSelected.add(id);
        }
        setSelectedIds(newSelected);
    };

    const handleBulkDelete = async () => {
        if (selectedIds.size === 0) return;
        if (confirm(`${t('confirm_delete_lesson')} (${selectedIds.size})`)) {
            await deleteLessons(Array.from(selectedIds));
            await refreshLessons();
            if (onSelectionModeChange) onSelectionModeChange(false);
            setSelectedIds(new Set());
        }
    };

    const getGroupName = (groupId: string) => {
        const group = groups.find(g => String(g.id) === String(groupId));
        return group?.name || 'Unknown';
    };

    const getGroupColor = (groupId: string) => {
        const group = groups.find(g => String(g.id) === String(groupId));
        return group?.color || '#007AFF';
    };

    const getGroupMemberCount = (groupId: string) => {
        const memberIds = studentGroups
            .filter(sg => String(sg.group_id) === String(groupId))
            .map(sg => String(sg.student_id));

        return students.filter(s =>
            memberIds.includes(String(s.id)) &&
            s.name && s.name.trim().length > 0
        ).length;
    };

    // Format time like "14" or "14:30"
    const formatT = (timeStr: string) => {
        const [h, m] = timeStr.split(':').map(Number);
        return m === 0 ? `${h}` : `${h}:${m.toString().padStart(2, '0')}`;
    };

    // Render external events for a specific date
    const renderExternalEventsForDate = (dateStr: string) => {
        // Parse YYYY-MM-DD as local date to avoid UTC shifts
        const [y, m, d] = dateStr.split('-').map(Number);
        const date = new Date(y, m - 1, d);

        const events = getExternalEventsForDate(externalEvents, date).sort((a, b) => {
            if (a.allDay && !b.allDay) return -1;
            if (!a.allDay && b.allDay) return 1;
            return a.start.getTime() - b.start.getTime();
        });

        if (events.length === 0) return null;


        return (
            <div className="space-y-1 mb-2">
                {events.map(event => {
                    const startTime = `${event.start.getHours().toString().padStart(2, '0')}:${event.start.getMinutes().toString().padStart(2, '0')}`;
                    const endTime = `${event.end.getHours().toString().padStart(2, '0')}:${event.end.getMinutes().toString().padStart(2, '0')}`;
                    return (
                        <button
                            key={event.uid}
                            onClick={() => openExternalEvent(event)}
                            className="flex items-start gap-2 py-1 w-full text-left active:opacity-60 transition-opacity hover:bg-black/5 dark:hover:bg-white/5 rounded-lg px-1 -mx-1"
                        >
                            <div
                                className="w-0.5 h-4 rounded-full shrink-0 mt-0.5"
                                style={{ backgroundColor: event.calendarColor || '#888' }}
                            />
                            <span className="text-sm text-ios-gray">
                                {event.allDay ? (
                                    event.title
                                ) : (
                                    <>{formatT(startTime)}–{formatT(endTime)} {event.title}</>
                                )}
                            </span>
                        </button>
                    );
                })}
            </div>
        );
    };

    // Sort all lessons by date (newest first for display, but we'll reverse for past)
    const sortedLessons = [...lessons].sort((a, b) => a.date.localeCompare(b.date));

    // Deduplicate lessons
    const seen = new Set<string>();
    const uniqueLessons = sortedLessons.filter(l => {
        const key = `${l.date}-${l.time}-${l.group_id}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });

    // Generate a unified timeline of days with either lessons or external events
    const timeline = useMemo(() => {
        const daysMap: Record<string, { lessons: Lesson[], events: ExternalEvent[] }> = {};

        const ensureDay = (dStr: string) => {
            if (!daysMap[dStr]) daysMap[dStr] = { lessons: [], events: [] };
            return daysMap[dStr];
        };

        // 1. Add native lessons
        uniqueLessons.forEach(l => {
            ensureDay(l.date).lessons.push(l);
        });

        // 2. Add today
        ensureDay(today);

        // 3. Add external events (expanding multi-day events)
        externalEvents.forEach(e => {
            const start = new Date(e.start);
            start.setHours(0, 0, 0, 0);
            const end = new Date(e.end);
            // End date bracket
            const endLimit = new Date(start);
            endLimit.setDate(endLimit.getDate() + 31); // Max 31 days per event to avoid bloat

            const curr = new Date(start);
            while (curr <= end && curr <= endLimit) {
                const dStr = `${curr.getFullYear()}-${String(curr.getMonth() + 1).padStart(2, '0')}-${String(curr.getDate()).padStart(2, '0')}`;
                ensureDay(dStr).events.push(e);
                curr.setDate(curr.getDate() + 1);
            }
        });

        const allDates = Object.keys(daysMap).sort();
        const pastDates = allDates.filter(d => d < today).reverse(); // Newest past first
        const futureDates = allDates.filter(d => d > today);

        // Lazy loading for past: Limit total items (lessons + days with events)
        let itemsShown = 0;
        let lastDateIndex = -1;
        for (let i = 0; i < pastDates.length; i++) {
            const day = daysMap[pastDates[i]];
            // Count lessons + 1 if the day has external events (each day's events group is one "item" visually)
            itemsShown += day.lessons.length + (day.events.length > 0 ? 1 : 0);
            lastDateIndex = i;
            if (itemsShown >= pastLessonsCount) break;
        }

        const visiblePastDates = lastDateIndex >= 0
            ? pastDates.slice(0, lastDateIndex + 1).reverse() // Chronological
            : [];

        const hasMorePast = pastDates.length > (lastDateIndex + 1) && itemsShown >= pastLessonsCount;

        return {
            daysMap,
            visiblePastDates,
            futureDates,
            hasMorePast
        };
    }, [uniqueLessons, externalEvents, today, pastLessonsCount]);

    // Format today's date for header
    const formatTodayHeader = () => {
        const date = new Date();
        const lang = i18n.language.toUpperCase();
        const locale = lang === 'KA' ? 'ka-GE' : lang === 'RU' ? 'ru' : 'en-US';
        const weekday = date.toLocaleDateString(locale, { weekday: 'short' });
        const monthDay = date.toLocaleDateString(locale, { month: 'long', day: 'numeric' });
        return `${t('today')}, ${weekday}, ${monthDay}`;
    };

    // Handle scroll to load more past lessons and show/hide today button
    const handleScroll = useCallback(() => {
        if (!containerRef.current) return;

        const { scrollTop, scrollHeight } = containerRef.current;

        // 1. Manage today button visibility
        if (todayRef.current) {
            const rect = todayRef.current.getBoundingClientRect();
            const containerRect = containerRef.current.getBoundingClientRect();

            // Check if today section is visible in the container viewport
            const isVisible = rect.top >= containerRect.top && rect.bottom <= containerRect.bottom;

            if (!isVisible) {
                const direction = rect.top < containerRect.top ? 'up' : 'down';
                setTodayButton({ show: true, direction });
            } else {
                setTodayButton(prev => ({ ...prev, show: false }));
            }
        }

        // 2. Load more past lessons
        if (!isLoadingMore && timeline.hasMorePast && scrollTop < 100) {
            setIsLoadingMore(true);
            const currentScrollHeight = scrollHeight;

            setPastLessonsCount(prev => prev + BATCH_SIZE);

            // Restore scroll position after content is added
            requestAnimationFrame(() => {
                if (containerRef.current) {
                    const newScrollHeight = containerRef.current.scrollHeight;
                    containerRef.current.scrollTop = newScrollHeight - currentScrollHeight + scrollTop;
                }
                setIsLoadingMore(false);
            });
        }
    }, [timeline.hasMorePast, isLoadingMore]);

    // Scroll to today on mount or when data changes (until first manual scroll)
    useEffect(() => {
        if (hasInteracted.current) return;

        const scrollToToday = () => {
            if (todayRef.current && containerRef.current && !hasInteracted.current) {
                isProgrammaticScroll.current = true;
                const target = todayRef.current.offsetTop - 16;
                containerRef.current.scrollTop = target;

                // Give the browser a moment to process the scroll and settle the layout
                // before we fade the content in.
                setTimeout(() => {
                    if (!containerRef.current || hasInteracted.current) {
                        isProgrammaticScroll.current = false;
                        return;
                    }

                    const currentScroll = containerRef.current.scrollTop;
                    // We're "ready" if we've reached the target, or if we've moved significantly,
                    // or if there are no past events to scroll through.
                    // We ONLY set isReady if we aren't currently waiting for a fresh network fetch
                    // to avoid snapping when new events arrive.
                    if (!isFetchingExternal && (Math.abs(currentScroll - target) < 10 || currentScroll > 50 || timeline.visiblePastDates.length === 0)) {
                        setIsReady(true);
                    }

                    isProgrammaticScroll.current = false;
                }, 250);
            }
        };

        // Execute immediately
        scrollToToday();

        // Also execute after a short delay to catch layout shifts
        const timer = setTimeout(scrollToToday, 100);
        return () => clearTimeout(timer);
    }, [lessons.length, timeline, isFetchingExternal, isActive]); // Re-run whenever timeline or fetching state change

    useEffect(() => {
        const container = containerRef.current;
        if (container) {
            const onInteraction = () => {
                hasInteracted.current = true;
            };

            container.addEventListener('scroll', handleScroll);
            container.addEventListener('touchstart', onInteraction, { passive: true });
            container.addEventListener('mousedown', onInteraction);
            container.addEventListener('wheel', onInteraction, { passive: true });

            return () => {
                container.removeEventListener('scroll', handleScroll);
                container.removeEventListener('touchstart', onInteraction);
                container.removeEventListener('mousedown', onInteraction);
                container.removeEventListener('wheel', onInteraction);
            };
        }
    }, [handleScroll]);

    const renderLesson = (lesson: Lesson) => {
        const isToday = lesson.date === today;
        const isCancelled = lesson.status === 'cancelled';
        const isCompleted = lesson.status === 'completed';
        const isSelected = selectedIds.has(String(lesson.id));

        // Check if lesson time has passed (for showing "Mark" in blue)
        const now = new Date();
        const lessonDateTime = new Date(`${lesson.date}T${lesson.time}:00`);
        const needsMarking = now > lessonDateTime && !isCompleted && !isCancelled;

        return (
            <div key={lesson.id} className="space-y-2">
                <div className="flex items-center gap-3">
                    {isSelectionMode && (
                        <button
                            onClick={() => toggleLessonSelection(String(lesson.id))}
                            className="p-1 active:scale-90 transition-transform"
                        >
                            {isSelected ? (
                                <CheckCircle2 className="w-6 h-6 text-ios-blue fill-current bg-white dark:bg-black rounded-full" />
                            ) : (
                                <Circle className="w-6 h-6 text-ios-gray" />
                            )}
                        </button>
                    )}
                    <button
                        onClick={() => {
                            if (isSelectionMode) {
                                toggleLessonSelection(String(lesson.id));
                            } else {
                                setSelectedLesson(lesson);
                            }
                        }}
                        className={cn(
                            "flex-1 text-left ios-card dark:bg-zinc-900 border border-gray-100 dark:border-zinc-800 transition-all",
                            isToday && !isCancelled && !isSelectionMode && "ring-2 ring-ios-blue shadow-lg",
                            isCancelled && "opacity-50",
                            isSelected && "bg-ios-blue/5 border-ios-blue/30 dark:bg-ios-blue/10 dark:border-ios-blue/30 scale-[0.98]",
                            !isSelectionMode && "active:scale-[0.98]"
                        )}
                    >
                        {/* Title row with status */}
                        <div className="flex justify-between items-center mb-1">
                            <div className="flex items-center gap-3">
                                <div
                                    className="w-4 h-4 rounded-full flex-shrink-0"
                                    style={{ backgroundColor: getGroupColor(lesson.group_id) }}
                                />
                                <h3 className={cn(
                                    "text-xl font-bold dark:text-white leading-none",
                                    isCancelled && "line-through"
                                )}>
                                    {getGroupName(lesson.group_id)}
                                </h3>
                            </div>
                            {isSelectionMode ? null : (
                                <>
                                    {isCancelled ? (
                                        <span className="flex items-center gap-1 text-ios-gray text-sm font-medium">
                                            <Ban className="w-4 h-4" />
                                            {t('skipped')}
                                        </span>
                                    ) : isCompleted ? (
                                        <span className="flex items-center gap-1 text-ios-green text-sm font-medium">
                                            <CheckCircle2 className="w-4 h-4" />
                                            {t('completed')}
                                        </span>
                                    ) : needsMarking ? (
                                        <span className="flex items-center gap-1 text-ios-blue text-sm font-medium">
                                            <Circle className="w-4 h-4" />
                                            {t('needs_marking')}
                                        </span>
                                    ) : (
                                        <span className="text-ios-orange text-sm font-medium">
                                            {t('upcoming')}
                                        </span>
                                    )}
                                </>
                            )}
                        </div>
                        {/* Time row - full width */}
                        <div className="flex items-baseline justify-between text-ios-gray text-sm pl-7">
                            <div className="flex items-center gap-1">
                                <span>{formatTimeRange(lesson.time, lesson.duration_minutes)}, {lesson.duration_minutes} {t('minutes')}</span>
                            </div>
                            {!isSelectionMode && (
                                <div className="flex items-center gap-1 flex-shrink-0">
                                    <div className="flex items-center gap-1">
                                        <Users className="w-4 h-4" />
                                        <span>{lesson.students_count || 0}/{getGroupMemberCount(lesson.group_id)}</span>
                                    </div>
                                </div>
                            )}
                        </div>
                    </button>
                </div>
            </div>
        );
    };

    return (
        <div className="flex flex-col h-full bg-ios-background dark:bg-black overflow-hidden relative overscroll-y-contain">
            {!isReady && (
                <div className="absolute inset-0 flex items-center justify-center z-50 bg-ios-background dark:bg-black">
                    <Loader2 className="w-8 h-8 text-zinc-400/50 dark:text-zinc-600/50 animate-spin" />
                </div>
            )}
            <div
                ref={containerRef}
                className={cn(
                    "flex-1 overflow-y-auto relative px-4 pt-0 pb-32 transition-opacity duration-500",
                    isReady ? "opacity-100" : "opacity-0 invisible"
                )}
            >
                {timeline.hasMorePast && (
                    <div className="text-center py-2 text-ios-gray text-sm mb-4">
                        {isLoadingMore ? t('loading') || 'Loading...' : `↑ ${t('scroll_for_more') || 'Scroll up for more'}`}
                    </div>
                )}

                <div className="space-y-4 pt-4">
                    {/* Past dates */}
                    {timeline.visiblePastDates.map(dateStr => (
                        <div key={dateStr} className="space-y-2">
                            <span className="text-sm font-semibold text-ios-gray px-1 uppercase tracking-wider">
                                {formatDate(dateStr, i18n)}
                            </span>
                            {renderExternalEventsForDate(dateStr)}
                            {timeline.daysMap[dateStr].lessons.map(l => renderLesson(l))}
                        </div>
                    ))}

                    {/* Today section - always visible */}
                    <div className="space-y-2" ref={todayRef}>
                        <div className="border-b-2 border-ios-red pb-2">
                            <span className="text-sm font-semibold text-ios-red uppercase tracking-wider">
                                {formatTodayHeader()}
                            </span>
                        </div>
                        {/* External events for today */}
                        {renderExternalEventsForDate(today)}
                        {timeline.daysMap[today].lessons.length === 0 && (getExternalEventsForDate(externalEvents, (() => {
                            const [y, m, d] = today.split('-').map(Number);
                            return new Date(y, m - 1, d);
                        })()).length === 0) ? (
                            <p className="text-ios-gray text-sm py-2">{t('no_classes_today') || 'No classes today'}</p>
                        ) : (
                            timeline.daysMap[today].lessons.map(l => renderLesson(l))
                        )}
                    </div>

                    {/* Future dates */}
                    {timeline.futureDates.map(dateStr => (
                        <div key={dateStr} className="space-y-2">
                            <span className="text-sm font-semibold text-ios-gray px-1 uppercase tracking-wider">
                                {formatDate(dateStr, i18n)}
                            </span>
                            {renderExternalEventsForDate(dateStr)}
                            {timeline.daysMap[dateStr].lessons.map(l => renderLesson(l))}
                        </div>
                    ))}
                </div>
            </div>

            {/* Selection Toolbar */}
            {isSelectionMode && (
                <div className="fixed bottom-20 left-4 right-4 z-50 animate-in slide-in-from-bottom-5 duration-300">
                    <div className="bg-white/80 dark:bg-zinc-900/80 backdrop-blur-xl border border-gray-200 dark:border-zinc-800 rounded-3xl p-4 shadow-2xl flex items-center justify-between">
                        <div className="flex flex-col">
                            <span className="text-xs font-black text-ios-gray uppercase tracking-widest">{t('lessons_selected')}</span>
                            <span className="text-xl font-bold dark:text-white">{selectedIds.size}</span>
                        </div>
                        <button
                            onClick={handleBulkDelete}
                            disabled={selectedIds.size === 0}
                            className="flex items-center gap-2 px-6 py-3 bg-ios-red text-white rounded-2xl font-bold active:scale-95 transition-transform disabled:opacity-50"
                        >
                            <Trash2 className="w-5 h-5" />
                            {t('delete_lesson')}
                        </button>
                    </div>
                </div>
            )}

            <LessonDetailSheet
                lesson={selectedLesson}
                onClose={() => setSelectedLesson(null)}
            />

            {/* Floating Today Button */}
            <button
                onClick={() => {
                    if (todayRef.current && containerRef.current) {
                        containerRef.current.scrollTo({
                            top: todayRef.current.offsetTop - 16,
                            behavior: 'smooth'
                        });
                    }
                }}
                className={cn(
                    "fixed bottom-32 right-6 z-50 w-12 h-12 bg-ios-red text-white rounded-full shadow-lg flex items-center justify-center active:scale-90 transition-all duration-400",
                    todayButton.show && !isSelectionMode
                        ? "opacity-100 scale-100 translate-y-0"
                        : "opacity-0 scale-90 translate-y-4 pointer-events-none"
                )}
            >
                {todayButton.direction === 'up' ? (
                    <ArrowUp className="w-6 h-6" />
                ) : (
                    <ArrowDown className="w-6 h-6" />
                )}
            </button>
        </div>
    );
};
