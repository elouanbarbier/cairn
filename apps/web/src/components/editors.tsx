import { PencilIcon, XIcon } from 'lucide-react';
import { type ReactNode, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Markdown } from '@/components/markdown';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/input';
import { Kbd } from '@/components/ui/kbd';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn, isMac } from '@/lib/utils';

/** Heading edited in place: Enter or blur saves, Escape reverts. Empty values are refused. */
export function InlineTitle({
  value,
  onSave,
  label,
  className,
  readOnly = false,
}: {
  value: string;
  onSave: (value: string) => void;
  label: string;
  /** Text size and weight of the heading. */
  className?: string;
  readOnly?: boolean;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);

  const commit = () => {
    const next = draft.replace(/\s+/g, ' ').trim();
    if (next && next !== value) onSave(next);
    else setDraft(value);
  };

  return (
    <h1 className="m-0 min-w-0">
      <textarea
        aria-label={label}
        value={draft}
        rows={1}
        readOnly={readOnly}
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
        className={cn(
          '-mx-1.5 block w-[calc(100%+12px)] resize-none rounded-md border-0 bg-transparent px-1.5 py-0.5 text-ink outline-none [field-sizing:content] focus-visible:outline-none',
          !readOnly && 'hover:bg-subtle focus-visible:bg-subtle',
          className,
        )}
      />
    </h1>
  );
}

/** Markdown shown as text; a pencil or a click on the placeholder opens a textarea with Save and Cancel. */
export function MarkdownEditor({
  value,
  onSave,
  label,
  placeholder,
  className,
  readOnly = false,
}: {
  value: string;
  onSave: (value: string) => void;
  /** Accessible name of the textarea and of the edit button. */
  label: string;
  placeholder: string;
  /** Text style of the rendered Markdown. */
  className?: string;
  readOnly?: boolean;
}) {
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
          aria-label={label}
          value={draft}
          rows={Math.max(5, draft.split('\n').length + 1)}
          autoFocus
          placeholder={placeholder}
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

  if (!value) {
    return readOnly ? null : (
      <button
        type="button"
        onClick={start}
        className="self-start border-0 bg-transparent p-0 text-base text-ink-4 hover:text-ink-3"
      >
        {placeholder}
      </button>
    );
  }

  return (
    <div className={cn('group relative -mx-2 rounded-md px-2 py-1', !readOnly && 'hover:bg-subtle')}>
      <Markdown source={value} className={cn('flex flex-col gap-2.5 text-base text-ink-body', className)} />
      {readOnly ? null : (
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={start}
          aria-label={label}
          className="absolute top-1 right-1 opacity-0 focus-visible:opacity-100 group-hover:opacity-100"
        >
          <PencilIcon className="size-3.5" />
        </Button>
      )}
    </div>
  );
}

export const isValidDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && Number(value.slice(0, 4)) >= 2000;

/**
 * Date picker in a popover that commits when it closes or on Enter, not on every keystroke.
 * Controlled (`open`) or not.
 */
export function DatePopover({
  value,
  open: openProp,
  onOpenChange,
  onCommit,
  label,
  clearLabel,
  triggerClassName,
  children,
}: {
  value: string | null;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onCommit: (value: string | null) => void;
  /** Accessible name of the date field. */
  label: string;
  clearLabel: string;
  triggerClassName?: string;
  /** Trigger content. */
  children: ReactNode;
}) {
  const [ownOpen, setOwnOpen] = useState(false);
  const open = openProp ?? ownOpen;
  const setOpen = (next: boolean) => {
    if (openProp === undefined) setOwnOpen(next);
    onOpenChange?.(next);
  };
  const [draft, setDraft] = useState(value ?? '');
  useEffect(() => {
    if (open) setDraft(value ?? '');
  }, [open, value]);

  const close = () => {
    if (draft !== (value ?? '') && isValidDate(draft)) onCommit(draft);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={(next) => (next ? setOpen(true) : close())}>
      <PopoverTrigger className={triggerClassName}>{children}</PopoverTrigger>
      <PopoverContent className="flex items-center gap-2">
        <input
          type="date"
          aria-label={label}
          value={draft}
          // biome-ignore lint/a11y/noAutofocus: the popover exists to edit this field
          autoFocus
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') close();
          }}
          className="h-8 rounded-md border border-input bg-background px-2 text-ink text-sm [color-scheme:light] dark:[color-scheme:dark]"
        />
        {value ? (
          <button
            type="button"
            onClick={() => {
              onCommit(null);
              setOpen(false);
            }}
            aria-label={clearLabel}
            className="grid size-8 place-items-center rounded-md border border-border bg-background text-ink-3 hover:bg-accent"
          >
            <XIcon className="size-3.5" aria-hidden />
          </button>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
