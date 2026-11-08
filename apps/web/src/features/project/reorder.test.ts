import type { TopicStatus, TopicSummary } from '@cairn/shared';
import { describe, expect, it } from 'vitest';
import { planListDrop } from './reorder';

function topic(id: string, status: TopicStatus, sortOrder: string, subprojectId: string | null = 's1'): TopicSummary {
  return {
    id,
    ref: `POR-${id}`,
    number: 1,
    projectId: 'p1',
    projectKey: 'POR',
    projectName: 'Portail',
    projectColor: '#6366F1',
    subprojectId,
    subprojectName: null,
    title: id,
    status,
    priority: 'none',
    dueDate: null,
    assignee: null,
    labels: [],
    checklist: { done: 0, total: 0 },
    sortOrder,
    createdAt: '2026-11-01T00:00:00.000Z',
    lastActivityAt: '2026-11-01T00:00:00.000Z',
    completedAt: null,
    waitingSince: null,
  };
}

const a = topic('a', 'todo', 'a0');
const b = topic('b', 'todo', 'a1');
const c = topic('c', 'todo', 'a2');
const todo = [a, b, c];

describe('planListDrop', () => {
  it('moves a row down and up within its group', () => {
    const down = planListDrop({
      topic: a,
      group: 'status',
      targetKey: 'todo',
      targetTopics: todo,
      overId: 'c',
      below: false,
    });
    expect(down?.sortOrder && down.sortOrder > 'a2').toBe(true);
    expect(down?.status).toBeUndefined();

    const up = planListDrop({
      topic: c,
      group: 'status',
      targetKey: 'todo',
      targetTopics: todo,
      overId: 'a',
      below: true,
    });
    expect(up?.sortOrder && up.sortOrder < 'a0').toBe(true);
  });

  it('does nothing when the row stays in place', () => {
    expect(
      planListDrop({ topic: b, group: 'status', targetKey: 'todo', targetTopics: todo, overId: 'b', below: false }),
    ).toBeNull();
  });

  it('changes the status when dropped in another status group, where the pointer is', () => {
    const doing = [topic('d', 'in_progress', 'a0'), topic('e', 'in_progress', 'a1')];
    const patch = planListDrop({
      topic: a,
      group: 'status',
      targetKey: 'in_progress',
      targetTopics: doing,
      overId: 'd',
      below: true,
    });
    expect(patch?.status).toBe('in_progress');
    expect(patch?.sortOrder && patch.sortOrder > 'a0' && patch.sortOrder < 'a1').toBe(true);
  });

  it('goes last when dropped on a group itself', () => {
    const patch = planListDrop({
      topic: a,
      group: 'status',
      targetKey: 'waiting',
      targetTopics: [topic('w', 'waiting', 'a5')],
      overId: null,
      below: false,
    });
    expect(patch).toMatchObject({ status: 'waiting' });
    expect(patch?.sortOrder && patch.sortOrder > 'a5').toBe(true);
  });

  it('moves to another subproject and keeps the status', () => {
    const other = [topic('x', 'todo', 'a0', 's2')];
    const patch = planListDrop({
      topic: a,
      group: 'subproject',
      targetKey: 's2',
      targetTopics: other,
      overId: 'x',
      below: false,
    });
    expect(patch?.subprojectId).toBe('s2');
    expect(patch?.status).toBeUndefined();
    expect(
      planListDrop({ topic: a, group: 'subproject', targetKey: 'none', targetTopics: [], overId: null, below: false }),
    ).toMatchObject({
      subprojectId: null,
    });
  });

  it('places a row among its own status when dropped next to another status', () => {
    const mixed = [topic('i', 'in_progress', 'a0'), a, b, topic('k', 'backlog', 'a0')];
    // Over a backlog row (listed after To do): last of the To do rows.
    const last = planListDrop({
      topic: a,
      group: 'subproject',
      targetKey: 's1',
      targetTopics: mixed,
      overId: 'k',
      below: false,
    });
    expect(last?.sortOrder && last.sortOrder > 'a1').toBe(true);
    // Over an in-progress row (listed before To do): first of them.
    const first = planListDrop({
      topic: b,
      group: 'subproject',
      targetKey: 's1',
      targetTopics: mixed,
      overId: 'i',
      below: false,
    });
    expect(first?.sortOrder && first.sortOrder < 'a0').toBe(true);
  });
});
