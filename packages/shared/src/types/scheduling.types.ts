export interface WorkSchedule {
  id: string;
  organization_id: string;
  name: string;
  type: string;              // 'appointments' | 'follow_up' | 'custom'
  color: string;             // hex color e.g. '#2563EB'
  is_active: boolean;
  work_days: number[];       // 0=Sun, 1=Mon, ..., 6=Sat
  start_time: string;        // 'HH:MM'
  end_time: string;          // 'HH:MM'
  slot_duration_minutes: number;
  buffer_minutes: number;
  timezone: string;
  blocked_dates: string[];   // 'YYYY-MM-DD'
  created_at: string;
  updated_at: string;
}

export interface AvailabilitySlot {
  starts_at: string;  // ISO datetime
  ends_at: string;    // ISO datetime
}
