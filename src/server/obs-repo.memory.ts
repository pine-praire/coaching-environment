// Хранилище в памяти: для тестов и локальной разработки без доступа к Firestore.
import { randomBytes } from "node:crypto";
import type { ObsAnswer } from "@/lib/obs-schema";
import type { ObsConfig, ObsRepo } from "./obs-service";

export class MemoryObsRepo implements ObsRepo {
  config: ObsConfig = { names: null, passwordHash: null, open: false };
  responses = new Map<string, ObsAnswer>();

  async getConfig() {
    return structuredClone(this.config);
  }
  async updateConfig(patch: Partial<ObsConfig>) {
    this.config = { ...this.config, ...structuredClone(patch) };
  }
  async addResponse(doc: ObsAnswer) {
    this.responses.set(randomBytes(10).toString("hex"), structuredClone(doc));
  }
  async listResponses() {
    return [...this.responses.entries()].map(([id, data]) => ({ id, data: structuredClone(data) }));
  }
  async deleteResponse(id: string) {
    return this.responses.delete(id);
  }
}
