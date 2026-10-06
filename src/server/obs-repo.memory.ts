// Хранилище в памяти: для тестов и локальной разработки без доступа к Firestore.
import { randomBytes } from "node:crypto";
import type { ObsAnswer } from "@/lib/obs-schema";
import type { ObsRepo, SurveyPatch, SurveyRecord } from "./obs-service";

export class MemoryObsRepo implements ObsRepo {
  surveys = new Map<string, SurveyRecord>();
  responses = new Map<string, { surveyId: string; data: ObsAnswer }>();
  private seq = 0;

  async listSurveys() {
    return [...this.surveys.values()].map((s) => structuredClone(s));
  }
  async getSurvey(id: string) {
    const s = this.surveys.get(id);
    return s ? structuredClone(s) : null;
  }
  async createSurvey(data: Omit<SurveyRecord, "id" | "createdAt">) {
    const id = randomBytes(10).toString("hex");
    this.surveys.set(id, { id, ...structuredClone(data), createdAt: ++this.seq });
    return id;
  }
  async updateSurvey(id: string, patch: SurveyPatch) {
    this.surveys.set(id, { ...this.surveys.get(id)!, ...structuredClone(patch) });
  }
  async deleteSurvey(id: string) {
    for (const [key, r] of this.responses) if (r.surveyId === id) this.responses.delete(key);
    this.surveys.delete(id);
  }
  async countResponses(surveyId: string) {
    return [...this.responses.values()].filter((r) => r.surveyId === surveyId).length;
  }
  async addResponse(surveyId: string, doc: ObsAnswer) {
    this.responses.set(randomBytes(10).toString("hex"), { surveyId, data: structuredClone(doc) });
  }
  async listResponses(surveyId: string) {
    return [...this.responses.entries()]
      .filter(([, r]) => r.surveyId === surveyId)
      .map(([id, r]) => ({ id, data: structuredClone(r.data) }));
  }
  async deleteResponse(id: string) {
    return this.responses.delete(id);
  }
}
