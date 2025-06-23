
"use client";

import type { ProjectAggregatedEvent } from '@/types';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { MainTaskTimelineEventCard } from './MainTaskTimelineEventCard';
import { Layers } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { useTranslation } from '@/hooks/useTranslation';

interface ProjectTimelineEventCardProps {
  eventGroup: ProjectAggregatedEvent;
}

export function ProjectTimelineEventCard({ eventGroup }: ProjectTimelineEventCardProps) {
  const { mainTaskInfo, events } = eventGroup.data;
  const { t } = useTranslation();

  const relevantEventsText = events.length === 1 
    ? t('timeline.relevantEvent', { count: 1 }) 
    : t('timeline.relevantEvents', { count: events.length });
    
  const latestActivityText = t('timeline.latestActivity', { time: formatDistanceToNow(eventGroup.timestamp, { addSuffix: true }) });

  return (
    <Accordion type="single" collapsible className="w-full bg-card rounded-lg border shadow-sm">
      <AccordionItem value={mainTaskInfo.id} className="border-b-0">
        <AccordionTrigger className="flex w-full items-center justify-between p-4 font-normal text-base hover:no-underline [&[data-state=open]>svg]:rotate-180">
          <div className="flex items-center gap-3 text-left">
            <Layers className="h-6 w-6 text-primary" />
            <div>
              <p className="font-semibold text-foreground">
                {mainTaskInfo.name}
              </p>
              <p className="text-xs text-muted-foreground">
                {relevantEventsText} &bull; {latestActivityText}
              </p>
            </div>
          </div>
        </AccordionTrigger>
        <AccordionContent className="px-4 pb-4">
            <div className="relative pl-6 pt-2">
                {/* Vertical line for the sub-timeline */}
                <div className="absolute left-[9px] top-0 bottom-0 w-0.5 bg-border -translate-x-1/2"></div>
                <div className="space-y-8">
                    {events.map((event) => (
                    <MainTaskTimelineEventCard key={event.id} event={event} />
                    ))}
                </div>
            </div>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}
