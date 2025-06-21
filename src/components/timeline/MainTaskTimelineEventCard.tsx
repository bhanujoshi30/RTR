
"use client";

import type { AggregatedEvent, TimelineEvent } from '@/types';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { TimelineEventCard } from './TimelineEventCard';
import { ListChecks } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface MainTaskTimelineEventCardProps {
  event: AggregatedEvent;
}

export function MainTaskTimelineEventCard({ event }: MainTaskTimelineEventCardProps) {
  // Case 1: It's a group of sub-task events
  if (event.type === 'subTaskEventGroup') {
    const { subTaskInfo, events } = event.data as {
      subTaskInfo: { id: string; name: string };
      events: TimelineEvent[];
    };
    return (
      <div className="relative flex items-start gap-4">
        {/* Icon for the group */}
        <div className="absolute left-0 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-background border-2 border-border -translate-x-1/2 z-10">
          <ListChecks className="h-5 w-5 text-secondary-foreground" />
        </div>
        <div className="flex-1 space-y-1 pl-8">
          <Accordion type="single" collapsible className="w-full bg-muted/50 rounded-lg px-4 border">
            <AccordionItem value={subTaskInfo.id} className="border-b-0">
              <AccordionTrigger className="flex-1 items-center justify-between py-3 font-normal text-sm hover:no-underline [&[data-state=open]>svg]:rotate-90">
                <div className="text-left">
                  <p className="font-semibold">
                    {events.length} event{events.length > 1 ? 's' : ''} on sub-task: <span className="text-primary">{subTaskInfo.name}</span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Latest activity {formatDistanceToNow(event.timestamp, { addSuffix: true })}
                  </p>
                </div>
              </AccordionTrigger>
              <AccordionContent className="pb-4 pt-2">
                  <div className="relative space-y-4 pl-8 pt-2">
                    {/* Dotted line for sub-events */}
                    <div className="absolute left-4 top-0 bottom-0 w-px border-l-2 border-dashed border-border" />
                    {events.map((subEvent) => (
                      <div key={subEvent.id} className="relative">
                        {/* Dot for each sub-event */}
                        <div className="absolute -left-1.5 top-2 h-1.5 w-1.5 rounded-full bg-border" />
                        <p className="text-sm text-foreground">
                          <span className="font-semibold">{subEvent.author.name}</span> {subEvent.description}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatDistanceToNow(subEvent.timestamp, { addSuffix: true })}
                        </p>
                      </div>
                    ))}
                  </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </div>
      </div>
    );
  }

  // Case 2: It's a single main task event
  if (event.type === 'mainTaskEvent') {
    const mainTaskEvent = event.data as TimelineEvent;
    return <TimelineEventCard event={mainTaskEvent} />;
  }

  return null; // Fallback
}
