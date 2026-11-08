import { sortKeyBetween, type TopicStatus, type TopicSummary, type UpdateTopicInput } from '@cairn/shared';
import type { GroupBy } from '@/router';
import { LIST_STATUS_ORDER } from './filters';

export interface ListDrop {
  topic: TopicSummary;
  /** How the list is grouped: a group key is a status, or a subproject id (`none` for no subproject). */
  group: GroupBy;
  targetKey: string;
  /** Topics of the target group, in display order (they may include the dragged topic). */
  targetTopics: TopicSummary[];
  /** The row it was dropped on, or `null` for the group itself (then it goes last). */
  overId: string | null;
  /** For a drop from another group: whether the dragged row's middle is below the target row's. */
  below: boolean;
}

/**
 * The change a list drop makes: a new sort key, plus the status or the subproject when the topic lands in another
 * group. Lists show topics by status first, so a topic is placed among the topics of its own status; dropped next to a
 * topic of another status, it goes to the edge of its status block. Returns `null` when nothing changes.
 */
export function planListDrop({
  topic,
  group,
  targetKey,
  targetTopics,
  overId,
  below,
}: ListDrop): UpdateTopicInput | null {
  const sameGroup = group === 'status' ? topic.status === targetKey : (topic.subprojectId ?? 'none') === targetKey;
  const status: TopicStatus = group === 'status' ? (targetKey as TopicStatus) : topic.status;
  const peers = targetTopics.filter((t) => t.status === status);
  const others = peers.filter((t) => t.id !== topic.id);
  const over = overId ? targetTopics.find((t) => t.id === overId) : undefined;

  let index = others.length;
  if (over && over.id === topic.id) {
    if (sameGroup) return null;
  } else if (over && over.status === status) {
    const at = others.findIndex((t) => t.id === over.id);
    const from = peers.findIndex((t) => t.id === topic.id);
    const to = peers.findIndex((t) => t.id === over.id);
    // Within its group the row takes the place of the one it is over; from elsewhere, the pointer decides.
    const after = sameGroup && from !== -1 ? from < to : below;
    index = at + (after ? 1 : 0);
  } else if (over) {
    index = LIST_STATUS_ORDER.indexOf(over.status) < LIST_STATUS_ORDER.indexOf(status) ? 0 : others.length;
  }

  const previous = others[index - 1];
  const next = others[index];
  const patch: UpdateTopicInput = {};
  if (!sameGroup) {
    if (group === 'status') patch.status = status;
    else patch.subprojectId = targetKey === 'none' ? null : targetKey;
  } else {
    const current = peers.findIndex((t) => t.id === topic.id);
    if (peers[current - 1]?.id === previous?.id && peers[current + 1]?.id === next?.id) return null;
  }
  try {
    patch.sortOrder = sortKeyBetween(previous?.sortOrder ?? null, next?.sortOrder ?? null);
  } catch {
    // Neighbours from different projects can share keys: keep the order as it is.
  }
  return Object.keys(patch).length > 0 ? patch : null;
}
