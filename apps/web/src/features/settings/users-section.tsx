import { type Account, USER_ROLES, type UserLink, type UserRole } from '@cairn/shared';
import { type FormEvent, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Avatar, LoadError } from '@/components/bits';
import { Button } from '@/components/ui/button';
import { NativeSelect } from '@/components/ui/input';
import { ApiRequestError } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { useAccountLink, useAccounts, useCreateAccount, useUpdateAccount } from '@/lib/queries';
import { cn } from '@/lib/utils';
import { CopyField, Field, Section } from './parts';

const linkUrl = (link: UserLink) => `${window.location.origin}${link.path}`;

function status(account: Account): 'active' | 'pending' | 'disabled' {
  if (account.disabled) return 'disabled';
  return account.hasPassword ? 'active' : 'pending';
}

/** Administrators: invite people, hand over links, change roles, disable accounts. */
export function UsersSection({ meId }: { meId: string }) {
  const { t } = useTranslation();
  const accounts = useAccounts();
  const create = useCreateAccount();
  const update = useUpdateAccount();
  const accessLink = useAccountLink();
  const id = useId();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<UserRole>('member');
  /** The last link produced, shown under its account. */
  const [shown, setShown] = useState<{ accountId: string; name: string; link: UserLink } | null>(null);

  const invite = (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim() || !email.trim()) return;
    create.mutate(
      { name: name.trim(), email: email.trim(), role },
      {
        onSuccess: ({ account, link }) => {
          setShown({ accountId: account.id, name: account.name, link });
          setName('');
          setEmail('');
          setRole('member');
          toast.success(t('settings.accountCreated', { name: account.name }));
        },
        onError: (error) =>
          toast.error(
            error instanceof ApiRequestError && error.status === 409 ? t('settings.emailTaken') : t('errors.rollback'),
          ),
      },
    );
  };

  return (
    <Section title={t('settings.users')}>
      <p className="m-0 text-ink-3">{t('settings.usersHint')}</p>
      {accounts.isError ? <LoadError onRetry={() => void accounts.refetch()} /> : null}
      <ul className="m-0 flex list-none flex-col p-0">
        {accounts.data?.map((account) => {
          const self = account.id === meId;
          const state = status(account);
          return (
            <li key={account.id} className="flex flex-col gap-2 border-line border-t py-3">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <Avatar user={account} size={22} className={cn(account.disabled && 'opacity-50')} />
                <span className="flex min-w-0 flex-col">
                  <span className="font-medium">
                    {account.name}
                    {self ? <span className="font-normal text-ink-4"> · {t('settings.you')}</span> : null}
                  </span>
                  <span className="truncate text-ink-3 text-xs">{account.email}</span>
                </span>
                <span
                  className={cn(
                    'rounded-full px-2 py-px text-xs',
                    state === 'active' && 'bg-success-soft text-success',
                    state === 'pending' && 'bg-brand-soft text-brand',
                    state === 'disabled' && 'bg-muted text-ink-4',
                  )}
                >
                  {t(`settings.statuses.${state}`)}
                </span>
                <span className="ml-auto flex flex-wrap items-center gap-2">
                  {account.lastSeenAt ? (
                    <span className="text-ink-4 text-xs">
                      {t('settings.lastSeen', { when: formatDateTime(account.lastSeenAt) })}
                    </span>
                  ) : null}
                  <NativeSelect
                    aria-label={t('settings.roleOf', { name: account.name })}
                    value={account.role}
                    disabled={self || account.disabled}
                    onChange={(e) => update.mutate({ id: account.id, input: { role: e.target.value as UserRole } })}
                    className="w-auto"
                  >
                    {USER_ROLES.map((r) => (
                      <option key={r} value={r}>
                        {t(`settings.roles.${r}`)}
                      </option>
                    ))}
                  </NativeSelect>
                  {account.disabled ? null : (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        accessLink.mutate(account.id, {
                          onSuccess: (link) => setShown({ accountId: account.id, name: account.name, link }),
                        })
                      }
                    >
                      {t(account.hasPassword ? 'settings.resetLink' : 'settings.inviteLink')}
                    </Button>
                  )}
                  {self ? null : (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => update.mutate({ id: account.id, input: { disabled: !account.disabled } })}
                      className={cn(!account.disabled && 'text-danger')}
                    >
                      {t(account.disabled ? 'settings.enable' : 'settings.disable')}
                    </Button>
                  )}
                </span>
              </div>
              {shown?.accountId === account.id ? (
                <div className="flex flex-col gap-1.5 rounded-lg border border-brand bg-brand-soft p-3">
                  <p className="m-0 text-brand text-xs">{t('settings.linkHint', { name: shown.name })}</p>
                  <CopyField value={linkUrl(shown.link)} label={t('settings.linkFor', { name: shown.name })} />
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>

      <form onSubmit={invite} className="flex flex-wrap items-end gap-3">
        <Field
          label={t('settings.name')}
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={120}
          className="min-w-44 flex-1"
        />
        <Field
          label={t('settings.email')}
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="min-w-52 flex-1"
        />
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-role`} className="font-medium text-ink-3 text-xs">
            {t('settings.role')}
          </label>
          <NativeSelect
            id={`${id}-role`}
            value={role}
            onChange={(e) => setRole(e.target.value as UserRole)}
            className="w-auto"
          >
            {USER_ROLES.map((r) => (
              <option key={r} value={r}>
                {t(`settings.roles.${r}`)}
              </option>
            ))}
          </NativeSelect>
        </div>
        <Button type="submit" disabled={!name.trim() || !email.trim() || create.isPending}>
          {t('settings.invite')}
        </Button>
      </form>
    </Section>
  );
}
