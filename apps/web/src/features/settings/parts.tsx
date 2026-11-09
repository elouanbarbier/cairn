import { CheckIcon, CopyIcon } from 'lucide-react';
import { type ReactNode, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

export function Section({ title, children }: { title: string; children: ReactNode }) {
  const id = useId();
  return (
    <section
      aria-labelledby={id}
      className="flex flex-col gap-4 border-border border-t pt-6 first:border-t-0 first:pt-0"
    >
      <h2 id={id} className="m-0 font-semibold text-base">
        {title}
      </h2>
      {children}
    </section>
  );
}

/** Segmented choice built on native radio buttons. */
export function Choice<T extends string>({
  legend,
  value,
  options,
  onChange,
}: {
  legend: string;
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (value: T) => void;
}) {
  const name = useId();
  return (
    <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
      <legend className="mb-2 p-0 font-medium text-ink-2">{legend}</legend>
      <div className="inline-flex self-start rounded-[7px] bg-muted p-0.5">
        {options.map((option) => (
          <label
            key={option.value}
            className={cn(
              'relative inline-flex h-7 cursor-pointer items-center rounded-[5px] px-3 font-medium text-ink-3 transition-colors duration-150 hover:text-ink has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ring',
              value === option.value && 'bg-background text-ink shadow-segment',
            )}
          >
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={value === option.value}
              onChange={() => onChange(option.value)}
              className="sr-only"
            />
            {option.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/** Label and input on one column, with an optional hint. */
export function Field({
  label,
  hint,
  className,
  ...input
}: { label: string; hint?: string; className?: string } & React.ComponentProps<typeof Input>) {
  const id = useId();
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={id} className="font-medium text-ink-3 text-xs">
        {label}
      </label>
      <Input id={id} aria-describedby={hint ? `${id}-hint` : undefined} {...input} />
      {hint ? (
        <p id={`${id}-hint`} className="m-0 text-ink-4 text-xs">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/**
 * A secret or a link to hand over, with a copy button. Over plain http on the local network the clipboard API is not
 * available: the text is then selected, ready for Cmd/Ctrl+C.
 */
export function CopyField({ value, label }: { value: string; label: string }) {
  const { t } = useTranslation();
  const ref = useRef<HTMLInputElement>(null);
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      ref.current?.select();
    }
  };
  return (
    <span className="flex items-center gap-2">
      <Input
        ref={ref}
        value={value}
        readOnly
        aria-label={label}
        onFocus={(e) => e.currentTarget.select()}
        className="flex-auto font-mono text-xs"
      />
      <Button variant="outline" onClick={() => void copy()} className="shrink-0">
        {copied ? <CheckIcon className="size-3.5" aria-hidden /> : <CopyIcon className="size-3.5" aria-hidden />}
        {copied ? t('settings.copied') : t('settings.copy')}
      </Button>
    </span>
  );
}
