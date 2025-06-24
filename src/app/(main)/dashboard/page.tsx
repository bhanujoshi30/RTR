
"use client";

import { ProjectList } from '@/components/projects/ProjectList';
import { Button } from '@/components/ui/button';
import { FolderPlus } from 'lucide-react';
import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';
import { useEffect, useState } from 'react';
import type { Project } from '@/types';
import { countProjectMainTasks, countProjectSubTasks, getAllTasksAssignedToUser } from '@/services/taskService';
import { countProjectOpenIssues, getOpenIssuesForTaskIds } from '@/services/issueService';
import { getClientProjects, getMemberProjects, getUserProjects, getAllProjects } from '@/services/projectService';
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
      
      const isSupervisor = user.role === 'supervisor';
      const isMember = user.role === 'member';
      const isClient = user.role === 'client';
      const isAdmin = user.role === 'admin';
      const isOwner = user.role === 'owner';

      setDashboardLoading(true);
      setDashboardError(null);

      try {
        let finalProjects: Project[] = [];

        if (isClient) {
            finalProjects = await getClientProjects(user.uid);
        
        } else if (isSupervisor || isMember) {
            const memberProjects = await getMemberProjects(user.uid);
            const allAssignedSubTasks = await getAllTasksAssignedToUser(user.uid);
    
            finalProjects = await Promise.all(memberProjects.map(async (project) => {
                const subTasksForThisProject = allAssignedSubTasks.filter(t => t.projectId === project.id);
                const subTaskIds = subTasksForThisProject.map(t => t.id);
        
                const openIssues = subTaskIds.length > 0 ? await getOpenIssuesForTaskIds(subTaskIds) : [];
                
                const uniqueMainTaskIds = new Set(subTasksForThisProject.map(t => t.parentId).filter(Boolean));
        
                return {
                    ...project,
                    totalMainTasks: uniqueMainTaskIds.size,
                    totalSubTasks: subTasksForThisProject.length,
                    totalOpenIssues: openIssues.length,
                };
            }));

        } else if (isAdmin || isOwner) {
            const projectsToCount = isAdmin ? await getAllProjects(user.uid) : await getUserProjects(user.uid);
            
            finalProjects = await Promise.all(
                projectsToCount.map(async (project) => {
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

        console.log('DashboardPage: Final projectsToDisplay with counts:', finalProjects.length > 0 ? finalProjects : 'None');
        setProjectsToDisplay(finalProjects);

      } catch (err: any) {
        console.error("DashboardPage: Error fetching dashboard data:", err);
        setDashboardError("Failed to load dashboard data. " + (err.message || "Missing or insufficient permissions."));
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

  const canCreateProject = user && (user.role === 'admin' || user.role === 'owner');

  if (authLoading || dashboardLoading) {
    return (
      <div className="flex h-[calc(100vh-10rem)] items-center justify-center">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="ml-3 text-lg">{t('dashboard.loading')}</p>
      </div>
    );
  }
   
  if (dashboardError) {
      return (
          <div className="text-center py-10">
              <h1 className="text-xl font-semibold text-destructive">Error Loading Dashboard</h1>
              <p className="text-muted-foreground mt-2">{dashboardError}</p>
          </div>
      )
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
      <ProjectList projects={projectsToDisplay} />
    </div>
  );
}
