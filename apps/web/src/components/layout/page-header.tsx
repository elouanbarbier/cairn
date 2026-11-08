import { Link, type LinkProps } from '@tanstack/react-router';
import { ChevronRightIcon, MenuIcon } from 'lucide-react';
import { Fragment, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { useUi } from '@/lib/ui-state';

/** 48 px top bar of the main area: title or breadcrumb on the left, actions on the right. */
export function PageHeader({ children, actions }: { children: ReactNode; actions?: ReactNode }) {
  const { t } = useTranslation();
  const ui = useUi();
  return (
    <header className="sticky top-0 z-20 flex min-h-12 flex-wrap items-center gap-x-3 gap-y-2 border-border border-b bg-background px-5 py-2">
      <Button
        variant="ghost"
        size="icon-sm"
        className="-ml-1.5 md:hidden"
        aria-label={t('nav.openMenu')}
        onClick={() => ui.setNavOpen(true)}
      >
        <MenuIcon className="size-4" />
      </Button>
      {children}
      {actions ? <span className="ml-auto flex flex-wrap items-center gap-2">{actions}</span> : null}
    </header>
  );
}

export interface Crumb {
  label: ReactNode;
  link?: LinkProps;
}

export function Breadcrumb({ items }: { items: Crumb[] }) {
  const { t } = useTranslation();
  return (
    <nav aria-label={t('nav.breadcrumb')} className="flex min-w-0 flex-wrap items-center gap-1.5 text-ink-4">
      {items.map((item, index) => {
        const last = index === items.length - 1;
        return (
          // biome-ignore lint/suspicious/noArrayIndexKey: breadcrumb positions are stable
          <Fragment key={index}>
            {item.link && !last ? (
              <Link {...item.link} className="inline-flex items-center gap-1.5 text-ink-3 no-underline hover:text-ink">
                {item.label}
              </Link>
            ) : (
              <span
                className={last ? 'inline-flex items-center gap-1.5 font-medium text-ink' : 'text-ink-3'}
                aria-current={last ? 'page' : undefined}
              >
                {item.label}
              </span>
            )}
            {last ? null : <ChevronRightIcon aria-hidden className="size-3 text-ink-5" strokeWidth={2} />}
          </Fragment>
        );
      })}
    </nav>
  );
}
