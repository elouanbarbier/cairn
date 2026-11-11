import { type CreatedToken, TOKEN_SCOPES, type TokenScope } from '@cairn/shared';
import { KeyRoundIcon } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { LoadError } from '@/components/bits';
import { Button } from '@/components/ui/button';
import { formatDateTime } from '@/lib/format';
import { useCreateToken, useRevokeToken, useTokens } from '@/lib/queries';
import { Choice, CopyField, Field, Section } from './parts';

/** Personal API tokens: for scripts and AI assistants, read only or read and write. */
export function TokensSection() {
  const { t } = useTranslation();
  const tokens = useTokens();
  const create = useCreateToken();
  const revoke = useRevokeToken();
  const [name, setName] = useState('');
  const [scope, setScope] = useState<TokenScope>('read');
  const [created, setCreated] = useState<CreatedToken | null>(null);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return;
    create.mutate(
      { name: name.trim(), scope },
      {
        onSuccess: (result) => {
          setCreated(result);
          setName('');
        },
      },
    );
  };

  return (
    <Section title={t('settings.tokens')}>
      <p className="m-0 text-ink-3">
        {t('settings.tokensHint')}{' '}
        <a
          href="/api/openapi.json"
          target="_blank"
          rel="noreferrer"
          className="text-brand underline underline-offset-2"
        >
          {t('settings.apiDocs')}
        </a>
      </p>

      {tokens.isError ? <LoadError onRetry={() => void tokens.refetch()} /> : null}
      {tokens.data?.length === 0 ? <p className="m-0 text-ink-4">{t('settings.noTokens')}</p> : null}
      {tokens.data && tokens.data.length > 0 ? (
        <ul className="m-0 flex list-none flex-col p-0">
          {tokens.data.map((token) => (
            <li key={token.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-line border-t py-2.5">
              <KeyRoundIcon className="size-3.5 shrink-0 text-ink-4" strokeWidth={2} aria-hidden />
              <span className="font-medium">{token.name}</span>
              <span className="font-mono text-ink-4 text-xs">{token.prefix}…</span>
              <span className="rounded-full border border-border px-2 py-px text-ink-3 text-xs">
                {t(`settings.scopes.${token.scope}`)}
              </span>
              <span className="ml-auto text-ink-4 text-xs">
                {token.lastUsedAt
                  ? t('settings.usedAt', { when: formatDateTime(token.lastUsedAt) })
                  : t('settings.neverUsed')}
              </span>
              <Button
                variant="ghost"
                size="sm"
                aria-label={t('settings.revokeToken', { name: token.name })}
                onClick={() =>
                  revoke.mutate(token.id, {
                    onSuccess: () => {
                      if (created?.token.id === token.id) setCreated(null);
                      toast.success(t('settings.tokenRevoked'));
                    },
                  })
                }
                className="text-danger"
              >
                {t('settings.revoke')}
              </Button>
            </li>
          ))}
        </ul>
      ) : null}

      {created ? (
        <div role="status" className="flex flex-col gap-2 rounded-lg border border-brand bg-brand-soft p-3">
          <p className="m-0 font-medium text-brand">{t('settings.tokenCreated')}</p>
          <CopyField value={created.secret} label={created.token.name} />
        </div>
      ) : null}

      <form onSubmit={submit} className="flex flex-wrap items-end gap-3">
        <Field
          label={t('settings.tokenName')}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t('settings.tokenNamePlaceholder')}
          maxLength={80}
          className="min-w-56 flex-1"
        />
        <Choice<TokenScope>
          legend={t('settings.scope')}
          value={scope}
          onChange={setScope}
          options={TOKEN_SCOPES.map((value) => ({ value, label: t(`settings.scopes.${value}`) }))}
        />
        <Button type="submit" disabled={!name.trim() || create.isPending}>
          {t('settings.createToken')}
        </Button>
      </form>
    </Section>
  );
}
