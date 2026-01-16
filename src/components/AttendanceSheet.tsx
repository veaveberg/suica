import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Check } from 'lucide-react';
import type { Student } from '../types';

interface AttendanceSheetProps {
    isOpen: boolean;
    lessonId: string | undefined;
    students: Student[];
    onClose: () => void;
    onSave: (data: { attendance: string[], notes: string }) => Promise<void>;
}

export const AttendanceSheet: React.FC<AttendanceSheetProps> = ({ isOpen, lessonId: _lessonId, students, onClose, onSave }) => {
    const { t } = useTranslation();
    const [selected, setSelected] = useState<string[]>([]);
    const [notes, setNotes] = useState('');

    if (!isOpen) return null;

    const toggleStudent = (id: string) => {
        setSelected(prev =>
            prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]
        );
    };

    return (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-sm transition-opacity">
            <div className="w-full max-w-lg bg-ios-card rounded-t-[32px] p-6 shadow-2xl animate-in slide-in-from-bottom duration-300 dark:bg-zinc-900">
                <div className="flex justify-between items-center mb-6">
                    <h2 className="text-2xl font-bold">{t('mark_attendance')}</h2>
                    <button onClick={onClose} className="p-2 rounded-full bg-gray-100 dark:bg-zinc-800">
                        <X className="w-5 h-5 text-gray-500" />
                    </button>
                </div>

                <div className="max-h-[60vh] overflow-y-auto mb-6 space-y-2">
                    {students.map((student: Student) => (
                        <button
                            key={student.id}
                            onClick={() => student.id && toggleStudent(student.id)}
                            className="w-full flex items-center justify-between p-4 rounded-2xl bg-ios-background dark:bg-zinc-800 active:scale-[0.99] transition-transform"
                        >
                            <span className="font-medium dark:text-gray-200">{student.name}</span>
                            <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors ${selected.includes(student.id!)
                                ? 'bg-ios-blue border-ios-blue'
                                : 'border-gray-300 dark:border-zinc-700'
                                }`}>
                                {selected.includes(student.id!) && <Check className="w-4 h-4 text-white" />}
                            </div>
                        </button>
                    ))}
                </div>

                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-semibold text-ios-gray mb-1 uppercase px-1">
                            {t('notes')}
                        </label>
                        <textarea
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            className="w-full p-4 rounded-2xl bg-ios-background dark:bg-zinc-800 border-none focus:ring-2 focus:ring-ios-blue min-h-[100px] resize-none"
                            placeholder="..."
                        />
                    </div>

                    <button
                        onClick={() => onSave({ attendance: selected, notes })}
                        className="w-full ios-button py-4 text-lg"
                    >
                        {t('save')}
                    </button>
                </div>
            </div>
        </div>
    );
};
