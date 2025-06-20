
"use client";

import { ProjectList } from '@/components/projects/ProjectList';
import { Button } from '@/components/ui/button';
import { FolderPlus } from 'lucide-react';
import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';
import { useEffect, useState } from 'react';
import type { Project, Task as AppTask } from '@/types'; // Renamed Task to AppTask to avoid conflict
import { getAllTasksAssignedToUser, countProjectMainTasks } from '@/services/taskService';
import { getAllIssuesAssignedToUser, countProjectOpenIssues } from '@/services/issueService';
import { getProjectsByIds, getUserProjects } from '@/services/projectService';
import { Loader2 } from 'lucide-react';

export default function DashboardPage() {
  const { user, loading: authLoading } = useAuth();
  const [projectsToDisplay, setProjectsToDisplay] = useState<Project[]>([]);
  const [dashboardLoading, setDashboardLoading] = useState(true);
  const [dashboardError, setDashboardError] = useState<string | null>(null);

  const isSupervisor = user?.role === 'supervisor';
  const isMember = user?.role === 'member';
  const isAdminOrOwner = user && !isSupervisor && !isMember; 

  useEffect(() => {
    const fetchDashboardData = async () => {
      console.log('DashboardPage: fetchDashboardData called. Auth Loading:', authLoading, 'User:', user ? `${user.displayName || user.email} (Role: ${user.role}, UID: ${user.uid})` : 'null');
      if (authLoading || !user) {
        if (!authLoading && !user) {
            console.log('DashboardPage: Auth done, no user. Stopping dashboard loading.');
            setDashboardLoading(false);
        }
        return;
      }

      setDashboardLoading(true);
      setDashboardError(null);

      try {
        let baseProjects: Project[] = [];
        let userAssignedSubTasks: AppTask[] = []; // Store assigned sub-tasks for supervisor/member

        if (isSupervisor || isMember) {
          console.log(`DashboardPage: User is a ${user.role} (UID: ${user.uid}). Fetching assigned tasks and issues.`);
          // Fetch all sub-tasks assigned to the user across all projects
          userAssignedSubTasks = await getAllTasksAssignedToUser(user.uid); 
          console.log(`DashboardPage: ${user.role} - Fetched assignedTasks (sub-tasks):`, userAssignedSubTasks);
          
          const assignedIssues = await getAllIssuesAssignedToUser(user.uid); 
          console.log(`DashboardPage: ${user.role} - Fetched assignedIssues:`, assignedIssues);

          const projectIdsFromTasks = userAssignedSubTasks.map(task => task.projectId).filter(id => !!id);
          const projectIdsFromIssues = assignedIssues.map(issue => issue.projectId).filter(id => !!id);
          
          const allProjectIds = [...new Set([...projectIdsFromTasks, ...projectIdsFromIssues])];
          console.log(`DashboardPage: ${user.role} - Combined unique projectIds from tasks and issues:`, allProjectIds);

          if (allProjectIds.length > 0) {
            baseProjects = await getProjectsByIds(allProjectIds);
            console.log(`DashboardPage: ${user.role} - Fetched baseProjects from combined IDs:`, baseProjects);
          } else {
            console.log(`DashboardPage: ${user.role} - No unique project IDs found from tasks or issues.`);
            baseProjects = [];
          }
        } else if (isAdminOrOwner) { 
          console.log(`DashboardPage: User is admin/owner (UID: ${user.uid}). Fetching owned projects.`);
          baseProjects = await getUserProjects(user.uid);
          console.log('DashboardPage: Admin/Owner - Fetched baseProjects:', baseProjects);
        } else {
          baseProjects = [];
        }

        if (baseProjects.length > 0) {
          console.log('DashboardPage: Base projects found, proceeding to fetch counts for:', baseProjects.map(p => p.id));
          const projectsWithCounts = await Promise.all(
            baseProjects.map(async (project) => {
              console.log(`DashboardPage: Processing project ${project.id} (${project.name}) for counts.`);

              const mainTaskCountPromise = countProjectMainTasks(project.id);
              
              let subTaskCountForProject: number;
              if (isSupervisor || isMember) {
                // For supervisor/member, count sub-tasks assigned to them in *this specific project*
                subTaskCountForProject = userAssignedSubTasks.filter(task => task.projectId === project.id).length;
                console.log(`DashboardPage: [Project: ${project.id}] User is ${user.role}. Assigned sub-task count for this project: ${subTaskCountForProject}`);
              } else {
                // For admin/owner, count all sub-tasks in the project (this was the previous behavior, kept for consistency if ever needed, though not displayed by default)
                // For simplicity, we can default to 0 if not supervisor/member, or fetch project-wide if needed.
                // Current request implies we only care about user-specific sub-task count for sup/member on this view.
                // The ProjectCard.tsx will show project.totalSubTasks if available. Let's assume for admin/owner they want the total.
                // However, the original issue was about supervisor/member. So let's ensure the display logic for the card is consistent.
                // For this iteration, `totalSubTasks` on the project object will mean "assigned to me" for sup/mem.
                // If an admin/owner views this, `totalSubTasks` might be undefined or could fetch project-wide count.
                // The current setup uses `countProjectSubTasks` from `projectService` for admin/owner implicitly as `userAssignedSubTasks` is empty.
                // Let's stick to the user story: for supervisor/member, it's *their* assigned subtasks.
                // Admin/owner still see project-wide counts if those fields were populated by some other means,
                // but the `getAllTasksAssignedToUser` won't be used for them for sub-task count.
                // Let's ensure they get the global count if they are not sup/mem
                // The dashboard was already fetching `countProjectSubTasks` from `taskService`.
                // To be clear: the request is "number of sub tasks assigned to the current user"
                // So if not supervisor/member, this specific count is not relevant.
                // The `ProjectCard` can show total if that's what `countProjectSubTasks` returns.
                // For this specific view for sup/mem, totalSubTasks property WILL hold their assigned count.
                subTaskCountForProject = 0; // Fallback for admin/owner if we don't re-implement project-wide sub-task count here
                                            // which is fine because the request is specifically for sup/mem view.
                                            // Admin/owners still see project-wide stats via other calls IF ProjectCard is designed to take them.
                                            // The previous change added project-wide main, sub, issues.
                                            // Let's keep it simple: `totalSubTasks` on project will be the assigned count for sup/mem.
                                            // For admin/owner, it uses a different path entirely for `baseProjects` so this count won't be set here.
                                            // The ProjectCard receives a Project object. If `totalSubTasks` is set, it displays it.
                                            // The `DashboardPage` for admin/owner was ALREADY fetching total counts including total sub-tasks.
                                            // So, this change specifically addresses the sup/mem case.
              }
              
              const openIssueCountPromise = countProjectOpenIssues(project.id);
              
              console.log(`DashboardPage: [Project: ${project.id}] Initiating countProjectMainTasks.`);
              console.log(`DashboardPage: [Project: ${project.id}] Sub-task count (for ${user?.role}): ${subTaskCountForProject}`);
              console.log(`DashboardPage: [Project: ${project.id}] Initiating countProjectOpenIssues.`);

              const [mainTaskCount, openIssueCount] = await Promise.all([
                mainTaskCountPromise,
                openIssueCountPromise // subTaskCount is now determined before Promise.all for sup/mem
              ]);
              
              console.log(`DashboardPage: [Project: ${project.id}] Resolved mainTaskCount: ${mainTaskCount}`);
              // subTaskCountForProject is already resolved for sup/mem. For admin/owner, countProjectSubTasks is still used
              // let's re-add project-wide subtask count for admin/owner for completeness, as it was there before
              let finalSubTaskCount = subTaskCountForProject; // for sup/mem
              if (isAdminOrOwner) {
                // The services/taskService has countProjectSubTasks - this was part of the previous request
                // const projectWideSubTasks = await countProjectSubTasks(project.id); // This was removed in last prompt. Re-add if needed.
                // For now, the focus is on sup/mem. If admin/owner needs this, their ProjectList will get projects from getUserProjects path
                // which might already have these from a different calculation or might need them added.
                // The issue is about supervisor/member view.
                // Let's assume the other view (admin/owner) for ProjectList is already populating its `totalSubTasks` if needed.
                // This component (DashboardPage) prepares `projectsToDisplay`.
                // The existing `if (isAdminOrOwner)` path fetches `baseProjects = await getUserProjects(user.uid);`
                // and then it proceeds to the `Promise.all` block. In that block, we need to ensure `subTaskCount` is also calculated.
                // Let's re-introduce the taskService.countProjectSubTasks call for admin/owner.

                // This block is for ALL users now.
                // if (isSupervisor || isMember) -> subTaskCountForProject is from filter
                // else (isAdminOrOwner) -> subTaskCountForProject should be from taskService.countProjectSubTasks
                // This requires taskService.countProjectSubTasks again.
                // To avoid re-adding it to imports if not needed, let's simplify.
                // The request is specific to "My Assigned Work Overview" (sup/mem).
                // The ProjectCard will display `totalSubTasks` if it exists.
                // This `DashboardPage` is responsible for setting that field.
                // So for sup/mem, `totalSubTasks` = their_assigned_subtasks_in_project.
                // For admin/owner, their `baseProjects` might not have this count set by `getUserProjects`
                // so the map block should set it. The previous version had `taskService.countProjectSubTasks` for this.
                // Let's add it back for consistency.
                // No, the user story is very specific "in the my assigned work overview page".
                // So we only need to ensure this is correct for sup/mem.
                // The generic ProjectCard will show `totalSubTasks`.
                // If an admin/owner sees a project on their dashboard, their `totalSubTasks` should be project-wide.
                // Let's modify the `subTaskCountPromise` to reflect this.
              }
              
              const subTaskCountToUse = (isSupervisor || isMember) 
                ? subTaskCountForProject 
                : (await import('@/services/taskService')).countProjectSubTasks(project.id); // Fetch project-wide for admin/owner


              console.log(`DashboardPage: [Project: ${project.id}] Resolved subTaskCount (final for display): ${await subTaskCountToUse}`);
              console.log(`DashboardPage: [Project: ${project.id}] Resolved openIssueCount: ${openIssueCount}`);

              return {
                ...project,
                totalMainTasks: mainTaskCount,
                totalSubTasks: await subTaskCountToUse,
                totalOpenIssues: openIssueCount,
              };
            })
          );
          console.log('DashboardPage: Projects with counts:', projectsWithCounts);
          setProjectsToDisplay(projectsWithCounts);
        } else {
          console.log('DashboardPage: No base projects to display or fetch counts for.');
          setProjectsToDisplay([]);
        }

      } catch (err: any) {
        console.error("DashboardPage: Error fetching dashboard data:", err);
        setDashboardError("Failed to load dashboard data. " + (err.message || ""));
      } finally {
        console.log('DashboardPage: fetchDashboardData finished. Setting dashboardLoading to false.');
        setDashboardLoading(false);
      }
    };

    fetchDashboardData();
  }, [user, authLoading, isSupervisor, isAdminOrOwner, isMember]);

  const pageTitle = isSupervisor ? "My Assigned Work Overview" : (isMember ? "My Assigned Work Overview" : "My Projects");
  const canCreateProject = user && !isSupervisor && !isMember;

  if (authLoading || dashboardLoading) {
    return (
      <div className="flex h-[calc(100vh-10rem)] items-center justify-center">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="ml-3 text-lg">Loading dashboard...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
        <h1 className="font-headline text-3xl font-semibold tracking-tight">{pageTitle}</h1>
        {canCreateProject && (
          <Button asChild>
            <Link href="/projects/create">
              <FolderPlus className="mr-2 h-4 w-4" />
              New Project
            </Link>
          </Button>
        )}
      </div>
      {dashboardError && <p className="text-center text-destructive py-4">{dashboardError}</p>}
      {!dashboardError && <ProjectList projects={projectsToDisplay} isSupervisorView={isSupervisor || isMember} />}
    </div>
  );
}
