import type { Label, Progress, User } from '@cairn/shared';
import { MoonIcon } from 'lucide-react';
import { type ReactNode, useId } from 'react';
import { useTranslation } from 'react-i18next';
import { cn, initials } from '@/lib/utils';

/** Initials avatar. */
export function Avatar({
  user,
  size = 20,
  className,
}: {
  user: Pick<User, 'name'>;
  size?: 18 | 20 | 22 | 26;
  className?: string;
}) {
  const text = { 18: 'text-[8.5px]', 20: 'text-[9px]', 22: 'text-[10px]', 26: 'text-[10.5px]' }[size];
  return (
    <span
      title={user.name}
      style={{ width: size, height: size }}
      className={cn(
        'grid shrink-0 place-items-center rounded-full bg-avatar font-semibold text-avatar-foreground',
        text,
        className,
      )}
    >
      {initials(user.name)}
    </span>
  );
}

/** Project or subproject color square. Colors are data, stored per project. */
export function ColorSquare({
  color,
  size = 10,
  className,
}: {
  color: string;
  size?: 8 | 10 | 14;
  className?: string;
}) {
  const radius = size === 14 ? 4 : size === 10 ? 3 : 2;
  return (
    <span
      aria-hidden
      className={cn('inline-block shrink-0', className)}
      style={{ width: size, height: size, borderRadius: radius, background: color }}
    />
  );
}

export function LabelChip({ label, size = 'sm' }: { label: Label; size?: 'sm' | 'md' }) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-[5px] rounded-full border border-border text-ink-2',
        size === 'sm' ? 'h-5 px-[7px] text-caption' : 'h-[22px] bg-background px-2 text-xs',
      )}
    >
      <span aria-hidden className="size-1.5 rounded-full" style={{ background: label.color }} />
      {label.name}
    </span>
  );
}

/** Thin progress bar; `tone` picks the fill token, or a data color. */
/** Done out of total. Named for assistive technologies by `label` (what progresses), "Progress" otherwise. */
export function ProgressBar({
  progress,
  height = 6,
  tone = 'brand',
  color,
  label,
  className,
}: {
  progress: Progress;
  height?: 4 | 6;
  tone?: 'brand' | 'neutral' | 'success';
  color?: string;
  label?: string;
  className?: string;
}) {
  const { t } = useTranslation();
  const pct = progress.total === 0 ? 0 : Math.round((progress.done / progress.total) * 100);
  const fill = { brand: 'bg-brand', neutral: 'bg-ink-5', success: 'bg-status-done' }[tone];
  return (
    <span
      role="progressbar"
      aria-label={label ?? t('project.progress')}
      aria-valuetext={t('views.doneOfTotal', { done: progress.done, total: progress.total })}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      className={cn('block overflow-hidden rounded-full bg-line', className)}
      style={{ height }}
    >
      <span
        className={cn('block rounded-full transition-[width] duration-200', color ? undefined : fill)}
        style={{ width: `${pct}%`, height, background: color }}
      />
    </span>
  );
}

export function DormantBadge({ days, title, icon = true }: { days: string; title?: string; icon?: boolean }) {
  return (
    <span
      title={title}
      className="inline-flex shrink-0 items-center gap-1 rounded bg-dormant-soft px-1.5 font-medium text-caption text-dormant tabular-nums"
    >
      {icon ? <MoonIcon aria-hidden className="size-[11px]" strokeWidth={2.4} /> : null}
      {days}
    </span>
  );
}

/** Section card used on the overview. */
export function Panel({
  id,
  title,
  icon,
  count,
  hint,
  action,
  children,
}: {
  id?: string;
  title: string;
  icon: ReactNode;
  count?: number;
  hint?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  // A generated id: titles contain spaces, which would split `aria-labelledby` into several references.
  const headingId = `${useId()}-heading`;
  return (
    <section
      id={id}
      aria-labelledby={headingId}
      className="scroll-mt-16 overflow-hidden rounded-lg border border-border bg-card"
    >
      <div className={cn('flex flex-col gap-0.5 px-4', hint ? 'pt-3 pb-2.5' : 'h-11 justify-center')}>
        <div className="flex items-center gap-2">
          {icon}
          <h2 id={headingId} className="m-0 font-semibold text-sm">
            {title}
          </h2>
          {count === undefined ? null : <Count>{count}</Count>}
          {action ? <span className="ml-auto">{action}</span> : null}
        </div>
        {hint ? <p className="m-0 text-ink-4 text-xs">{hint}</p> : null}
      </div>
      {children}
    </section>
  );
}

export function TopicRef({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={cn('shrink-0 whitespace-nowrap font-mono text-caption text-ink-4', className)}>{children}</span>
  );
}

export function Count({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn('font-normal text-ink-4 text-xs tabular-nums', className)}>{children}</span>;
}

/** Calm empty state with an optional action. */
/** An empty screen or list: a sober icon, what is (not) there, and the main action. */
export function EmptyState({ icon, children, action }: { icon?: ReactNode; children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-10 text-center text-ink-4">
      {icon ? (
        <span
          aria-hidden
          className="grid size-10 place-items-center rounded-full bg-muted text-ink-3 [&>svg]:size-[18px]"
        >
          {icon}
        </span>
      ) : null}
      <p className="m-0 max-w-sm">{children}</p>
      {action}
    </div>
  );
}

export function LoadError({ onRetry }: { onRetry: () => void }) {
  const { t } = useTranslation();
  return (
    <EmptyState
      action={
        <button type="button" onClick={onRetry} className="font-medium text-brand hover:underline">
          {t('errors.retry')}
        </button>
      }
    >
      {t('errors.loadFailed')}
    </EmptyState>
  );
}
