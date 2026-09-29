// Серверные функции дашборда /admin/communication. Каждая проверяет Firebase ID token и роль admin.
import { createMiddleware, createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { auth } from "@/integrations/firebase/client";
import { commRepo } from "@/server/comm-repo.server";
import { verifyAdminToken } from "@/server/firebase-admin.server";
import * as svc from "@/server/comm-service";

const requireAdmin = createMiddleware({ type: "function" })
  .client(async ({ next }) => {
    const token = await auth.currentUser?.getIdToken();
    return next({ headers: token ? { Authorization: `Bearer ${token}` } : {} });
  })
  .server(async ({ next }) => {
    const uid = await verifyAdminToken(getRequestHeader("authorization"));
    if (!uid) throw new Error("Forbidden");
    return next();
  });

const input = <T>(d: unknown) => (d ?? {}) as T;

export const listWavesFn = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .handler(() => svc.listWaves(commRepo()));

export const createWaveFn = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((d: unknown) => input<{ name?: unknown; code?: unknown }>(d))
  .handler(({ data }) => svc.createWave(commRepo(), data.name, data.code));

export const updateWaveFn = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((d: unknown) =>
    input<{ waveId?: unknown; name?: unknown; code?: unknown; open?: unknown }>(d),
  )
  .handler(({ data }) =>
    svc.updateWave(commRepo(), data.waveId, { name: data.name, code: data.code, open: data.open }),
  );

export const deleteWaveFn = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((d: unknown) => input<{ waveId?: unknown }>(d))
  .handler(({ data }) => svc.deleteWave(commRepo(), data.waveId));

export const getWaveResultsFn = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((d: unknown) => input<{ waveId?: unknown }>(d))
  .handler(({ data }) => svc.getWaveResults(commRepo(), data.waveId));

export const setStarFn = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((d: unknown) => input<{ waveId?: unknown; key?: unknown; starred?: unknown }>(d))
  .handler(({ data }) => svc.setStar(commRepo(), data.waveId, data.key, data.starred));
