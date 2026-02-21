const AUTH_KEY = 'suica_auth_v1';

export let currentUserId: string | null = localStorage.getItem(AUTH_KEY + '_id');
export let currentUserRole: 'admin' | 'teacher' | 'student' | null = localStorage.getItem(AUTH_KEY + '_role') as any;
export let currentStudentId: string | null = localStorage.getItem(AUTH_KEY + '_student_id');
export let currentAuthToken: string | null = localStorage.getItem(AUTH_KEY + '_token');

export function setAuthUser(userId: string, role: any, studentId?: string, authToken?: string) {
    currentUserId = userId;
    currentUserRole = role;
    currentStudentId = studentId || null;
    currentAuthToken = authToken || null;

    localStorage.setItem(AUTH_KEY + '_id', userId);
    localStorage.setItem(AUTH_KEY + '_role', role);
    if (studentId) localStorage.setItem(AUTH_KEY + '_student_id', studentId);
    else localStorage.removeItem(AUTH_KEY + '_student_id');
    if (authToken) localStorage.setItem(AUTH_KEY + '_token', authToken);
    else localStorage.removeItem(AUTH_KEY + '_token');
}

export function clearAuthUser() {
    currentUserId = null;
    currentUserRole = null;
    currentStudentId = null;
    currentAuthToken = null;
    localStorage.removeItem(AUTH_KEY + '_id');
    localStorage.removeItem(AUTH_KEY + '_role');
    localStorage.removeItem(AUTH_KEY + '_student_id');
    localStorage.removeItem(AUTH_KEY + '_token');
}

export function getAuthUserId() {
    return currentUserId as any;
}

export function getAuthRole() {
    return currentUserRole;
}

export function getAuthToken() {
    return currentAuthToken;
}
