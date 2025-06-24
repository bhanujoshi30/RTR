
"use client";

import { ProjectList } from '@/components/projects/ProjectList';
import { Button } from '@/components/ui/button';
import { FolderPlus } from 'lucide-react';
import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';
import { useEffect, useState } from 'react';
import type { Project, Task as AppTask } from '@/types';
import { getAllTasksAssignedToUser, countProjectSubTasks, countProjectMainTasks } from '@/services/taskService';
import { getAllIssuesAssignedToUser, countProjectOpenIssues } from '@/services/issueService';
import { getProjectsByIds, getUserProjects, getClientProjects } from '@/services/projectService';
import { Loader2 } from 'lucide-react';
import { useTranslation } from '@/hooks/useTranslation';
import { useRouter } from 'next/navigation';

export default function DashboardPage() {
  const { user, loading: authLoading } = useAuth();
  const { t } = useTranslation();
  const router = useRouter();
  const [projectsToDisplay, setProjectsToDisplay] = useState<Project[]>([]);
  const [dashboardLoading, setDashboardLoading] = useState(true);
  const [dashboardError, setDashboardError] = useState<string | null>(null);
  const [loadingCreateProject, setLoadingCreateProject] = useState(false);

  useEffect(() => {
    const fetchDashboardData = async () => {
      if (authLoading || !user) {
        if (!authLoading && !user) {
            console.log('DashboardPage: Auth done, no user. Stopping dashboard loading.');
            setDashboardLoading(false);
        }
        return;
      }
      
      const isSupervisor = user?.role === 'supervisor';
      const isMember = user?.role === 'member';
      const isClient = user?.role === 'client';
      const isAdminOrOwner = !isSupervisor && !isMember && !isClient; 

      setDashboardLoading(true);
      setDashboardError(null);

      try {
        let finalProjectsToDisplay: Project[] = [];
        
        if (isClient) {
            const clientProjects = await getClientProjects(user.uid);
            finalProjectsToDisplay = clientProjects;
        } else if (isSupervisor || isMember) {
          const assignedSubTasks = await getAllTasksAssignedToUser(user.uid);
          const assignedIssues = await getAllIssuesAssignedToUser(user.uid);
          
          const projectIdsFromTasks = assignedSubTasks.map(task => task.projectId).filter(id => !!id);
          const projectIdsFromIssues = assignedIssues.map(issue => issue.projectId).filter(id => !!id);
          const allRelevantProjectIds = [...new Set([...projectIdsFromTasks, ...projectIdsFromIssues])];

          if (allRelevantProjectIds.length > 0) {
            const baseProjectsForUser = await getProjectsByIds(allRelevantProjectIds, user.uid, user.role);

            finalProjectsToDisplay = baseProjectsForUser.map(project => {
              const countSubTasksForUser = assignedSubTasks.filter(st => st.projectId === project.id).length;
              const countOpenIssuesForUser = assignedIssues.filter(i => i.projectId === project.id && i.status === 'Open').length;
              const mainTaskIdsUserInvolvedWith = new Set(
                assignedSubTasks.filter(st => st.projectId === project.id).map(st => st.parentId).filter(Boolean) as string[]
              );
              const countMainTasksForUser = mainTaskIdsUserInvolvedWith.size;

              return {
                ...project,
                totalMainTasks: countMainTasksForUser,
                totalSubTasks: countSubTasksForUser,
                totalOpenIssues: countOpenIssuesForUser,
              };
            });
          }
        } else if (isAdminOrOwner) {
          const baseProjectsAdmin = await getUserProjects(user.uid, user.role);

          if (baseProjectsAdmin.length > 0) {
            finalProjectsToDisplay = await Promise.all(
              baseProjectsAdmin.map(async (project) => {
                try {
                  const [mainTaskCount, subTaskCount, openIssueCount] = await Promise.all([
                    countProjectMainTasks(project.id, user.uid),
                    countProjectSubTasks(project.id, user.uid),
                    countProjectOpenIssues(project.id, user.uid),
                  ]);
                  
                  return {
                    ...project,
                    totalMainTasks: mainTaskCount,
                    totalSubTasks: subTaskCount,
                    totalOpenIssues: openIssueCount,
                  };
                } catch (err) {
                  console.error(`DashboardPage: Failed to get counts for project ${project.id}. Returning project with zero counts.`, err);
                  return {
                    ...project,
                    totalMainTasks: 0,
                    totalSubTasks: 0,
                    totalOpenIssues: 0,
                  };
                }
              })
            );
          }
        }

        console.log('DashboardPage: Final projectsToDisplay with counts:', finalProjectsToDisplay.length > 0 ? finalProjectsToDisplay : 'None');
        setProjectsToDisplay(finalProjectsToDisplay);

      } catch (err: any) {
        console.error("DashboardPage: Error fetching dashboard data:", err);
        setDashboardError("Failed to load dashboard data. " + (err.message || ""));
      } finally {
        console.log('DashboardPage: fetchDashboardData finished. Setting dashboardLoading to false.');
        setDashboardLoading(false);
      }
    };

    fetchDashboardData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, authLoading]);

  const isSupervisor = user?.role === 'supervisor';
  const isMember = user?.role === 'member';
  const isClient = user?.role === 'client';
  
  let pageTitle = t('dashboard.myProjects');
  if (isSupervisor || isMember) {
    pageTitle = t('dashboard.assignedWork');
  } else if (isClient) {
    pageTitle = t('dashboard.myProjects');
  }

  const canCreateProject = user && !isSupervisor && !isMember && !isClient;

  if (authLoading || dashboardLoading) {
    return (
      <div className="flex h-[calc(100vh-10rem)] items-center justify-center">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="ml-3 text-lg">{t('dashboard.loading')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
        <h1 className="font-headline text-3xl font-semibold tracking-tight">{pageTitle}</h1>
        <div className="flex items-center gap-2">
          {canCreateProject && (
            <Button
              onClick={() => {
                setLoadingCreateProject(true);
                router.push('/projects/create');
              }}
              disabled={loadingCreateProject}
            >
              {loadingCreateProject ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <FolderPlus className="mr-2 h-4 w-4" />
              )}
              {t('header.newProject')}
            </Button>
          )}
        </div>
      </div>
      {dashboardError && <p className="text-center text-destructive py-4">{dashboardError}</p>}
      {!dashboardError && <ProjectList projects={projectsToDisplay} isSupervisorView={isSupervisor || isMember} isClientView={isClient} />}
    </div>
  );
}
