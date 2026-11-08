import type { TopicDetail } from '@cairn/shared';
import { Link, useCanGoBack, useNavigate, useRouter } from '@tanstack/react-router';
import { EllipsisIcon, LinkIcon, PencilIcon, PlusIcon } from 'lucide-react';
import { type KeyboardEvent, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { ActivityItem } from '@/components/activity-item';
import { Avatar, ColorSquare, EmptyState, LoadError, ProgressBar } from '@/components/bits';
import { Breadcrumb, PageHeader } from '@/components/layout/page-header';
import { Markdown } from '@/components/markdown';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Textarea } from '@/components/ui/input';
import { Kbd } from '@/components/ui/kbd';
import { ApiRequestError } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { useHotkeys } from '@/lib/hotkeys';
import {
  useAddChecklistItem,
  useAddNote,
  useLabels,
  useMe,
  useProjects,
  useTopic,
  useUpdateChecklistItem,
  useUpdateTopic,
  useUsers,
} from '@/lib/queries';
import { useUi } from '@/lib/ui-state';
import { cn, isMac } from '@/lib/utils';
import { topicRoute } from '@/router';
import { type OpenMenu, TopicProperties } from './topic-properties';

export function TopicPage() {
  const { t } = useTranslation();
  const { ref } = topicRoute.useParams();
  const topicRef = ref.toUpperCase();
  const topic = useTopic(topicRef);

  if (topic.isError) {
    return topic.error instanceof ApiRequestError && topic.error.status === 404 ? (
      <EmptyState
        action={
          <Link to="/" className="font-medium text-brand">
            {t('topic.backToOverview')}
          </Link>
        }
      >
        {t('topic.notFound')}
      </EmptyState>
    ) : (
      <LoadError onRetry={() => void topic.refetch()} />
    );
  }
  if (!topic.data) return null;
  return <TopicView topic={topic.data} />;
}

function TopicView({ topic }: { topic: TopicDetail }) {
  const { t } = useTranslation();
  const ui = useUi();
  const router = useRouter();
  const navigate = useNavigate();
  const canGoBack = useCanGoBack();
  const projects = useProjects();
  const users = useUsers();
  const labels = useLabels();
  const update = useUpdateTopic();
  const [openMenu, setOpenMenu] = useState<OpenMenu>(null);
  const project = projects.data?.find((p) => p.id === topic.projectId);

  useEffect(() => {
    ui.setScreenContext({
      projectId: topic.projectId,
      projectName: topic.projectName,
      subprojectId: topic.subprojectId,
      subprojectName: topic.subprojectName ?? undefined,
      topicRef: topic.ref,
    });
  }, [topic.projectId, topic.projectName, topic.subprojectId, topic.subprojectName, topic.ref, ui.setScreenContext]);

  const close = () => {
    if (canGoBack) router.history.back();
    else if (topic.subprojectId)
      void navigate({
        to: '/p/$key/s/$subprojectId',
        params: { key: topic.projectKey, subprojectId: topic.subprojectId },
      });
    else void navigate({ to: '/p/$key', params: { key: topic.projectKey } });
  };

  const change = (patch: Parameters<typeof update.mutate>[0]['patch']) => update.mutate({ ref: topic.ref, patch });

  useHotkeys({
    s: () => setOpenMenu('status'),
    p: () => setOpenMenu('priority'),
    d: () => setOpenMenu('due'),
    m: () => setOpenMenu('subproject'),
    l: () => setOpenMenu('labels'),
    escape: (event) => {
      const target = event.target as HTMLElement;
      if (
        openMenu ||
        ui.paletteOpen ||
        target.closest('[role="menu"],[role="dialog"],[data-radix-popper-content-wrapper]')
      ) {
        return false;
      }
      close();
    },
  });

  const copyLink = () =>
    void navigator.clipboard?.writeText(window.location.href).then(() => toast.success(t('topic.linkCopied')));

  return (
    <>
      <PageHeader
        actions={
          <>
            <Button variant="outline" size="icon" aria-label={t('topic.copyLink')} onClick={copyLink}>
              <LinkIcon className="size-[15px]" strokeWidth={1.9} />
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" aria-label={t('topic.moreActions')}>
                  <EllipsisIcon className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => ui.openPalette({ kind: 'status', ref: topic.ref })}>
                  {t('palette.changeStatusOf', { ref: topic.ref })}
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => ui.openPalette({ kind: 'priority', ref: topic.ref })}>
                  {t('palette.changePriorityOf', { ref: topic.ref })}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button variant="outline" onClick={close} className="pr-2 text-ink-2">
              {t('topic.close')}
              <Kbd className="bg-muted text-ink-3">{t('palette.escape')}</Kbd>
            </Button>
          </>
        }
      >
        <Breadcrumb
          items={[
            {
              label: (
                <>
                  <ColorSquare color={topic.projectColor} />
                  {topic.projectName}
                </>
              ),
              link: { to: '/p/$key', params: { key: topic.projectKey } },
            },
            ...(topic.subprojectId && topic.subprojectName
              ? [
                  {
                    label: topic.subprojectName,
                    link: {
                      to: '/p/$key/s/$subprojectId' as const,
                      params: { key: topic.projectKey, subprojectId: topic.subprojectId },
                    },
                  },
                ]
              : []),
            { label: <span className="font-mono text-xs">{topic.ref}</span> },
          ]}
        />
      </PageHeader>

      <div className="flex flex-auto flex-wrap items-stretch">
        <article className="box-border flex min-w-0 flex-[999_1_520px] flex-col gap-7 px-4 pt-8 pb-14 sm:px-12">
          <div className="flex max-w-[760px] flex-col gap-3">
            <TitleEditor key={topic.id} value={topic.title} onSave={(title) => change({ title })} />
            <DescriptionEditor value={topic.description} onSave={(description) => change({ description })} />
          </div>
          <Checklist topic={topic} />
          <Journal topic={topic} />
          <section aria-labelledby="topic-activity" className="flex max-w-[760px] flex-col gap-2.5">
            <h2 id="topic-activity" className="m-0 font-semibold text-sm">
              {t('topic.activity')}
            </h2>
            <ol className="m-0 flex list-none flex-col gap-2.5 p-0 text-ink-3 text-small">
              {topic.activity.map((entry) => (
                <ActivityItem key={entry.id} entry={entry} />
              ))}
            </ol>
          </section>
        </article>

        <TopicProperties
          topic={topic}
          project={project}
          users={users.data ?? []}
          labels={labels.data ?? []}
          open={openMenu}
          setOpen={setOpenMenu}
          onChange={change}
        />
      </div>
    </>
  );
}

/** Title edited in place: Enter or blur saves, Escape reverts. */
function TitleEditor({ value, onSave }: { value: string; onSave: (value: string) => void }) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);

  const commit = () => {
    const next = draft.replace(/\s+/g, ' ').trim();
    if (next && next !== value) onSave(next);
    else setDraft(value);
  };

  return (
    <h1 className="m-0">
      <textarea
        aria-label={t('topic.editTitle')}
        value={draft}
        rows={1}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            e.currentTarget.blur();
          }
          if (e.key === 'Escape') {
            setDraft(value);
            requestAnimationFrame(() => (e.target as HTMLTextAreaElement).blur());
          }
        }}
        className="-mx-1.5 block w-[calc(100%+12px)] resize-none rounded-md border-0 bg-transparent px-1.5 py-0.5 font-semibold text-3xl text-ink tracking-[-0.02em] outline-none [field-sizing:content] hover:bg-subtle focus-visible:bg-subtle focus-visible:outline-none"
      />
    </h1>
  );
}

function DescriptionEditor({ value, onSave }: { value: string; onSave: (value: string) => void }) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  const save = () => {
    if (draft !== value) onSave(draft);
    setEditing(false);
  };

  if (editing) {
    return (
      <div className="flex flex-col gap-2">
        <Textarea
          aria-label={t('topic.editDescription')}
          value={draft}
          rows={Math.max(5, draft.split('\n').length + 1)}
          autoFocus
          placeholder={t('topic.descriptionPlaceholder')}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) save();
            if (e.key === 'Escape') {
              e.stopPropagation();
              setDraft(value);
              setEditing(false);
            }
          }}
          className="font-sans text-base leading-[1.6]"
        />
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setEditing(false)}>
            {t('topic.cancel')}
          </Button>
          <Button onClick={save} className="pr-2">
            {t('topic.save')}
            <Kbd variant="inverse">{isMac ? '⌘↵' : 'Ctrl ↵'}</Kbd>
          </Button>
        </div>
      </div>
    );
  }

  const start = () => {
    setDraft(value);
    setEditing(true);
  };

  return value ? (
    <div className="group relative -mx-2 rounded-md px-2 py-1 hover:bg-subtle">
      <Markdown source={value} className="flex flex-col gap-2.5 text-base text-ink-body" />
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={start}
        aria-label={t('topic.editDescription')}
        className="absolute top-1 right-1 opacity-0 focus-visible:opacity-100 group-hover:opacity-100"
      >
        <PencilIcon className="size-3.5" />
      </Button>
    </div>
  ) : (
    <button
      type="button"
      onClick={start}
      className="self-start border-0 bg-transparent p-0 text-base text-ink-4 hover:text-ink-3"
    >
      {t('topic.descriptionPlaceholder')}
    </button>
  );
}

function Checklist({ topic }: { topic: TopicDetail }) {
  const { t } = useTranslation();
  const toggle = useUpdateChecklistItem(topic.ref);
  const add = useAddChecklistItem(topic.ref);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');
  const items = topic.checklistItems;

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && draft.trim()) {
      add.mutate(draft.trim());
      setDraft('');
    }
    if (e.key === 'Escape') {
      e.stopPropagation();
      setAdding(false);
      setDraft('');
    }
  };

  return (
    <section aria-labelledby="topic-checklist" className="flex max-w-[760px] flex-col gap-2.5">
      <div className="flex items-center gap-2.5">
        <h2 id="topic-checklist" className="m-0 font-semibold text-sm">
          {t('topic.checklist')}
        </h2>
        {items.length > 0 ? (
          <>
            <span className="text-ink-4 text-xs tabular-nums">
              {topic.checklist.done}/{topic.checklist.total}
            </span>
            <ProgressBar progress={topic.checklist} height={4} tone="success" className="w-30" />
          </>
        ) : null}
      </div>
      {items.length > 0 || adding ? (
        <div className="flex flex-col overflow-hidden rounded-lg border border-border">
          {items.map((item, index) => (
            <div
              key={item.id}
              className={cn('flex min-h-9.5 items-center gap-2.5 px-3', index > 0 && 'border-line border-t')}
            >
              <input
                type="checkbox"
                id={`ck-${item.id}`}
                checked={item.done}
                onChange={() => toggle.mutate({ id: item.id, patch: { done: !item.done } })}
                className="m-0 size-4 shrink-0 cursor-pointer accent-[var(--status-done)]"
              />
              <label
                htmlFor={`ck-${item.id}`}
                className={cn('flex-auto cursor-pointer', item.done ? 'text-ink-4 line-through' : 'text-ink')}
              >
                {item.text}
              </label>
            </div>
          ))}
          {adding ? (
            <div className={cn('flex min-h-9.5 items-center gap-2.5 px-3', items.length > 0 && 'border-line border-t')}>
              <input type="checkbox" disabled aria-hidden tabIndex={-1} className="m-0 size-4 shrink-0" />
              <input
                aria-label={t('topic.newItemLabel')}
                placeholder={t('topic.newItemPlaceholder')}
                value={draft}
                // biome-ignore lint/a11y/noAutofocus: the field appears on an explicit "add" action
                autoFocus
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={onKeyDown}
                onBlur={() => {
                  if (!draft.trim()) setAdding(false);
                }}
                className="h-9 flex-auto border-0 bg-transparent text-ink text-sm outline-none placeholder:text-ink-4"
              />
            </div>
          ) : null}
        </div>
      ) : null}
      <Button variant="ghost" size="sm" className="self-start" onClick={() => setAdding(true)}>
        <PlusIcon className="size-[13px]" strokeWidth={2} />
        {t('topic.addItem')}
      </Button>
    </section>
  );
}

function Journal({ topic }: { topic: TopicDetail }) {
  const { t } = useTranslation();
  const me = useMe();
  const addNote = useAddNote(topic.ref);
  const [draft, setDraft] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const publish = () => {
    if (!draft.trim()) return;
    addNote.mutate(draft.trim());
    setDraft('');
  };

  return (
    <section aria-labelledby="topic-journal" className="flex max-w-[760px] flex-col gap-3">
      <h2 id="topic-journal" className="m-0 font-semibold text-sm">
        {t('topic.journal')}
      </h2>
      {[...topic.notes].reverse().map((note) => (
        <div key={note.id} className="flex gap-3">
          {note.author ? <Avatar user={note.author} size={26} /> : <span className="size-[26px] shrink-0" />}
          <div className="flex flex-auto flex-col gap-1 rounded-lg border border-border px-3.5 py-2.5">
            <div className="flex items-baseline gap-2">
              <span className="font-semibold">{note.author?.name.split(' ')[0]}</span>
              <span className="text-ink-4 text-xs">{formatDateTime(note.createdAt)}</span>
            </div>
            <Markdown source={note.body} className="flex flex-col gap-2 text-ink-body" />
          </div>
        </div>
      ))}
      <div className="flex gap-3">
        {me.data ? <Avatar user={me.data.user} size={26} /> : <span className="size-[26px] shrink-0" />}
        <div className="flex flex-auto flex-col gap-2">
          <label htmlFor="topic-note" className="sr-only">
            {t('topic.addNote')}
          </label>
          <Textarea
            ref={textareaRef}
            id="topic-note"
            rows={3}
            value={draft}
            placeholder={t('topic.notePlaceholder')}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                publish();
              }
            }}
          />
          <div className="flex justify-end">
            <Button onClick={publish} disabled={!draft.trim()} className="pr-2">
              {t('topic.publish')}
              <Kbd variant="inverse">{isMac ? '⌘↵' : 'Ctrl ↵'}</Kbd>
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
