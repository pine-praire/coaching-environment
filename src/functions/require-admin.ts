// Middleware для серверных функций админки: передаёт Firebase ID token и проверяет роль admin.
import { createMiddleware } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { auth } from "@/integrations/firebase/client";
import { verifyAdminToken } from "@/server/firebase-admin.server";

export const requireAdmin = createMiddleware({ type: "function" })
  .client(async ({ next }) => {
    const token = await auth.currentUser?.getIdToken();
    return next({ headers: token ? { Authorization: `Bearer ${token}` } : {} });
  })
  .server(async ({ next }) => {
    const uid = await verifyAdminToken(getRequestHeader("authorization"));
    if (!uid) throw new Error("Forbidden");
    return next();
  });
