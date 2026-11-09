import { type FormEvent, type ReactNode, useId } from 'react';
import { CairnLogo } from '@/components/icons';
import { Input } from '@/components/ui/input';

/** Centered card of the screens shown before the workspace: first run, sign-in, invitation links. */
export function AccessCard({
  title,
  description,
  onSubmit,
  children,
}: {
  title: string;
  description?: ReactNode;
  onSubmit?: (event: FormEvent) => void;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <main className="grid min-h-dvh place-items-center bg-subtle px-4 py-10">
      <form
        onSubmit={onSubmit}
        aria-labelledby={`${id}-title`}
        noValidate
        className="flex w-full max-w-[420px] flex-col gap-5 rounded-xl border border-border bg-card p-6 shadow-float sm:p-8"
      >
        <div className="flex flex-col gap-3">
          <CairnLogo className="size-7" />
          <div className="flex flex-col gap-1">
            <h1 id={`${id}-title`} className="m-0 font-semibold text-2xl tracking-[-0.02em]">
              {title}
            </h1>
            {description ? <p className="m-0 text-ink-3">{description}</p> : null}
          </div>
        </div>
        {children}
      </form>
    </main>
  );
}

/** Label, input and an optional hint, wired together. */
export function AccessField({
  label,
  hint,
  ...input
}: { label: string; hint?: string } & React.ComponentProps<typeof Input>) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="font-medium text-ink-3 text-xs">
        {label}
      </label>
      <Input id={id} aria-describedby={hint ? `${id}-hint` : undefined} className="h-9 text-base" {...input} />
      {hint ? (
        <p id={`${id}-hint`} className="m-0 text-ink-4 text-xs">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/** Error under a form, read out when it appears. */
export function AccessError({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="m-0 text-danger text-xs">
      {children}
    </p>
  );
}
