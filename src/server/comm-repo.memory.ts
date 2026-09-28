// Хранилище в памяти: для тестов и локальной разработки без доступа к Firestore.
import { randomBytes } from "node:crypto";
import type { CommRepo, StoredResponse, WaveRecord } from "./comm-service";

export class MemoryCommRepo implements CommRepo {
  waves = new Map<string, WaveRecord>();
  responses = new Map<string, StoredResponse>();
  private seq = 0;

  async findWavesByCode(code: string) {
    return [...this.waves.values()].filter((w) => w.code === code);
  }
  async getWave(id: string) {
    return this.waves.get(id) ?? null;
  }
  async listWaves() {
    return [...this.waves.values()];
  }
  async countResponses(waveId: string) {
    return [...this.responses.values()].filter((r) => r.waveId === waveId).length;
  }
  async createWave(data: { name: string; code: string; open: boolean }) {
    const id = randomBytes(10).toString("hex");
    this.waves.set(id, { id, ...data, createdAt: ++this.seq, starred: {} });
    return id;
  }
  async updateWave(id: string, patch: Partial<Pick<WaveRecord, "name" | "code" | "open">>) {
    this.waves.set(id, { ...this.waves.get(id)!, ...patch });
  }
  async addResponse(doc: StoredResponse) {
    this.responses.set(randomBytes(10).toString("hex"), structuredClone(doc));
  }
  async listResponses(waveId: string) {
    return [...this.responses.entries()]
      .filter(([, d]) => d.waveId === waveId)
      .map(([id, data]) => ({ id, data }));
  }
  async setStar(waveId: string, key: string, on: boolean) {
    const w = this.waves.get(waveId)!;
    if (on) w.starred[key] = true;
    else delete w.starred[key];
  }
}
