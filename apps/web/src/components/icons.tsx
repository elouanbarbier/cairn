import type { TopicPriority, TopicStatus } from '@cairn/shared';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';

interface IconProps {
  className?: string;
  /** Announce the meaning to screen readers; otherwise the icon is decorative. */
  labelled?: boolean;
}

/** 14 px icon frame: announced as an image with a label, or hidden from assistive tech. */
function Icon14({ label, labelled, className, children }: IconProps & { label: string; children: ReactNode }) {
  return (
    <svg
      width={14}
      height={14}
      viewBox="0 0 14 14"
      className={cn('shrink-0', className)}
      role={labelled ? 'img' : undefined}
      aria-label={labelled ? label : undefined}
      aria-hidden={labelled ? undefined : true}
    >
      {children}
    </svg>
  );
}

/** Round status icon that fills up with progress. */
export function StatusIcon({ status, className, labelled }: IconProps & { status: TopicStatus }) {
  const { t } = useTranslation();
  const props = { className, labelled, label: t(`status.${status}`) };
  switch (status) {
    case 'backlog':
      return (
        <Icon14 {...props}>
          <circle
            cx="7"
            cy="7"
            r="5.75"
            className="fill-none stroke-status-backlog"
            strokeWidth="1.5"
            strokeDasharray="2.2 2.2"
          />
        </Icon14>
      );
    case 'todo':
      return (
        <Icon14 {...props}>
          <circle cx="7" cy="7" r="5.75" className="fill-none stroke-status-todo" strokeWidth="1.5" />
        </Icon14>
      );
    case 'in_progress':
      return (
        <Icon14 {...props}>
          <circle cx="7" cy="7" r="5.75" className="fill-none stroke-status-in-progress" strokeWidth="1.5" />
          <path d="M7 3.5A3.5 3.5 0 0 1 7 10.5Z" className="fill-status-in-progress" />
        </Icon14>
      );
    case 'waiting':
      return (
        <Icon14 {...props}>
          <circle cx="7" cy="7" r="5.75" className="fill-none stroke-status-waiting" strokeWidth="1.5" />
          <path
            d="M5.6 5v4M8.4 5v4"
            className="fill-none stroke-status-waiting"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </Icon14>
      );
    case 'done':
      return (
        <Icon14 {...props}>
          <circle cx="7" cy="7" r="6.5" className="fill-status-done" />
          <path
            d="M4.4 7.1 6.2 8.9 9.6 5.3"
            className="fill-none stroke-status-mark"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </Icon14>
      );
    case 'cancelled':
      return (
        <Icon14 {...props}>
          <circle cx="7" cy="7" r="6.5" className="fill-status-cancelled" />
          <path
            d="M4.9 4.9 9.1 9.1M9.1 4.9 4.9 9.1"
            className="fill-none stroke-status-mark"
            strokeWidth="1.4"
            strokeLinecap="round"
          />
        </Icon14>
      );
  }
}

const BAR_CLASSES: Record<Exclude<TopicPriority, 'urgent'>, [string, string, string]> = {
  none: ['fill-priority-none', 'fill-priority-none', 'fill-priority-none'],
  low: ['fill-priority-on', 'fill-priority-off', 'fill-priority-off'],
  medium: ['fill-priority-on', 'fill-priority-on', 'fill-priority-off'],
  high: ['fill-priority-on', 'fill-priority-on', 'fill-priority-on'],
};

/** Signal-style bars; Urgent is a red badge. */
export function PriorityIcon({ priority, className, labelled }: IconProps & { priority: TopicPriority }) {
  const { t } = useTranslation();
  const props = { className, labelled, label: t(`priorityLabel.${priority}`) };
  if (priority === 'urgent') {
    return (
      <Icon14 {...props}>
        <rect x="1" y="1" width="12" height="12" rx="3" className="fill-priority-urgent" />
        <path d="M7 4v3.8" className="fill-none stroke-priority-urgent-mark" strokeWidth="1.6" strokeLinecap="round" />
        <circle cx="7" cy="10.1" r="0.95" className="fill-priority-urgent-mark" />
      </Icon14>
    );
  }
  const [b1, b2, b3] = BAR_CLASSES[priority];
  return (
    <Icon14 {...props}>
      <rect x="1.5" y="8" width="2.6" height="4.5" rx="0.8" className={b1} />
      <rect x="5.7" y="5" width="2.6" height="7.5" rx="0.8" className={b2} />
      <rect x="9.9" y="2" width="2.6" height="10.5" rx="0.8" className={b3} />
    </Icon14>
  );
}

/** Three stacked stones. */
export function CairnLogo({ className }: { className?: string }) {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true" className={cn('shrink-0', className)}>
      <rect x="6" y="2" width="8" height="4.5" rx="2.25" className="fill-brand" />
      <rect x="4" y="8" width="12" height="4.5" rx="2.25" className="fill-brand" fillOpacity="0.7" />
      <rect x="2" y="14" width="16" height="4.5" rx="2.25" className="fill-brand" fillOpacity="0.45" />
    </svg>
  );
}
