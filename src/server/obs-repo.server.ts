import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { adminDb } from "./firebase-admin.server";
import { MemoryObsRepo } from "./obs-repo.memory";
import type { ObsRepo, SurveyPatch, SurveyRecord } from "./obs-service";
import type { ObsAnswer } from "@/lib/obs-schema";

const SURVEYS = "obs_surveys";
const RESPONSES = "obs_responses";
// Первая версия хранила один опрос в obs_config/main, а ответы — без surveyId.
const LEGACY_CONFIG = "obs_config";
const LEGACY_SURVEY_ID = "main";

function toSurvey(id: string, d: FirebaseFirestore.DocumentData): SurveyRecord {
  return {
    id,
    subject: d.subject,
    password: d.password ?? null,
    passwordHash: d.passwordHash ?? null,
    open: d.open === true,
    createdAt: d.createdAt instanceof Timestamp ? d.createdAt.toMillis() : 0,
  };
}

// Переносит данные первой версии: obs_config/main становится опросом obs_surveys/main (женский род,
// прежний пароль продолжает работать по хешу), ответам без surveyId проставляется "main".
// Повторный запуск ничего не меняет. Выполняется один раз на экземпляр сервера.
let legacyChecked: Promise<void> | null = null;

async function migrateLegacy() {
  const db = adminDb();
  const legacyRef = db.collection(LEGACY_CONFIG).doc("main");
  const legacy = await legacyRef.get();
  if (!legacy.exists) return;
  const d = legacy.data()!;
  const target = db.collection(SURVEYS).doc(LEGACY_SURVEY_ID);
  if (d.names && !(await target.get()).exists) {
    await target.set({
      subject: { ...d.names, gender: "f" },
      password: null,
      passwordHash: d.passwordHash ?? null,
      open: d.open === true,
      createdAt: FieldValue.serverTimestamp(),
    });
  }
  const snap = await db.collection(RESPONSES).get();
  const orphans = snap.docs.filter((doc) => !doc.get("surveyId"));
  for (let i = 0; i < orphans.length; i += 400) {
    const batch = db.batch();
    orphans
      .slice(i, i + 400)
      .forEach((doc) => batch.update(doc.ref, { surveyId: LEGACY_SURVEY_ID }));
    await batch.commit();
  }
  await legacyRef.delete();
}

function ready() {
  legacyChecked ??= migrateLegacy().catch((err) => {
    legacyChecked = null; // повторить при следующем запросе
    throw err;
  });
  return legacyChecked;
}

const firestoreObsRepo: ObsRepo = {
  async listSurveys() {
    await ready();
    const snap = await adminDb().collection(SURVEYS).get();
    return snap.docs.map((d) => toSurvey(d.id, d.data()));
  },
  async getSurvey(id) {
    if (!id || id.includes("/")) return null;
    await ready();
    const d = await adminDb().collection(SURVEYS).doc(id).get();
    return d.exists ? toSurvey(d.id, d.data()!) : null;
  },
  async createSurvey(data) {
    const ref = await adminDb()
      .collection(SURVEYS)
      .add({ ...data, createdAt: FieldValue.serverTimestamp() });
    return ref.id;
  },
  async updateSurvey(id, patch: SurveyPatch) {
    await adminDb().collection(SURVEYS).doc(id).update(patch);
  },
  async deleteSurvey(id) {
    // Сначала ответы, опрос последним: если удаление прервётся, опрос останется в списке.
    const db = adminDb();
    for (;;) {
      const snap = await db.collection(RESPONSES).where("surveyId", "==", id).limit(400).get();
      if (snap.empty) break;
      const batch = db.batch();
      snap.docs.forEach((d) => batch.delete(d.ref));
      await batch.commit();
    }
    await db.collection(SURVEYS).doc(id).delete();
  },
  async countResponses(surveyId) {
    const agg = await adminDb()
      .collection(RESPONSES)
      .where("surveyId", "==", surveyId)
      .count()
      .get();
    return agg.data().count;
  },
  async addResponse(surveyId, doc: ObsAnswer) {
    await adminDb()
      .collection(RESPONSES)
      .add({ ...doc, surveyId });
  },
  async listResponses(surveyId) {
    await ready();
    const snap = await adminDb().collection(RESPONSES).where("surveyId", "==", surveyId).get();
    return snap.docs.map((d) => {
      const { surveyId: _omit, ...data } = d.data();
      return { id: d.id, data: data as ObsAnswer };
    });
  },
  async deleteResponse(id) {
    const ref = adminDb().collection(RESPONSES).doc(id);
    if (!(await ref.get()).exists) return false;
    await ref.delete();
    return true;
  },
};

// Локальная разработка без ключа сервисного аккаунта: COMM_DEV_MEMORY=1 npm run dev.
// Два опроса: пароль DEVTEST (женский род) и DEVTEST-M (мужской).
// В production-сборке import.meta.env.DEV = false, и эта ветка вырезается.
const devGlobal = globalThis as { __obsDevRepo?: MemoryObsRepo };

export function obsRepo(): ObsRepo {
  if (import.meta.env.DEV && process.env.COMM_DEV_MEMORY === "1") {
    if (!devGlobal.__obsDevRepo) {
      const repo = new MemoryObsRepo();
      void repo.createSurvey({
        subject: { nom: "Вера", acc: "Веру", dat: "Вере", gender: "f" },
        password: "DEVTEST",
        passwordHash: null,
        open: true,
      });
      void repo.createSurvey({
        subject: { nom: "Олег", acc: "Олега", dat: "Олегу", gender: "m" },
        password: "DEVTEST-M",
        passwordHash: null,
        open: true,
      });
      devGlobal.__obsDevRepo = repo;
    }
    return devGlobal.__obsDevRepo;
  }
  return firestoreObsRepo;
}
