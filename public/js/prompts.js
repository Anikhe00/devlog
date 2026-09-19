// The guided prompts. Copy is framed per cadence; the structure is identical.

export const CADENCES = {
  daily: { name: 'Daily log', noun: 'day', period: 'today', unit: 'day' },
  weekly: { name: 'Weekly log', noun: 'week', period: 'this week', unit: 'week' },
};

export const PROMPTS = [
  {
    key: 'worked_on',
    short: 'Worked on',
    question: { daily: 'What did you work on today?', weekly: 'What did you work on this week?' },
    hint: { daily: 'The main tasks and projects that took your time.', weekly: 'The main projects and threads of the week.' },
    placeholder: {
      daily: 'e.g.\n- Refactored the auth middleware to support refresh tokens\n- Reviewed two PRs (#482, #490)\n- Chased down the flaky checkout test',
      weekly: 'e.g.\n- Finished the billing migration\n- Started the search rewrite (prototype only)\n- Three code reviews, one design sync',
    },
  },
  {
    key: 'learned',
    short: 'Learned',
    question: { daily: 'What did you learn?', weekly: 'What did you learn this week?' },
    hint: { daily: 'New concepts, tools, techniques, gotchas.', weekly: 'Concepts, tools and techniques worth remembering.' },
    placeholder: {
      daily: 'e.g.\n- `useDeferredValue` lowers priority, it does not debounce\n- `git worktree` lets me review a PR without stashing',
      weekly: 'e.g.\n- Postgres partial indexes and when the planner skips them\n- How our feature flags are evaluated at the edge',
    },
  },
  {
    key: 'shipped',
    short: 'Shipped',
    question: { daily: 'What did you ship or achieve?', weekly: 'What did you ship or achieve this week?' },
    hint: { daily: 'Completed, shipped, merged, closed.', weekly: 'Completed, shipped, merged, closed — the wins.' },
    placeholder: {
      daily: 'e.g.\n- Merged #482 (rate limiting)\n- Closed 3 stale bug tickets',
      weekly: 'e.g.\n- Shipped v2.3 to production\n- Merged the rate limiter and closed 6 tickets',
    },
  },
  {
    key: 'blockers',
    short: 'Blockers',
    question: { daily: 'Any blockers or challenges?', weekly: 'Any blockers or challenges this week?' },
    hint: { daily: 'Anything slowing you down. "None" is a fine answer.', weekly: 'What got in the way, and what is still unresolved.' },
    placeholder: {
      daily: 'e.g.\n- Staging DB is out of sync with prod\n- Waiting on design for the empty state',
      weekly: 'e.g.\n- CI is 3x slower since the runner change\n- Unclear ownership of the notifications service',
    },
  },
  {
    key: 'next_steps',
    short: 'Next',
    question: { daily: 'Notes for next time: what is next?', weekly: 'Notes for next week: what is next?' },
    hint: { daily: 'A note to your future self. Where to pick up.', weekly: 'Priorities and loose ends to carry forward.' },
    placeholder: {
      daily: 'e.g.\n- [ ] Pick up the retry logic in `queue.ts`\n- [ ] Ask Sam about the API contract',
      weekly: 'e.g.\n- [ ] Kick off the search rewrite\n- [ ] Write up the billing migration runbook',
    },
  },
];

export const MOODS = ['drained', 'low', 'okay', 'good', 'energised'];

export const TAG_PLACEHOLDER = 'e.g. #frontend #bug #learning';
export const MARKDOWN_HINT = 'Markdown works here: **bold**, `code`, - lists, - [ ] tasks, ```code blocks```.';
