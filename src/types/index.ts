export type CustomerStatus = 'enquiry' | 'onboarded' | 'archived';
/** Chosen at conversion: only new customers get the WhatsApp welcome message. */
export type CustomerType = 'new' | 'existing';
export type QuotaType = 'daily' | 'monthly';

export interface Customer {
  id: string;
  customer_no: number;
  name: string;
  mobile: string;
  email: string | null;
  location: string | null;
  business: string | null;
  notes: string | null;
  status: CustomerStatus;
  is_active: boolean;
  inactive_reason: string | null;
  plan: string | null;
  plan_amount: number | null;
  plan_start: string | null;
  valid_till: string | null;
  quota_type: QuotaType | null;
  daily_limit: number | null;
  monthly_limit: number | null;
  upload_batch: string | null;
  /** Account details captured at conversion. */
  login_username: string | null;
  login_password: string | null;
  verified_number: string | null;
  customer_type: CustomerType | null;
  created_at: string;
  converted_at: string | null;
}

export interface CustomerInsert {
  name: string;
  mobile: string;
  email?: string | null;
  location?: string | null;
  business?: string | null;
  notes?: string | null;
  status?: CustomerStatus;
  is_active?: boolean;
  inactive_reason?: string | null;
  plan?: string | null;
  plan_amount?: number | null;
  plan_start?: string | null;
  valid_till?: string | null;
  quota_type?: QuotaType | null;
  daily_limit?: number | null;
  monthly_limit?: number | null;
  upload_batch?: string | null;
  converted_at?: string | null;
}

export interface CustomerUpdate {
  name?: string;
  mobile?: string;
  email?: string | null;
  location?: string | null;
  business?: string | null;
  notes?: string | null;
  status?: CustomerStatus;
  is_active?: boolean;
  inactive_reason?: string | null;
  plan?: string | null;
  plan_amount?: number | null;
  plan_start?: string | null;
  valid_till?: string | null;
  quota_type?: QuotaType | null;
  daily_limit?: number | null;
  monthly_limit?: number | null;
  login_username?: string | null;
  login_password?: string | null;
  verified_number?: string | null;
  customer_type?: CustomerType | null;
  converted_at?: string | null;
}

export interface Recharge {
  id: string;
  customer_id: string;
  amount: number;
  base_amount: number | null;
  gst_amount: number | null;
  recharged_on: string;
  valid_till: string | null;
  quota_type: QuotaType | null;
  mode: string | null;
  note: string | null;
  created_at: string;
  customers?: Pick<Customer, 'customer_no' | 'name' | 'mobile' | 'location' | 'business' | 'plan' | 'is_active' | 'inactive_reason' | 'valid_till'>;
}

export interface RechargeInsert {
  customer_id: string;
  amount: number;
  base_amount?: number | null;
  gst_amount?: number | null;
  recharged_on: string;
  valid_till: string | null;
  quota_type?: QuotaType | null;
  mode?: string | null;
  note?: string | null;
}

export type RechargeUpdate = Partial<Omit<RechargeInsert, 'customer_id'>>;

export interface QuotaSettings {
  id: number;
  vendor_daily_limit: number;
  updated_at: string;
}

/** One customer's quota as it stood on a given day. */
export interface QuotaHistoryEntry {
  snapshot_date: string; // YYYY-MM-DD
  customer_id: string;
  customer_name: string;
  mobile: string | null;
  plan: string | null;
  quota_type: QuotaType | null;
  daily_limit: number | null;
  monthly_limit: number | null;
  valid_till: string | null;
  vendor_daily_limit: number | null;
  created_at: string;
  updated_at: string;
}

export interface QuotaAllocation {
  customer_id: string;
  messages_per_day: number;
  customers?: Pick<Customer, 'name' | 'mobile' | 'plan' | 'valid_till' | 'status' | 'is_active' | 'inactive_reason'>;
}

export interface UploadPreview {
  newRows: CustomerInsert[];
  existingCount: number;
  invalidCount: number;
  duplicateCount: number;
  rejectedRows: Record<string, unknown>[];
  batchId: string;
}

// ============================================================
// Roles, tasks & notifications
// ============================================================

export type { UserRole, Username } from '@/auth/users';
import type { Username } from '@/auth/users';
export type TaskPriority = 'low' | 'medium' | 'high';
export type TaskStatus = 'pending' | 'completed';
export type NotificationType = 'task_assigned' | 'task_completed';

export interface Task {
  id: string;
  title: string;
  description: string | null;
  due_date: string; // YYYY-MM-DD
  priority: TaskPriority;
  status: TaskStatus;
  /** Username of the assignee (staff | staff2). */
  assigned_to: Username;
  completed_at: string | null;
  created_at: string;
}

export interface TaskInsert {
  title: string;
  description?: string | null;
  due_date: string;
  priority: TaskPriority;
  assigned_to: Username;
}

export interface TaskFilters {
  assignedTo?: Username;
  status?: TaskStatus;
  dueDate?: string; // exact day
  dueFrom?: string; // inclusive range
  dueTo?: string;
  completedFrom?: string; // ISO timestamp, inclusive
  completedTo?: string; // ISO timestamp, exclusive
}

export interface TaskUpdate {
  id: string;
  task_id: string;
  message: string | null;
  screenshot_url: string | null;
  created_at: string;
}

export interface AppNotification {
  id: string;
  /** Username the notification is for (admin | staff | staff2). */
  recipient: Username;
  type: NotificationType;
  task_id: string | null;
  title: string;
  message: string | null;
  is_read: boolean;
  created_at: string;
}

// ============================================================
// WhatsApp
// ============================================================

export type WhatsAppStatus = 'queued' | 'sent' | 'failed';

export interface WhatsAppMessage {
  id: string;
  customer_id: string;
  request_id: number | null;
  to_number: string | null;
  template_name: string | null;
  status: WhatsAppStatus;
  http_status: number | null;
  response: string | null;
  created_at: string;
  updated_at: string;
}
