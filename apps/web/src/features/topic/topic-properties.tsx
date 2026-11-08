import {
  diffDays,
  isClosed,
  type Label,
  type ProjectSummary,
  TOPIC_PRIORITIES,
  TOPIC_STATUSES,
  type TopicDetail,
  type UpdateTopicInput,
  type User,
} from '@cairn/shared';
import { Link } from '@tanstack/react-router';
import { CalendarIcon, PlusIcon, UserRoundIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Avatar, ColorSquare, LabelChip } from '@/components/bits';
import { DatePopover } from '@/components/editors';
import { PriorityIcon, StatusIcon } from '@/components/icons';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Kbd } from '@/components/ui/kbd';
import { formatDateTime, formatFullDate, formatRelativeDay, formatWeekdayDate, todayISO } from '@/lib/format';
import { cn } from '@/lib/utils';

export type OpenMenu = 'status' | 'priority' | 'due' | 'assignee' | 'subproject' | 'labels' | null;

const valueButton =
  'inline-flex h-7.5 min-w-0 items-center gap-2 rounded-md border-0 bg-transparent px-2 font-medium text-ink text-sm transition-colors duration-150 hover:bg-accent data-[state=open]:bg-accent';

function Row({
  label,
  children,
  align = 'center',
}: {
  label: string;
  children: ReactNode;
  align?: 'center' | 'start';
}) {
  return (
    <div className={cn('flex min-h-8.5', align === 'center' ? 'items-center' : 'items-start pt-1')}>
      <span className={cn('w-24 shrink-0 text-ink-4', align === 'start' && 'leading-[26px]')}>{label}</span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

export function TopicProperties({
  topic,
  project,
  users,
  labels,
  open,
  setOpen,
  onChange,
}: {
  topic: TopicDetail;
  project: ProjectSummary | undefined;
  users: User[];
  labels: Label[];
  open: OpenMenu;
  setOpen: (menu: OpenMenu) => void;
  onChange: (patch: UpdateTopicInput) => void;
}) {
  const { t } = useTranslation();
  const today = todayISO();
  const menuProps = (menu: Exclude<OpenMenu, null>) => ({
    open: open === menu,
    onOpenChange: (value: boolean) => setOpen(value ? menu : null),
  });
  const late = topic.dueDate !== null && !isClosed(topic.status) && diffDays(today, topic.dueDate) < 0;

  return (
    <aside
      aria-label={t('topic.properties')}
      className="box-border flex flex-[1_1_320px] flex-col gap-5 border-border border-t bg-aside px-5 py-6 lg:border-t-0 lg:border-l"
    >
      <div className="flex flex-col gap-0.5">
        <Row label={t('topic.props.status')}>
          <DropdownMenu {...menuProps('status')}>
            <DropdownMenuTrigger className={valueButton}>
              <StatusIcon status={topic.status} />
              {t(`status.${topic.status}`)}
              <Kbd variant="hint">S</Kbd>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              {TOPIC_STATUSES.map((status) => (
                <DropdownMenuItem key={status} onSelect={() => onChange({ status })}>
                  <StatusIcon status={status} />
                  {t(`status.${status}`)}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </Row>

        <Row label={t('topic.props.priority')}>
          <DropdownMenu {...menuProps('priority')}>
            <DropdownMenuTrigger className={valueButton}>
              <PriorityIcon priority={topic.priority} />
              {t(`priority.${topic.priority}`)}
              <Kbd variant="hint">P</Kbd>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              {[...TOPIC_PRIORITIES].reverse().map((priority) => (
                <DropdownMenuItem key={priority} onSelect={() => onChange({ priority })}>
                  <PriorityIcon priority={priority} />
                  {t(`priority.${priority}`)}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </Row>

        <Row label={t('topic.props.due')}>
          <DatePopover
            value={topic.dueDate}
            open={open === 'due'}
            onOpenChange={(value) => setOpen(value ? 'due' : null)}
            onCommit={(dueDate) => onChange({ dueDate })}
            label={t('topic.props.due')}
            clearLabel={t('topic.clearDue')}
            triggerClassName={valueButton}
          >
            <CalendarIcon className={cn('size-3.5', late ? 'text-danger' : 'text-ink-3')} strokeWidth={2} aria-hidden />
            {topic.dueDate ? (
              <>
                <span className={cn('whitespace-nowrap', late && 'text-danger')}>
                  {formatWeekdayDate(topic.dueDate)}
                </span>
                <span className={cn('truncate font-normal text-xs', late ? 'text-danger' : 'text-ink-4')}>
                  {formatRelativeDay(topic.dueDate, today)}
                </span>
              </>
            ) : (
              <span className="font-normal text-ink-4">{t('topic.noDue')}</span>
            )}
          </DatePopover>
        </Row>

        <Row label={t('topic.props.assignee')}>
          <DropdownMenu {...menuProps('assignee')}>
            <DropdownMenuTrigger className={valueButton}>
              {topic.assignee ? (
                <>
                  <Avatar user={topic.assignee} size={18} />
                  <span className="truncate">{topic.assignee.name.split(' ')[0]}</span>
                </>
              ) : (
                <>
                  <UserRoundIcon className="size-3.5 text-ink-4" aria-hidden />
                  <span className="font-normal text-ink-4">{t('topic.unassigned')}</span>
                </>
              )}
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              {users.map((user) => (
                <DropdownMenuItem key={user.id} onSelect={() => onChange({ assigneeId: user.id })}>
                  <Avatar user={user} size={18} />
                  {user.name}
                </DropdownMenuItem>
              ))}
              <DropdownMenuItem onSelect={() => onChange({ assigneeId: null })}>
                <UserRoundIcon className="size-3.5 text-ink-4" aria-hidden />
                {t('topic.unassigned')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </Row>
      </div>

      <div className="h-px bg-border" />

      <div className="flex flex-col gap-0.5">
        <Row label={t('topic.props.project')}>
          <Link to="/p/$key" params={{ key: topic.projectKey }} className={cn(valueButton, 'no-underline')}>
            <ColorSquare color={topic.projectColor} />
            <span className="truncate">{topic.projectName}</span>
          </Link>
        </Row>

        <Row label={t('topic.props.subproject')}>
          <DropdownMenu {...menuProps('subproject')}>
            <DropdownMenuTrigger className={valueButton}>
              <span className={cn('truncate', !topic.subprojectName && 'font-normal text-ink-4')}>
                {topic.subprojectName ?? t('topic.noSubproject')}
              </span>
              <Kbd variant="hint">M</Kbd>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              {project?.subprojects.map((sub) => (
                <DropdownMenuItem key={sub.id} onSelect={() => onChange({ subprojectId: sub.id })}>
                  {sub.name}
                </DropdownMenuItem>
              ))}
              <DropdownMenuItem onSelect={() => onChange({ subprojectId: null })}>
                <span className="text-ink-4">{t('topic.noSubproject')}</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </Row>

        <Row label={t('topic.props.labels')} align="start">
          <span className="flex flex-wrap gap-1.5 px-2 py-[3px]">
            {topic.labels.map((label) => (
              <LabelChip key={label.id} label={label} size="md" />
            ))}
            <DropdownMenu {...menuProps('labels')}>
              <DropdownMenuTrigger
                aria-label={t('topic.addLabel')}
                className="grid size-[22px] place-items-center rounded-full border border-input border-dashed bg-transparent p-0 text-ink-3 hover:bg-accent"
              >
                <PlusIcon className="size-[11px]" strokeWidth={2.4} aria-hidden />
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                {labels.map((label) => {
                  const checked = topic.labels.some((l) => l.id === label.id);
                  return (
                    <DropdownMenuCheckboxItem
                      key={label.id}
                      checked={checked}
                      onSelect={(e) => e.preventDefault()}
                      onCheckedChange={() =>
                        onChange({
                          labelIds: checked
                            ? topic.labels.filter((l) => l.id !== label.id).map((l) => l.id)
                            : [...topic.labels.map((l) => l.id), label.id],
                        })
                      }
                    >
                      <span aria-hidden className="size-2 rounded-full" style={{ background: label.color }} />
                      {label.name}
                    </DropdownMenuCheckboxItem>
                  );
                })}
              </DropdownMenuContent>
            </DropdownMenu>
          </span>
        </Row>
      </div>

      <div className="h-px bg-border" />

      <dl className="m-0 flex flex-col gap-2 text-small">
        <div className="flex">
          <dt className="w-28 shrink-0 text-ink-4">{t('topic.props.createdAt')}</dt>
          <dd className="m-0 text-ink-2">{formatFullDate(topic.createdAt)}</dd>
        </div>
        <div className="flex">
          <dt className="w-28 shrink-0 text-ink-4">{t('topic.props.lastActivity')}</dt>
          <dd className="m-0 text-ink-2">{formatDateTime(topic.lastActivityAt)}</dd>
        </div>
        <div className="flex">
          <dt className="w-28 shrink-0 text-ink-4">{t('topic.props.identifier')}</dt>
          <dd className="m-0 font-mono text-caption text-ink-2 leading-[19px]">{topic.ref}</dd>
        </div>
      </dl>
    </aside>
  );
}
