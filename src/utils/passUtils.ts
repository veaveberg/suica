import type { TFunction } from 'i18next';

export interface PassDisplayData {
    name?: string;
    lessons_count?: number;
    lessons_total?: number;
    is_consecutive: boolean;
    duration_days?: number;
}

/**
 * Generates a display name for a pass (template or subscription).
 * e.g. "8 lessons", "4 lessons 30 days", "Single lesson"
 */
export const getPassDisplayName = (pass: PassDisplayData, t: TFunction) => {
    // If name is explicitly set (custom pass name), use it
    if (pass.name && pass.name.trim().length > 0) return pass.name;

    const count = pass.lessons_total || pass.lessons_count || 0;

    // Fallback for single lesson
    if (count === 1) return t('single_lesson');

    // Base part: "X lessons"
    let name = `${count} ${t('lessons', { count })}`;

    // Suffix: "in a row" or "X days"
    if (pass.is_consecutive) {
        name += ` ${t('in_a_row')}`;
    } else if (pass.duration_days) {
        name += ` ${pass.duration_days} ${t('days', { count: pass.duration_days })}`;
    }

    return name;
};
