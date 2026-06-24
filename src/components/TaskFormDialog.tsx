import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { TASK_STATUSES, TASK_PRIORITIES } from '@/lib/caseManagement';
import type { CaseTask, TaskPriority, TaskStatus } from '@/types';

interface TaskFormState {
  task_title: string;
  task_description: string;
  assigned_to_name: string;
  assigned_to_email: string;
  assigned_to_mobile: string;
  due_date: string;
  priority: TaskPriority;
  task_status: TaskStatus;
}

const EMPTY: TaskFormState = {
  task_title: '', task_description: '', assigned_to_name: '', assigned_to_email: '',
  assigned_to_mobile: '', due_date: '', priority: 'Medium', task_status: 'Open',
};

export function TaskFormDialog({
  open, onOpenChange, caseId, task, initialTitle, initialDueDate, templates, onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  caseId: string;
  task?: CaseTask | null;
  initialTitle?: string;
  initialDueDate?: string | null;
  templates?: readonly string[];
  onSaved?: () => void;
}) {
  const { user } = useAuth();
  const [form, setForm] = useState<TaskFormState>(EMPTY);
  const [saving, setSaving] = useState(false);
  const isEdit = !!task;

  useEffect(() => {
    if (!open) return;
    if (task) {
      setForm({
        task_title: task.task_title ?? '',
        task_description: task.task_description ?? '',
        assigned_to_name: task.assigned_to_name ?? '',
        assigned_to_email: task.assigned_to_email ?? '',
        assigned_to_mobile: task.assigned_to_mobile ?? '',
        due_date: task.due_date ?? '',
        priority: task.priority ?? 'Medium',
        task_status: task.task_status ?? 'Open',
      });
    } else {
      setForm({ ...EMPTY, task_title: initialTitle ?? '', due_date: initialDueDate ?? '' });
    }
  }, [open, task, initialTitle, initialDueDate]);

  const txt = (f: keyof TaskFormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm(p => ({ ...p, [f]: e.target.value }));

  async function save() {
    if (!form.task_title.trim()) { toast.error('Task title is required.'); return; }
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        task_title: form.task_title.trim(),
        task_description: form.task_description.trim() || null,
        assigned_to_name: form.assigned_to_name.trim() || null,
        assigned_to_email: form.assigned_to_email.trim() || null,
        assigned_to_mobile: form.assigned_to_mobile.trim() || null,
        due_date: form.due_date || null,
        priority: form.priority,
        task_status: form.task_status,
        completed_at: form.task_status === 'Completed' ? new Date().toISOString() : null,
      };

      if (isEdit && task) {
        const { error } = await supabase.from('case_tasks').update(payload).eq('id', task.id);
        if (error) throw error;
        toast.success('Task updated.');
      } else {
        const { error } = await supabase.from('case_tasks').insert({
          ...payload,
          case_id: caseId,
          created_by: user?.profile?.full_name || user?.email || 'Unknown',
        });
        if (error) throw error;
        toast.success('Task created.');
      }
      onOpenChange(false);
      onSaved?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to save task.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[calc(100vw-1rem)] sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit Task' : 'Add Task'}</DialogTitle>
          <DialogDescription>
            {isEdit ? 'Update the task details.' : 'Create a task linked to this case.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {!isEdit && templates && templates.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {templates.map(t => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setForm(p => ({ ...p, task_title: t }))}
                  className="rounded-full border px-2.5 py-1 text-xs hover:bg-muted"
                >
                  {t}
                </button>
              ))}
            </div>
          )}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Task Title <span className="text-red-500">*</span></Label>
            <Input value={form.task_title} onChange={txt('task_title')} placeholder="e.g. Prepare Counter" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Description</Label>
            <Textarea value={form.task_description} onChange={txt('task_description')} rows={2} />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Assignee Name</Label>
              <Input value={form.assigned_to_name} onChange={txt('assigned_to_name')} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Assignee Mobile</Label>
              <Input value={form.assigned_to_mobile} onChange={txt('assigned_to_mobile')} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Assignee Email</Label>
              <Input value={form.assigned_to_email} onChange={txt('assigned_to_email')} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Due Date</Label>
              <Input type="date" value={form.due_date} onChange={txt('due_date')} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Priority</Label>
              <Select value={form.priority} onValueChange={(v) => setForm(p => ({ ...p, priority: v as TaskPriority }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TASK_PRIORITIES.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {isEdit && (
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Status</Label>
                <Select value={form.task_status} onValueChange={(v) => setForm(p => ({ ...p, task_status: v as TaskStatus }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TASK_STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="mt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={save} disabled={saving} className="gap-1">
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {isEdit ? 'Save Changes' : 'Create Task'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
