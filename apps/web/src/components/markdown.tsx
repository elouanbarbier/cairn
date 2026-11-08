import { Fragment, type ReactNode } from 'react';

/**
 * Minimal, safe Markdown renderer (no HTML injection): paragraphs, bullet and
 * numbered lists, **bold**, *italic* and `code`. The full editor (TipTap)
 * replaces this when rich editing lands.
 */
export function Markdown({ source, className }: { source: string; className?: string }) {
  const blocks = source.replace(/\r\n/g, '\n').split(/\n{2,}/);
  return (
    <div className={className}>
      {blocks.map((block, index) => {
        const lines = block.split('\n').filter((l) => l.trim().length > 0);
        if (lines.length === 0) return null;
        if (lines.every((l) => /^\s*[-*]\s+/.test(l))) {
          return (
            // biome-ignore lint/suspicious/noArrayIndexKey: blocks come from static text
            <ul key={index} className="m-0 flex flex-col gap-1 pl-5">
              {lines.map((l, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: lines come from static text
                <li key={i}>{inline(l.replace(/^\s*[-*]\s+/, ''))}</li>
              ))}
            </ul>
          );
        }
        if (lines.every((l) => /^\s*\d+[.)]\s+/.test(l))) {
          return (
            // biome-ignore lint/suspicious/noArrayIndexKey: blocks come from static text
            <ol key={index} className="m-0 flex flex-col gap-1 pl-5">
              {lines.map((l, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: lines come from static text
                <li key={i}>{inline(l.replace(/^\s*\d+[.)]\s+/, ''))}</li>
              ))}
            </ol>
          );
        }
        const heading = /^(#{1,3})\s+(.*)$/.exec(lines[0] ?? '');
        if (heading && lines.length === 1) {
          return (
            // biome-ignore lint/suspicious/noArrayIndexKey: blocks come from static text
            <p key={index} className="m-0 font-semibold">
              {inline(heading[2] ?? '')}
            </p>
          );
        }
        return (
          // biome-ignore lint/suspicious/noArrayIndexKey: blocks come from static text
          <p key={index} className="m-0">
            {lines.map((l, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: lines come from static text
              <Fragment key={i}>
                {i > 0 ? <br /> : null}
                {inline(l)}
              </Fragment>
            ))}
          </p>
        );
      })}
    </div>
  );
}

function inline(text: string): ReactNode[] {
  const parts: ReactNode[] = [];
  const pattern = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g;
  let last = 0;
  for (const match of text.matchAll(pattern)) {
    const token = match[0];
    const start = match.index ?? 0;
    if (start > last) parts.push(text.slice(last, start));
    if (token.startsWith('**')) parts.push(<strong key={start}>{token.slice(2, -2)}</strong>);
    else if (token.startsWith('`'))
      parts.push(
        <code key={start} className="rounded bg-muted px-1 font-mono text-[0.92em]">
          {token.slice(1, -1)}
        </code>,
      );
    else parts.push(<em key={start}>{token.slice(1, -1)}</em>);
    last = start + token.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}
