
"use client";

import { useEffect, useState } from 'react';
import { getProjectMainTasks, getProjectSubTasks } from '@/services/taskService';
import type { Task } from '@/types';
import { TaskCard } from '@/components/tasks/TaskCard';
import { Loader2, ListTodo } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useTranslation } from '@/hooks/useTranslation';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';

interface TaskListProps {
  projectId: string;
  onTasksUpdated?: () => void;
}

export function TaskList({ projectId, onTasksUpdated }: TaskListProps) {
  const [tasks, setTasks] = useState<Task[]>([]); // Will hold main tasks
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { user, loading: authLoading } = useAuth();
  const { t } = useTranslation();

  const isSupervisorOrMember = user?.role === 'supervisor' || user?.role === 'member';

  const fetchMainTasks = async () => {
    console.log('TaskList: fetchMainTasks called. projectId:', projectId, 'Auth Loading:', authLoading, 'User Role:', user?.role);
    if (authLoading || !user) {
      if (!authLoading && !user) setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const allProjectSubTasks = await getProjectSubTasks(projectId);

      const subTasksByParent = allProjectSubTasks.reduce((acc, subTask) => {
        if (subTask.parentId) {
          if (!acc[subTask.parentId]) acc[subTask.parentId] = [];
          acc[subTask.parentId].push(subTask);
        }
        return acc;
      }, {} as Record<string, Task[]>);

      const augmentTasks = (tasksToAugment: Task[]): Task[] => {
        return tasksToAugment.map(mainTask => {
          if (mainTask.taskType === 'collection') {
            return { ...mainTask, displaySubTaskCountLabel: t('taskDetails.collectionTaskType') };
          }
          
          const relatedSubTasks = subTasksByParent[mainTask.id] || [];
          let displaySubTaskCountLabel = '';

          if (isSupervisorOrMember) {
            const assignedSubtasks = relatedSubTasks.filter(st => st.assignedToUids?.includes(user!.uid));
            const count = assignedSubtasks.length;
            const labelKey = count === 1 ? 'taskCard.subTaskAssignedToYou' : 'taskCard.subTasksAssignedToYou';
            displaySubTaskCountLabel = t(labelKey).replace('{count}', count.toString());
          } else { // Admin or Owner
            const count = relatedSubTasks.length;
            const labelKey = count === 1 ? 'taskCard.subTask' : 'taskCard.subTasks';
            displaySubTaskCountLabel = t(labelKey).replace('{count}', count.toString());
          }
          
          return { ...mainTask, displaySubTaskCountLabel };
        });
      };

      const isClientOrAdmin = user?.role === 'client' || user?.role === 'admin';

      if (isSupervisorOrMember) {
        const assignedSubTasks = allProjectSubTasks.filter(st => st.assignedToUids?.includes(user.uid));
        
        if (assignedSubTasks.length > 0) {
          const mainTaskIdsUserIsInvolvedWith = [...new Set(assignedSubTasks.map(st => st.parentId!))];
          const involvedMainTasks = await getProjectMainTasks(projectId, mainTaskIdsUserIsInvolvedWith);
          const augmentedTasks = augmentTasks(involvedMainTasks);
          augmentedTasks.sort((a, b) => (b.createdAt?.getTime() || 0) - (a.createdAt?.getTime() || 0));
          setTasks(augmentedTasks);
        } else {
          setTasks([]);
        }
      } else {
        let allMainTasks = await getProjectMainTasks(projectId);
        
        if (!isClientOrAdmin) {
            allMainTasks = allMainTasks.filter(t => t.taskType !== 'collection');
        }
        const augmentedTasks = augmentTasks(allMainTasks);
        setTasks(augmentedTasks);
      }
    } catch (err: any) {
      console.error('TaskList: Error fetching main tasks:', err);
      setError(`Failed to load tasks. ${err.message?.includes("index") ? "A database index might be required for main tasks. Check console for details from taskService." : (err.message || "Unknown error")}`);
      setTasks([]);
    } finally {
      setLoading(false);
      console.log('TaskList: fetchMainTasks finished. Loading set to false.');
    }
  };

  useEffect(() => {
    console.log('TaskList: useEffect triggered. projectId:', projectId, 'Auth loading:', authLoading, 'User role:', user?.role);
    if (projectId && !authLoading && user) {
      fetchMainTasks();
    } else if (!projectId) {
      console.warn('TaskList: projectId is undefined or null, skipping fetch.');
      setLoading(false);
      setError("Project ID is missing, cannot load tasks.");
    } else if (!authLoading && !user) {
      setLoading(false);
      setError("User not authenticated. Cannot load tasks.");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, authLoading, user]);

  const onTaskUpdated = () => {
    console.log('TaskList: onTaskUpdated called, re-fetching main tasks.');
    fetchMainTasks();
    if(onTasksUpdated) {
        onTasksUpdated();
    }
  }

  if (loading) {
    console.log('TaskList: Render - Loading state true.');
    return (
      <div className="flex justify-center items-center py-8">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="ml-2">Loading tasks...</p>
      </div>
    );
  }

  if (error) {
    console.log('TaskList: Render - Error state:', error);
    return <p className="text-center text-destructive py-4">{error}</p>;
  }

  if (tasks.length === 0) {
    console.log('TaskList: Render - No tasks to display.');
    const message = isSupervisorOrMember
      ? "You are not assigned to any sub-tasks under main tasks in this project, or there are no main tasks with such assignments."
      : "No main tasks have been created for this project yet.";
    const title = isSupervisorOrMember
      ? "No Relevant Main Tasks"
      : "No Main Tasks Yet";
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-muted-foreground/30 bg-card p-10 text-center">
        <ListTodo className="mx-auto h-12 w-12 text-muted-foreground/50" />
        <h3 className="mt-3 font-headline text-lg font-semibold">{title}</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          {message}
        </p>
      </div>
    );
  }
  console.log('TaskList: Render - Displaying tasks:', tasks.length > 0 ? tasks : 'None');
  return (
    <div className="space-y-4">
      {tasks.map((task) => (
        <TaskCard key={task.id} task={task} onTaskUpdated={onTaskUpdated} isMainTaskView={true} />
      ))}
    </div>
  );
}
