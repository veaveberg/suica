import { useQuery } from 'convex/react';
import { memo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';
import { getAuthToken, getAuthUserId, isAuthTokenExpired } from '../../auth-store';
import type { ManagedSpace } from '../../space-types';
import { useParam, setParams } from '../../hooks/useSearchParams';
import { SpaceAvailabilityCalendar } from './SpaceAvailabilityCalendar';
import { SpaceAvailabilityPostSheet } from './SpaceAvailabilityPostSheet';
import { sourceCalendarRange, type SpaceCalendarMode } from './spaceCalendarModel';
import type { SpaceCalendarDisplay } from './SpaceViewDropdown';

export const ManagedSpaceCalendar = memo(function ManagedSpaceCalendar({ onPeriodChange, showNowLine, space }: { onPeriodChange: (period: string) => void; showNowLine: boolean; space: ManagedSpace }) {
    const { t } = useTranslation();
    const viewParam = useParam('view');
    const displayParam = useParam('display');
    const sheetParam = useParam('sheet');
    const mode: SpaceCalendarMode = viewParam === 'month' ? 'month' : 'week';
    const display: SpaceCalendarDisplay = displayParam === 'events' ? 'events' : 'availability';
    const range = sourceCalendarRange(space.timeZone);
    const authToken = getAuthToken();
    const authUserId = getAuthUserId();
    const hasAuth = !!authToken && !!authUserId && !isAuthTokenExpired(authToken);
    const result = useQuery(api.spaces.getManagedAvailability, hasAuth ? {
        userId: authUserId as Id<'users'>,
        authToken,
        spaceId: space.id,
        ...range,
    } : 'skip');
    const changeMode = useCallback((next: SpaceCalendarMode) => setParams({ view: next }), []);

    return <div className="flex h-full min-h-0 flex-col">
        {result === undefined && <div className="flex flex-1 items-center justify-center text-sm text-ios-gray">{t('loading')}…</div>}
        {result === null && <div className="flex flex-1 items-center justify-center text-sm text-ios-gray">{t('space_calendar_unavailable')}</div>}
        {result?.kind === 'unavailable' && <div className="flex flex-1 items-center justify-center px-6 text-center text-sm text-ios-gray">{t('space_calendar_unavailable')}</div>}
        {result?.kind === 'ready' && <div className="min-h-0 flex-1"><SpaceAvailabilityCalendar content={display} days={result.days} events={result.events ?? []} eventColor={space.color} mode={mode} onModeChange={changeMode} onPeriodChange={onPeriodChange} showNowLine={showNowLine} timeZone={space.timeZone} workingHours={space.workingHours} showToolbar={false} />{sheetParam === 'space-post' && <SpaceAvailabilityPostSheet days={result.days} timeZone={space.timeZone} workingHours={space.workingHours} onClose={() => setParams({ sheet: null })} />}</div>}
    </div>;
});
