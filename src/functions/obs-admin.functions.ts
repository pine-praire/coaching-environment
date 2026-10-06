// Серверные функции дашборда /admin/blizkie. Каждая проверяет Firebase ID token и роль admin.
import { createServerFn } from "@tanstack/react-start";
import { obsRepo } from "@/server/obs-repo.server";
import * as svc from "@/server/obs-service";
import { requireAdmin } from "./require-admin";

const input = <T>(d: unknown) => (d ?? {}) as T;

export const getObsSettingsFn = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .handler(() => svc.getSettings(obsRepo()));

export const updateObsSettingsFn = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((d: unknown) => input<{ names?: unknown; password?: unknown; open?: unknown }>(d))
  .handler(({ data }) =>
    svc.updateSettings(obsRepo(), { names: data.names, password: data.password, open: data.open }),
  );

export const listObsResponsesFn = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .handler(() => svc.listResponses(obsRepo()));

export const deleteObsResponseFn = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((d: unknown) => input<{ id?: unknown }>(d))
  .handler(({ data }) => svc.deleteResponse(obsRepo(), data.id));
