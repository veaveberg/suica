import { createContext, useContext, useEffect, useMemo } from 'react';
import type { ReactNode } from 'react';
import {
    useGroups,
    useStudents,
    useLessons,
    useSubscriptions,
    useSchedules,
    useStudentGroups,
    useTariffs,
    usePasses,
    usePassGroups,
    useAttendance,
    useExternalCalendars,
    useManagedSpaces,
} from './db-server';
import { checkAndArchiveExpired } from './utils/balance';
import type { Group, Student, Lesson, Subscription, GroupSchedule, StudentGroup, Tariff, Pass, PassGroup, Attendance, ExternalCalendar } from './types';
import type { ManagedSpace } from './space-types';

interface DataContextType {
    groups: Group[];
    students: Student[];
    lessons: Lesson[];
    subscriptions: Subscription[];
    schedules: GroupSchedule[];
    studentGroups: StudentGroup[];
    tariffs: Tariff[];
    passes: Pass[];
    passGroups: PassGroup[];
    attendance: Attendance[];
    externalCalendars: ExternalCalendar[];
    managedSpaces: ManagedSpace[];
    loading: boolean;
    refreshAll: () => Promise<void>;
    refreshGroups: () => Promise<void>;
    refreshStudents: () => Promise<void>;
    refreshLessons: () => Promise<void>;
    refreshSubscriptions: () => Promise<void>;
    refreshSchedules: () => Promise<void>;
    refreshStudentGroups: () => Promise<void>;
    refreshTariffs: () => Promise<void>;
    refreshPasses: () => Promise<void>;
    refreshPassGroups: () => Promise<void>;
    refreshAttendance: () => Promise<void>;
    refreshExternalCalendars: () => Promise<void>;
    refreshManagedSpaces: () => Promise<void>;
}

const DataContext = createContext<DataContextType | null>(null);

export function DataProvider({ children }: { children: ReactNode }) {
    const groups = useGroups();
    const students = useStudents();
    const lessons = useLessons();
    const subscriptions = useSubscriptions();
    const schedules = useSchedules();
    const studentGroups = useStudentGroups();
    const tariffs = useTariffs();
    const passes = usePasses();
    const passGroups = usePassGroups();
    const attendance = useAttendance();
    const externalCalendars = useExternalCalendars();
    const managedSpaces = useManagedSpaces();

    const loading = groups.loading || students.loading || lessons.loading || subscriptions.loading || passes.loading || attendance.loading;

    const refreshAll = async () => {
        await Promise.all([
            groups.refresh(),
            students.refresh(),
            lessons.refresh(),
            subscriptions.refresh(),
            schedules.refresh(),
            studentGroups.refresh(),
            tariffs.refresh(),
            passes.refresh(),
            passGroups.refresh(),
            attendance.refresh(),
            externalCalendars.refresh(),
            managedSpaces.refresh(),
        ]);
    };

    // Auto-archive expired subscriptions
    useEffect(() => {
        if (!subscriptions.loading && subscriptions.data.length > 0) {
            checkAndArchiveExpired(subscriptions.data).then((hasChanges) => {
                if (hasChanges) {
                    subscriptions.refresh();
                }
            });
        }
    }, [subscriptions.data, subscriptions.loading]);

    const value = useMemo(() => ({
        groups: groups.data,
        students: students.data,
        lessons: lessons.data,
        subscriptions: subscriptions.data,
        schedules: schedules.data,
        studentGroups: studentGroups.data,
        tariffs: tariffs.data,
        passes: passes.data,
        passGroups: passGroups.data,
        attendance: attendance.data,
        externalCalendars: externalCalendars.data,
        managedSpaces: managedSpaces.data,
        loading,
        refreshAll,
        refreshGroups: groups.refresh,
        refreshStudents: students.refresh,
        refreshLessons: lessons.refresh,
        refreshSubscriptions: subscriptions.refresh,
        refreshSchedules: schedules.refresh,
        refreshStudentGroups: studentGroups.refresh,
        refreshTariffs: tariffs.refresh,
        refreshPasses: passes.refresh,
        refreshPassGroups: passGroups.refresh,
        refreshAttendance: attendance.refresh,
        refreshExternalCalendars: externalCalendars.refresh,
        refreshManagedSpaces: managedSpaces.refresh,
    }), [
        groups.data,
        students.data,
        lessons.data,
        subscriptions.data,
        schedules.data,
        studentGroups.data,
        tariffs.data,
        passes.data,
        passGroups.data,
        attendance.data,
        externalCalendars.data,
        managedSpaces.data,
        loading
    ]);

    return (
        <DataContext.Provider value={value}>
            {children}
        </DataContext.Provider>
    );
}

export function useData() {
    const context = useContext(DataContext);
    if (!context) {
        throw new Error('useData must be used within a DataProvider');
    }
    return context;
}
