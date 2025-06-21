
"use client";

import type { TimelineEvent } from '@/types';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { TimelineEventCard } from './TimelineEventCard';
import { GitMerge } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface MainTaskTimelineEventCardProps {
  event: TimelineEvent;
}

export function MainTaskTimelineEventCard({ event }: MainTaskTimelineEventCardProps) {

  if (event.source === 'subTask' && event.subTaskInfo) {
    return (
      <div className="relative flex items-start gap-4">
         <div className="absolute left-0 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-background border-2 border-border -translate-x-1/2 z-10">
            <GitMerge className="h-5 w-5 text-secondary-foreground" />
        </div>
        <div className="flex-1 space-y-1 pl-8">
            <Accordion type="single" collapsible className="w-full">
                <AccordionItem value={event.id} className="border-b-0">
                    <AccordionTrigger className="flex-1 items-center justify-between py-2 font-normal text-sm hover:no-underline [&[data-state=open]>svg]:rotate-90">
                        <div className="text-left">
                            <p>
                                <span className="font-semibold">{event.author.name}</span> on sub-task: <span className="font-semibold text-primary">{event.subTaskInfo.name}</span>
                            </p>
                             <p className="text-xs text-muted-foreground">
                                {formatDistanceToNow(event.timestamp, { addSuffix: true })}
                            </p>
                        </div>
                    </AccordionTrigger>
                    <AccordionContent className="pb-0">
                        <div className="pl-4 border-l-2 border-dashed ml-2 py-2">
                           <TimelineEventCard event={event} hideIcon={true} />
                        </div>
                    </AccordionContent>
                </AccordionItem>
            </Accordion>
        </div>
      </div>
    );
  }

  // Fallback for main task events or events without subTaskInfo
  return <TimelineEventCard event={event} />;
}
