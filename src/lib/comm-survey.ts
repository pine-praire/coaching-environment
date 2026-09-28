// Communication Debugger: структура опроса. Общая для страницы /comm, дашборда и сервера.
// Тексты вычитаны — не менять.

export interface CommQuestion {
  n: number;
  text: string;
}

export interface CommZone {
  id: string;
  title: string;
  questions: CommQuestion[];
}

export interface CommQuickOption {
  id: string;
  label: string;
}

export interface CommOpenQuestion {
  n: number;
  id: OpenId;
  text: string;
  hint?: string;
}

export const SCALE = [
  { v: 1, label: "almost never" },
  { v: 2, label: "rarely" },
  { v: 3, label: "sometimes" },
  { v: 4, label: "often" },
  { v: 5, label: "very often / systematically" },
] as const;

export const ZONES: CommZone[] = [
  {
    id: "clarity",
    title: "Clarity of messages and tasks",
    questions: [
      {
        n: 1,
        text: "I have to guess what exactly is expected of me after a work message or request.",
      },
      { n: 2, text: "A task or message lacks the context needed to understand why it matters." },
      {
        n: 3,
        text: "Phrases like “ASAP”, “ideally today”, “when you have time” or “take a look” mean different things to different people.",
      },
      {
        n: 4,
        text: "Important requirements come to light after the work has started, even though they could have been stated upfront.",
      },
      { n: 5, text: "It is not always clear what exactly counts as a finished result." },
    ],
  },
  {
    id: "priorities",
    title: "Priorities and urgency",
    questions: [
      { n: 6, text: "It can be hard for me to tell how urgent a task really is." },
      {
        n: 7,
        text: "Several tasks arrive at the same time as “important” or “urgent”, and it is unclear which one takes priority.",
      },
      { n: 8, text: "A message does not always make clear when I am expected to reply or act." },
      {
        n: 9,
        text: "Sometimes urgency has to be inferred from the tone of a message, the number of pings or the sender’s position, rather than from a clearly stated deadline.",
      },
    ],
  },
  {
    id: "channels",
    title: "Communication channels",
    questions: [
      {
        n: 10,
        text: "Important information ends up scattered across Slack/Teams, Jira, email, calls, direct messages and other channels.",
      },
      { n: 11, text: "It is sometimes unclear which channel to use for a particular question." },
      {
        n: 12,
        text: "Decisions made verbally or in a meeting are sometimes not properly recorded anywhere.",
      },
      {
        n: 13,
        text: "I have to search for or reconstruct context that was already discussed somewhere earlier.",
      },
    ],
  },
  {
    id: "clarifying",
    title: "Clarifying and asking questions",
    questions: [
      {
        n: 14,
        text: "I sometimes start working with an incomplete understanding of the task instead of clarifying it right away.",
      },
      {
        n: 15,
        text: "Asking a clarifying question is sometimes harder than simply making an assumption.",
      },
      { n: 16, text: "The team has “I thought it was obvious” situations." },
      {
        n: 17,
        text: "After a discussion, people sometimes leave with different understandings of what was agreed.",
      },
    ],
  },
  {
    id: "feedback",
    title: "Feedback and disagreement",
    questions: [
      {
        n: 18,
        text: "In feedback or code review it can be hard to tell whether something is a required change, a suggestion, a question or a personal preference.",
      },
      {
        n: 19,
        text: "Some messages are so blunt that the content gets lost behind the reaction to the tone.",
      },
      {
        n: 20,
        text: "Other messages, on the contrary, are so cautious or indirect that it is unclear what the person actually wants.",
      },
      {
        n: 21,
        text: "Disagreements sometimes drag on longer than necessary because it is unclear who makes the final decision and how.",
      },
    ],
  },
  {
    id: "meetings",
    title: "Meetings and real-time communication",
    questions: [
      {
        n: 22,
        text: "In meetings it is not always clear what decision should be made by the end.",
      },
      {
        n: 23,
        text: "Some issues are discussed on a call even though they could have been resolved asynchronously.",
      },
      { n: 24, text: "After a meeting it can be unclear who does what next." },
      {
        n: 25,
        text: "Stating a position quickly during a meeting sometimes matters more than thinking it through well.",
      },
      {
        n: 26,
        text: "Discussions are sometimes dominated by a few of the most active participants, and some useful information goes unsaid.",
      },
    ],
  },
  {
    id: "interruptions",
    title: "Interruptions and availability",
    questions: [
      {
        n: 27,
        text: "Messages and pings regularly interrupt my work, even when an immediate reply is not needed.",
      },
      {
        n: 28,
        text: "It can be unclear when it is fine to wait for a reply and when I should follow up.",
      },
      {
        n: 29,
        text: "There is sometimes an unspoken expectation to be available faster than the work actually requires.",
      },
      {
        n: 30,
        text: "To get a reply, I sometimes have to message a person again or through another channel.",
      },
    ],
  },
  {
    id: "repair",
    title: "When something goes wrong",
    questions: [
      {
        n: 31,
        text: "After a misunderstanding, we spend more time discussing who should have understood what than quickly restoring a shared understanding.",
      },
      { n: 32, text: "Communication mistakes tend to repeat." },
      {
        n: 33,
        text: "Under pressure (a deadline, an incident, an urgent release) communication becomes noticeably less clear.",
      },
      {
        n: 34,
        text: "When the situation changes, it is not always clear who should tell everyone else.",
      },
    ],
  },
];

export const QUESTION_COUNT = 34;

export const QUICK_MAX = 3;
export const QUICK: CommQuickOption[] = [
  { id: "unclear_tasks", label: "Unclear tasks" },
  { id: "missing_context", label: "Missing context" },
  { id: "unclear_deadlines", label: "Unclear deadlines" },
  { id: "everything_urgent", label: "Everything is “urgent”" },
  { id: "too_many_pings", label: "Too many messages and pings" },
  { id: "lost_between_channels", label: "Information gets lost between channels" },
  { id: "too_many_meetings", label: "Too many meetings" },
  { id: "decisions_not_recorded", label: "Decisions are not recorded well enough" },
  { id: "hard_to_ask", label: "It is hard to ask clarifying questions" },
  { id: "review_feedback", label: "Code review / feedback" },
  { id: "disagreements", label: "Disagreements and arguments" },
  { id: "unclear_decider", label: "Unclear who makes the decision" },
  { id: "incidents", label: "Communication during incidents / crunch time" },
  { id: "same_words_diff_meaning", label: "People understand the same phrases differently" },
  { id: "other", label: "Other" },
];
export const QUICK_IDS = QUICK.map((o) => o.id);
export const QUICK_LABEL: Record<string, string> = Object.fromEntries(
  QUICK.map((o) => [o.id, o.label]),
);

export const OPEN_IDS = ["ambiguous_phrase", "where_it_breaks", "one_rule"] as const;
export type OpenId = (typeof OPEN_IDS)[number];

export const OPEN: CommOpenQuestion[] = [
  {
    n: 35,
    id: "ambiguous_phrase",
    text: "Which work phrase or wording in our team do you find especially ambiguous?",
    hint: "For example: “urgent”, “later”, “take a look”, “small task”, “let’s discuss”.",
  },
  {
    n: 36,
    id: "where_it_breaks",
    text: "In what situation does communication in our team most often start to break down?",
  },
  {
    n: 37,
    id: "one_rule",
    text: "If you could change ONE communication rule in the team, what would you change?",
  },
];

export const QUICK_OTHER_MAX = 300;
export const OPEN_MAX = 2000;

// Дашборд: ниже порога показывается только число ответов. По решению Sasha результаты видны
// с первого ответа (изначально было 5 — защита от угадывания автора при малом числе ответов).
export const THRESHOLD = 1;
// «Команда расходится»: не меньше этой доли ответили 1–2 И не меньше этой доли ответили 4–5.
export const SPLIT_SHARE = 0.25;
