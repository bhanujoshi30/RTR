
import type { Project } from '@/types';
import Link from 'next/link';
import Image from 'next/image';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { FolderKanban, CalendarDays, ExternalLink, ListChecks, AlertTriangle, Layers, Wallet } from 'lucide-react'; 
import { formatDistanceToNow } from 'date-fns';

interface ProjectCardProps {
  project: Project;
}

export function ProjectCard({ project }: ProjectCardProps) {
  const getStatusColor = (status: Project['status']) => {
    switch (status) {
      case 'Not Started': return 'bg-gray-500 hover:bg-gray-500';
      case 'In Progress': return 'bg-blue-500 hover:bg-blue-500';
      case 'Completed': return 'bg-green-500 hover:bg-green-500';
      case 'Payment Incomplete': return 'bg-amber-500 hover:bg-amber-500 text-white';
      default: return 'bg-primary';
    }
  };
  
  return (
    <Card className="flex h-full transform flex-col overflow-hidden shadow-lg transition-all duration-300 hover:shadow-xl hover:-translate-y-1 group">
      <Link href={`/projects/${project.id}`} className="block relative w-full aspect-video bg-muted">
        <Image
          src={project.photoURL || 'https://placehold.co/600x400.png'}
          alt={project.name}
          layout="fill"
          objectFit="cover"
          className="transition-transform duration-300 group-hover:scale-105"
          data-ai-hint="office project"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-black/20 to-transparent" />
        <div className="absolute top-2 right-2 z-10 flex flex-col items-end gap-2">
            {project.hasUpcomingReminder && (
                <Badge variant="destructive" className="animate-pulse">
                    <Wallet className="mr-1.5 h-3.5 w-3.5" />
                    Payment Due Soon
                </Badge>
            )}
            <Badge variant="secondary" className={`${getStatusColor(project.status)} text-primary-foreground`}>
            {project.status}
            </Badge>
        </div>
      </Link>
      <CardHeader className="pb-4">
        <CardTitle className="font-headline text-xl">
          <Link href={`/projects/${project.id}`} className="hover:underline">
            {project.name}
          </Link>
        </CardTitle>
        {project.description && (
          <CardDescription className="line-clamp-2 h-[40px] overflow-hidden text-ellipsis">
            {project.description}
          </CardDescription>
        )}
      </CardHeader>
      <CardContent className="flex-grow space-y-3">
        <div>
          <div className="flex justify-between text-sm text-muted-foreground">
            <span>Progress</span>
            <span>{Math.round(project.progress)}%</span>
          </div>
          <Progress value={project.progress} className="h-2 w-full" aria-label={`Project progress: ${project.progress}%`} />
        </div>
        <div className="space-y-1 text-sm text-muted-foreground">
            {(project.totalMainTasks !== undefined || project.totalSubTasks !== undefined || project.totalOpenIssues !== undefined) && (
            <>
                {project.totalMainTasks !== undefined && (
                <div className="flex items-center">
                    <Layers className="mr-2 h-4 w-4 text-indigo-600" />
                    <span>{project.totalMainTasks} Main Task{project.totalMainTasks !== 1 ? 's' : ''}</span>
                </div>
                )}
                {project.totalSubTasks !== undefined && (
                <div className="flex items-center">
                    <ListChecks className="mr-2 h-4 w-4 text-sky-600" />
                    <span>{project.totalSubTasks} Sub-task{project.totalSubTasks !== 1 ? 's' : ''}</span>
                </div>
                )}
                {project.totalOpenIssues !== undefined && (
                <div className="flex items-center">
                    <AlertTriangle className="mr-2 h-4 w-4 text-amber-600" />
                    <span>{project.totalOpenIssues} Open Issue{project.totalOpenIssues !== 1 ? 's' : ''}</span>
                </div>
                )}
            </>
            )}
            {project.totalCost && project.totalCost > 0 && (
                <div className="flex items-center pt-1">
                    <Wallet className="mr-2 h-4 w-4 text-green-600" />
                    <span className="text-foreground font-medium">Est. Cost: {new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(project.totalCost)}</span>
                </div>
            )}
        </div>
      </CardContent>
      <CardFooter className="flex flex-col items-start gap-2 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
         <div className="flex items-center text-xs text-muted-foreground">
          <CalendarDays className="mr-1.5 h-3.5 w-3.5" />
          Created {project.createdAt ? formatDistanceToNow(project.createdAt, { addSuffix: true }) : 'recently'}
        </div>
        <Button variant="outline" size="sm" asChild>
          <Link href={`/projects/${project.id}`}>
            View Project
            <ExternalLink className="ml-2 h-4 w-4" />
          </Link>
        </Button>
      </CardFooter>
    </Card>
  );
}
