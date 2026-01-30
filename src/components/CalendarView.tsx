import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { format, addDays, subMonths, isToday, getDate } from 'date-fns';
import { ru, ka, enUS } from 'date-fns/locale';
import { ArrowUp, ArrowDown, Loader2, Users } from 'lucide-react';
import { useTelegram } from './TelegramProvider';
import { useData } from '../DataProvider';
import { LessonDetailSheet } from './LessonDetailSheet';
import type { Lesson } from '../types';
import { cn } from '../utils/cn';
import { formatCurrency } from '../utils/formatting';
import { getCachedEvents, fetchAllExternalEvents, getExternalEventsForDate, openExternalEvent } from '../utils/ical';
import type { ExternalEvent } from '../types';

interface CalendarViewProps {
  onYearChange?: (year: string) => void;
  externalEventsRefresh?: number; // Increment to trigger refresh
  isActive?: boolean;
}

export const CalendarView: React.FC<CalendarViewProps> = ({ onYearChange, externalEventsRefresh, isActive }) => {
  const { t, i18n } = useTranslation();
  const { lessons, groups, students, externalCalendars, attendance } = useData();
  const { convexUser, userId: currentTgId } = useTelegram();
  const isStudentGlobal = convexUser?.role === 'student';
  const isAdmin = convexUser?.role === 'admin';

  const myStudentIds = useMemo(() => {
    if (!currentTgId) return [];
    return students
      .filter(s => s.telegram_id === String(currentTgId))
      .map(s => String(s.id));
  }, [students, currentTgId]);
  const [selectedLesson, setSelectedLesson] = useState<Lesson | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isReady, setIsReady] = useState(false);
  const [isFetchingExternal, setIsFetchingExternal] = useState(true);
  const hasInteracted = useRef(false);
  const [externalEvents, setExternalEvents] = useState<ExternalEvent[]>([]);
  const [todayButton, setTodayButton] = useState<{ show: boolean, direction: 'up' | 'down' }>({ show: false, direction: 'up' });

  // Fetch external calendar events
  useEffect(() => {
    if (!externalCalendars) return;

    // Load cached events immediately
    setExternalEvents(getCachedEvents());

    // Then fetch fresh data
    fetchAllExternalEvents(externalCalendars).then(events => {
      setExternalEvents(events);
      setIsFetchingExternal(false);
    }).catch(() => {
      setIsFetchingExternal(false);
    });
  }, [externalEventsRefresh, externalCalendars]);

  // Lazy loading state for weeks
  const [weekCount, setWeekCount] = useState(104);

  const currentLocale = useMemo(() => {
    const lang = i18n.language.toUpperCase();
    if (lang === 'KA') return ka;
    if (lang === 'RU') return ru;
    return enUS;
  }, [i18n.language]);

  const getGroupName = (groupId: string) => {
    const group = groups.find(g => String(g.id) === String(groupId));
    return group?.name || 'Unknown';
  };

  const getGroupColor = (groupId: string) => {
    const group = groups.find(g => String(g.id) === String(groupId));
    return group?.color || '#007AFF';
  };


  // Deduplicate and group lessons by date
  const lessonsByDate = useMemo(() => {
    const map: Record<string, Lesson[]> = {};
    const seen = new Set<string>();

    lessons.forEach(l => {
      const key = `${l.date}-${l.time}-${l.group_id}`;
      if (seen.has(key)) return;
      seen.add(key);

      if (!map[l.date]) map[l.date] = [];
      map[l.date].push(l);
    });

    Object.values(map).forEach(dayLessons => {
      dayLessons.sort((a, b) => a.time.localeCompare(b.time));
    });

    return map;
  }, [lessons]);

  // Generate continuous date range
  const { allDays, todayIndex } = useMemo(() => {
    const now = new Date();
    const startDate = subMonths(now, 6);
    const dayOfWeek = startDate.getDay();
    const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const alignedStart = addDays(startDate, diff);

    const totalDays = weekCount * 7;
    const days: Date[] = [];
    let foundTodayIndex = -1;

    for (let i = 0; i < totalDays; i++) {
      const day = addDays(alignedStart, i);
      days.push(day);
      if (isToday(day)) {
        foundTodayIndex = i;
      }
    }

    return { allDays: days, todayIndex: foundTodayIndex };
  }, [weekCount]);

  const loadMore = () => {
    setWeekCount(prev => prev + 52);
  };

  // Scroll to today on mount
  useEffect(() => {
    if (hasInteracted.current) return;

    const scrollToToday = () => {
      if (hasInteracted.current || !isActive) return;

      const todayElement = document.getElementById('today-cell');
      if (todayElement && containerRef.current) {
        // Use the same centering logic as the floating today button
        todayElement.scrollIntoView({ block: 'center' });

        // Verify and set ready
        setTimeout(() => {
          if (!containerRef.current || hasInteracted.current) return;
          if (!isFetchingExternal) {
            setIsReady(true);
          }
        }, 200);
      }
    };

    scrollToToday();
    const timer = setTimeout(scrollToToday, 100);
    return () => clearTimeout(timer);
  }, [todayIndex, allDays.length, isFetchingExternal, isActive]);

  // Handle scroll for today button and visible years
  useEffect(() => {
    const handleScroll = () => {
      const container = containerRef.current;
      if (!container) return;

      // Mark as interacted on scroll if not programmatically triggered
      // Since we don't have isProgrammaticScroll here yet, let's keep it simple
      // or just rely on mouse/touch like in Dashboard.

      // Today button logic
      const element = document.getElementById('today-cell');
      if (!element) {
        setTodayButton({ show: true, direction: 'up' });
      } else {
        const rect = element.getBoundingClientRect();
        const containerRect = container.getBoundingClientRect();
        const isVisible = rect.top >= containerRect.top && rect.bottom <= containerRect.bottom;

        if (!isVisible) {
          const direction = rect.top < containerRect.top ? 'up' : 'down';
          setTodayButton({ show: true, direction });
        } else {
          setTodayButton(prev => ({ ...prev, show: false }));
        }
      }

      // Track visible years and notify parent
      const visibleCells = container.querySelectorAll('[data-year]');
      const years = new Set<number>();
      visibleCells.forEach(cell => {
        const rect = cell.getBoundingClientRect();
        const containerRect = container.getBoundingClientRect();
        if (rect.top < containerRect.bottom && rect.bottom > containerRect.top) {
          years.add(parseInt(cell.getAttribute('data-year') || '0'));
        }
      });

      // Format and send to parent
      if (onYearChange) {
        const yearsArray = Array.from(years).sort();
        if (yearsArray.length === 0) {
          onYearChange(new Date().getFullYear().toString());
        } else if (yearsArray.length === 1) {
          onYearChange(yearsArray[0].toString());
        } else {
          onYearChange(`${yearsArray[0]}–${yearsArray[yearsArray.length - 1]}`);
        }
      }
    };

    const container = containerRef.current;
    if (container) {
      const onInteraction = () => {
        hasInteracted.current = true;
      };

      container.addEventListener('scroll', handleScroll);
      container.addEventListener('touchstart', onInteraction, { passive: true });
      container.addEventListener('mousedown', onInteraction);
      container.addEventListener('wheel', onInteraction, { passive: true });

      setTimeout(handleScroll, 100);

      return () => {
        container.removeEventListener('scroll', handleScroll);
        container.removeEventListener('touchstart', onInteraction);
        container.removeEventListener('mousedown', onInteraction);
        container.removeEventListener('wheel', onInteraction);
      };
    }
  }, [onYearChange]);

  const weekDays = useMemo(() => {
    const now = new Date();
    return Array.from({ length: 7 }, (_, i) => {
      const day = addDays(now, (1 - now.getDay() + 7) % 7 + i);
      return format(day, 'EEEEEE', { locale: currentLocale });
    });
  }, [currentLocale]);

  const formatT = (timeStr: string, offsetMins = 0) => {
    const [h, m] = timeStr.split(':').map(Number);
    const date = new Date();
    date.setHours(h, m + offsetMins, 0, 0);
    const hours = date.getHours();
    const mins = date.getMinutes();
    return mins === 0 ? `${hours}` : `${hours}:${mins.toString().padStart(2, '0')}`;
  };

  const isFirstOfMonth = (day: Date) => getDate(day) === 1;
  const getMonthParity = (day: Date) => day.getMonth() % 2;
  return (
    <div className="h-full bg-ios-background dark:bg-black overflow-hidden relative overscroll-y-contain">
      {!isReady && (
        <div className="absolute inset-0 flex items-center justify-center z-50 bg-ios-background dark:bg-black">
          <Loader2 className="w-8 h-8 text-zinc-400/50 dark:text-zinc-600/50 animate-spin" />
        </div>
      )}

      <div
        ref={containerRef}
        className={cn(
          "h-full overflow-y-auto overscroll-y-contain hide-scrollbar pb-40 relative transition-opacity duration-500 scroll-pt-[40px]",
          isReady ? "opacity-100" : "opacity-0 invisible"
        )}
      >
        {/* Sticky Weekdays Header */}
        <div className="sticky top-0 z-30 bg-ios-background dark:bg-black border-b border-gray-200 dark:border-zinc-800">
          <div className="grid grid-cols-7">
            {weekDays.map(day => (
              <div key={day} className="py-2 pl-[11px] text-left">
                <span className="text-[10px] font-black text-ios-gray uppercase tracking-widest">{day}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Continuous Calendar Grid */}
        <div className="grid grid-cols-7">
          {allDays.map((day) => {
            const dateKey = format(day, 'yyyy-MM-dd');
            const dayLessons = lessonsByDate[dateKey] || [];
            const isTodayDay = isToday(day);
            const isFirst = isFirstOfMonth(day);
            const monthParity = getMonthParity(day);

            return (
              <React.Fragment key={day.toISOString()}>
                {/* Day Cell */}
                <div
                  id={isTodayDay ? 'today-cell' : undefined}
                  data-year={day.getFullYear()}
                  className={cn(
                    "min-h-[100px] p-0.5 flex flex-col gap-0.5 border-r border-b",
                    monthParity === 0
                      ? "bg-white dark:bg-zinc-900 border-gray-200 dark:border-zinc-800"
                      : "bg-gray-100 dark:bg-zinc-800 border-gray-200 dark:border-zinc-800",
                    // Stronger top border for first cell of new month only
                    isFirst && "border-t-2 border-t-gray-400 dark:border-t-zinc-600"
                  )}
                >
                  {/* Day number with month name for first of month */}
                  <div className="flex flex-col ml-0.5 mt-0.5">
                    {isFirst && (() => {
                      const fullName = format(day, 'LLLL', { locale: currentLocale });
                      const shortName = format(day, 'MMM', { locale: currentLocale });
                      // Use full name if short enough - 5 letters for Georgian, 4 for others
                      const maxLen = i18n.language.toUpperCase() === 'KA' ? 5 : 4;
                      const displayName = fullName.length <= maxLen ? fullName : shortName;
                      return (
                        <span className="text-sm font-black text-black dark:text-white uppercase leading-tight">
                          {displayName}
                        </span>
                      );
                    })()}
                    <span className={cn(
                      "text-xs font-bold w-6 h-6 flex items-center justify-center rounded-full",
                      isTodayDay ? "bg-ios-red text-white" : "text-ios-gray dark:text-ios-gray"
                    )}>
                      {format(day, 'd')}
                    </span>
                  </div>

                  {/* Lessons */}
                  <div className="flex flex-col gap-0.5 overflow-hidden">
                    {dayLessons.map(lesson => {
                      const color = getGroupColor(lesson.group_id);
                      const isCancelled = lesson.status === 'cancelled';
                      const isOwner = lesson.userId === String(currentTgId);
                      const canOpen = isAdmin || isOwner;
                      return (
                        <button
                          key={lesson.id}
                          onClick={() => canOpen && setSelectedLesson(lesson)}
                          className={cn(
                            "text-[9px] text-left px-1 py-0.5 rounded-md transition-transform leading-tight overflow-hidden",
                            canOpen ? "active:scale-95" : "cursor-default",
                            isCancelled ? "opacity-40" : ""
                          )}
                          style={{
                            backgroundColor: isCancelled ? `${color}20` : color,
                            color: isCancelled ? color : '#FFFFFF'
                          }}
                        >
                          <div className={cn("font-bold leading-[1.1]", isCancelled && "line-through")}>
                            {getGroupName(lesson.group_id)}
                            {(() => {
                              const isOwner = lesson.userId === String(currentTgId);
                              const isStudentInContext = isStudentGlobal || !isOwner;
                              return isStudentInContext && lesson.teacherName ? `, ${lesson.teacherName}` : '';
                            })()}
                          </div>
                          <div className="opacity-90 truncate">
                            {formatT(lesson.time)}–{formatT(lesson.time, lesson.duration_minutes)}
                          </div>
                          <div className="opacity-70 whitespace-nowrap">
                            {(() => {
                              const isOwner = lesson.userId === String(currentTgId);
                              const isStudentInContext = isStudentGlobal || !isOwner;

                              if (isStudentInContext) {
                                const userAttendance = attendance.find(a =>
                                  String(a.lesson_id) === String(lesson.id) &&
                                  myStudentIds.includes(String(a.student_id))
                                );

                                if (userAttendance) {
                                  return t(`attendance_${userAttendance.status}`);
                                }

                                if (lesson.status === 'completed') {
                                  return t('not_marked');
                                }

                                if (lesson.status === 'upcoming') {
                                  const now = new Date();
                                  const lessonDate = new Date(lesson.date);
                                  if (lessonDate < now) {
                                    return t('not_marked');
                                  }
                                  return t('upcoming');
                                }
                              }

                              const amount = lesson.status === 'completed' && lesson.total_amount !== undefined
                                ? formatCurrency(lesson.total_amount)
                                : null;

                              return (
                                <span className="flex items-center">
                                  <Users className="w-[9px] h-[9px] -translate-y-[0.5px]" />
                                  <span>{lesson.students_count || 0}</span>
                                  {amount !== null && (
                                    <span className="text-white/50 ml-1">{amount} ₾</span>
                                  )}
                                </span>
                              );
                            })()}
                          </div>
                        </button>
                      );
                    })}

                    {/* External Calendar Events */}
                    {getExternalEventsForDate(externalEvents, day).map(event => {
                      const startTime = format(event.start, 'HH:mm');
                      const endTime = format(event.end, 'HH:mm');
                      return (
                        <button
                          key={event.uid}
                          onClick={() => openExternalEvent(event)}
                          className="flex gap-1 text-[10px] items-stretch leading-[1.1] w-full text-left active:opacity-60 hover:bg-black/5 dark:hover:bg-white/5 rounded px-0.5 -mx-0.5 transition-colors"
                        >
                          <div
                            className="w-0.5 shrink-0 rounded-full"
                            style={{ backgroundColor: event.calendarColor || '#888' }}
                          />
                          <div className="min-w-0 flex-1">
                            <div className="font-medium truncate text-ios-gray dark:text-ios-gray">
                              {event.title}
                            </div>
                            {!event.allDay && (
                              <div className="opacity-60">
                                <span className="whitespace-nowrap">{formatT(startTime)}–</span>
                                <span>{formatT(endTime)}</span>
                              </div>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </React.Fragment>
            );
          })}
        </div>

        {/* Load More */}
        <div className="p-8 flex justify-center">
          <button
            onClick={loadMore}
            className="px-8 py-4 bg-ios-card dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-2xl text-ios-blue font-bold active:scale-95 transition-transform shadow-sm"
          >
            {t('load_more')}
          </button>
        </div>

        <LessonDetailSheet
          lesson={selectedLesson}
          onClose={() => setSelectedLesson(null)}
        />

        {/* Floating Today Button */}
        <button
          onClick={() => {
            const todayElement = document.getElementById('today-cell');
            if (todayElement && containerRef.current) {
              todayElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
          }}
          className={cn(
            "fixed bottom-32 right-6 z-50 w-12 h-12 bg-ios-red text-white rounded-full shadow-lg flex items-center justify-center active:scale-90 transition-all duration-400",
            todayButton.show
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

        <style>{`
        .hide-scrollbar::-webkit-scrollbar {
          display: none;
        }
        .hide-scrollbar {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
      `}</style>
      </div>
    </div>
  );
};
