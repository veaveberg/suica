export interface Group {
  id?: string;
  name: string;
  color: string;                    // Hex color for calendar display
  default_duration_minutes: number; // Default lesson length (e.g., 60)
  status: 'active' | 'archived';
  last_class_date?: string;
  userId?: string;
  teacherName?: string;
  teacherUsername?: string;
  teacherInstagram?: string;
}

export interface Student {
  id?: string;
  name: string;
  telegram_username?: string;
  telegram_id?: string;
  instagram_username?: string;
  balance_notes?: string;
  notes?: string;
  userId?: string;
}

export interface StudentGroup {
  id?: string;
  student_id: string;
  group_id: string;
}

export interface Tariff {
  id?: string;
  type: string;
  name: string;
  price: number;
  count: number;
  is_consecutive: boolean;
  duration_days?: number;
}

export interface GroupSchedule {
  id?: string;
  group_id: string;
  day_of_week: number;              // 0-6 (Sun-Sat)
  time: string;                     // "HH:mm" (free-form)
  duration_minutes?: number;        // Overrides group default if set
  frequency_weeks?: number;        // null/1 = every week, 2 = every 2nd week, etc.
  week_offset?: number;            // 0 = cycle starts this week, 1 = cycle starts next week, etc.
  is_active: boolean;
}

export type AttendanceStatus = 'present' | 'absence_valid' | 'absence_invalid';

export interface Attendance {
  id?: string;
  lesson_id: string;
  student_id: string;
  status: AttendanceStatus;
  payment_amount?: number;
  is_uncovered?: boolean;
}

export interface Subscription {
  id?: string;
  user_id: string;
  group_id: string;                 // Subscription is for a specific group
  tariff_id: string;
  type: string;
  lessons_total: number;
  price: number;
  purchase_date: string;
  expiry_date?: string;
  is_consecutive: boolean;
  duration_days?: number;
  status: 'active' | 'archived';
  userId?: string;
}

export interface Payment {
  id?: string;
  student_id: string;
  amount: number;
  screenshot_url?: string;
  status: 'pending' | 'confirmed';
}

export interface Lesson {
  id?: string;
  group_id: string;
  date: string;
  time: string;
  duration_minutes: number;
  status: 'upcoming' | 'cancelled' | 'completed';
  schedule_id?: string;             // null = one-off lesson
  students_count: number;
  total_amount: number;
  uncovered_count?: number;
  notes?: string;
  info_for_students?: string;
  userId?: string;
  teacherName?: string;
}

export interface Pass {
  id?: string;
  name: string;
  price: number;
  lessons_count: number;
  is_consecutive?: boolean;
  duration_days?: number;
  userId?: string;
  teacherName?: string;
  teacherUsername?: string;
  teacherInstagram?: string;
}

export interface PassGroup {
  id?: string;
  pass_id: string;
  group_id: string;
}

export type Language = 'RU' | 'EN' | 'KA';

export interface ExternalCalendar {
  id?: string;
  name: string;
  url: string;
  color: string;
  enabled: boolean;
  lastFetched?: string;
}

export interface ExternalEvent {
  id?: string;
  uid: string;
  title: string;
  start: Date;
  end: Date;
  allDay: boolean;
  location?: string;
  description?: string;
  url?: string;
  calendarColor?: string;
  calendarName?: string;
}
