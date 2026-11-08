import { Fragment } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Kbd } from '@/components/ui/kbd';
import { useUi } from '@/lib/ui-state';
import { isMac } from '@/lib/utils';

type Item =
  | 'palette'
  | 'newTopic'
  | 'newProject'
  | 'status'
  | 'priority'
  | 'due'
  | 'labels'
  | 'move'
  | 'select'
  | 'nextPrev'
  | 'openClose'
  | 'search'
  | 'goOverview'
  | 'goProjects'
  | 'help';

const SHORTCUTS: Array<{ item: Item; keys: string[][] }> = [
  { item: 'palette', keys: [[isMac ? '⌘' : 'Ctrl', 'K']] },
  { item: 'newTopic', keys: [['C']] },
  { item: 'newProject', keys: [['⇧', 'P']] },
  { item: 'status', keys: [['S']] },
  { item: 'priority', keys: [['P']] },
  { item: 'due', keys: [['D']] },
  { item: 'labels', keys: [['L']] },
  { item: 'move', keys: [['M']] },
  { item: 'select', keys: [['X']] },
  { item: 'nextPrev', keys: [['J'], ['K']] },
  { item: 'openClose', keys: [['↵'], ['Esc']] },
  { item: 'search', keys: [['/']] },
  { item: 'goOverview', keys: [['G', 'O']] },
  { item: 'goProjects', keys: [['G', 'P']] },
  { item: 'help', keys: [['?']] },
];

export function ShortcutsDialog() {
  const { t } = useTranslation();
  const ui = useUi();
  return (
    <Dialog open={ui.shortcutsOpen} onOpenChange={ui.setShortcutsOpen}>
      <DialogContent className="max-w-[480px]">
        <div className="flex flex-col gap-1 px-5 pt-5 pb-3">
          <DialogTitle>{t('shortcuts.title')}</DialogTitle>
          <DialogDescription>{t('shortcuts.description')}</DialogDescription>
        </div>
        <dl className="m-0 flex flex-col px-5 pb-4">
          {SHORTCUTS.map(({ item, keys }) => (
            <div key={item} className="flex min-h-8.5 items-center justify-between gap-4 border-line border-t">
              <dt className="text-ink-2">{t(`shortcuts.items.${item}`)}</dt>
              <dd className="m-0 flex items-center gap-1 text-ink-4 text-xs">
                {keys.map((combo, i) => (
                  <Fragment key={combo.join('+')}>
                    {i > 0 ? <span>/</span> : null}
                    {combo.map((key, j) => (
                      <Fragment key={key}>
                        {j > 0 && item.startsWith('go') ? <span>{t('shortcuts.sequence')}</span> : null}
                        <Kbd variant="outline">{key}</Kbd>
                      </Fragment>
                    ))}
                  </Fragment>
                ))}
              </dd>
            </div>
          ))}
        </dl>
      </DialogContent>
    </Dialog>
  );
}
