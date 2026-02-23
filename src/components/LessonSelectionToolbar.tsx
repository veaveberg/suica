import React from 'react';
import { useTranslation } from 'react-i18next';
import { Trash2 } from 'lucide-react';
import { cn } from '../utils/cn';

interface LessonSelectionToolbarProps {
  isVisible: boolean;
  count: number;
  onDelete: () => void;
  className?: string;
}

export const LessonSelectionToolbar: React.FC<LessonSelectionToolbarProps> = ({
  isVisible,
  count,
  onDelete,
  className
}) => {
  const { t } = useTranslation();

  return (
    <div
      className={cn(
        'fixed bottom-20 left-4 right-4 z-50 transition-all duration-400',
        isVisible
          ? 'opacity-100 scale-100 translate-y-0'
          : 'opacity-0 scale-90 translate-y-4 pointer-events-none',
        className
      )}
    >
      <div className="bg-white/80 dark:bg-zinc-900/80 backdrop-blur-xl border border-gray-200 dark:border-zinc-800 rounded-3xl p-4 shadow-2xl flex items-center justify-between">
        <div className="flex flex-col">
          <span className="text-xs font-black text-ios-gray uppercase tracking-widest">{t('lessons_selected')}</span>
          <span className="text-xl font-bold dark:text-white">
            {count} {t('lessons', { count })}
          </span>
        </div>
        <button
          onClick={onDelete}
          disabled={count === 0}
          className="flex items-center gap-2 px-6 py-3 bg-ios-red text-white rounded-2xl font-bold active:scale-95 transition-transform disabled:opacity-50"
        >
          <Trash2 className="w-5 h-5" />
          {t('delete')}
        </button>
      </div>
    </div>
  );
};
