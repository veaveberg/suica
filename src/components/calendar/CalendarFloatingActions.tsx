import React from 'react';
import { ArrowDown, ArrowUp, Check, Loader2, Plus, X } from 'lucide-react';
import { cn } from '../../utils/cn';

interface CalendarFloatingActionsProps {
  canUseFillMode: boolean;
  isScheduleFillMode: boolean;
  selectedGeneratedCount: number;
  isAddingGeneratedLessons: boolean;
  todayButton: { show: boolean; direction: 'up' | 'down' };
  onScrollToToday: () => void;
  onToggleFillMode: () => void;
  onAddGeneratedLessons: () => void;
  todayRightClassWhenFillMode?: string;
}

export const CalendarFloatingActions: React.FC<CalendarFloatingActionsProps> = ({
  canUseFillMode,
  isScheduleFillMode,
  selectedGeneratedCount,
  isAddingGeneratedLessons,
  todayButton,
  onScrollToToday,
  onToggleFillMode,
  onAddGeneratedLessons,
  todayRightClassWhenFillMode = 'right-[5.875rem]'
}) => {
  return (
    <>
      <button
        onClick={onScrollToToday}
        className={cn(
          'fixed bottom-32 z-50 w-12 h-12 bg-ios-red text-white rounded-full shadow-lg flex items-center justify-center active:scale-90 transition-all duration-400',
          canUseFillMode ? todayRightClassWhenFillMode : 'right-[1.375rem]',
          todayButton.show
            ? 'opacity-100 scale-100 translate-y-0'
            : 'opacity-0 scale-90 translate-y-4 pointer-events-none'
        )}
      >
        {todayButton.direction === 'up' ? (
          <ArrowUp className="w-6 h-6" />
        ) : (
          <ArrowDown className="w-6 h-6" />
        )}
      </button>

      {canUseFillMode && (
        <>
          <button
            onClick={onToggleFillMode}
            className={cn(
              'fixed bottom-32 right-6 z-50 w-12 h-12 text-white rounded-full shadow-lg flex items-center justify-center active:scale-90 transition-all duration-300',
              isScheduleFillMode ? 'bg-ios-gray' : 'bg-ios-blue'
            )}
          >
            {isScheduleFillMode ? (
              <X className="w-6 h-6" />
            ) : (
              <Plus className="w-6 h-6" />
            )}
          </button>

          <button
              onClick={onAddGeneratedLessons}
              disabled={!isScheduleFillMode || selectedGeneratedCount === 0 || isAddingGeneratedLessons}
              className={cn(
              'fixed bottom-[11.625rem] right-6 z-50 w-12 h-12 text-white rounded-full shadow-lg flex items-center justify-center active:scale-90 transition-all duration-400',
                selectedGeneratedCount > 0 ? 'bg-ios-green' : 'bg-ios-gray',
                isScheduleFillMode
                  ? 'opacity-100 scale-100 translate-y-0'
                : 'opacity-0 scale-90 translate-y-4 pointer-events-none',
              isScheduleFillMode && (selectedGeneratedCount === 0 || isAddingGeneratedLessons) && 'opacity-45'
            )}
          >
            {isAddingGeneratedLessons ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Check className="w-6 h-6" />
            )}
            {selectedGeneratedCount > 0 && !isAddingGeneratedLessons && (
              <span className="absolute -top-1 -right-1 min-w-5 h-5 px-1 rounded-full bg-ios-blue text-white text-[10px] font-bold flex items-center justify-center">
                {selectedGeneratedCount}
              </span>
            )}
          </button>
        </>
      )}
    </>
  );
};
