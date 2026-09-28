// firebase-admin для серверных функций. Ключ сервисного аккаунта — только в переменной окружения.
// firebase-admin/auth не используется: он не загружается в функциях Vercel (см. firebase-id-token.ts).
import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { verifyFirebaseIdToken } from "./firebase-id-token";

let app: App | undefined;

interface ServiceAccount {
  project_id: string;
  client_email: string;
  private_key: string;
}

function serviceAccount(): ServiceAccount {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) throw new Error("FIREBASE_SERVICE_ACCOUNT is not set");
  return JSON.parse(raw) as ServiceAccount;
}

function adminApp(): App {
  if (app) return app;
  const existing = getApps()[0];
  if (existing) return (app = existing);
  const sa = serviceAccount();
  app = initializeApp({
    credential: cert({
      projectId: sa.project_id,
      clientEmail: sa.client_email,
      privateKey: sa.private_key,
    }),
  });
  return app;
}

export const adminDb = () => getFirestore(adminApp());

// Проверяет Firebase ID token и роль admin в user_roles/{uid}. Возвращает uid или null.
export async function verifyAdminToken(
  authHeader: string | null | undefined,
): Promise<string | null> {
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.slice("Bearer ".length).trim();
  if (!token) return null;
  try {
    const uid = await verifyFirebaseIdToken(token, serviceAccount().project_id);
    if (!uid) return null;
    const role = await adminDb().collection("user_roles").doc(uid).get();
    return role.exists && role.get("role") === "admin" ? uid : null;
  } catch (err) {
    // Сам токен в лог не пишем.
    console.error(
      "[comm] admin check failed:",
      err instanceof Error ? err.message : "unknown error",
    );
    return null;
  }
}
