
"use client";

import type { AggregatedEvent, TimelineEvent } from '@/types';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { TimelineEventCard } from './TimelineEventCard';
import { ListChecks } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { enUS, hi } from 'date-fns/locale';
import { useAuth } from '@/hooks/useAuth';
import { useTranslation } from '@/hooks/useTranslation';
import { replaceDevanagariNumerals } from '@/lib/utils';

const renderDescriptionWithLink = (event: TimelineEvent, t: (key: string, params?: any) => string, locale: 'en' | 'hi') => {
  // Use the stored key if it exists.
  if (event.descriptionKey) {
    const statusToKey = (status: string) => `status.${status.toLowerCase().replace(/ /g, '')}`;

    const detailsForTranslation = { ...event.details };
    if (event.details.newStatus) {
      detailsForTranslation.newStatus = t(statusToKey(event.details.newStatus));
    }
    if (event.details.oldStatus) {
      detailsForTranslation.oldStatus = t(statusToKey(event.details.oldStatus));
    }
    
    let descriptionText = t(event.descriptionKey, detailsForTranslation);
    descriptionText = locale === 'hi' ? replaceDevanagariNumerals(descriptionText) : descriptionText;

    if (event.type === 'ATTACHMENT_ADDED' && event.details?.url && event.details?.filename) {
      const filename = event.details.filename as string;
      const parts = descriptionText.split(filename);
      return (
        <p className="text-sm text-foreground">
          <span className="font-semibold">{event.author.name}</span>
          {parts.length > 1 ? (
            <>
              {parts[0]}
              <a href={event.details.url} target="_blank" rel="noopener noreferrer" className="font-medium text-primary hover:underline">
                {filename}
              </a>
              {parts[1]}
            </>
          ) : (
            ` ${descriptionText}` // fallback if split fails
          )}
        </p>
      );
    }
    return (
      <p className="text-sm text-foreground">
        <span className="font-semibold">{event.author.name}</span> {descriptionText}
      </p>
    );
  }

  // Fallback for old events that have the `description` field
  const legacyDescription = (event as any).description;
  if (legacyDescription) {
    return (
      <p className="text-sm text-foreground">
        <span className="font-semibold">{event.author.name}</span> {legacyDescription}
      </p>
    );
  }

  // Final fallback if nothing is found
  return (
    <p className="text-sm text-foreground">
      <span className="font-semibold">{event.author.name}</span> performed an event.
    </p>
  );
};


export function MainTaskTimelineEventCard({ event }: { event: AggregatedEvent }) {
  const { user } = useAuth();
  const { t, locale } = useTranslation();
  const dateLocale = locale === 'hi' ? hi : enUS;
  const isClient = user?.role === 'client';

  // Case 1: It's a group of sub-task events
  if (event.type === 'subTaskEventGroup') {
    const { subTaskInfo, events } = event.data as {
      subTaskInfo: { id: string; name: string };
      events: TimelineEvent[];
    };
    
    const eventsOnSubTaskText = events.length === 1
        ? t('timeline.eventsOnSubTask_one')
        : t('timeline.eventsOnSubTask_other', { count: events.length });

    const latestActivityFormatted = formatDistanceToNow(event.timestamp, { addSuffix: true, locale: dateLocale });
    const latestActivityText = t('timeline.latestActivity', { time: locale === 'hi' ? replaceDevanagariNumerals(latestActivityFormatted) : latestActivityFormatted });


    // For clients, render a simplified, non-interactive view
    if (isClient) {
      return (
        <div className="relative flex items-start gap-4">
          <div className="absolute left-0 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-background border-2 border-border -translate-x-1/2 z-10">
            <ListChecks className="h-5 w-5 text-secondary-foreground" />
          </div>
          <div className="flex-1 space-y-1 pl-8 py-3">
             <p className="font-semibold text-sm">
                {t('projectDetails.subTask')}: <span className="text-primary">{subTaskInfo.name}</span>
             </p>
             <p className="text-xs text-muted-foreground">
                {latestActivityText}
             </p>
          </div>
        </div>
      );
    }
    
    // For other roles, render the full accordion
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
                    {eventsOnSubTaskText}<span className="text-primary">{subTaskInfo.name}</span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {latestActivityText}
                  </p>
                </div>
              </AccordionTrigger>
              <AccordionContent className="pb-4 pt-2">
                  <div className="relative space-y-4 pl-8 pt-2">
                    {/* Dotted line for sub-events */}
                    <div className="absolute left-4 top-0 bottom-0 w-px border-l-2 border-dashed border-border" />
                    {events.map((subEvent) => {
                      const subEventDate = formatDistanceToNow(subEvent.timestamp, { addSuffix: true, locale: dateLocale });
                      return (
                          <div key={subEvent.id} className="relative">
                            {/* Dot for each sub-event */}
                            <div className="absolute -left-1.5 top-2 h-1.5 w-1.5 rounded-full bg-border" />
                            {renderDescriptionWithLink(subEvent, t, locale)}
                            <p className="text-xs text-muted-foreground">
                              {locale === 'hi' ? replaceDevanagariNumerals(subEventDate) : subEventDate}
                            </p>
                          </div>
                      )
                    })}
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
