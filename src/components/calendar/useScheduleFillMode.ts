import { useEffect, useMemo, useState } from 'react';
import { addDays, format } from 'date-fns';
import type { Group, GroupSchedule, Lesson } from '../../types';
import { bulkCreateLessons } from '../../db-server';

export interface GeneratedLessonCandidate {
  id: string;
  date: string;
  time: string;
  duration_minutes: number;
  group_id: string;
  schedule_id?: string;
}

interface DateRange {
  start: string;
  end: string;
}

interface UseScheduleFillModeArgs {
  lessons: Lesson[];
  groups: Group[];
  schedules: GroupSchedule[];
  editableGroupIds: Set<string>;
  getGroupName: (groupId: string) => string;
  refreshLessons: () => Promise<void>;
}

const REF_MONDAY = 1736121600000; // 2025-01-06 00:00 UTC
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MS_PER_WEEK = 7 * MS_PER_DAY;
const GENERATION_BUFFER_WEEKS = 8;
const GENERATION_EDGE_WEEKS = 2;

const toDateKey = (day: Date) => format(day, 'yyyy-MM-dd');

const parseDateKey = (dateKey: string) => {
  const [y, m, d] = dateKey.split('-').map(Number);
  return new Date(y, m - 1, d);
};

const shiftDateKey = (dateKey: string, days: number) => {
  const day = parseDateKey(dateKey);
  day.setDate(day.getDate() + days);
  return toDateKey(day);
};

const distanceInDays = (a: string, b: string) => {
  const dateA = parseDateKey(a).getTime();
  const dateB = parseDateKey(b).getTime();
  return Math.floor((dateA - dateB) / MS_PER_DAY);
};

export function useScheduleFillMode({
  lessons,
  groups,
  schedules,
  editableGroupIds,
  getGroupName,
  refreshLessons
}: UseScheduleFillModeArgs) {
  const canUseFillMode = editableGroupIds.size > 0;

  const [isScheduleFillMode, setIsScheduleFillMode] = useState(false);
  const [selectedGeneratedLessonIds, setSelectedGeneratedLessonIds] = useState<Set<string>>(new Set());
  const [visibleRange, setVisibleRange] = useState<DateRange | null>(null);
  const [generationRange, setGenerationRange] = useState<DateRange | null>(null);
  const [isAddingGeneratedLessons, setIsAddingGeneratedLessons] = useState(false);

  useEffect(() => {
    if (!canUseFillMode && isScheduleFillMode) {
      setIsScheduleFillMode(false);
    }
  }, [canUseFillMode, isScheduleFillMode]);

  useEffect(() => {
    if (!isScheduleFillMode || !visibleRange) return;

    const bufferDays = GENERATION_BUFFER_WEEKS * 7;

    if (!generationRange) {
      setGenerationRange({
        start: shiftDateKey(visibleRange.start, -bufferDays),
        end: shiftDateKey(visibleRange.end, bufferDays)
      });
      return;
    }

    const nearStart = distanceInDays(visibleRange.start, generationRange.start) <= GENERATION_EDGE_WEEKS * 7;
    const nearEnd = distanceInDays(generationRange.end, visibleRange.end) <= GENERATION_EDGE_WEEKS * 7;

    if (nearStart || nearEnd || visibleRange.start < generationRange.start || visibleRange.end > generationRange.end) {
      setGenerationRange({
        start: shiftDateKey(visibleRange.start, -bufferDays),
        end: shiftDateKey(visibleRange.end, bufferDays)
      });
    }
  }, [isScheduleFillMode, visibleRange, generationRange]);

  useEffect(() => {
    if (!isScheduleFillMode) {
      setSelectedGeneratedLessonIds(new Set());
      setGenerationRange(null);
    }
  }, [isScheduleFillMode]);

  const generatedCandidatesByDate = useMemo(() => {
    if (!isScheduleFillMode || !generationRange) return {} as Record<string, GeneratedLessonCandidate[]>;

    const editableSchedules = schedules.filter(schedule =>
      schedule.is_active && editableGroupIds.has(String(schedule.group_id))
    );

    if (editableSchedules.length === 0) return {} as Record<string, GeneratedLessonCandidate[]>;

    const schedulesByDay: Record<number, GroupSchedule[]> = {
      0: [],
      1: [],
      2: [],
      3: [],
      4: [],
      5: [],
      6: []
    };

    editableSchedules.forEach(schedule => {
      schedulesByDay[schedule.day_of_week]?.push(schedule);
    });

    const groupsById = new Map(groups.map(group => [String(group.id), group]));

    const existingExact = new Set<string>();
    lessons.forEach(lesson => {
      existingExact.add(`${lesson.date}|${lesson.time}|${lesson.group_id}|${lesson.duration_minutes}`);
    });

    const result: Record<string, GeneratedLessonCandidate[]> = {};

    const start = parseDateKey(generationRange.start);
    const end = parseDateKey(generationRange.end);

    for (let current = new Date(start); current <= end; current = addDays(current, 1)) {
      const dateKey = toDateKey(current);
      const daySchedules = schedulesByDay[current.getDay()] || [];

      for (const schedule of daySchedules) {
        const groupId = String(schedule.group_id);
        const group = groupsById.get(groupId);
        if (!group || group.status !== 'active') continue;
        if (group.last_class_date && dateKey > group.last_class_date) continue;

        if (schedule.frequency_weeks && schedule.frequency_weeks > 1) {
          const diff = parseDateKey(dateKey).getTime() - REF_MONDAY;
          const weeks = Math.floor(diff / MS_PER_WEEK);
          if ((weeks + (schedule.week_offset || 0)) % schedule.frequency_weeks !== 0) continue;
        }

        const duration = schedule.duration_minutes || group.default_duration_minutes || 60;
        const exactKey = `${dateKey}|${schedule.time}|${groupId}|${duration}`;
        if (existingExact.has(exactKey)) continue;

        const candidate: GeneratedLessonCandidate = {
          id: `${dateKey}|${schedule.time}|${groupId}|${duration}|${String(schedule.id)}`,
          date: dateKey,
          time: schedule.time,
          duration_minutes: duration,
          group_id: groupId,
          schedule_id: String(schedule.id)
        };

        if (!result[dateKey]) result[dateKey] = [];
        result[dateKey].push(candidate);
      }

      if (result[dateKey]) {
        result[dateKey].sort((a, b) => {
          if (a.time !== b.time) return a.time.localeCompare(b.time);
          return getGroupName(a.group_id).localeCompare(getGroupName(b.group_id));
        });
      }
    }

    return result;
  }, [isScheduleFillMode, generationRange, schedules, editableGroupIds, groups, lessons, getGroupName]);

  const generatedCandidatesById = useMemo(() => {
    const map = new Map<string, GeneratedLessonCandidate>();
    Object.values(generatedCandidatesByDate).forEach(dayCandidates => {
      dayCandidates.forEach(candidate => {
        map.set(candidate.id, candidate);
      });
    });
    return map;
  }, [generatedCandidatesByDate]);

  const selectedGeneratedCount = selectedGeneratedLessonIds.size;

  const toggleGeneratedCandidate = (candidateId: string) => {
    setSelectedGeneratedLessonIds(prev => {
      const next = new Set(prev);
      if (next.has(candidateId)) {
        next.delete(candidateId);
      } else {
        next.add(candidateId);
      }
      return next;
    });
  };

  const setVisibleDateRange = (nextStart: string | null, nextEnd: string | null) => {
    if (!nextStart || !nextEnd) return;
    setVisibleRange(prev => {
      if (prev?.start === nextStart && prev?.end === nextEnd) return prev;
      return { start: nextStart, end: nextEnd };
    });
  };

  const addSelectedGeneratedLessons = async () => {
    if (selectedGeneratedCount === 0 || isAddingGeneratedLessons) return;

    const selectedCandidates = Array.from(selectedGeneratedLessonIds)
      .map(id => generatedCandidatesById.get(id))
      .filter((candidate): candidate is GeneratedLessonCandidate => !!candidate);

    if (selectedCandidates.length === 0) return;

    try {
      setIsAddingGeneratedLessons(true);
      await bulkCreateLessons(selectedCandidates.map(candidate => ({
        group_id: candidate.group_id,
        date: candidate.date,
        time: candidate.time,
        duration_minutes: candidate.duration_minutes,
        status: 'upcoming' as const,
        schedule_id: candidate.schedule_id,
        students_count: 0,
        total_amount: 0
      })));
      await refreshLessons();
      setIsScheduleFillMode(false);
      setSelectedGeneratedLessonIds(new Set());
    } catch {
      alert('Failed to add lessons');
    } finally {
      setIsAddingGeneratedLessons(false);
    }
  };

  const toggleFillMode = () => {
    if (!canUseFillMode) return;
    setIsScheduleFillMode(prev => !prev);
  };

  return {
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
  };
}
