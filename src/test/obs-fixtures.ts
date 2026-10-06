// Готовые ответы опроса близких для тестов.
import { ADULT_IDS, CHILD_IDS, OPEN_CHILD_IDS, OPEN_IDS } from "@/lib/obs-survey";
import { toStoredAnswer, type ObsAnswer, type ObsPayload } from "@/lib/obs-schema";

export function obsPayload(opts: { v?: string; child?: boolean; name?: string | null } = {}) {
  const v = opts.v ?? "sometimes";
  const child = opts.child ?? false;
  return {
    version: 1,
    name: opts.name === undefined ? "Мария" : opts.name,
    about: {
      relation: "friend",
      relationOther: null,
      years: 12,
      frequency: "weekly",
      places: ["home", "online"],
      knewAsChild: child ? "yes" : "no",
    },
    start: { threeWords: "умная, прямая, смешная", valued: null },
    scale: Object.fromEntries(ADULT_IDS.map((id) => [id, { v, when: null }])),
    open: Object.fromEntries(OPEN_IDS.map((id) => [id, null])),
    child: child
      ? {
          ages: ["6-12"],
          scale: Object.fromEntries(CHILD_IDS.map((id) => [id, { v }])),
          open: Object.fromEntries(OPEN_CHILD_IDS.map((id) => [id, null])),
        }
      : null,
  };
}

export function obsAnswer(
  opts: Parameters<typeof obsPayload>[0] = {},
  date = "2026-10-01T10:00:00.000Z",
): ObsAnswer {
  return toStoredAnswer(obsPayload(opts) as ObsPayload, new Date(date));
}
