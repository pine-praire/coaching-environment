// firebase-admin для серверных функций. Ключ сервисного аккаунта — только в переменной окружения.
import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

let app: App | undefined;

function adminApp(): App {
  if (app) return app;
  const existing = getApps()[0];
  if (existing) return (app = existing);
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) throw new Error("FIREBASE_SERVICE_ACCOUNT is not set");
  const sa = JSON.parse(raw) as { project_id: string; client_email: string; private_key: string };
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
export const adminAuth = () => getAuth(adminApp());

// Проверяет Firebase ID token и роль admin в user_roles/{uid}. Возвращает uid или null.
export async function verifyAdminToken(
  authHeader: string | null | undefined,
): Promise<string | null> {
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.slice("Bearer ".length).trim();
  if (!token) return null;
  try {
    const decoded = await adminAuth().verifyIdToken(token);
    const role = await adminDb().collection("user_roles").doc(decoded.uid).get();
    return role.exists && role.get("role") === "admin" ? decoded.uid : null;
  } catch {
    return null;
  }
}
