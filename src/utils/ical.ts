import type { ExternalCalendar, ExternalEvent } from '../types';

// Helper to get UTC offset for a timezone at a specific date
function getTimeZoneOffset(date: Date, timeZone: string): number {
    try {
        const parts = new Intl.DateTimeFormat('en-US', {
            timeZone,
            year: 'numeric', month: 'numeric', day: 'numeric',
            hour: 'numeric', minute: 'numeric', second: 'numeric',
            hour12: false
        }).formatToParts(date);

        const map: any = {};
        parts.forEach(p => map[p.type] = p.value);

        const tzDate = new Date(Date.UTC(
            parseInt(map.year),
            parseInt(map.month) - 1,
            parseInt(map.day),
            map.hour === '24' ? 0 : parseInt(map.hour),
            parseInt(map.minute),
            parseInt(map.second)
        ));

        return tzDate.getTime() - date.getTime();
    } catch (e) {
        return 0;
    }
}

// Parse iCal date format: 20250106T120000Z or 20250106
function parseICalDate(dateStr: string, tzid?: string): Date {
    // Remove any VALUE=DATE: prefix
    dateStr = dateStr.replace(/^VALUE=DATE:/i, '');

    if (dateStr.includes('T')) {
        // DateTime format: 20250106T120000 or 20250106T120000Z
        const year = parseInt(dateStr.slice(0, 4));
        const month = parseInt(dateStr.slice(4, 6)) - 1;
        const day = parseInt(dateStr.slice(6, 8));
        const hour = parseInt(dateStr.slice(9, 11)) || 0;
        const minute = parseInt(dateStr.slice(11, 13)) || 0;
        const second = parseInt(dateStr.slice(13, 15)) || 0;

        if (dateStr.endsWith('Z')) {
            return new Date(Date.UTC(year, month, day, hour, minute, second));
        }

        if (tzid) {
            const utcGuess = new Date(Date.UTC(year, month, day, hour, minute, second));
            const offset = getTimeZoneOffset(utcGuess, tzid);
            return new Date(utcGuess.getTime() - offset);
        }

        // Floating time - treat as local time
        return new Date(year, month, day, hour, minute, second);
    } else {
        // All-day date format: 20250106
        const year = parseInt(dateStr.slice(0, 4));
        const month = parseInt(dateStr.slice(4, 6)) - 1;
        const day = parseInt(dateStr.slice(6, 8));
        // For all-day events, we use local midnight
        return new Date(year, month, day);
    }
}

// Unfold iCal lines (lines starting with space are continuations)
function unfoldLines(text: string): string[] {
    return text
        .replace(/\r\n /g, '') // CRLF + space = continuation
        .replace(/\r\n\t/g, '') // CRLF + tab = continuation
        .split(/\r\n|\r|\n/)
        .filter(line => line.trim());
}

// Unescape iCal text values
function unescapeText(text: string): string {
    return text
        .replace(/\\n/g, '\n')
        .replace(/\\,/g, ',')
        .replace(/\\;/g, ';')
        .replace(/\\\\/g, '\\');
}

export function parseICalFeed(icsContent: string, calendarName?: string, calendarColor?: string, calendarId?: string): ExternalEvent[] {
    const events: ExternalEvent[] = [];
    const lines = unfoldLines(icsContent);

    let inEvent = false;
    let currentEvent: Partial<ExternalEvent> = {};

    let calendarTimeZone = '';

    for (const line of lines) {
        const colonIndex = line.indexOf(':');
        if (colonIndex === -1) continue;

        const keyPart = line.slice(0, colonIndex);
        const key = keyPart.split(';')[0].toUpperCase();
        const value = line.slice(colonIndex + 1);

        // Capture calendar-level properties
        if (key === 'X-WR-TIMEZONE') {
            calendarTimeZone = value.trim();
        }
        if (key === 'X-WR-CALNAME' && !calendarName) {
            calendarName = value.trim();
        }

        if (line === 'BEGIN:VEVENT') {
            inEvent = true;
            currentEvent = { calendarName, calendarColor, calendarId };
            continue;
        }

        if (line === 'END:VEVENT') {
            inEvent = false;
            if (currentEvent.uid && currentEvent.start && currentEvent.title) {
                events.push({
                    uid: currentEvent.uid,
                    title: currentEvent.title,
                    start: currentEvent.start,
                    end: currentEvent.end || currentEvent.start,
                    allDay: currentEvent.allDay || false,
                    location: currentEvent.location,
                    description: currentEvent.description,
                    url: currentEvent.url,
                    calendarName: currentEvent.calendarName,
                    calendarColor: currentEvent.calendarColor,
                    calendarId: currentEvent.calendarId,
                });
            }
            currentEvent = {};
            continue;
        }

        if (!inEvent) continue;

        // Extract TZID if present in key part (e.g. DTSTART;TZID=Asia/Tbilisi)
        let tzid = calendarTimeZone;
        if (keyPart.includes('TZID=')) {
            const match = keyPart.match(/TZID=([^;:]+)/);
            if (match) tzid = match[1];
        }

        switch (key) {
            case 'UID':
                currentEvent.uid = value;
                break;
            case 'SUMMARY':
                currentEvent.title = unescapeText(value);
                break;
            case 'DTSTART':
                currentEvent.start = parseICalDate(value, tzid);
                currentEvent.allDay = !value.includes('T');
                break;
            case 'DTEND':
                currentEvent.end = parseICalDate(value, tzid);
                break;
            case 'LOCATION':
                currentEvent.location = unescapeText(value);
                break;
            case 'DESCRIPTION':
                currentEvent.description = unescapeText(value);
                break;
            case 'URL':
                currentEvent.url = value.trim();
                break;
        }
    }

    return events;
}

// CORS proxies to try (in order)
const CORS_PROXIES = [
    (url: string) => `https://corsproxy.io/?${encodeURIComponent(url)}`,
    (url: string) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
    (url: string) => `https://proxy.cors.sh/${url}`,
    (url: string) => `https://thingproxy.freeboard.io/fetch/${url}`,
];

// Deduplication map to prevent multiple concurrent fetches of the same URL
const pendingFetches = new Map<string, Promise<ExternalEvent[] | null>>();

// Fetch and parse an iCal feed
// Returns null if all proxies fail
export async function fetchExternalCalendar(calendar: ExternalCalendar): Promise<ExternalEvent[] | null> {
    const originalUrl = calendar.url.replace(/^webcal:\/\//i, 'https://');

    // Add cache-busting but round to 5 minutes to avoid spamming proxies and allow their internal caching
    const fiveMinutesMins = 5 * 60 * 1000;
    const roundedTime = Math.floor(Date.now() / fiveMinutesMins) * fiveMinutesMins;
    const separator = originalUrl.includes('?') ? '&' : '?';
    const cacheBusterUrl = `${originalUrl}${separator}_t=${roundedTime}`;

    if (pendingFetches.has(cacheBusterUrl)) {
        return pendingFetches.get(cacheBusterUrl)!;
    }

    const fetchPromise = (async () => {
        // Try each CORS proxy until one works
        for (const makeProxyUrl of CORS_PROXIES) {
            try {
                const proxyUrl = makeProxyUrl(cacheBusterUrl);
                const response = await fetch(proxyUrl, {
                    headers: {
                        'Accept': 'text/calendar, text/plain, */*',
                    }
                });

                if (!response.ok) {
                    console.warn(`ical: Proxy failed for ${calendar.name} (${response.status}), trying next...`);
                    continue;
                }

                const icsContent = await response.text();

                // Check if it's actually iCal content
                if (!icsContent.includes('BEGIN:VCALENDAR')) {
                    console.warn(`ical: Invalid iCal content for ${calendar.name} from proxy, trying next...`);
                    continue;
                }

                const events = parseICalFeed(icsContent, calendar.name, calendar.color, calendar.id);
                return events;
            } catch (error) {
                // Network error or CORS block, try next proxy
                continue;
            }
        }
        return null;
    })();

    pendingFetches.set(cacheBusterUrl, fetchPromise);

    // Clean up after it's done (with a small delay to catch near-simultaneous calls)
    fetchPromise.finally(() => {
        setTimeout(() => pendingFetches.delete(cacheBusterUrl), 2000);
    });

    return fetchPromise;
}

// Get events for a specific date from external events
export function getExternalEventsForDate(events: ExternalEvent[], date: Date): ExternalEvent[] {
    const dateStart = new Date(date);
    dateStart.setHours(0, 0, 0, 0);
    const dateEnd = new Date(date);
    dateEnd.setHours(23, 59, 59, 999);

    return events.filter(event => {
        const eventStart = new Date(event.start);
        const eventEnd = new Date(event.end);

        // Check if the event overlaps with this date
        return eventStart <= dateEnd && eventEnd >= dateStart;
    });
}

// Generate and open a single-event .ics file to "open" it in the system calendar
export function openExternalEvent(event: ExternalEvent): void {
    const formatDate = (date: Date) => {
        return date.getUTCFullYear() +
            String(date.getUTCMonth() + 1).padStart(2, '0') +
            String(date.getUTCDate()).padStart(2, '0') +
            'T' +
            String(date.getUTCHours()).padStart(2, '0') +
            String(date.getUTCMinutes()).padStart(2, '0') +
            String(date.getUTCSeconds()).padStart(2, '0') +
            'Z';
    };

    const formatDateAllDay = (date: Date) => {
        return date.getFullYear() +
            String(date.getMonth() + 1).padStart(2, '0') +
            String(date.getDate()).padStart(2, '0');
    };

    const start = event.allDay ? formatDateAllDay(event.start) : formatDate(event.start);
    const end = event.allDay ? formatDateAllDay(new Date(event.end.getTime() + 86400000)) : formatDate(event.end);

    const icsLines = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        `X-WR-CALNAME:${event.calendarName || 'Suica Classes'}`,
        'PRODID:-//Suica//NONSGML External Event//EN',
        'BEGIN:VEVENT',
        `UID:${event.uid}`,
        `DTSTAMP:${formatDate(new Date())}`,
        `SUMMARY:${event.title}`,
        event.allDay ? `DTSTART;VALUE=DATE:${start}` : `DTSTART:${start}`,
        event.allDay ? `DTEND;VALUE=DATE:${end}` : `DTEND:${end}`,
        event.location ? `LOCATION:${event.location.replace(/,/g, '\\,')}` : '',
        event.description ? `DESCRIPTION:${event.description.replace(/\n/g, '\\n').replace(/,/g, '\\,')}` : '',
        event.url ? `URL:${event.url}` : '',
        'END:VEVENT',
        'END:VCALENDAR'
    ].filter(line => line !== '');

    const icsContent = icsLines.join('\r\n');

    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

    // 1. Only open event.url if it looks like a real external link (e.g. Google Calendar session)
    // Avoid opening it if it's missing or points back to our own app/origin.
    if (event.url && event.url.startsWith('http') && !event.url.includes(window.location.hostname)) {
        console.log('ical: Opening external URL:', event.url);
        window.open(event.url, '_blank');
        return;
    }

    // 2. On iOS, try to open the native Calendar app directly to the event's date
    if (isIOS) {
        const referenceDate = new Date('2001-01-01T00:00:00Z').getTime();

        // Normalize the date: use the start time, or noon if it's an all-day event
        const jumpDate = new Date(event.start);
        if (event.allDay) {
            jumpDate.setHours(12, 0, 0, 0);
        }

        const eventSeconds = Math.floor((jumpDate.getTime() - referenceDate) / 1000);
        const calshowUri = `calshow:${eventSeconds}`;

        console.log('ical: iOS Jump. URI:', calshowUri, 'Event:', event.title);

        // Using window.location.replace or assign for protocol jumps 
        // is generally more reliable in PWA/Standalone modes on iOS.
        window.location.assign(calshowUri);
        return;
    }

    // 3. Fallback/Non-iOS: Use a data URI to trigger the native calendar integration
    const base64 = btoa(unescape(encodeURIComponent(icsContent)));
    const dataUri = `data:text/calendar;base64,${base64}`;
    window.location.href = dataUri;
}

// ============================================
// LOCAL STORAGE MANAGEMENT
// ============================================

const EVENTS_CACHE_KEY = 'external_events_cache';
const LAST_FETCH_KEY = 'external_events_last_fetch';

// Cache for fetched events
export function getCachedEvents(): ExternalEvent[] {
    try {
        const stored = localStorage.getItem(EVENTS_CACHE_KEY);
        if (!stored) return [];
        const data = JSON.parse(stored);
        // Convert date strings back to Date objects
        return data.map((e: any) => ({
            ...e,
            start: new Date(e.start),
            end: new Date(e.end),
        }));
    } catch {
        return [];
    }
}

export function cacheEvents(events: ExternalEvent[]): void {
    localStorage.setItem(EVENTS_CACHE_KEY, JSON.stringify(events));
    localStorage.setItem(LAST_FETCH_KEY, Date.now().toString());
}

// Throttle: avoid fetching more than once every 1 minute
const FETCH_THROTTLE_MS = 60 * 1000;

// Fetch all enabled calendars and return combined events
export async function fetchAllExternalEvents(calendars: ExternalCalendar[] | null | undefined): Promise<ExternalEvent[]> {
    const cachedEvents = getCachedEvents();

    // 1. Handle loading state (still waiting for Convex)
    // If calendars is null/undefined, we are still loading. Return cache to avoid wiping UI.
    if (!calendars) {
        return cachedEvents;
    }

    // 2. Handle empty state (user has no calendars)
    if (calendars.length === 0) {
        return [];
    }

    const enabledCalendars = calendars.filter(c => c.enabled);
    if (enabledCalendars.length === 0) {
        cacheEvents([]);
        return [];
    }

    // 3. Throttle check
    const lastFetch = parseInt(localStorage.getItem(LAST_FETCH_KEY) || '0');
    if (Date.now() - lastFetch < FETCH_THROTTLE_MS && cachedEvents.length > 0) {
        return cachedEvents;
    }

    // 4. Fetch all in parallel
    const results = await Promise.all(enabledCalendars.map(async (calendar) => {
        try {
            const freshEvents = await fetchExternalCalendar(calendar);
            if (freshEvents !== null) {
                return freshEvents;
            }
        } catch (error) {
            console.error(`ical: Error fetching ${calendar.name}:`, error);
        }

        // If fetch failed, return cached events for THIS calendar
        // This prevents the whole calendar from disappearing intermittently.
        return cachedEvents.filter(e => e.calendarId === calendar.id);
    }));

    const allEvents = results.flat();

    // Only update cache if we actually have some data or all fetches explicitly returned empty lists (not failures)
    // Actually, results.flat() will contain either fresh or cached data, so it's safe to cache.
    cacheEvents(allEvents);

    return allEvents;
}
