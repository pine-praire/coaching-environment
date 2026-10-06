import { adminDb } from "./firebase-admin.server";
import { MemoryObsRepo } from "./obs-repo.memory";
import { hashPassword, type ObsConfig, type ObsRepo } from "./obs-service";
import type { ObsAnswer } from "@/lib/obs-schema";

const CONFIG = "obs_config";
const CONFIG_DOC = "main";
const RESPONSES = "obs_responses";

const firestoreObsRepo: ObsRepo = {
  async getConfig() {
    const d = await adminDb().collection(CONFIG).doc(CONFIG_DOC).get();
    const data = d.exists ? d.data()! : {};
    return {
      names: data.names ?? null,
      passwordHash: data.passwordHash ?? null,
      open: data.open === true,
    };
  },
  async updateConfig(patch: Partial<ObsConfig>) {
    await adminDb().collection(CONFIG).doc(CONFIG_DOC).set(patch, { merge: true });
  },
  async addResponse(doc: ObsAnswer) {
    await adminDb().collection(RESPONSES).add(doc);
  },
  async listResponses() {
    const snap = await adminDb().collection(RESPONSES).get();
    return snap.docs.map((d) => ({ id: d.id, data: d.data() as ObsAnswer }));
  },
  async deleteResponse(id) {
    const ref = adminDb().collection(RESPONSES).doc(id);
    if (!(await ref.get()).exists) return false;
    await ref.delete();
    return true;
  },
};

// Локальная разработка без ключа сервисного аккаунта: COMM_DEV_MEMORY=1 npm run dev, пароль DEVTEST.
// В production-сборке import.meta.env.DEV = false, и эта ветка вырезается.
const devGlobal = globalThis as { __obsDevRepo?: MemoryObsRepo };

export function obsRepo(): ObsRepo {
  if (import.meta.env.DEV && process.env.COMM_DEV_MEMORY === "1") {
    if (!devGlobal.__obsDevRepo) {
      devGlobal.__obsDevRepo = new MemoryObsRepo();
      devGlobal.__obsDevRepo.config = {
        names: { nom: "Вера", acc: "Веру", dat: "Вере" },
        passwordHash: hashPassword("DEVTEST"),
        open: true,
      };
    }
    return devGlobal.__obsDevRepo;
  }
  return firestoreObsRepo;
}
