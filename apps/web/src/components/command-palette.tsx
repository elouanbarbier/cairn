import { TOPIC_PRIORITIES, TOPIC_STATUSES, type TopicSummary } from '@cairn/shared';
import { useMatchRoute, useNavigate } from '@tanstack/react-router';
import {
  CheckIcon,
  CircleUserRoundIcon,
  KeyboardIcon,
  LayersIcon,
  LayoutDashboardIcon,
  ListFilterIcon,
  PlusIcon,
  SearchIcon,
  SunMoonIcon,
} from 'lucide-react';
import { Dialog as DialogPrimitive } from 'radix-ui';
import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ColorSquare } from '@/components/bits';
import { PriorityIcon, StatusIcon } from '@/components/icons';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Kbd } from '@/components/ui/kbd';
import { useProjects, useSearch, useTopic, useUpdateTopic } from '@/lib/queries';
import { useTheme } from '@/lib/theme';
import { useUi } from '@/lib/ui-state';
import { cn, isMac, normalize, splitMatch } from '@/lib/utils';
import type { ViewSearch } from '@/router';

function useDebounced<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

function Highlight({ text, query }: { text: string; query: string }) {
  const parts = splitMatch(text, query);
  if (!parts) return <>{text}</>;
  return (
    <>
      {parts[0]}
      <span className="font-semibold text-highlight">{parts[1]}</span>
      {parts[2]}
    </>
  );
}

interface PaletteAction {
  id: string;
  label: string;
  icon: ReactNode;
  shortcut?: string;
  run: () => void;
}

/** Cmd/Ctrl+K: navigate, search, create, change a status. */
export function CommandPalette() {
  const { t } = useTranslation();
  const ui = useUi();
  const navigate = useNavigate();
  const matchRoute = useMatchRoute();
  const { setting, setSetting } = useTheme();
  const projects = useProjects();
  const update = useUpdateTopic();
  const [query, setQuery] = useState('');
  const debounced = useDebounced(query.trim(), 90);
  const search = useSearch(debounced);
  const page = ui.palettePage;
  const ctx = ui.screenContext;

  useEffect(() => {
    if (!ui.paletteOpen) setQuery('');
  }, [ui.paletteOpen]);

  // Topics of the project in view come first.
  const topics: TopicSummary[] =
    query.trim() && search.data
      ? [...search.data.topics].sort(
          (a, b) => Number(b.projectId === ctx.projectId) - Number(a.projectId === ctx.projectId),
        )
      : [];
  const subprojects = query.trim() && search.data ? search.data.subprojects : [];
  const targetRef = ctx.topicRef ?? topics[0]?.ref;
  const onListView = Boolean(
    matchRoute({ to: '/p/$key' }) || matchRoute({ to: '/p/$key/s/$subprojectId' }) || matchRoute({ to: '/mes-sujets' }),
  );

  const close = () => ui.closePalette();
  const openTopic = (topic: Pick<TopicSummary, 'projectKey' | 'ref'>) => {
    close();
    void navigate({ to: '/p/$key/sujets/$ref', params: { key: topic.projectKey, ref: topic.ref } });
  };

  // Rebuilt on each render: a handful of items, always in sync with the context.
  const actions: PaletteAction[] = (() => {
    const list: PaletteAction[] = [];
    const where = ctx.subprojectName ?? ctx.projectName;
    list.push({
      id: 'new-topic',
      label: where ? t('palette.newTopicIn', { name: where }) : t('palette.newTopic'),
      icon: <PlusIcon className="size-3.5 text-ink-3" strokeWidth={2} aria-hidden />,
      shortcut: 'C',
      run: () => {
        close();
        ui.openCreate(ctx);
      },
    });
    if (targetRef) {
      list.push({
        id: 'status',
        label: t('palette.changeStatusOf', { ref: targetRef }),
        icon: <StatusIcon status="in_progress" />,
        shortcut: 'S',
        run: () => ui.setPalettePage({ kind: 'status', ref: targetRef }),
      });
      list.push({
        id: 'priority',
        label: t('palette.changePriorityOf', { ref: targetRef }),
        icon: <PriorityIcon priority="high" />,
        shortcut: 'P',
        run: () => ui.setPalettePage({ kind: 'priority', ref: targetRef }),
      });
    }
    if (onListView && query.trim()) {
      const q = query.trim();
      list.push({
        id: 'filter',
        label: t('palette.filterView', { q }),
        icon: <ListFilterIcon className="size-3.5 text-ink-3" strokeWidth={2} aria-hidden />,
        run: () => {
          close();
          void navigate({ to: '.', search: (prev: ViewSearch) => ({ ...prev, q }) });
        },
      });
    }
    if (!query.trim()) {
      list.push({
        id: 'theme',
        label: t('palette.toggleTheme'),
        icon: <SunMoonIcon className="size-3.5 text-ink-3" strokeWidth={2} aria-hidden />,
        run: () => {
          const dark = document.documentElement.classList.contains('dark');
          setSetting(setting === 'system' ? (dark ? 'light' : 'dark') : setting === 'dark' ? 'light' : 'dark');
        },
      });
      list.push({
        id: 'shortcuts',
        label: t('palette.showShortcuts'),
        icon: <KeyboardIcon className="size-3.5 text-ink-3" strokeWidth={2} aria-hidden />,
        shortcut: '?',
        run: () => {
          close();
          ui.setShortcutsOpen(true);
        },
      });
    }
    return list;
  })();

  const navigation = useMemo(() => {
    const q = normalize(query.trim());
    const items = [
      {
        id: 'go-overview',
        label: t('palette.goOverview'),
        icon: <LayoutDashboardIcon className="size-3.5 text-ink-3" strokeWidth={2} aria-hidden />,
        run: () => void navigate({ to: '/' }),
      },
      {
        id: 'go-mine',
        label: t('palette.goMyTopics'),
        icon: <CircleUserRoundIcon className="size-3.5 text-ink-3" strokeWidth={2} aria-hidden />,
        run: () => void navigate({ to: '/mes-sujets' }),
      },
      ...(projects.data ?? []).map((p) => ({
        id: `go-${p.key}`,
        label: t('palette.goProject', { name: p.name }),
        icon: <ColorSquare color={p.color} size={10} />,
        run: () => void navigate({ to: '/p/$key', params: { key: p.key } }),
      })),
    ];
    return q ? items.filter((i) => normalize(i.label).includes(q)) : items;
  }, [query, projects.data, t, navigate]);

  // New results: highlight the best match, like the first row of the design.
  const firstValue = topics[0] ? `topic-${topics[0].id}` : subprojects[0] ? `sub-${subprojects[0].id}` : actions[0]?.id;
  const [selected, setSelected] = useState('');
  useEffect(() => setSelected(firstValue ?? ''), [firstValue]);

  const resultCount = topics.length + subprojects.length + actions.length + (query.trim() ? navigation.length : 0);

  return (
    <DialogPrimitive.Root open={ui.paletteOpen} onOpenChange={(open) => (open ? ui.openPalette() : close())}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-overlay data-[state=open]:animate-overlay-in" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className="fixed top-[min(112px,12vh)] left-1/2 z-50 box-border w-[calc(100%-32px)] max-w-[640px] -translate-x-1/2 overflow-hidden rounded-xl border border-popover-border bg-popover text-popover-foreground shadow-float outline-none data-[state=open]:animate-dialog-in"
        >
          <DialogPrimitive.Title className="sr-only">{t('palette.label')}</DialogPrimitive.Title>
          {page.kind === 'root' ? (
            <Command shouldFilter={false} loop label={t('palette.label')} value={selected} onValueChange={setSelected}>
              {ctx.projectName ? (
                <div className="flex items-center gap-2 px-4 pt-2.5">
                  <span className="inline-flex h-[22px] items-center gap-1.5 rounded-md bg-muted px-2 text-ink-3 text-xs">
                    {projects.data?.find((p) => p.id === ctx.projectId) ? (
                      <ColorSquare color={projects.data.find((p) => p.id === ctx.projectId)?.color ?? ''} size={8} />
                    ) : null}
                    {ctx.subprojectName ? `${ctx.projectName} · ${ctx.subprojectName}` : ctx.projectName}
                  </span>
                </div>
              ) : null}
              <div
                className={cn(
                  'flex items-center gap-3 border-border border-b px-4 pb-3',
                  ctx.projectName ? 'pt-1.5' : 'pt-3',
                )}
              >
                <SearchIcon className="size-[18px] shrink-0 text-ink-4" strokeWidth={1.9} aria-hidden />
                <CommandInput value={query} onValueChange={setQuery} placeholder={t('palette.placeholder')} />
                <Kbd variant="outline" className="bg-transparent text-ink-3">
                  {t('palette.escape')}
                </Kbd>
              </div>
              <CommandList>
                {query.trim() && !search.isFetching ? (
                  <CommandEmpty>{t('palette.noResults', { q: query.trim() })}</CommandEmpty>
                ) : null}
                {topics.length > 0 ? (
                  <CommandGroup heading={t('palette.topics')}>
                    {topics.map((topic) => (
                      <CommandItem key={topic.id} value={`topic-${topic.id}`} onSelect={() => openTopic(topic)}>
                        <StatusIcon status={topic.status} labelled />
                        <span className="min-w-13 shrink-0 whitespace-nowrap font-mono text-caption text-ink-4 group-data-[selected=true]:text-ink-3">
                          {topic.ref}
                        </span>
                        <span
                          className={cn(
                            'min-w-0 flex-auto truncate',
                            (topic.status === 'done' || topic.status === 'cancelled') && 'text-ink-3',
                          )}
                        >
                          <Highlight text={topic.title} query={query} />
                        </span>
                        <span className="hidden shrink-0 items-center gap-1.5 text-ink-3 text-xs group-data-[selected=true]:inline-flex">
                          {t('palette.open')}
                          <Kbd>↵</Kbd>
                        </span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                ) : null}
                {subprojects.length > 0 ? (
                  <CommandGroup heading={t('palette.subprojects')}>
                    {subprojects.map((sub) => (
                      <CommandItem
                        key={sub.id}
                        value={`sub-${sub.id}`}
                        onSelect={() => {
                          close();
                          void navigate({
                            to: '/p/$key/s/$subprojectId',
                            params: { key: sub.projectKey, subprojectId: sub.id },
                          });
                        }}
                      >
                        <LayersIcon className="size-3.5 shrink-0 text-ink-3" strokeWidth={2} aria-hidden />
                        <span className="min-w-0 flex-auto truncate">
                          <Highlight text={sub.name} query={query} />
                          <span className="text-ink-4"> · {sub.projectName}</span>
                        </span>
                        <span className="shrink-0 text-ink-3 text-xs tabular-nums">
                          {sub.progress.done}/{sub.progress.total}
                        </span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                ) : null}
                <PaletteGroup heading={t('palette.actions')} items={actions} />
                <PaletteGroup heading={t('palette.navigation')} items={navigation} onBeforeRun={close} />
              </CommandList>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-border border-t bg-popover-footer px-4 py-2.5 text-ink-3 text-xs">
                <span className="inline-flex items-center gap-1.5">
                  <Kbd>↑↓</Kbd>
                  {t('palette.navigate')}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Kbd>↵</Kbd>
                  {t('palette.open')}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Kbd>{isMac ? '⌘↵' : 'Ctrl ↵'}</Kbd>
                  {t('palette.fullscreen')}
                </span>
                <span className="ml-auto text-ink-4">{t('palette.results', { count: resultCount })}</span>
              </div>
            </Command>
          ) : (
            <TopicFieldPage
              key={`${page.kind}-${page.ref}`}
              kind={page.kind}
              topicRef={page.ref}
              onBack={() => ui.setPalettePage({ kind: 'root' })}
              onPick={(patch) => {
                update.mutate({ ref: page.ref, patch });
                close();
              }}
            />
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function PaletteGroup({
  heading,
  items,
  onBeforeRun,
}: {
  heading: string;
  items: Array<{ id: string; label: string; icon: ReactNode; shortcut?: string; run: () => void }>;
  /** Navigation closes the palette first; actions decide for themselves. */
  onBeforeRun?: () => void;
}) {
  if (items.length === 0) return null;
  return (
    <CommandGroup heading={heading}>
      {items.map((item) => (
        <CommandItem
          key={item.id}
          value={item.id}
          onSelect={() => {
            onBeforeRun?.();
            item.run();
          }}
        >
          <span className="grid w-3.5 shrink-0 place-items-center">{item.icon}</span>
          <span className="flex-auto">{item.label}</span>
          {item.shortcut ? <Kbd>{item.shortcut}</Kbd> : null}
        </CommandItem>
      ))}
    </CommandGroup>
  );
}

/** Sub-page: pick a status or a priority for one topic. Backspace on empty input goes back. */
function TopicFieldPage({
  kind,
  topicRef,
  onBack,
  onPick,
}: {
  kind: 'status' | 'priority';
  topicRef: string;
  onBack: () => void;
  onPick: (patch: { status?: (typeof TOPIC_STATUSES)[number]; priority?: (typeof TOPIC_PRIORITIES)[number] }) => void;
}) {
  const { t } = useTranslation();
  const topic = useTopic(topicRef);
  const [query, setQuery] = useState('');
  const q = normalize(query.trim());
  const options =
    kind === 'status'
      ? TOPIC_STATUSES.map((status) => ({
          id: status,
          label: t(`status.${status}`),
          icon: <StatusIcon status={status} />,
          current: topic.data?.status === status,
          pick: () => onPick({ status }),
        }))
      : [...TOPIC_PRIORITIES].reverse().map((priority) => ({
          id: priority,
          label: t(`priority.${priority}`),
          icon: <PriorityIcon priority={priority} />,
          current: topic.data?.priority === priority,
          pick: () => onPick({ priority }),
        }));
  const visible = q ? options.filter((o) => normalize(o.label).includes(q)) : options;

  return (
    <Command
      shouldFilter={false}
      loop
      label={t(kind === 'status' ? 'palette.statusOf' : 'palette.priorityOf', { ref: topicRef })}
    >
      <div className="flex items-center gap-2 px-4 pt-2.5">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex h-[22px] items-center gap-1.5 rounded-md border-0 bg-muted px-2 text-ink-3 text-xs hover:text-ink"
        >
          {t(kind === 'status' ? 'palette.statusOf' : 'palette.priorityOf', { ref: topicRef })}
        </button>
        {topic.data ? <span className="truncate text-ink-4 text-xs">{topic.data.title}</span> : null}
      </div>
      <div className="flex items-center gap-3 border-border border-b px-4 pt-1.5 pb-3">
        <SearchIcon className="size-[18px] shrink-0 text-ink-4" strokeWidth={1.9} aria-hidden />
        <CommandInput
          value={query}
          onValueChange={setQuery}
          placeholder={t(kind === 'status' ? 'palette.statusOf' : 'palette.priorityOf', { ref: topicRef })}
          onKeyDown={(e) => {
            if (e.key === 'Backspace' && !query) {
              e.preventDefault();
              onBack();
            }
          }}
        />
        <Kbd variant="outline" className="bg-transparent text-ink-3">
          {t('palette.escape')}
        </Kbd>
      </div>
      <CommandList>
        <CommandGroup>
          {visible.map((option) => (
            <CommandItem key={option.id} value={option.id} onSelect={option.pick}>
              <span className="grid w-3.5 shrink-0 place-items-center">{option.icon}</span>
              <span className="flex-auto">{option.label}</span>
              {option.current ? <CheckIcon className="size-3.5 text-ink-3" aria-hidden /> : null}
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </Command>
  );
}
