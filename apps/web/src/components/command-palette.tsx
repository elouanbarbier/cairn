import {
  addDays,
  type BulkTopicPatch,
  type SearchHit,
  type SearchSegment,
  TOPIC_PRIORITIES,
  TOPIC_STATUSES,
  type TopicDetail,
  type TopicSummary,
} from '@cairn/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useMatchRoute, useNavigate } from '@tanstack/react-router';
import {
  CalendarIcon,
  CheckIcon,
  CircleUserRoundIcon,
  FolderInputIcon,
  FolderPlusIcon,
  KeyboardIcon,
  LayersIcon,
  LayoutDashboardIcon,
  ListFilterIcon,
  MinusIcon,
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
import { formatWeekdayDate, todayISO } from '@/lib/format';
import { queryKeys, useBulkUpdateTopics, useLabels, useProjects, useSearch, useTopic } from '@/lib/queries';
import { useTheme } from '@/lib/theme';
import { useTopicPanel } from '@/lib/topic-panel';
import { type PaletteField, useUi } from '@/lib/ui-state';
import { cn, isMac, normalize, splitMatch } from '@/lib/utils';
import type { ViewSearch } from '@/router';

const FIELD_ORDER: SearchHit['match']['field'][] = ['ref', 'title', 'description', 'note'];

function useDebounced<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

/** Text cut by the server search, matching words emphasized. */
function Segments({ segments }: { segments: SearchSegment[] }) {
  return (
    <>
      {segments.map((segment, index) =>
        segment.match ? (
          // biome-ignore lint/suspicious/noArrayIndexKey: segments never move
          <span key={index} className="font-semibold text-highlight">
            {segment.text}
          </span>
        ) : (
          segment.text
        ),
      )}
    </>
  );
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
  const panel = useTopicPanel();
  const matchRoute = useMatchRoute();
  const { setting, setSetting } = useTheme();
  const projects = useProjects();
  const bulk = useBulkUpdateTopics();
  const [query, setQuery] = useState('');
  const debounced = useDebounced(query.trim(), 90);
  const search = useSearch(debounced);
  const page = ui.palettePage;
  const ctx = ui.screenContext;

  useEffect(() => {
    if (!ui.paletteOpen) setQuery('');
  }, [ui.paletteOpen]);

  // Among equally good matches, topics of the project in view come first.
  const topics: SearchHit[] =
    query.trim() && search.data
      ? [...search.data.topics].sort(
          (a, b) =>
            FIELD_ORDER.indexOf(a.match.field) - FIELD_ORDER.indexOf(b.match.field) ||
            Number(b.projectId === ctx.projectId) - Number(a.projectId === ctx.projectId),
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
    panel.open(topic);
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
    // Creating projects and subprojects stays at hand.
    const contextProject = projects.data?.find((p) => p.id === ctx.projectId);
    const creations: PaletteAction[] = [
      {
        id: 'new-project',
        label: t('palette.newProject'),
        icon: <FolderPlusIcon className="size-3.5 text-ink-3" strokeWidth={2} aria-hidden />,
        shortcut: '⇧P',
        run: () => {
          close();
          ui.setProjectDialogOpen(true);
        },
      },
      ...(contextProject
        ? [
            {
              id: 'new-subproject',
              label: t('palette.newSubprojectIn', { name: contextProject.name }),
              icon: <LayersIcon className="size-3.5 text-ink-3" strokeWidth={2} aria-hidden />,
              run: () => {
                close();
                ui.setSubprojectDialogFor(contextProject.key);
              },
            },
          ]
        : []),
    ];
    list.push(...creations);
    if (targetRef) {
      list.push({
        id: 'status',
        label: t('palette.changeStatusOf', { ref: targetRef }),
        icon: <StatusIcon status="in_progress" />,
        shortcut: 'S',
        run: () => ui.setPalettePage({ kind: 'status', refs: [targetRef] }),
      });
      list.push({
        id: 'priority',
        label: t('palette.changePriorityOf', { ref: targetRef }),
        icon: <PriorityIcon priority="high" />,
        shortcut: 'P',
        run: () => ui.setPalettePage({ kind: 'priority', refs: [targetRef] }),
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
    // Once something is typed, only the actions it names stay (the view filter always matches).
    const typed = normalize(query.trim());
    return typed ? list.filter((a) => a.id === 'filter' || normalize(a.label).includes(typed)) : list;
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
  // Rows in order of preference: a topic, a subproject, an action, a place to go, then filtering the view. cmdk
  // selects the first row as one types, so the display order is the preference order.
  const mainActions = actions.filter((a) => a.id !== 'filter');
  const viewFilter = actions.filter((a) => a.id === 'filter');
  const shownNavigation = query.trim() ? navigation : [];
  const firstValue = topics[0]
    ? `topic-${topics[0].id}`
    : subprojects[0]
      ? `sub-${subprojects[0].id}`
      : (mainActions[0]?.id ?? shownNavigation[0]?.id ?? viewFilter[0]?.id ?? navigation[0]?.id);
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
                            'flex min-w-0 flex-auto flex-col',
                            (topic.status === 'done' || topic.status === 'cancelled') && 'text-ink-3',
                          )}
                        >
                          <span className="truncate">
                            {topic.match.field === 'title' ? (
                              <Segments segments={topic.match.segments} />
                            ) : (
                              <Highlight text={topic.title} query={query} />
                            )}
                          </span>
                          {topic.match.field === 'description' || topic.match.field === 'note' ? (
                            <span className="truncate text-ink-4 text-xs">
                              {t(`palette.matchIn.${topic.match.field}`)} · <Segments segments={topic.match.segments} />
                            </span>
                          ) : null}
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
                <PaletteGroup heading={t('palette.actions')} items={mainActions} />
                <PaletteGroup heading={t('palette.navigation')} items={navigation} onBeforeRun={close} />
                <PaletteGroup items={viewFilter} />
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
            <FieldPage
              key={`${page.kind}-${page.refs.join(',')}`}
              kind={page.kind}
              refs={page.refs}
              onBack={() => ui.setPalettePage({ kind: 'root' })}
              onApply={(patch, done) => {
                bulk.mutate({ refs: page.refs, patch });
                if (done) close();
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
  heading?: string;
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
/** Topics a field page acts on, as the lists and detail caches know them. */
function useTargets(refs: string[]): TopicSummary[] {
  const client = useQueryClient();
  const single = useTopic(refs[0] ?? '', refs.length === 1);
  const found = new Map<string, TopicSummary>();
  for (const [, list] of client.getQueriesData<TopicSummary[]>({ queryKey: ['topics'] })) {
    for (const topic of list ?? []) if (refs.includes(topic.ref)) found.set(topic.ref, topic);
  }
  for (const ref of refs) {
    const detail = client.getQueryData<TopicDetail>(queryKeys.topic(ref));
    if (detail) found.set(ref, detail);
  }
  if (single.data) found.set(single.data.ref, single.data);
  return refs.flatMap((ref) => found.get(ref) ?? []);
}

interface FieldOption {
  id: string;
  label: string;
  icon?: ReactNode;
  /** Whether every target, some of them or none have this value. */
  state: 'all' | 'some' | 'none';
  pick: () => void;
}

const stateOf = (count: number, total: number): FieldOption['state'] =>
  total > 0 && count === total ? 'all' : count > 0 ? 'some' : 'none';

/**
 * One field (status, priority, labels, subproject, due date) of one topic or of a selection. Labels toggle and
 * keep the page open; the other fields apply and close the palette.
 */
function FieldPage({
  kind,
  refs,
  onBack,
  onApply,
}: {
  kind: PaletteField;
  refs: string[];
  onBack: () => void;
  onApply: (patch: BulkTopicPatch, close: boolean) => void;
}) {
  const { t, i18n } = useTranslation();
  const targets = useTargets(refs);
  const labels = useLabels();
  const projects = useProjects();
  const [query, setQuery] = useState('');
  // Labels toggled on this page, shown at once (the palette does not re-read the lists).
  const [labelState, setLabelState] = useState<Record<string, boolean>>({});
  const q = normalize(query.trim());
  const today = todayISO();
  const total = targets.length;
  const count = (match: (topic: TopicSummary) => boolean) => targets.filter(match).length;
  const target = refs.length === 1 ? (refs[0] ?? '') : t('palette.topicCount', { count: refs.length });
  const title = t(`palette.fieldOf.${kind}`, { target });

  let options: FieldOption[] = [];
  let note: string | null = null;
  if (kind === 'status') {
    options = TOPIC_STATUSES.map((status) => ({
      id: status,
      label: t(`status.${status}`),
      icon: <StatusIcon status={status} />,
      state: stateOf(
        count((x) => x.status === status),
        total,
      ),
      pick: () => onApply({ status }, true),
    }));
  } else if (kind === 'priority') {
    options = [...TOPIC_PRIORITIES].reverse().map((priority) => ({
      id: priority,
      label: t(`priority.${priority}`),
      icon: <PriorityIcon priority={priority} />,
      state: stateOf(
        count((x) => x.priority === priority),
        total,
      ),
      pick: () => onApply({ priority }, true),
    }));
  } else if (kind === 'labels') {
    options = (labels.data ?? []).map((label) => {
      const toggled = labelState[label.id];
      const has = count((x) => x.labels.some((l) => l.id === label.id));
      const state = toggled === undefined ? stateOf(has, total) : toggled ? 'all' : 'none';
      return {
        id: label.id,
        label: label.name,
        icon: <span aria-hidden className="size-2 rounded-full" style={{ background: label.color }} />,
        state,
        pick: () => {
          const add = state !== 'all';
          setLabelState((prev) => ({ ...prev, [label.id]: add }));
          onApply(add ? { addLabelIds: [label.id] } : { removeLabelIds: [label.id] }, false);
        },
      };
    });
  } else if (kind === 'subproject') {
    const projectIds = new Set(targets.map((x) => x.projectId));
    const project = projectIds.size === 1 ? projects.data?.find((p) => projectIds.has(p.id)) : undefined;
    if (projectIds.size > 1) note = t('palette.severalProjects');
    options = project
      ? [
          {
            id: 'none',
            label: t('topic.noSubproject'),
            icon: <FolderInputIcon className="size-3.5 text-ink-4" strokeWidth={2} aria-hidden />,
            state: stateOf(
              count((x) => x.subprojectId === null),
              total,
            ),
            pick: () => onApply({ subprojectId: null }, true),
          },
          ...project.subprojects.map((sub) => ({
            id: sub.id,
            label: sub.name,
            icon: <LayersIcon className="size-3.5 text-ink-3" strokeWidth={2} aria-hidden />,
            state: stateOf(
              count((x) => x.subprojectId === sub.id),
              total,
            ),
            pick: () => onApply({ subprojectId: sub.id }, true),
          })),
        ]
      : [];
  } else {
    const typed = parseTypedDate(query.trim(), today, i18n.language);
    const presets = (
      [
        ['today', today],
        ['tomorrow', addDays(today, 1)],
        ['nextMonday', nextWeekday(today, 1)],
        ['inAWeek', addDays(today, 7)],
        ['none', null],
      ] as const
    )
      // On a Sunday, tomorrow is next Monday: one choice is enough.
      .filter(([, value], index, all) => all.findIndex(([, other]) => other === value) === index);
    const dated = presets.map(([name, value]) => ({
      id: name,
      label: value ? `${t(`palette.due.${name}`)} · ${formatWeekdayDate(value)}` : t(`palette.due.${name}`),
      icon: <CalendarIcon className="size-3.5 text-ink-3" strokeWidth={2} aria-hidden />,
      state: stateOf(
        count((x) => x.dueDate === value),
        total,
      ),
      pick: () => onApply({ dueDate: value }, true),
    }));
    options = typed
      ? [
          {
            id: `typed-${typed}`,
            label: t('palette.due.on', { date: formatWeekdayDate(typed) }),
            icon: <CalendarIcon className="size-3.5 text-ink-3" strokeWidth={2} aria-hidden />,
            state: stateOf(
              count((x) => x.dueDate === typed),
              total,
            ),
            pick: () => onApply({ dueDate: typed }, true),
          },
        ]
      : dated;
  }
  const visible = q && kind !== 'due' ? options.filter((o) => normalize(o.label).includes(q)) : options;
  // When the options change as one types, Enter picks the first one.
  const firstId = visible[0]?.id ?? '';
  const [selected, setSelected] = useState(firstId);
  useEffect(() => setSelected(firstId), [firstId]);

  return (
    <Command shouldFilter={false} loop label={title} value={selected} onValueChange={setSelected}>
      <div className="flex items-center gap-2 px-4 pt-2.5">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex h-[22px] items-center gap-1.5 rounded-md border-0 bg-muted px-2 text-ink-3 text-xs hover:text-ink"
        >
          {title}
        </button>
        {targets.length === 1 ? <span className="truncate text-ink-4 text-xs">{targets[0]?.title}</span> : null}
      </div>
      <div className="flex items-center gap-3 border-border border-b px-4 pt-1.5 pb-3">
        <SearchIcon className="size-[18px] shrink-0 text-ink-4" strokeWidth={1.9} aria-hidden />
        <CommandInput
          value={query}
          onValueChange={setQuery}
          // The page opens from a key press: typing must land here at once.
          autoFocus
          placeholder={kind === 'due' ? t('palette.due.typeDate', { example: dateExample(i18n.language) }) : title}
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
        {note ? <p className="m-0 px-4 py-3 text-ink-4 text-xs">{note}</p> : null}
        <CommandGroup>
          {visible.map((option) => (
            <CommandItem key={option.id} value={option.id} onSelect={option.pick}>
              <span className="grid w-3.5 shrink-0 place-items-center">{option.icon}</span>
              <span className="flex-auto">{option.label}</span>
              {option.state === 'all' ? <CheckIcon className="size-3.5 text-ink-3" aria-hidden /> : null}
              {option.state === 'some' ? <MinusIcon className="size-3.5 text-ink-4" aria-hidden /> : null}
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </Command>
  );
}

/** A date typed in the palette: `2026-12-24`, or day and month in the reader's order (24/12, 12/24 in English). */
function parseTypedDate(input: string, today: string, language: string): string | null {
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(input);
  const short = /^(\d{1,2})[/.](\d{1,2})(?:[/.](\d{2}|\d{4}))?$/.exec(input);
  let year: number;
  let month: number;
  let day: number;
  if (iso) {
    [year, month, day] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
  } else if (short) {
    const [a, b] = [Number(short[1]), Number(short[2])];
    [day, month] = language.startsWith('en') ? [b, a] : [a, b];
    const y = short[3];
    year = y ? (y.length === 2 ? 2000 + Number(y) : Number(y)) : Number(today.slice(0, 4));
  } else {
    return null;
  }
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return date.toISOString().slice(0, 10);
}

const dateExample = (language: string) => (language.startsWith('en') ? '12/24' : '24/12');

/** Next given weekday after `today` (1 = Monday), one to seven days ahead. */
function nextWeekday(today: string, weekday: number): string {
  const current = new Date(`${today}T00:00:00Z`).getUTCDay();
  return addDays(today, (weekday - current + 7) % 7 || 7);
}
