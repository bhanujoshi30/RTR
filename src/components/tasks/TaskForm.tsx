
"use client";

import { useEffect, useState, type FormEvent, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { createTask, getTaskById, updateTask } from '@/services/taskService';
import type { Task, TaskStatus, User as AppUser } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { CalendarIcon, Save, Loader2, Users, Layers, X } from 'lucide-react';
import { format } from 'date-fns';
import { enUS, hi } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { getAllUsers } from '@/services/userService';
import { useTranslation } from '@/hooks/useTranslation';
import { replaceDevanagariNumerals } from '@/lib/utils';

const taskStatuses: TaskStatus[] = ['To Do', 'In Progress', 'Completed'];
const taskTypes = ['standard', 'collection'] as const;

interface TaskFormProps {
  projectId: string;
  task?: Task;
  parentId?: string | null;
  onFormSuccess?: () => void;
  preloadedAssignableUsers?: AppUser[];
}

export function TaskForm({ projectId, task, parentId, onFormSuccess, preloadedAssignableUsers }: TaskFormProps) {
  const router = useRouter();
  const { toast } = useToast();
  const { user } = useAuth();
  const { t, locale } = useTranslation();
  const dateLocale = locale === 'hi' ? hi : enUS;
  const isSubTask = !!(parentId || task?.parentId);

  // Form State
  const [name, setName] = useState(task?.name || '');
  const [description, setDescription] = useState(task?.description || '');
  const [status, setStatus] = useState<TaskStatus>(task?.status || 'To Do');
  const [dueDate, setDueDate] = useState<Date | undefined>(task?.dueDate);
  const [taskType, setTaskType] = useState<'standard' | 'collection'>(task?.taskType || 'standard');
  const [reminderDays, setReminderDays] = useState<number | null>(task?.reminderDays || null);
  const [cost, setCost] = useState<number | null>(task?.cost || null);
  
  // Member Assignment State
  const [assignedUsers, setAssignedUsers] = useState<AppUser[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [allAssignableUsers, setAllAssignableUsers] = useState<AppUser[]>(preloadedAssignableUsers || []);

  // Control State
  const [loading, setLoading] = useState(false);
  const [loadingAssignableUsers, setLoadingAssignableUsers] = useState(true);
  const [parentMainTask, setParentMainTask] = useState<Task | null>(null);

  useEffect(() => {
    if (isSubTask && user && !preloadedAssignableUsers) {
      const fetchPrerequisites = async () => {
        setLoadingAssignableUsers(true);
        try {
          // Fetch main task for date constraints
          const mainTaskId = parentId || task?.parentId;
          if (mainTaskId) {
            const fetchedMainTask = await getTaskById(mainTaskId, user.uid, user.role);
            setParentMainTask(fetchedMainTask);
          }

          // Fetch assignable users
          const allUsers = await getAllUsers(user.uid);
          const assignable = allUsers.filter(u => u.role === 'supervisor' || u.role === 'member');
          setAllAssignableUsers(assignable);
          if (task?.assignedToUids) {
            const preAssigned = assignable.filter(u => task.assignedToUids!.includes(u.uid));
            setAssignedUsers(preAssigned);
          }
        } catch (error) {
          console.error("Failed to fetch prerequisites for TaskForm:", error);
          toast({
            title: "Error fetching form data",
            description: "Could not load required data for the form.",
            variant: "destructive"
          });
        } finally {
          setLoadingAssignableUsers(false);
        }
      };
      fetchPrerequisites();
    } else {
        setLoadingAssignableUsers(false);
    }
  }, [isSubTask, user, toast, task, parentId, preloadedAssignableUsers]);


  const handleAddMember = () => {
    if (!selectedUserId) return;
    const userToAdd = allAssignableUsers.find(u => u.uid === selectedUserId);
    if (userToAdd && !assignedUsers.some(u => u.uid === selectedUserId)) {
      setAssignedUsers([...assignedUsers, userToAdd]);
      setSelectedUserId('');
    }
  };

  const handleRemoveMember = (uid: string) => {
    setAssignedUsers(assignedUsers.filter(u => u.uid !== uid));
  };
  
  const availableUsersToAssign = useMemo(() => {
    return allAssignableUsers.filter(u => !assignedUsers.some(au => au.uid === u.uid));
  }, [allAssignableUsers, assignedUsers]);


  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!user) {
      toast({ title: 'Authentication Error', description: 'You must be logged in.', variant: 'destructive' });
      return;
    }
    if (!name || !dueDate) {
        toast({ title: 'Missing Fields', description: 'Name and Due Date are required.', variant: 'destructive'});
        return;
    }
     if (!isSubTask && taskType === 'collection' && (!cost || cost <= 0)) {
        toast({ title: 'Invalid Cost', description: 'A positive cost is required for collection tasks.', variant: 'destructive'});
        return;
    }

    setLoading(true);

    const taskPayload: any = {
      name,
      description,
      dueDate,
      parentId: parentId || task?.parentId || null,
    };

    if (isSubTask) {
      taskPayload.status = status;
      taskPayload.assignedToUids = assignedUsers.map(u => u.uid);
      taskPayload.assignedToNames = assignedUsers.map(u => u.displayName || u.email || 'N/A');
      taskPayload.taskType = 'standard';
      taskPayload.cost = null;
    } else {
      taskPayload.status = 'To Do';
      taskPayload.assignedToUids = [];
      taskPayload.assignedToNames = [];
      taskPayload.taskType = taskType;
      taskPayload.reminderDays = taskType === 'collection' ? reminderDays : null;
      taskPayload.cost = taskType === 'collection' ? cost : null;
    }

    try {
      if (task) {
        await updateTask(task.id, user.uid, taskPayload, user.role);
        toast({ title: 'Task Updated', description: `"${name}" has been updated.` });
      } else {
        const ownerName = user.displayName || user.email || 'Unknown User';
        await createTask(projectId, user.uid, ownerName, taskPayload);
        toast({ title: 'Task Created', description: `"${name}" has been added.` });
      }

      if (onFormSuccess) {
        onFormSuccess();
      } else {
        router.push(taskPayload.parentId ? `/projects/${projectId}/tasks/${taskPayload.parentId}` : `/projects/${projectId}`);
      }
      router.refresh();
    } catch (error: any) {
      toast({
        title: task ? 'Update Failed' : 'Creation Failed',
        description: error.message || 'An unexpected error occurred.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const formTitle = task
    ? (isSubTask ? t("taskForm.editSubTask") : t("taskForm.editMainTask"))
    : (isSubTask ? t("taskForm.addSubTask") : t("taskForm.addMainTask"));
    
  const buttonText = task 
    ? t("taskForm.saveChanges")
    : (isSubTask ? t("taskForm.addSubTaskBtn") : t("taskForm.createMainTaskBtn"));
    
  const formattedDueDate = dueDate ? format(dueDate, "PPP", { locale: dateLocale }) : '';
  const displayDueDate = locale === 'hi' ? replaceDevanagariNumerals(formattedDueDate) : formattedDueDate;
  
  const mainTaskCreatedDateText = parentMainTask?.createdAt ? format(parentMainTask.createdAt, 'PP', { locale: dateLocale }) : '';
  const mainTaskDueDateText = parentMainTask?.dueDate ? format(parentMainTask.dueDate, 'PP', { locale: dateLocale }) : '';
  
  const dateConstraintText = t("taskForm.dateConstraint", { 
    startDate: locale === 'hi' ? replaceDevanagariNumerals(mainTaskCreatedDateText) : mainTaskCreatedDateText, 
    endDate: locale === 'hi' ? replaceDevanagariNumerals(mainTaskDueDateText) : mainTaskDueDateText,
  });

  return (
    <Card className="shadow-lg">
      <form onSubmit={handleSubmit}>
        <CardHeader>
          <CardTitle className="font-headline text-2xl">{formTitle}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {!isSubTask && (
            <div className="space-y-3">
              <label className="text-sm font-medium">{t("taskForm.taskType")}</label>
              <RadioGroup value={taskType} onValueChange={(val: 'standard' | 'collection') => setTaskType(val)} className="flex flex-col space-y-1">
                  <div className="flex items-center space-x-3">
                      <RadioGroupItem value="standard" id="standard" />
                      <label htmlFor="standard" className="font-normal flex items-center gap-2">
                          <Layers className="h-4 w-4 text-muted-foreground" />
                          {t("taskForm.standardTask")}
                      </label>
                  </div>
                  <div className="flex items-center space-x-3">
                      <RadioGroupItem value="collection" id="collection" />
                       <label htmlFor="collection" className="font-normal flex items-center gap-2">
                           <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 text-muted-foreground"><path d="M6 3h12"/><path d="M6 8h12"/><path d="m6 13 8.5 8"/><path d="M6 13h3"/><path d="M9 13c6.667 0 6.667-10 0-10"/></svg>
                           {t("taskForm.collectionTask")}
                       </label>
                  </div>
              </RadioGroup>
            </div>
          )}

          <div className="space-y-2">
            <label htmlFor="name" className="text-sm font-medium">{t("taskForm.name")}</label>
            <Input id="name" value={name} onChange={e => setName(e.target.value)} placeholder={isSubTask ? t("taskForm.subTaskNamePlaceholder") : t("taskForm.mainTaskNamePlaceholder")} />
          </div>

          <div className="space-y-2">
            <label htmlFor="description" className="text-sm font-medium">{t("taskForm.description")}</label>
            <Textarea id="description" value={description} onChange={e => setDescription(e.target.value)} placeholder={isSubTask ? t("taskForm.subTaskDescPlaceholder") : t("taskForm.mainTaskDescPlaceholder")} rows={4} />
          </div>

          {isSubTask && (
            <>
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                <div className="space-y-2">
                    <label className="text-sm font-medium">{t("taskForm.status")}</label>
                    <Select value={status} onValueChange={(v: TaskStatus) => setStatus(v)}>
                        <SelectTrigger><SelectValue/></SelectTrigger>
                        <SelectContent>
                            {taskStatuses.map(s => <SelectItem key={s} value={s}>{t(`status.${s.toLowerCase().replace(/ /g, '')}`)}</SelectItem>)}
                        </SelectContent>
                    </Select>
                </div>
                 <div className="space-y-2">
                    <label className="text-sm font-medium">{t("common.dueDate")}</label>
                    <Popover>
                        <PopoverTrigger asChild>
                            <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !dueDate && "text-muted-foreground")}>
                                <CalendarIcon className="mr-2 h-4 w-4"/>
                                {dueDate ? displayDueDate : <span>{t("taskForm.pickDate")}</span>}
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0">
                          <Calendar
                            locale={dateLocale}
                            mode="single"
                            selected={dueDate}
                            onSelect={setDueDate}
                            disabled={parentMainTask ? { before: parentMainTask.createdAt, after: parentMainTask.dueDate || undefined } : undefined}
                          />
                        </PopoverContent>
                    </Popover>
                    {parentMainTask?.dueDate && (
                      <p className="text-xs text-muted-foreground pt-1">
                          {dateConstraintText}
                      </p>
                    )}
                </div>
              </div>
              <div className="space-y-2">
                  <label className="text-sm font-medium flex items-center gap-2"><Users className="h-4 w-4"/>{t("taskForm.assignTo")}</label>
                  <p className="text-sm text-muted-foreground">{t("taskForm.assignToDesc")}</p>
                  {loadingAssignableUsers ? (
                      <p className="text-sm text-muted-foreground">{t("taskForm.loadingUsers")}</p>
                  ) : allAssignableUsers.length === 0 ? (
                      <p className="text-sm text-muted-foreground">{t("taskForm.noUsers")}</p>
                  ) : (
                      <>
                          <div className="flex gap-2">
                              <select value={selectedUserId} onChange={e => setSelectedUserId(e.target.value)} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                                  <option value="">{t("taskForm.selectUser")}</option>
                                  {availableUsersToAssign.map(u => <option key={u.uid} value={u.uid}>{u.displayName} ({u.role})</option>)}
                              </select>
                              <Button type="button" onClick={handleAddMember} disabled={!selectedUserId}>{t("taskForm.add")}</Button>
                          </div>
                           {assignedUsers.length > 0 && (
                               <div className="space-y-2 rounded-md border p-2">
                                   <h4 className="text-xs font-semibold text-muted-foreground">{t("taskForm.assigned")}</h4>
                                   <ul className="flex flex-wrap gap-2">
                                       {assignedUsers.map(u => (
                                           <li key={u.uid} className="flex items-center gap-2 rounded-full bg-secondary px-3 py-1 text-sm">
                                               {u.displayName}
                                               <button type="button" onClick={() => handleRemoveMember(u.uid)} className="rounded-full hover:bg-muted p-0.5"><X className="h-3 w-3"/></button>
                                           </li>
                                       ))}
                                   </ul>
                               </div>
                           )}
                      </>
                  )}
              </div>
            </>
          )}

          {!isSubTask && (
              <div className="space-y-2">
                  <label className="text-sm font-medium">{t("common.dueDate")}</label>
                  <Popover>
                      <PopoverTrigger asChild>
                          <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !dueDate && "text-muted-foreground")}>
                              <CalendarIcon className="mr-2 h-4 w-4"/>
                              {dueDate ? displayDueDate : <span>{t("taskForm.pickDate")}</span>}
                          </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0">
                        <Calendar
                          locale={dateLocale} 
                          mode="single" 
                          selected={dueDate} 
                          onSelect={setDueDate}
                         />
                      </PopoverContent>
                  </Popover>
              </div>
          )}

          {taskType === 'collection' && !isSubTask && (
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                <div className="space-y-2">
                    <label className="text-sm font-medium">{t("taskForm.cost")}</label>
                    <Input type="number" value={cost || ''} onChange={e => setCost(e.target.value ? Number(e.target.value) : null)} placeholder={t("taskForm.costPlaceholder")} />
                </div>
                <div className="space-y-2">
                    <label className="text-sm font-medium">{t("taskForm.reminder")}</label>
                    <Input type="number" value={reminderDays || ''} onChange={e => setReminderDays(e.target.value ? Number(e.target.value) : null)} placeholder={t("taskForm.reminderPlaceholder")} />
                </div>
            </div>
          )}
        </CardContent>
        <CardFooter>
          <Button type="submit" className="w-full sm:w-auto" disabled={loading || !user}>
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            {buttonText}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
