import type { Activity, TopicPriority, TopicStatus } from '@cairn/shared';
import {
  CalendarIcon,
  CheckSquareIcon,
  FolderInputIcon,
  MessageSquareTextIcon,
  PencilIcon,
  PlusIcon,
  TagIcon,
  UserRoundIcon,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { PriorityIcon, StatusIcon } from '@/components/icons';
import { formatShortDate } from '@/lib/format';

const iconClass = 'size-3.5 shrink-0 text-ink-4';

/** One line of history: icon, actor, what happened, when. */
export function ActivityItem({ entry, suffix }: { entry: Activity; suffix?: ReactNode }) {
  const { t } = useTranslation();
  const p = entry.payload as Record<string, string | boolean | null | undefined>;
  let icon: ReactNode = <PencilIcon className={iconClass} strokeWidth={2} aria-hidden />;
  let text: string;

  switch (entry.action) {
    case 'created':
      icon = <PlusIcon className={iconClass} strokeWidth={2} aria-hidden />;
      text = t('topic.activityLog.created');
      break;
    case 'status_changed':
      icon = <StatusIcon status={p.to as TopicStatus} />;
      text = t('topic.activityLog.status_changed', {
        from: t(`status.${p.from as TopicStatus}`),
        to: t(`status.${p.to as TopicStatus}`),
      });
      break;
    case 'priority_changed':
      icon = <PriorityIcon priority={p.to as TopicPriority} />;
      text = t('topic.activityLog.priority_changed', {
        from: t(`priority.${p.from as TopicPriority}`),
        to: t(`priority.${p.to as TopicPriority}`),
      });
      break;
    case 'due_date_changed':
      icon = <CalendarIcon className={iconClass} strokeWidth={2} aria-hidden />;
      text = p.to
        ? t('topic.activityLog.due_date_set', { to: formatShortDate(String(p.to)) })
        : t('topic.activityLog.due_date_cleared');
      break;
    case 'assignee_changed':
      icon = <UserRoundIcon className={iconClass} strokeWidth={2} aria-hidden />;
      text = t('topic.activityLog.assignee_changed');
      break;
    case 'subproject_changed':
      icon = <FolderInputIcon className={iconClass} strokeWidth={2} aria-hidden />;
      text = t('topic.activityLog.subproject_changed', { to: p.to ?? t('topic.noSubproject') });
      break;
    case 'labels_changed':
      icon = <TagIcon className={iconClass} strokeWidth={2} aria-hidden />;
      text = t('topic.activityLog.labels_changed');
      break;
    case 'title_changed':
      text = t('topic.activityLog.title_changed');
      break;
    case 'description_changed':
      text = t('topic.activityLog.description_changed');
      break;
    case 'checklist_item_added':
      icon = <CheckSquareIcon className={iconClass} strokeWidth={2} aria-hidden />;
      text = t('topic.activityLog.checklist_item_added', { text: p.text });
      break;
    case 'checklist_item_toggled':
      icon = <CheckSquareIcon className={iconClass} strokeWidth={2} aria-hidden />;
      text = t(p.done ? 'topic.activityLog.checklist_item_checked' : 'topic.activityLog.checklist_item_unchecked', {
        text: p.text,
      });
      break;
    case 'note_added':
      icon = <MessageSquareTextIcon className={iconClass} strokeWidth={2} aria-hidden />;
      text = t('topic.activityLog.note_added');
      break;
  }

  return (
    <li className="flex items-center gap-2.5">
      {icon}
      <span className="min-w-0">
        {entry.actor ? <span className="font-medium text-ink">{entry.actor.name.split(' ')[0]} </span> : null}
        {text}
        {suffix}
      </span>
      <span className="ml-auto shrink-0 text-ink-4">{formatShortDate(entry.createdAt)}</span>
    </li>
  );
}
