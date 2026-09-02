import assert from 'node:assert/strict';
import { test } from 'node:test';
import { addMonthsToDateKey, calculateAvailability, localMinuteToEpochMs } from '../convex/spaceAvailability.ts';

const openWeek = {
  sunday: null,
  monday: { start: 9 * 60, end: 18 * 60 },
  tuesday: { start: 9 * 60, end: 18 * 60 },
  wednesday: { start: 9 * 60, end: 18 * 60 },
  thursday: { start: 9 * 60, end: 18 * 60 },
  friday: { start: 9 * 60, end: 18 * 60 },
  saturday: null,
};

test('availability is limited to local working hours and merges overlapping bookings', () => {
  const timeZone = 'Asia/Tbilisi';
  const start = localMinuteToEpochMs('2026-09-07', 10 * 60, timeZone);
  const end = localMinuteToEpochMs('2026-09-07', 12 * 60, timeZone);
  const days = calculateAvailability({
    busyIntervals: [
      { start, end: localMinuteToEpochMs('2026-09-07', 11 * 60, timeZone) },
      { start: localMinuteToEpochMs('2026-09-07', 10 * 60 + 30, timeZone), end },
    ],
    startDate: '2026-09-07', endDate: '2026-09-07', minimumMinutes: 30, timeZone, workingHours: openWeek,
  });
  assert.deepEqual(days[0].windows, [
    { start: localMinuteToEpochMs('2026-09-07', 9 * 60, timeZone), end: start },
    { start: end, end: localMinuteToEpochMs('2026-09-07', 18 * 60, timeZone) },
  ]);
});

test('closed days have no availability and short gaps stay hidden', () => {
  const timeZone = 'Asia/Tbilisi';
  const days = calculateAvailability({
    busyIntervals: [{ start: localMinuteToEpochMs('2026-09-07', 9 * 60 + 20, timeZone), end: localMinuteToEpochMs('2026-09-07', 18 * 60, timeZone) }],
    startDate: '2026-09-06', endDate: '2026-09-07', minimumMinutes: 30, timeZone, workingHours: openWeek,
  });
  assert.deepEqual(days.map(day => day.windows), [[], []]);
});

test('gaps shorter than one hour are not available', () => {
  const timeZone = 'Asia/Tbilisi';
  const days = calculateAvailability({
    busyIntervals: [
      { start: localMinuteToEpochMs('2026-09-07', 9 * 60, timeZone), end: localMinuteToEpochMs('2026-09-07', 10 * 60, timeZone) },
      { start: localMinuteToEpochMs('2026-09-07', 10 * 60 + 45, timeZone), end: localMinuteToEpochMs('2026-09-07', 18 * 60, timeZone) },
    ],
    startDate: '2026-09-07', endDate: '2026-09-07', minimumMinutes: 60, timeZone, workingHours: openWeek,
  });
  assert.deepEqual(days[0].windows, []);
});

test('timezone conversion preserves the requested wall-clock time across DST', () => {
  const winter = localMinuteToEpochMs('2026-01-15', 9 * 60, 'Europe/Berlin');
  const summer = localMinuteToEpochMs('2026-07-15', 9 * 60, 'Europe/Berlin');
  assert.equal(new Date(winter).toISOString(), '2026-01-15T08:00:00.000Z');
  assert.equal(new Date(summer).toISOString(), '2026-07-15T07:00:00.000Z');
});

test('adding months clamps dates to the last day of shorter months', () => {
  assert.equal(addMonthsToDateKey('2026-12-31', 2), '2027-02-28');
  assert.equal(addMonthsToDateKey('2028-12-31', 2), '2029-02-28');
});
