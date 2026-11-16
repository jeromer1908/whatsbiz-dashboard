import { supabase } from './supabase';
import type {
  Customer,
  CustomerInsert,
  CustomerUpdate,
  Recharge,
  RechargeInsert,
  RechargeUpdate,
  QuotaSettings,
  QuotaAllocation,
  QuotaHistoryEntry,
  UploadPreview,
  Task,
  TaskInsert,
  TaskFilters,
  TaskUpdate,
  AppNotification,
  NotificationType,
  CustomerType,
  WhatsAppMessage,
  Username,
} from '@/types';
import { ASSIGNABLE_USERS, displayName } from '@/auth/users';
import { normalizeMobile, generateBatchId, localDateISO, matchesCustomerSearch } from './format';
import * as XLSX from 'xlsx';

export function logSupabaseError(context: string, error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  const details =
    typeof error === 'object' && error !== null && 'details' in error
      ? error.details
      : undefined;
  console.error(context, { message, details });
}

// ============================================================
// Customers
// ============================================================

export async function fetchCustomersByStatus(status: string): Promise<Customer[]> {
  const { data, error } = await supabase
    .from('customers')
    .select('*')
    .eq('status', status)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data as Customer[];
}

export async function fetchAllCustomers(): Promise<Customer[]> {
  const { data, error } = await supabase
    .from('customers')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data as Customer[];
}

export async function searchCustomers(status: string, query: string): Promise<Customer[]> {
  const { data, error } = await supabase
    .from('customers')
    .select('*')
    .eq('status', status)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data as Customer[]).filter((customer) => matchesCustomerSearch(customer, query));
}

export async function createCustomer(input: CustomerInsert): Promise<Customer> {
  const { data, error } = await supabase.from('customers').insert(input).select().single();
  if (error) throw error;
  return data as Customer;
}

export async function updateCustomer(id: string, input: CustomerUpdate): Promise<Customer> {
  const { data, error } = await supabase.from('customers').update(input).eq('id', id).select().single();
  if (error) throw error;
  return data as Customer;
}

export async function deleteCustomers(ids: string[]): Promise<void> {
  const { error } = await supabase.from('customers').delete().filter('id', 'in', `(${ids.map((id) => `"${id}"`).join(',')})`);
  if (error) throw error;
}

export async function deleteCustomersByBatch(batchId: string): Promise<number> {
  const { data, error } = await supabase
    .from('customers')
    .delete()
    .eq('upload_batch', batchId)
    .select('id');
  if (error) throw error;
  return data?.length ?? 0;
}

export async function convertToCustomer(
  id: string,
  plan: string,
  planAmount: number,
  planStart: string,
  validTill: string | null,
  alsoRecharge: boolean,
  baseAmount?: number,
  gstAmount?: number,
  account?: {
    login_username: string | null;
    login_password: string | null;
    verified_number: string | null;
    customer_type: CustomerType;
  }
): Promise<void> {
  const update: CustomerUpdate = {
    ...account,
    status: 'onboarded',
    plan,
    plan_amount: planAmount,
    plan_start: planStart,
    valid_till: validTill,
    converted_at: new Date().toISOString(),
  };
  const { error } = await supabase.from('customers').update(update).eq('id', id);
  if (error) throw error;

  if (alsoRecharge) {
    if (!validTill) throw new Error('Valid Till is required when recording a recharge');
    const recharge: RechargeInsert = {
      customer_id: id,
      amount: planAmount,
      base_amount: baseAmount,
      gst_amount: gstAmount,
      recharged_on: planStart,
      valid_till: validTill,
      mode: 'Other',
      note: 'Plan activation recharge',
    };
    await addRecharge(recharge);
  }
}

export async function getMobileExists(mobile: string, excludeId?: string): Promise<boolean> {
  let q = supabase.from('customers').select('id').eq('mobile', mobile);
  if (excludeId) q = q.neq('id', excludeId);
  const { data, error } = await q.maybeSingle();
  if (error) throw error;
  return !!data;
}

// ============================================================
// Recharges
// ============================================================

export async function fetchAllRecharges(): Promise<Recharge[]> {
  const { data, error } = await supabase
    .from('recharges')
    .select('*, customers(customer_no, name, mobile, location, business, plan, is_active, inactive_reason, valid_till)')
    .order('recharged_on', { ascending: false })
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data as Recharge[];
}

export async function addRecharge(
  input: RechargeInsert & Pick<CustomerUpdate, 'daily_limit' | 'monthly_limit'>
): Promise<Recharge> {
  const { daily_limit, monthly_limit, ...rechargeInput } = input;
  const { data, error } = await supabase
    .from('recharges')
    .insert({
      ...rechargeInput,
      base_amount: input.base_amount ?? input.amount,
      gst_amount: input.gst_amount ?? 0,
      quota_type: input.quota_type ?? null,
    })
    .select()
    .single();
  if (error) throw error;

  const { data: customer, error: customerError } = await supabase
    .from('customers')
    .select('valid_till, is_active')
    .eq('id', input.customer_id)
    .single();
  if (customerError) {
    logSupabaseError('Recharge was saved, but customer status could not be loaded', customerError);
    throw new Error(`Recharge was saved, but customer status could not be loaded: ${customerError.message}`);
  }

  const extendsValidity = Boolean(
    input.valid_till && (!customer.valid_till || input.valid_till > customer.valid_till)
  );
  const update: CustomerUpdate = {};
  if (extendsValidity && input.valid_till) update.valid_till = input.valid_till;
  if (input.quota_type) {
    update.quota_type = input.quota_type;
    update.daily_limit = daily_limit ?? null;
    update.monthly_limit = monthly_limit ?? null;
  }
  if (!customer.is_active) {
    update.is_active = true;
    update.inactive_reason = null;
  }

  if (Object.keys(update).length > 0) {
    const { error: customerUpdateError } = await supabase
      .from('customers')
      .update(update)
      .eq('id', input.customer_id)
      .select('id')
      .single();
    if (customerUpdateError) {
      logSupabaseError('Recharge was saved, but customer update failed', customerUpdateError);
      throw new Error(`Recharge was saved, but the customer could not be updated: ${customerUpdateError.message}`);
    }
  }
  return data as Recharge;
}

export const PAYMENT_MODE = 'Payment';

/** True for rows added with the Payment button (extra amount, not a plan recharge). */
export function isPaymentEntry(r: Pick<Recharge, 'mode'>): boolean {
  return r.mode === PAYMENT_MODE;
}

/**
 * Records an extra payment for a customer. It is stored in the recharges table
 * so it counts toward the customer's total amount, but it does not touch the
 * customer's validity, quota or active status.
 */
export async function addPayment(input: {
  customer_id: string;
  amount: number;
  paid_on: string;
  note: string | null;
}): Promise<Recharge> {
  const { data, error } = await supabase
    .from('recharges')
    .insert({
      customer_id: input.customer_id,
      amount: input.amount,
      base_amount: input.amount,
      gst_amount: 0,
      recharged_on: input.paid_on,
      valid_till: null,
      quota_type: null,
      mode: PAYMENT_MODE,
      note: input.note,
    })
    .select()
    .single();
  if (error) throw error;
  return data as Recharge;
}

export async function updatePayment(
  id: string,
  input: { amount: number; paid_on: string; note: string | null }
): Promise<Recharge> {
  const { data, error } = await supabase
    .from('recharges')
    .update({
      amount: input.amount,
      base_amount: input.amount,
      gst_amount: 0,
      recharged_on: input.paid_on,
      note: input.note,
    })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data as Recharge;
}

export async function updateRecharge(
  id: string,
  input: RechargeUpdate & Pick<CustomerUpdate, 'daily_limit' | 'monthly_limit'>
): Promise<Recharge> {
  const { daily_limit, monthly_limit, ...rechargeUpdate } = input;
  const { data: currentData, error: currentError } = await supabase
    .from('recharges')
    .select('*')
    .eq('id', id)
    .single();
  if (currentError) throw currentError;
  const current = currentData as Recharge;
  const previousRecharges = (await fetchRechargesForCustomer(current.customer_id)).filter((r) => !isPaymentEntry(r));
  const wasLatestRecharge = previousRecharges[0]?.id === id;

  const { data, error } = await supabase
    .from('recharges')
    .update(rechargeUpdate)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;

  const latestRecharges = (await fetchRechargesForCustomer(current.customer_id)).filter((r) => !isPaymentEntry(r));
  const latestRecharge = latestRecharges[0];
  if (latestRecharge && (wasLatestRecharge || latestRecharge.id === id)) {
    const customerUpdate: CustomerUpdate = {
      valid_till: latestRecharge.valid_till,
    };
    if (latestRecharge.id === id) {
      customerUpdate.quota_type = latestRecharge.quota_type;
      customerUpdate.daily_limit = daily_limit ?? null;
      customerUpdate.monthly_limit = monthly_limit ?? null;
    }
    const { error: customerError } = await supabase
      .from('customers')
      .update(customerUpdate)
      .eq('id', current.customer_id);
    if (customerError) {
      logSupabaseError('Recharge was updated, but customer quota synchronization failed', customerError);
      throw new Error(`Recharge was updated, but customer quota could not be synchronized: ${customerError.message}`);
    }
  }
  return data as Recharge;
}

export async function deleteRecharge(id: string): Promise<void> {
  const { error } = await supabase.from('recharges').delete().eq('id', id);
  if (error) throw error;
}

export async function fetchRechargesForCustomer(customerId: string): Promise<Recharge[]> {
  const { data, error } = await supabase
    .from('recharges')
    .select('*')
    .eq('customer_id', customerId)
    .order('recharged_on', { ascending: false })
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data as Recharge[];
}

// ============================================================
// Quota Settings
// ============================================================

export async function fetchQuotaSettings(): Promise<QuotaSettings> {
  const { data, error } = await supabase.from('quota_settings').select('*').eq('id', 1).maybeSingle();
  if (error) throw error;
  if (!data) {
    const { data: created, error: cErr } = await supabase
      .from('quota_settings')
      .insert({ id: 1, vendor_daily_limit: 1000 })
      .select()
      .single();
    if (cErr) throw cErr;
    return created as QuotaSettings;
  }
  return data as QuotaSettings;
}

export async function updateQuotaSettings(limit: number): Promise<QuotaSettings> {
  const { data, error } = await supabase
    .from('quota_settings')
    .update({ vendor_daily_limit: limit })
    .eq('id', 1)
    .select()
    .single();
  if (error) throw error;
  return data as QuotaSettings;
}

// ============================================================
// Quota History (day-wise snapshots)
// ============================================================

/**
 * Records the current quota of every customer with a quota type against a day,
 * so past days can be reviewed later. Re-running it for the same day overwrites
 * that day's rows, so the snapshot always reflects the latest state of that day.
 */
export async function snapshotQuota(
  vendorDailyLimit: number,
  customers: Customer[],
  date: string = localDateISO()
): Promise<void> {
  const now = new Date().toISOString();
  const rows = customers
    .filter((customer) => customer.quota_type)
    .map((customer) => ({
      snapshot_date: date,
      customer_id: customer.id,
      customer_name: customer.name,
      mobile: customer.mobile,
      plan: customer.plan,
      quota_type: customer.quota_type,
      daily_limit: customer.daily_limit,
      monthly_limit: customer.monthly_limit,
      valid_till: customer.valid_till,
      vendor_daily_limit: vendorDailyLimit,
      updated_at: now,
    }));
  if (rows.length === 0) return;
  const { error } = await supabase
    .from('quota_history')
    .upsert(rows, { onConflict: 'snapshot_date,customer_id' });
  if (error) throw error;
}

export async function fetchQuotaHistory(date: string): Promise<QuotaHistoryEntry[]> {
  const { data, error } = await supabase
    .from('quota_history')
    .select('*')
    .eq('snapshot_date', date)
    .order('customer_name', { ascending: true });
  if (error) throw error;
  return data as QuotaHistoryEntry[];
}

/** Snapshot count per day inside a range — used for the history calendar dots. */
export async function fetchQuotaHistoryDays(
  from: string,
  to: string
): Promise<Record<string, number>> {
  const { data, error } = await supabase
    .from('quota_history')
    .select('snapshot_date')
    .gte('snapshot_date', from)
    .lte('snapshot_date', to);
  if (error) throw error;
  const counts: Record<string, number> = {};
  for (const row of (data ?? []) as { snapshot_date: string }[]) {
    counts[row.snapshot_date] = (counts[row.snapshot_date] ?? 0) + 1;
  }
  return counts;
}

// ============================================================
// Quota Allocations
// ============================================================

export async function fetchQuotaAllocations(): Promise<QuotaAllocation[]> {
  const { data, error } = await supabase
    .from('quota_allocations')
    .select('*, customers(name, mobile, plan, valid_till, status, is_active, inactive_reason)')
    .order('messages_per_day', { ascending: false });
  if (error) throw error;
  return data as QuotaAllocation[];
}

export async function upsertQuotaAllocation(customerId: string, messagesPerDay: number): Promise<void> {
  const { error } = await supabase
    .from('quota_allocations')
    .upsert({ customer_id: customerId, messages_per_day: messagesPerDay });
  if (error) throw error;
}

export async function clearAllQuotaAllocations(): Promise<void> {
  const { error } = await supabase.from('quota_allocations').delete().neq('customer_id', '00000000-0000-0000-0000-000000000000');
  if (error) throw error;
}

export async function bulkUpsertQuotaAllocations(
  allocations: { customer_id: string; messages_per_day: number }[]
): Promise<void> {
  const { error } = await supabase.from('quota_allocations').upsert(allocations);
  if (error) throw error;
}

// ============================================================
// File Upload — parse & preview
// ============================================================

function findColumn(headers: string[], candidates: string[]): string | null {
  const lower = headers.map((h) => h.toLowerCase().trim());
  for (const candidate of candidates) {
    const idx = lower.findIndex((h) => h === candidate || h.includes(candidate));
    if (idx >= 0) return headers[idx];
  }
  return null;
}

export function parseFile(file: File): Promise<{ headers: string[]; rows: Record<string, unknown>[] }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target!.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
        if (json.length === 0) {
          resolve({ headers: [], rows: [] });
          return;
        }
        const headers = Object.keys(json[0]);
        resolve({ headers, rows: json });
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}

export function buildUploadPreview(
  headers: string[],
  rows: Record<string, unknown>[],
  mobileColumnOverride: string | null,
  existingMobiles: Set<string>
): UploadPreview {
  const nameCol = findColumn(headers, ['name', 'customer name', 'customer']);
  let mobileCol = mobileColumnOverride || findColumn(headers, ['mobile', 'phone', 'whatsapp', 'number', 'contact']);
  const emailCol = findColumn(headers, ['email', 'mail', 'email id']);
  const locationCol = findColumn(headers, ['location', 'address', 'city']);
  const businessCol = findColumn(headers, ['business']);
  const notesCol = findColumn(headers, ['notes', 'note', 'remark', 'remarks', 'comment', 'comments']);

  const batchId = generateBatchId();
  const newRows: CustomerInsert[] = [];
  const rejectedRows: Record<string, unknown>[] = [];
  const seenMobiles = new Set<string>();
  let existingCount = 0;
  let invalidCount = 0;
  let duplicateCount = 0;

  for (const row of rows) {
    const rawMobile = mobileCol ? String(row[mobileCol] || '') : '';
    const normalized = normalizeMobile(rawMobile);

    const rowData = {
      name: nameCol ? String(row[nameCol] || '') : '',
      mobile: rawMobile,
      email: emailCol ? String(row[emailCol] || '') : '',
      location: locationCol ? String(row[locationCol] || '') : '',
      business: businessCol ? String(row[businessCol] || '') : '',
      notes: notesCol ? String(row[notesCol] || '') : '',
    };

    if (!normalized) {
      invalidCount++;
      rejectedRows.push({ ...rowData, reason: 'Invalid mobile number' });
      continue;
    }

    if (existingMobiles.has(normalized)) {
      existingCount++;
      rejectedRows.push({ ...rowData, reason: 'Already saved' });
      continue;
    }

    if (seenMobiles.has(normalized)) {
      duplicateCount++;
      rejectedRows.push({ ...rowData, reason: 'Duplicate in file' });
      continue;
    }

    seenMobiles.add(normalized);
    newRows.push({
      name: (nameCol ? String(row[nameCol] || '') : '').trim() || 'Unknown',
      mobile: normalized,
      email: emailCol ? String(row[emailCol] || '').trim() || null : null,
      location: locationCol ? String(row[locationCol] || '').trim() || null : null,
      business: businessCol ? String(row[businessCol] || '').trim() || null : null,
      notes: notesCol ? String(row[notesCol] || '').trim() || null : null,
      status: 'enquiry',
      upload_batch: batchId,
    });
  }

  return {
    newRows,
    existingCount,
    invalidCount,
    duplicateCount,
    rejectedRows,
    batchId,
  };
}

export async function fetchAllMobiles(): Promise<Set<string>> {
  const { data, error } = await supabase.from('customers').select('mobile');
  if (error) throw error;
  return new Set((data || []).map((r: { mobile: string }) => r.mobile));
}

export async function insertCustomersBatch(rows: CustomerInsert[]): Promise<void> {
  const batchSize = 500;
  for (let i = 0; i < rows.length; i += batchSize) {
    const chunk = rows.slice(i, i + batchSize);
    const { error } = await supabase.from('customers').insert(chunk);
    if (error) throw error;
  }
}

// ============================================================
// Reports helpers
// ============================================================

export async function fetchRechargesInRange(startDate: string, endDate: string): Promise<Recharge[]> {
  const { data, error } = await supabase
    .from('recharges')
    .select('*, customers(customer_no, name, mobile, location, business, plan, is_active, inactive_reason, valid_till)')
    .gte('recharged_on', startDate)
    .lte('recharged_on', endDate)
    .order('recharged_on', { ascending: false });
  if (error) throw error;
  return data as Recharge[];
}

// ============================================================
// Tasks
// ============================================================

export const TASK_SCREENSHOT_BUCKET = 'task-screenshots';

async function insertNotification(input: {
  recipient: Username;
  type: NotificationType;
  task_id: string;
  title: string;
  message?: string | null;
}): Promise<void> {
  const { error } = await supabase.from('notifications').insert({ ...input, message: input.message ?? null });
  if (error) throw error;
}

export async function createTask(input: TaskInsert): Promise<Task> {
  if (!ASSIGNABLE_USERS.some((u) => u.username === input.assigned_to)) {
    throw new Error('Choose who the task is assigned to');
  }
  const { data, error } = await supabase
    .from('tasks')
    .insert({ ...input, description: input.description?.trim() || null, status: 'pending' })
    .select()
    .single();
  if (error) throw error;
  const task = data as Task;

  try {
    await insertNotification({
      recipient: task.assigned_to,
      type: 'task_assigned',
      task_id: task.id,
      title: `New task: ${task.title}`,
      message: `Due ${task.due_date} · ${task.priority} priority`,
    });
  } catch (err) {
    // The task exists; a failed notification should not make the create look failed.
    logSupabaseError('Task created but notification failed', err);
  }
  return task;
}

export async function fetchTasks(filters: TaskFilters = {}): Promise<Task[]> {
  let query = supabase.from('tasks').select('*');
  if (filters.assignedTo) query = query.eq('assigned_to', filters.assignedTo);
  if (filters.status) query = query.eq('status', filters.status);
  if (filters.dueDate) query = query.eq('due_date', filters.dueDate);
  if (filters.dueFrom) query = query.gte('due_date', filters.dueFrom);
  if (filters.dueTo) query = query.lte('due_date', filters.dueTo);
  if (filters.completedFrom) query = query.gte('completed_at', filters.completedFrom);
  if (filters.completedTo) query = query.lt('completed_at', filters.completedTo);
  const { data, error } = await query
    .order('due_date', { ascending: true })
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data as Task[];
}

export async function fetchTask(taskId: string): Promise<Task | null> {
  const { data, error } = await supabase.from('tasks').select('*').eq('id', taskId).maybeSingle();
  if (error) throw error;
  return (data as Task) ?? null;
}

export async function fetchTaskUpdates(taskId: string): Promise<TaskUpdate[]> {
  const { data, error } = await supabase
    .from('task_updates')
    .select('*')
    .eq('task_id', taskId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data as TaskUpdate[];
}

/** Latest update per task, for showing completion details in task lists. */
export async function fetchLatestTaskUpdates(taskIds: string[]): Promise<Record<string, TaskUpdate>> {
  if (taskIds.length === 0) return {};
  const { data, error } = await supabase
    .from('task_updates')
    .select('*')
    .in('task_id', taskIds)
    .order('created_at', { ascending: false });
  if (error) throw error;
  const latest: Record<string, TaskUpdate> = {};
  for (const u of data as TaskUpdate[]) latest[u.task_id] ??= u;
  return latest;
}

async function uploadTaskScreenshot(taskId: string, file: File): Promise<string> {
  const ext = (file.name.split('.').pop() || file.type.split('/')[1] || 'png').toLowerCase();
  const path = `${taskId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await supabase.storage
    .from(TASK_SCREENSHOT_BUCKET)
    .upload(path, file, { contentType: file.type || 'image/png', upsert: false });
  if (error) throw error;
  const { data } = supabase.storage.from(TASK_SCREENSHOT_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

export async function completeTask(
  taskId: string,
  message: string | null,
  screenshotFile: File | null,
  completedBy: Username
): Promise<Task> {
  const trimmed = message?.trim() || null;
  if (!trimmed && !screenshotFile) {
    throw new Error('Add a message or a screenshot');
  }

  const current = await fetchTask(taskId);
  if (!current) throw new Error('That task no longer exists');
  if (current.assigned_to !== completedBy) throw new Error('This task is assigned to someone else');

  const screenshotUrl = screenshotFile ? await uploadTaskScreenshot(taskId, screenshotFile) : null;

  const { error: updateError } = await supabase
    .from('task_updates')
    .insert({ task_id: taskId, message: trimmed, screenshot_url: screenshotUrl });
  if (updateError) throw updateError;

  const { data, error } = await supabase
    .from('tasks')
    .update({ status: 'completed', completed_at: new Date().toISOString() })
    .eq('id', taskId)
    .eq('assigned_to', completedBy)
    .select()
    .single();
  if (error) throw error;
  const task = data as Task;

  try {
    await insertNotification({
      recipient: 'admin',
      type: 'task_completed',
      task_id: task.id,
      title: `${displayName(completedBy)} completed: ${task.title}`,
      message: trimmed ? trimmed.slice(0, 140) : 'Screenshot attached',
    });
  } catch (err) {
    logSupabaseError('Task completed but notification failed', err);
  }
  return task;
}

// ============================================================
// Notifications
// ============================================================

export async function fetchNotifications(recipient: Username, limit = 30): Promise<AppNotification[]> {
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .eq('recipient', recipient)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data as AppNotification[];
}

export async function fetchUnreadCount(recipient: Username): Promise<number> {
  const { count, error } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('recipient', recipient)
    .eq('is_read', false);
  if (error) throw error;
  return count ?? 0;
}

export async function markNotificationRead(id: string): Promise<void> {
  const { error } = await supabase.from('notifications').update({ is_read: true }).eq('id', id);
  if (error) throw error;
}

export async function markAllRead(recipient: Username): Promise<void> {
  const { error } = await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('recipient', recipient)
    .eq('is_read', false);
  if (error) throw error;
}

// ============================================================
// WhatsApp (sending happens in the database — see supabase/migrations/*_whatsapp_welcome.sql)
// ============================================================

/** The customer's WhatsApp send log, newest first, with pending results refreshed. */
export async function fetchWhatsAppMessages(customerId: string): Promise<WhatsAppMessage[]> {
  const { data, error } = await supabase.rpc('whatsapp_messages_for', { p_customer_id: customerId });
  if (error) throw error;
  return (data ?? []) as WhatsAppMessage[];
}

/** Sends the welcome template again (manual resend). */
export async function resendWelcomeWhatsApp(customerId: string): Promise<void> {
  const { error } = await supabase.rpc('send_welcome_whatsapp', { p_customer_id: customerId });
  if (error) throw error;
}
