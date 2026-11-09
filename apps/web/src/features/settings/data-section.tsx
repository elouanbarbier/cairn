import { DatabaseBackupIcon, DownloadIcon, UploadIcon } from 'lucide-react';
import { type ChangeEvent, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { LoadError } from '@/components/bits';
import { Button } from '@/components/ui/button';
import { ApiRequestError } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { useBackups, useImportWorkspace, useRunBackup } from '@/lib/queries';
import { Section } from './parts';

const size = (bytes: number) =>
  bytes < 1_048_576 ? `${Math.round(bytes / 1024)} Ko` : `${(bytes / 1_048_576).toFixed(1)} Mo`;

/** Administrators: export, import into an empty workspace, and the database backups. */
export function DataSection() {
  const { t, i18n } = useTranslation();
  const backups = useBackups();
  const runBackup = useRunBackup();
  const importWorkspace = useImportWorkspace();
  const file = useRef<HTMLInputElement>(null);
  const unit = (text: string) => (i18n.language.startsWith('en') ? text.replace('Ko', 'KB').replace('Mo', 'MB') : text);

  const onFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const chosen = event.target.files?.[0];
    event.target.value = '';
    if (!chosen) return;
    let doc: unknown;
    try {
      doc = JSON.parse(await chosen.text());
    } catch {
      toast.error(t('settings.importInvalid'));
      return;
    }
    importWorkspace.mutate(doc, {
      onSuccess: (result) =>
        toast.success(
          t('settings.imported', { projects: result.projects, topics: result.topics, accounts: result.newAccounts }),
        ),
      onError: (error) =>
        toast.error(
          error instanceof ApiRequestError && error.status === 409
            ? t('settings.importNotEmpty')
            : error instanceof ApiRequestError && error.status === 400
              ? t('settings.importInvalid')
              : t('errors.rollback'),
        ),
    });
  };

  return (
    <Section title={t('settings.data')}>
      <p className="m-0 text-ink-3">{t('settings.dataHint')}</p>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" asChild>
          <a href="/api/export" download>
            <DownloadIcon className="size-3.5" aria-hidden />
            {t('settings.exportJson')}
          </a>
        </Button>
        <Button variant="outline" asChild>
          <a href="/api/export/topics.csv" download>
            <DownloadIcon className="size-3.5" aria-hidden />
            {t('settings.exportCsv')}
          </a>
        </Button>
        <Button variant="outline" onClick={() => file.current?.click()} disabled={importWorkspace.isPending}>
          <UploadIcon className="size-3.5" aria-hidden />
          {t('settings.importJson')}
        </Button>
        <input
          ref={file}
          type="file"
          accept="application/json,.json"
          onChange={(e) => void onFile(e)}
          className="hidden"
          tabIndex={-1}
          aria-hidden
        />
      </div>

      <div className="flex flex-col gap-2">
        <h3 className="m-0 font-medium text-ink-2">{t('settings.backups')}</h3>
        <p className="m-0 text-ink-3">{t('settings.backupsHint')}</p>
        {backups.isError ? <LoadError onRetry={() => void backups.refetch()} /> : null}
        {backups.data?.length === 0 ? <p className="m-0 text-ink-4">{t('settings.noBackups')}</p> : null}
        {backups.data && backups.data.length > 0 ? (
          <ul className="m-0 flex list-none flex-col p-0">
            {backups.data.slice(0, 7).map((backup) => (
              <li key={backup.name} className="flex items-center gap-3 border-line border-t py-2 text-small">
                <DatabaseBackupIcon className="size-3.5 shrink-0 text-ink-4" strokeWidth={2} aria-hidden />
                <span className="font-mono text-xs">{backup.name}</span>
                <span className="ml-auto text-ink-4 text-xs">
                  {formatDateTime(backup.createdAt)} · {unit(size(backup.size))}
                </span>
              </li>
            ))}
          </ul>
        ) : null}
        <Button
          variant="outline"
          onClick={() =>
            runBackup.mutate(undefined, { onSuccess: (b) => toast.success(t('settings.backupDone', { name: b.name })) })
          }
          disabled={runBackup.isPending}
          className="self-start"
        >
          {t('settings.backupNow')}
        </Button>
      </div>
    </Section>
  );
}
