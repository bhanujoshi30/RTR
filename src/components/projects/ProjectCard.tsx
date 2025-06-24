
"use client";

import type { Project } from '@/types';
import Link from 'next/link';
import Image from 'next/image';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { FolderKanban, CalendarDays, ExternalLink, ListChecks, AlertTriangle, Layers, Wallet, IndianRupee, Loader2 } from 'lucide-react'; 
import { formatDistanceToNow } from 'date-fns';
import { enUS, hi } from 'date-fns/locale';
import { numberToWordsInr, replaceDevanagariNumerals } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import { useState } from 'react';
import { useTranslation } from '@/hooks/useTranslation';

interface ProjectCardProps {
  project: Project;
}

export function ProjectCard({ project }: ProjectCardProps) {
  const { user } = useAuth();
  const { t, locale } = useTranslation();
  const dateLocale = locale === 'hi' ? hi : enUS;
  const canViewFinancials = user?.role === 'client' || user?.role === 'admin';
  const [isNavigating, setIsNavigating] = useState(false);

  const getStatusColor = (status: Project['status']) => {
    switch (status) {
      case 'Not Started': return 'bg-gray-500 hover:bg-gray-500';
      case 'In Progress': return 'bg-blue-500 hover:bg-blue-500';
      case 'Completed': return 'bg-green-500 hover:bg-green-500';
      case 'Payment Incomplete': return 'bg-amber-500 hover:bg-amber-500 text-white';
      default: return 'bg-primary';
    }
  };
  
  let displayStatus = project.status;
  if (displayStatus === 'Payment Incomplete' && !canViewFinancials) {
    displayStatus = 'Completed';
  }

  const handleNavigation = () => {
    setIsNavigating(true);
  };
  
  const createdAtText = project.createdAt ? formatDistanceToNow(project.createdAt, { addSuffix: true, locale: dateLocale }) : 'recently';

  return (
    <Card className="relative flex h-full transform flex-col overflow-hidden shadow-lg transition-all duration-300 hover:shadow-xl hover:-translate-y-1 group">
      {isNavigating && (
        <div className="absolute inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center z-10 rounded-lg">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
        </div>
      )}
      <Link href={`/projects/${project.id}`} onClick={handleNavigation} className="block relative w-full aspect-video bg-muted">
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
            {canViewFinancials && project.hasUpcomingReminder && (
                <Badge variant="destructive" className="animate-pulse">
                    <Wallet className="mr-1.5 h-3.5 w-3.5" />
                    {t('projectCard.paymentDue')}
                </Badge>
            )}
            <Badge variant="secondary" className={`${getStatusColor(displayStatus)} text-primary-foreground`}>
              {t(`status.${displayStatus.toLowerCase().replace(/ /g, '')}`)}
            </Badge>
        </div>
      </Link>
      <CardHeader className="pb-4">
        <CardTitle className="font-headline text-xl">
          <Link href={`/projects/${project.id}`} onClick={handleNavigation} className="hover:underline">
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
        {(user?.role === 'admin' || user?.role === 'owner') && (
            <div>
              <div className="flex justify-between text-sm text-muted-foreground">
                <span>{t('projectDetails.progress')}</span>
                <span>{Math.round(project.progress)}%</span>
              </div>
              <Progress value={project.progress} className="h-2 w-full" aria-label={`Project progress: ${project.progress}%`} />
            </div>
        )}
        <div className="space-y-1 text-sm text-muted-foreground">
            {(project.totalMainTasks !== undefined || project.totalSubTasks !== undefined || project.totalOpenIssues !== undefined) && (
            <>
                {project.totalMainTasks !== undefined && (
                <div className="flex items-center">
                    <Layers className="mr-2 h-4 w-4 text-indigo-600" />
                    <span>{t(project.totalMainTasks === 1 ? 'projectCard.mainTask' : 'projectCard.mainTasks', { count: project.totalMainTasks })}</span>
                </div>
                )}
                {project.totalSubTasks !== undefined && (
                <div className="flex items-center">
                    <ListChecks className="mr-2 h-4 w-4 text-sky-600" />
                    <span>{t(project.totalSubTasks === 1 ? 'projectCard.subTask' : 'projectCard.subTasks', { count: project.totalSubTasks })}</span>
                </div>
                )}
                {project.totalOpenIssues !== undefined && (
                <div className="flex items-center">
                    <AlertTriangle className="mr-2 h-4 w-4 text-amber-600" />
                    <span>{t(project.totalOpenIssues === 1 ? 'projectCard.openIssue' : 'projectCard.openIssues', { count: project.totalOpenIssues })}</span>
                </div>
                )}
            </>
            )}
            {canViewFinancials && project.totalCost && project.totalCost > 0 && (
                <div className="pt-1">
                    <div className="flex items-center text-sm">
                        <IndianRupee className="mr-2 h-4 w-4 text-green-600" />
                        <span className="text-foreground font-medium">{t('projectDetails.estCost')} {new Intl.NumberFormat('en-IN', { minimumFractionDigits: 0 }).format(project.totalCost)}</span>
                    </div>
                    <p className="text-xs text-muted-foreground pl-6">{numberToWordsInr(project.totalCost, locale)}</p>
                </div>
            )}
        </div>
      </CardContent>
      <CardFooter className="flex flex-col items-start gap-2 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
         <div className="flex items-center text-xs text-muted-foreground">
          <CalendarDays className="mr-1.5 h-3.5 w-3.5" />
          {t('common.created')} {locale === 'hi' ? replaceDevanagariNumerals(createdAtText) : createdAtText}
        </div>
        <Button variant="outline" size="sm" asChild>
          <Link href={`/projects/${project.id}`} onClick={handleNavigation}>
            {t('projectCard.viewProject')}
            <ExternalLink className="ml-2 h-4 w-4" />
          </Link>
        </Button>
      </CardFooter>
    </Card>
  );
}
