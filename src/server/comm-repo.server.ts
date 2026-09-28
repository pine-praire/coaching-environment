import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { adminDb } from "./firebase-admin.server";
import { MemoryCommRepo } from "./comm-repo.memory";
import type { CommRepo, StoredResponse, WaveRecord } from "./comm-service";

const WAVES = "comm_waves";
const RESPONSES = "comm_responses";

function toWave(id: string, d: FirebaseFirestore.DocumentData): WaveRecord {
  const created = d.createdAt instanceof Timestamp ? d.createdAt.toMillis() : 0;
  return {
    id,
    name: d.name,
    code: d.code,
    open: d.open === true,
    createdAt: created,
    starred: d.starred ?? {},
  };
}

const firestoreCommRepo: CommRepo = {
  async findWavesByCode(code) {
    const snap = await adminDb().collection(WAVES).where("code", "==", code).get();
    return snap.docs.map((d) => toWave(d.id, d.data()));
  },
  async getWave(id) {
    if (!id || id.includes("/")) return null;
    const d = await adminDb().collection(WAVES).doc(id).get();
    return d.exists ? toWave(d.id, d.data()!) : null;
  },
  async listWaves() {
    const snap = await adminDb().collection(WAVES).get();
    return snap.docs.map((d) => toWave(d.id, d.data()));
  },
  async countResponses(waveId) {
    const agg = await adminDb().collection(RESPONSES).where("waveId", "==", waveId).count().get();
    return agg.data().count;
  },
  async createWave({ name, code, open }) {
    const ref = await adminDb()
      .collection(WAVES)
      .add({ name, code, open, createdAt: FieldValue.serverTimestamp(), starred: {} });
    return ref.id;
  },
  async updateWave(id, patch) {
    await adminDb().collection(WAVES).doc(id).update(patch);
  },
  async addResponse(doc: StoredResponse) {
    // add() даёт случайный автоматический id.
    await adminDb().collection(RESPONSES).add(doc);
  },
  async listResponses(waveId) {
    const snap = await adminDb().collection(RESPONSES).where("waveId", "==", waveId).get();
    return snap.docs.map((d) => ({ id: d.id, data: d.data() as StoredResponse }));
  },
  async setStar(waveId, key, on) {
    await adminDb()
      .collection(WAVES)
      .doc(waveId)
      .update({ [`starred.${key}`]: on ? true : FieldValue.delete() });
  },
};

// Локальная разработка без ключа сервисного аккаунта: COMM_DEV_MEMORY=1 npm run dev.
// В production-сборке import.meta.env.DEV = false, и эта ветка вырезается.
const devGlobal = globalThis as { __commDevRepo?: MemoryCommRepo };

export function commRepo(): CommRepo {
  if (import.meta.env.DEV && process.env.COMM_DEV_MEMORY === "1") {
    if (!devGlobal.__commDevRepo) {
      devGlobal.__commDevRepo = new MemoryCommRepo();
      void devGlobal.__commDevRepo.createWave({
        name: "Local dev run",
        code: "DEVTEST",
        open: true,
      });
    }
    return devGlobal.__commDevRepo;
  }
  return firestoreCommRepo;
}
