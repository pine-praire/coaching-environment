// Серверные функции дашборда /admin/blizkie. Каждая проверяет Firebase ID token и роль admin.
import { createServerFn } from "@tanstack/react-start";
import { obsRepo } from "@/server/obs-repo.server";
import * as svc from "@/server/obs-service";
import { requireAdmin } from "./require-admin";

const input = <T>(d: unknown) => (d ?? {}) as T;

export const listObsSurveysFn = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .handler(() => svc.listSurveys(obsRepo()));

export const createObsSurveyFn = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((d: unknown) => input<{ subject?: unknown; password?: unknown }>(d))
  .handler(({ data }) => svc.createSurvey(obsRepo(), data.subject, data.password));

export const updateObsSurveyFn = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((d: unknown) =>
    input<{ surveyId?: unknown; subject?: unknown; password?: unknown; open?: unknown }>(d),
  )
  .handler(({ data }) =>
    svc.updateSurvey(obsRepo(), data.surveyId, {
      subject: data.subject,
      password: data.password,
      open: data.open,
    }),
  );

export const deleteObsSurveyFn = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((d: unknown) => input<{ surveyId?: unknown }>(d))
  .handler(({ data }) => svc.deleteSurvey(obsRepo(), data.surveyId));

export const listObsResponsesFn = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((d: unknown) => input<{ surveyId?: unknown }>(d))
  .handler(({ data }) => svc.listResponses(obsRepo(), data.surveyId));

export const deleteObsResponseFn = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((d: unknown) => input<{ id?: unknown }>(d))
  .handler(({ data }) => svc.deleteResponse(obsRepo(), data.id));
