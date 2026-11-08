import type { Activity, ProjectStatus, TopicPriority, TopicStatus } from '@cairn/shared';
import {
  ArchiveIcon,
  ArchiveRestoreIcon,
  CalendarIcon,
  CheckSquareIcon,
  CircleDotIcon,
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
import { formatDateTime, formatShortDate } from '@/lib/format';

const iconClass = 'size-3.5 shrink-0 text-ink-4';

type Payload = Record<string, string | boolean | null | undefined>;
type T = ReturnType<typeof useTranslation>['t'];

function topicLine(t: T, action: Activity['action'], p: Payload): { icon?: ReactNode; text: string } {
  switch (action) {
    case 'created':
      return {
        icon: <PlusIcon className={iconClass} strokeWidth={2} aria-hidden />,
        text: t('topic.activityLog.created'),
      };
    case 'status_changed':
      return {
        icon: <StatusIcon status={p.to as TopicStatus} />,
        text: t('topic.activityLog.status_changed', {
          from: t(`status.${p.from as TopicStatus}`),
          to: t(`status.${p.to as TopicStatus}`),
        }),
      };
    case 'priority_changed':
      return {
        icon: <PriorityIcon priority={p.to as TopicPriority} />,
        text: t('topic.activityLog.priority_changed', {
          from: t(`priority.${p.from as TopicPriority}`),
          to: t(`priority.${p.to as TopicPriority}`),
        }),
      };
    case 'due_date_changed':
      return {
        icon: <CalendarIcon className={iconClass} strokeWidth={2} aria-hidden />,
        text: p.to
          ? t('topic.activityLog.due_date_set', { to: formatShortDate(String(p.to)) })
          : t('topic.activityLog.due_date_cleared'),
      };
    case 'assignee_changed':
      return {
        icon: <UserRoundIcon className={iconClass} strokeWidth={2} aria-hidden />,
        text: t('topic.activityLog.assignee_changed'),
      };
    case 'subproject_changed':
      return {
        icon: <FolderInputIcon className={iconClass} strokeWidth={2} aria-hidden />,
        text: t('topic.activityLog.subproject_changed', { to: p.to ?? t('topic.noSubproject') }),
      };
    case 'labels_changed':
      return {
        icon: <TagIcon className={iconClass} strokeWidth={2} aria-hidden />,
        text: t('topic.activityLog.labels_changed'),
      };
    case 'title_changed':
      return { text: t('topic.activityLog.title_changed') };
    case 'description_changed':
      return { text: t('topic.activityLog.description_changed') };
    case 'checklist_item_added':
      return {
        icon: <CheckSquareIcon className={iconClass} strokeWidth={2} aria-hidden />,
        text: t('topic.activityLog.checklist_item_added', { text: p.text }),
      };
    case 'checklist_item_toggled':
      return {
        icon: <CheckSquareIcon className={iconClass} strokeWidth={2} aria-hidden />,
        text: t(p.done ? 'topic.activityLog.checklist_item_checked' : 'topic.activityLog.checklist_item_unchecked', {
          text: p.text,
        }),
      };
    case 'note_added':
      return {
        icon: <MessageSquareTextIcon className={iconClass} strokeWidth={2} aria-hidden />,
        text: t('topic.activityLog.note_added'),
      };
    default:
      return { text: '' };
  }
}

/** Project and subproject lines share their wording, with the subproject's name when it applies. */
function containerLine(
  t: T,
  kind: 'project' | 'subproject',
  action: Activity['action'],
  p: Payload,
  name: string,
): { icon?: ReactNode; text: string } {
  const base = `history.${kind}` as const;
  switch (action) {
    case 'created':
      return {
        icon: <PlusIcon className={iconClass} strokeWidth={2} aria-hidden />,
        text: t(`${base}.created`, { name }),
      };
    case 'renamed':
      return { text: t(`${base}.renamed`, { from: p.from, to: p.to, name }) };
    case 'status_changed':
      return {
        icon: <CircleDotIcon className={iconClass} strokeWidth={2} aria-hidden />,
        text: t(`${base}.status_changed`, {
          name,
          from: t(`projectStatus.${p.from as ProjectStatus}`),
          to: t(`projectStatus.${p.to as ProjectStatus}`),
        }),
      };
    case 'target_date_changed':
      return {
        icon: <CalendarIcon className={iconClass} strokeWidth={2} aria-hidden />,
        text: p.to
          ? t(`${base}.target_set`, { name, to: formatShortDate(String(p.to)) })
          : t(`${base}.target_cleared`, { name }),
      };
    case 'description_changed':
      return { text: t(`${base}.description_changed`, { name }) };
    case 'archived':
      return {
        icon: <ArchiveIcon className={iconClass} strokeWidth={2} aria-hidden />,
        text: t(`${base}.archived`, { name }),
      };
    case 'restored':
      return {
        icon: <ArchiveRestoreIcon className={iconClass} strokeWidth={2} aria-hidden />,
        text: t(`${base}.restored`, { name }),
      };
    default:
      return { text: '' };
  }
}

/** One line of history: icon, actor, what happened, when. */
export function ActivityItem({
  entry,
  suffix,
  withTime = false,
}: {
  entry: Activity & { subprojectName?: string | null };
  suffix?: ReactNode;
  /** Show the time of day (recent activity), not only the date. */
  withTime?: boolean;
}) {
  const { t } = useTranslation();
  const p = entry.payload as Payload;
  const line =
    entry.entityType === 'topic'
      ? topicLine(t, entry.action, p)
      : containerLine(t, entry.entityType, entry.action, p, entry.subprojectName ?? '');
  if (!line.text) return null;

  return (
    <li className="flex items-center gap-2.5">
      {line.icon ?? <PencilIcon className={iconClass} strokeWidth={2} aria-hidden />}
      <span className="min-w-0">
        {entry.actor ? <span className="font-medium text-ink">{entry.actor.name.split(' ')[0]} </span> : null}
        {line.text}
        {suffix}
      </span>
      <span className="ml-auto shrink-0 whitespace-nowrap text-ink-4">
        {withTime ? formatDateTime(entry.createdAt) : formatShortDate(entry.createdAt)}
      </span>
    </li>
  );
}
