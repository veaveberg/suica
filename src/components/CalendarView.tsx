import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { format, addDays, subMonths, isToday, getDate } from 'date-fns';
import { ru, ka, enUS } from 'date-fns/locale';
import { Loader2, Users, Check, Calendar, Clock, Timer } from 'lucide-react';
import { useTelegram } from './TelegramProvider';
import { useData } from '../DataProvider';
import { LessonDetailSheet } from './LessonDetailSheet';
import type { Lesson } from '../types';
import { cn } from '../utils/cn';
import { formatCurrency } from '../utils/formatting';
import { getCachedEvents, fetchAllExternalEvents, getExternalEventsForDate, openExternalEvent } from '../utils/ical';
import type { ExternalEvent } from '../types';
import { useScheduleFillMode } from './calendar/useScheduleFillMode';
import { CalendarFloatingActions } from './calendar/CalendarFloatingActions';
import * as api from '../api';

interface CalendarViewProps {
  onYearChange?: (year: string) => void;
  externalEventsRefresh?: number; // Increment to trigger refresh
  isActive?: boolean;
}

interface DragState {
  lesson: Lesson;
  pointerId: number;
  offsetX: number;
  offsetY: number;
  hoverDate: string;
}

export const CalendarView: React.FC<CalendarViewProps> = ({ onYearChange, externalEventsRefresh, isActive }) => {
  const { t, i18n } = useTranslation();
  const { lessons, groups, students, externalCalendars, attendance, schedules, refreshLessons } = useData();
  const { convexUser, userId: currentTgId } = useTelegram();
  const isStudentGlobal = convexUser?.role === 'student';
  const isAdmin = convexUser?.role === 'admin';

  const myStudentIds = useMemo(() => {
    if (!currentTgId) return [];
    return students
      .filter(s => s.telegram_id === String(currentTgId))
      .map(s => String(s.id));
  }, [students, currentTgId]);

  const editableGroupIds = useMemo(() => {
    if (isStudentGlobal) return new Set<string>();
    if (isAdmin) {
      return new Set(groups.filter(group => group.status === 'active').map(group => String(group.id)));
    }
    return new Set(
      groups
        .filter(group => group.status === 'active' && group.userId === String(currentTgId))
        .map(group => String(group.id))
    );
  }, [groups, isStudentGlobal, isAdmin, currentTgId]);

  const [selectedLesson, setSelectedLesson] = useState<Lesson | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isReady, setIsReady] = useState(false);
  const [isFetchingExternal, setIsFetchingExternal] = useState(true);
  const hasInteracted = useRef(false);
  const [externalEvents, setExternalEvents] = useState<ExternalEvent[]>([]);
  const [todayButton, setTodayButton] = useState<{ show: boolean, direction: 'up' | 'down' }>({ show: false, direction: 'up' });
  const [dragState, setDragState] = useState<DragState | null>(null);
  const dragStartRef = useRef<{
    lesson: Lesson;
    pointerId: number;
    targetEl: HTMLElement;
    startX: number;
    startY: number;
    offsetX: number;
    offsetY: number;
  } | null>(null);
  const longPressTimerRef = useRef<number | null>(null);
  const autoScrollTimerRef = useRef<number | null>(null);
  const dragPointerRef = useRef<{ x: number; y: number } | null>(null);
  const dragQueuedPointRef = useRef<{ x: number; y: number } | null>(null);
  const dragRafRef = useRef<number | null>(null);
  const dragGhostRef = useRef<HTMLDivElement | null>(null);
  const suppressClickLessonIdRef = useRef<string | null>(null);
  const [pendingReschedule, setPendingReschedule] = useState<{
    lesson: Lesson;
    originalDate: string;
    targetDate: string;
  } | null>(null);
  const [showRescheduleConfirm, setShowRescheduleConfirm] = useState(false);
  const [rescheduleDate, setRescheduleDate] = useState('');
  const [rescheduleTime, setRescheduleTime] = useState('');
  const [rescheduleDuration, setRescheduleDuration] = useState<number | string>(60);
  const [isSavingReschedule, setIsSavingReschedule] = useState(false);

  // Fetch external calendar events
  useEffect(() => {
    if (!externalCalendars) return;

    setExternalEvents(getCachedEvents());

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

  const {
    canUseFillMode,
    isScheduleFillMode,
    toggleFillMode,
    generatedCandidatesByDate,
    selectedGeneratedLessonIds,
    selectedGeneratedCount,
    isAddingGeneratedLessons,
    toggleGeneratedCandidate,
    setVisibleDateRange,
    addSelectedGeneratedLessons
  } = useScheduleFillMode({
    lessons,
    groups,
    schedules,
    editableGroupIds,
    getGroupName,
    refreshLessons
  });

  const uniqueLessons = useMemo(() => {
    const seen = new Set<string>();
    return lessons.filter(lesson => {
      const id = String(lesson.id);
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    });
  }, [lessons]);

  const lessonsByDate = useMemo(() => {
    const map: Record<string, Lesson[]> = {};
    const dateOverrides = new Map<string, string>();

    if (pendingReschedule?.lesson.id) {
      dateOverrides.set(String(pendingReschedule.lesson.id), rescheduleDate || pendingReschedule.targetDate);
    }

    uniqueLessons.forEach(lesson => {
      const id = String(lesson.id);
      const date = dateOverrides.get(id) || lesson.date;
      if (!map[date]) map[date] = [];
      map[date].push(lesson);

      // Drag preview: keep the original lesson visible and add a preview copy on hovered day.
      if (
        dragState?.lesson.id &&
        String(dragState.lesson.id) === id &&
        dragState.hoverDate &&
        dragState.hoverDate !== lesson.date
      ) {
        if (!map[dragState.hoverDate]) map[dragState.hoverDate] = [];
        map[dragState.hoverDate].push(lesson);
      }
    });

    Object.values(map).forEach(dayLessons => {
      dayLessons.sort((a, b) => a.time.localeCompare(b.time));
    });

    return map;
  }, [uniqueLessons, pendingReschedule, rescheduleDate, dragState]);

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

  const clearLongPressTimer = () => {
    if (longPressTimerRef.current !== null) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const getHoverDateFromPoint = (x: number, y: number) => {
    const element = document.elementFromPoint(x, y) as HTMLElement | null;
    const dayCell = element?.closest('[data-date]') as HTMLElement | null;
    return dayCell?.getAttribute('data-date') || null;
  };

  const updateGhostPosition = () => {
    if (!dragState || !dragGhostRef.current || !dragPointerRef.current) return;
    const left = dragPointerRef.current.x - dragState.offsetX;
    const top = dragPointerRef.current.y - dragState.offsetY;
    dragGhostRef.current.style.transform = `translate3d(${left}px, ${top}px, 0)`;
  };

  const applyDragPoint = (x: number, y: number) => {
    dragPointerRef.current = { x, y };
    updateGhostPosition();
    const nextHoverDate = getHoverDateFromPoint(x, y);
    setDragState(prev => {
      if (!prev) return prev;
      if (!nextHoverDate || nextHoverDate === prev.hoverDate) return prev;
      return { ...prev, hoverDate: nextHoverDate };
    });
  };

  useEffect(() => {
    if (!dragState) return;

    const onPointerMove = (e: PointerEvent) => {
      if (e.pointerId !== dragState.pointerId) return;
      e.preventDefault();
      dragQueuedPointRef.current = { x: e.clientX, y: e.clientY };
      if (dragRafRef.current !== null) return;
      dragRafRef.current = window.requestAnimationFrame(() => {
        dragRafRef.current = null;
        const point = dragQueuedPointRef.current;
        if (!point) return;
        applyDragPoint(point.x, point.y);
      });
    };

    const onPointerUp = (e: PointerEvent) => {
      if (e.pointerId !== dragState.pointerId) return;

      const dragStart = dragStartRef.current;
      if (dragStart?.targetEl?.hasPointerCapture?.(dragState.pointerId)) {
        try {
          dragStart.targetEl.releasePointerCapture(dragState.pointerId);
        } catch {
          // no-op
        }
      }

      setDragState(prev => {
        if (!prev) return prev;

        const targetDate = prev.hoverDate || prev.lesson.date;
        if (targetDate !== prev.lesson.date) {
          setPendingReschedule({
            lesson: prev.lesson,
            originalDate: prev.lesson.date,
            targetDate
          });
          setRescheduleDate(targetDate);
          setRescheduleTime(prev.lesson.time);
          setRescheduleDuration(prev.lesson.duration_minutes);
          setShowRescheduleConfirm(true);
        }

        return null;
      });
      dragStartRef.current = null;
      dragPointerRef.current = null;
      dragQueuedPointRef.current = null;
      clearLongPressTimer();
    };

    window.addEventListener('pointermove', onPointerMove, { passive: false });
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);

    autoScrollTimerRef.current = window.setInterval(() => {
      if (!containerRef.current || !dragPointerRef.current) return;

      const container = containerRef.current;
      const rect = container.getBoundingClientRect();
      const x = dragPointerRef.current.x;
      const y = dragPointerRef.current.y;
      const threshold = 56;

      let delta = 0;
      if (y < rect.top + threshold) {
        const ratio = (rect.top + threshold - y) / threshold;
        delta = -Math.max(2, Math.round(ratio * 10));
      } else if (y > rect.bottom - threshold) {
        const ratio = (y - (rect.bottom - threshold)) / threshold;
        delta = Math.max(2, Math.round(ratio * 10));
      }

      if (delta !== 0) {
        container.scrollTop += delta;
      }

      const nextHoverDate = getHoverDateFromPoint(x, y);
      if (nextHoverDate) {
        setDragState(prev => {
          if (!prev || prev.hoverDate === nextHoverDate) return prev;
          return { ...prev, hoverDate: nextHoverDate };
        });
      }
    }, 16);

    return () => {
      if (dragRafRef.current !== null) {
        window.cancelAnimationFrame(dragRafRef.current);
        dragRafRef.current = null;
      }
      if (autoScrollTimerRef.current !== null) {
        window.clearInterval(autoScrollTimerRef.current);
        autoScrollTimerRef.current = null;
      }
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
    };
  }, [dragState]);

  useEffect(() => {
    updateGhostPosition();
  }, [dragState]);

  const handleRescheduleCancel = () => {
    setShowRescheduleConfirm(false);
    setPendingReschedule(null);
    suppressClickLessonIdRef.current = null;
  };

  const handleRescheduleSave = async () => {
    if (!pendingReschedule?.lesson.id || !rescheduleDate || !rescheduleTime) return;
    try {
      setIsSavingReschedule(true);
      await api.update('lessons', pendingReschedule.lesson.id, {
        date: rescheduleDate,
        time: rescheduleTime,
        duration_minutes: Number(rescheduleDuration)
      });
      await refreshLessons();
      setShowRescheduleConfirm(false);
      setPendingReschedule(null);
      suppressClickLessonIdRef.current = null;
    } finally {
      setIsSavingReschedule(false);
    }
  };

  // Scroll to today on mount
  useEffect(() => {
    if (hasInteracted.current) return;

    const scrollToToday = () => {
      if (hasInteracted.current || !isActive) return;

      const todayElement = document.getElementById('today-cell');
      if (todayElement && containerRef.current) {
        todayElement.scrollIntoView({ block: 'center' });

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

  // Handle scroll for today button, visible years, and schedule-candidate generation range
  useEffect(() => {
    const handleScroll = () => {
      const container = containerRef.current;
      if (!container) return;
      if (dragState) return;

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

      const containerRect = container.getBoundingClientRect();
      const visibleCells = container.querySelectorAll<HTMLElement>('[data-year]');
      const years = new Set<number>();
      let visibleStart: string | null = null;
      let visibleEnd: string | null = null;

      visibleCells.forEach(cell => {
        const rect = cell.getBoundingClientRect();
        if (rect.top < containerRect.bottom && rect.bottom > containerRect.top) {
          years.add(parseInt(cell.getAttribute('data-year') || '0', 10));
          const date = cell.getAttribute('data-date');
          if (date) {
            if (!visibleStart || date < visibleStart) visibleStart = date;
            if (!visibleEnd || date > visibleEnd) visibleEnd = date;
          }
        }
      });

      if (visibleStart && visibleEnd) {
        setVisibleDateRange(visibleStart, visibleEnd);
      }

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
  }, [onYearChange, dragState]);

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
          'h-full overflow-y-auto overscroll-y-contain hide-scrollbar pb-40 relative transition-opacity duration-500 scroll-pt-[40px] select-none',
          isReady ? 'opacity-100' : 'opacity-0 invisible'
        )}
        style={{ WebkitUserSelect: 'none', WebkitTouchCallout: 'none' }}
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
          {allDays.map(day => {
            const dateKey = format(day, 'yyyy-MM-dd');
            const dayLessons = lessonsByDate[dateKey] || [];
            const dayGeneratedCandidates = generatedCandidatesByDate[dateKey] || [];
            const isTodayDay = isToday(day);
            const isFirst = isFirstOfMonth(day);
            const monthParity = getMonthParity(day);

            return (
              <React.Fragment key={day.toISOString()}>
                <div
                  id={isTodayDay ? 'today-cell' : undefined}
                  data-year={day.getFullYear()}
                  data-date={dateKey}
                  className={cn(
                    'min-h-[100px] p-0.5 flex flex-col gap-0.5 border-r border-b',
                    monthParity === 0
                      ? 'bg-white dark:bg-zinc-900 border-gray-200 dark:border-zinc-800'
                      : 'bg-gray-100 dark:bg-zinc-800 border-gray-200 dark:border-zinc-800',
                    isFirst && 'border-t-2 border-t-gray-400 dark:border-t-zinc-600'
                  )}
                >
                  <div className="flex flex-col ml-0.5 mt-0.5">
                    {isFirst && (() => {
                      const fullName = format(day, 'LLLL', { locale: currentLocale });
                      const shortName = format(day, 'MMM', { locale: currentLocale });
                      const maxLen = i18n.language.toUpperCase() === 'KA' ? 5 : 4;
                      const displayName = fullName.length <= maxLen ? fullName : shortName;
                      return (
                        <span className="text-sm font-black text-black dark:text-white uppercase leading-tight">
                          {displayName}
                        </span>
                      );
                    })()}
                    <span className={cn(
                      'text-xs font-bold w-6 h-6 flex items-center justify-center rounded-full',
                      isTodayDay ? 'bg-ios-red text-white' : 'text-ios-gray dark:text-ios-gray'
                    )}>
                      {format(day, 'd')}
                    </span>
                  </div>

                  <div className="flex flex-col gap-0.5 overflow-hidden">
                    {dayLessons.map(lesson => {
                      const color = getGroupColor(lesson.group_id);
                      const isCancelled = lesson.status === 'cancelled';
                      const isOwner = lesson.userId === String(currentTgId);
                      const canOpen = isAdmin || isOwner;
                      const canDrag = canOpen && !isScheduleFillMode && !showRescheduleConfirm;
                      const isDraggedOriginal =
                        !!dragState?.lesson.id &&
                        String(dragState.lesson.id) === String(lesson.id) &&
                        dateKey === dragState.lesson.date;
                      return (
                        <button
                          key={lesson.id}
                          onClick={() => {
                            if (!canOpen) return;
                            if (suppressClickLessonIdRef.current) {
                              const isSuppressedLesson = suppressClickLessonIdRef.current === String(lesson.id);
                              suppressClickLessonIdRef.current = null;
                              if (isSuppressedLesson) return;
                            }
                            setSelectedLesson(lesson);
                          }}
                          onPointerDown={(e) => {
                            if (!canDrag || !lesson.id || e.button !== 0) return;
                            const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                            const targetEl = e.currentTarget as HTMLElement;
                            dragStartRef.current = {
                              lesson,
                              pointerId: e.pointerId,
                              targetEl,
                              startX: e.clientX,
                              startY: e.clientY,
                              offsetX: e.clientX - rect.left,
                              offsetY: e.clientY - rect.top
                            };
                            clearLongPressTimer();
                            longPressTimerRef.current = window.setTimeout(() => {
                              const start = dragStartRef.current;
                              if (!start || !start.lesson.id) return;
                              dragPointerRef.current = { x: start.startX, y: start.startY };
                              try {
                                start.targetEl.setPointerCapture(start.pointerId);
                              } catch {
                                // no-op
                              }
                              suppressClickLessonIdRef.current = String(start.lesson.id);
                              setDragState({
                                lesson: start.lesson,
                                pointerId: start.pointerId,
                                offsetX: start.offsetX,
                                offsetY: start.offsetY,
                                hoverDate: start.lesson.date
                              });
                            }, 280);
                          }}
                          onPointerMove={(e) => {
                            const start = dragStartRef.current;
                            if (start && e.pointerId !== start.pointerId) return;
                            if (!start || dragState) return;
                            const moved = Math.hypot(e.clientX - start.startX, e.clientY - start.startY) > 8;
                            if (moved) {
                              clearLongPressTimer();
                              dragStartRef.current = null;
                            }
                          }}
                          onPointerUp={(e) => {
                            const start = dragStartRef.current;
                            if (start && e.pointerId !== start.pointerId) return;
                            if (!dragState) {
                              clearLongPressTimer();
                              dragStartRef.current = null;
                            }
                          }}
                          onPointerLeave={() => {
                            if (!dragState) {
                              clearLongPressTimer();
                            }
                          }}
                          className={cn(
                            'w-full text-[9px] text-left px-1 py-0.5 rounded-md transition-transform leading-tight overflow-hidden',
                            canOpen ? 'active:scale-95' : 'cursor-default',
                            isCancelled ? 'opacity-40' : '',
                            isDraggedOriginal && 'opacity-50'
                          )}
                          style={{
                            backgroundColor: isCancelled ? `${color}20` : color,
                            color: isCancelled ? color : '#FFFFFF',
                            touchAction: canDrag ? 'none' : 'auto'
                          }}
                        >
                          <div className={cn('font-bold leading-[1.1]', isCancelled && 'line-through')}>
                            {getGroupName(lesson.group_id)}
                            {(() => {
                              const isOwnerLesson = lesson.userId === String(currentTgId);
                              const isStudentInContext = isStudentGlobal || !isOwnerLesson;
                              return isStudentInContext && lesson.teacherName ? `, ${lesson.teacherName}` : '';
                            })()}
                          </div>
                          <div className="opacity-90 truncate">
                            {formatT(lesson.time)}–{formatT(lesson.time, lesson.duration_minutes)}
                          </div>
                          <div className="opacity-70 whitespace-nowrap">
                            {(() => {
                              const isOwnerLesson = lesson.userId === String(currentTgId);
                              const isStudentInContext = isStudentGlobal || !isOwnerLesson;

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

                    {isScheduleFillMode && dayGeneratedCandidates.map(candidate => {
                      const color = getGroupColor(candidate.group_id);
                      const isSelected = selectedGeneratedLessonIds.has(candidate.id);

                      return (
                        <div
                          key={candidate.id}
                          role="button"
                          tabIndex={0}
                          onClick={() => toggleGeneratedCandidate(candidate.id)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              toggleGeneratedCandidate(candidate.id);
                            }
                          }}
                          className={cn(
                            'relative w-full text-[9px] text-left px-1 py-0.5 rounded-md leading-tight overflow-hidden transition-all cursor-pointer active:scale-95 border border-transparent'
                          )}
                          style={{
                            backgroundColor: 'transparent',
                            borderColor: color,
                            outline: isSelected ? '2px solid var(--ios-blue)' : undefined,
                            outlineOffset: isSelected ? '-2px' : undefined,
                            color
                          }}
                        >
                          <div className="font-bold leading-[1.1] truncate pr-5">{getGroupName(candidate.group_id)}</div>
                          <div className="opacity-90 truncate">
                            {formatT(candidate.time)}–{formatT(candidate.time, candidate.duration_minutes)}
                          </div>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleGeneratedCandidate(candidate.id);
                            }}
                            className={cn(
                              'absolute top-1 right-1 w-3.5 h-3.5 rounded-full border-[1.5px] flex items-center justify-center transition-colors',
                              isSelected
                                ? 'bg-ios-blue border-ios-blue text-white'
                                : 'bg-transparent opacity-90'
                            )}
                            style={{ borderColor: isSelected ? undefined : 'var(--ios-gray)' }}
                            aria-label={isSelected ? t('cancel') : t('add')}
                          >
                            {isSelected ? <Check className="w-2.5 h-2.5" /> : <span className="w-2.5 h-2.5" />}
                          </button>
                        </div>
                      );
                    })}

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

        {dragState && (
          <div
            ref={dragGhostRef}
            className="fixed z-[110] pointer-events-none w-[calc((100vw-1rem)/7)] max-w-[160px] text-[9px] text-left px-1 py-0.5 rounded-md leading-tight overflow-hidden opacity-50"
            style={{
              left: 0,
              top: 0,
              backgroundColor: getGroupColor(dragState.lesson.group_id),
              color: '#FFFFFF'
            }}
          >
            <div className="font-bold leading-[1.1]">
              {getGroupName(dragState.lesson.group_id)}
            </div>
            <div className="opacity-90 truncate">
              {formatT(dragState.lesson.time)}–{formatT(dragState.lesson.time, dragState.lesson.duration_minutes)}
            </div>
            <div className="opacity-70 whitespace-nowrap">
              {dragState.lesson.status === 'completed' && dragState.lesson.total_amount !== undefined ? (
                <span className="flex items-center">
                  <Users className="w-[9px] h-[9px] -translate-y-[0.5px]" />
                  <span>{dragState.lesson.students_count || 0}</span>
                  <span className="text-white/50 ml-1">{formatCurrency(dragState.lesson.total_amount)} ₾</span>
                </span>
              ) : (
                <span className="flex items-center">
                  <Users className="w-[9px] h-[9px] -translate-y-[0.5px]" />
                  <span>{dragState.lesson.students_count || 0}</span>
                </span>
              )}
            </div>
          </div>
        )}

        <CalendarFloatingActions
          canUseFillMode={canUseFillMode}
          isScheduleFillMode={isScheduleFillMode}
          selectedGeneratedCount={selectedGeneratedCount}
          isAddingGeneratedLessons={isAddingGeneratedLessons}
          todayButton={todayButton}
          onScrollToToday={() => {
            const todayElement = document.getElementById('today-cell');
            if (todayElement && containerRef.current) {
              todayElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
          }}
          onToggleFillMode={toggleFillMode}
          onAddGeneratedLessons={addSelectedGeneratedLessons}
        />

        {showRescheduleConfirm && pendingReschedule && (
          <div
            className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center"
            style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}
          >
            <div className="absolute inset-0 bg-black/40" />
            <div className="relative w-full max-w-lg bg-ios-card dark:bg-zinc-900 rounded-t-3xl sm:rounded-3xl p-4 border-t border-gray-200 dark:border-zinc-800">
              <div className="space-y-4">
                <div className="grid grid-cols-[2fr_1.2fr_110px] gap-2">
                  <div>
                    <label className="text-sm text-ios-gray uppercase font-semibold block mb-1 pl-1">{t('date') || 'Date'}</label>
                    <div className="relative flex items-center bg-ios-background dark:bg-zinc-800 rounded-xl px-3">
                      <Calendar className="w-4 h-4 text-ios-gray flex-shrink-0" />
                      <input
                        type="date"
                        value={rescheduleDate}
                        onChange={(e) => setRescheduleDate(e.target.value)}
                        className="w-full py-2.5 pl-2 bg-transparent dark:text-white text-base border-none focus:ring-0 outline-none [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:inset-0 [&::-webkit-calendar-picker-indicator]:opacity-0 [&::-webkit-calendar-picker-indicator]:cursor-pointer"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-sm text-ios-gray uppercase font-semibold block mb-1 pl-1">{t('time') || 'Time'}</label>
                    <div className="relative flex items-center bg-ios-background dark:bg-zinc-800 rounded-xl px-3">
                      <Clock className="w-4 h-4 text-ios-gray flex-shrink-0" />
                      <input
                        type="time"
                        value={rescheduleTime}
                        onChange={(e) => setRescheduleTime(e.target.value)}
                        className="w-full py-2.5 pl-2 bg-transparent dark:text-white text-base border-none focus:ring-0 outline-none [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:inset-0 [&::-webkit-calendar-picker-indicator]:opacity-0 [&::-webkit-calendar-picker-indicator]:cursor-pointer"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-sm text-ios-gray uppercase font-semibold block mb-1 pl-1">&nbsp;</label>
                    <div className="flex items-center bg-ios-background dark:bg-zinc-800 rounded-xl px-3">
                      <Timer className="w-4 h-4 text-ios-gray flex-shrink-0" />
                      <input
                        type="number"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        value={rescheduleDuration}
                        onChange={(e) => setRescheduleDuration(e.target.value)}
                        onFocus={(e) => e.target.select()}
                        className="w-full py-2.5 pl-2 bg-transparent dark:text-white text-base border-none focus:ring-0 outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none text-left"
                      />
                      <span className="text-base text-ios-gray pointer-events-none ml-1">
                        {t('minutes') || 'min'}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={handleRescheduleCancel}
                    className="flex-1 py-3 rounded-xl bg-gray-200 dark:bg-zinc-800 font-medium dark:text-white text-sm"
                  >
                    {t('cancel')}
                  </button>
                  <button
                    onClick={handleRescheduleSave}
                    disabled={isSavingReschedule}
                    className="flex-1 py-3 rounded-xl bg-ios-blue text-white font-medium text-sm shadow-lg shadow-ios-blue/20 disabled:opacity-50"
                  >
                    {isSavingReschedule ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : t('save')}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

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
