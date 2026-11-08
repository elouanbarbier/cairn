import { useNavigate, useRouter, useRouterState } from '@tanstack/react-router';
import type { MouseEvent } from 'react';
import type { ViewSearch } from '@/router';

declare module '@tanstack/react-router' {
  interface HistoryState {
    /** Set on history entries that opened the topic panel, so closing it can go back. */
    topicPanel?: boolean;
  }
}

interface TopicTarget {
  projectKey: string;
  ref: string;
}

/**
 * The topic panel slides over the current page. Its state lives in the `topic` search param, while the address bar
 * shows the topic's own URL (`/p/POR/sujets/POR-24`, a route mask): a reload or a shared link opens the full-screen
 * page instead.
 */
export function useTopicPanel() {
  const navigate = useNavigate();
  const router = useRouter();
  const current = useRouterState({
    select: (s) => {
      const value = (s.location.search as ViewSearch).topic;
      return typeof value === 'string' ? value : null;
    },
  });
  const onTopicPage = useRouterState({ select: (s) => s.matches.some((m) => m.routeId === '/p/$key/sujets/$ref') });

  const open = (topic: TopicTarget) => {
    if (onTopicPage) {
      void navigate({ to: '/p/$key/sujets/$ref', params: { key: topic.projectKey, ref: topic.ref } });
      return;
    }
    void navigate({
      to: '.',
      search: (prev: ViewSearch) => ({ ...prev, topic: topic.ref }),
      mask: { to: '/p/$key/sujets/$ref', params: { key: topic.projectKey, ref: topic.ref } },
      // Moving from topic to topic replaces the entry: Back closes the panel in one step.
      replace: current !== null,
      state: { topicPanel: true },
    });
  };

  const close = () => {
    if (router.state.location.state.topicPanel) router.history.back();
    else void navigate({ to: '.', search: (prev: ViewSearch) => ({ ...prev, topic: undefined }), replace: true });
  };

  /** For links to a topic: a plain click opens the panel, a modified click keeps the browser behavior. */
  const onLinkClick = (topic: TopicTarget) => (event: MouseEvent) => {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    )
      return;
    event.preventDefault();
    open(topic);
  };

  return { current, open, close, onLinkClick };
}
