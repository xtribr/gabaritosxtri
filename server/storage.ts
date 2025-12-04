import { randomUUID } from "crypto";
import type { StudentData, ProcessingSession, ProcessedPage } from "@shared/schema";

export interface IStorage {
  createSession(fileName: string, totalPages: number): Promise<ProcessingSession>;
  updateSession(id: string, updates: Partial<ProcessingSession>): Promise<ProcessingSession | undefined>;
  getSession(id: string): Promise<ProcessingSession | undefined>;
  addStudentToSession(sessionId: string, student: StudentData): Promise<void>;
}

export class MemStorage implements IStorage {
  private sessions: Map<string, ProcessingSession>;

  constructor() {
    this.sessions = new Map();
  }

  async createSession(fileName: string, totalPages: number): Promise<ProcessingSession> {
    const id = randomUUID();
    const session: ProcessingSession = {
      id,
      fileName,
      totalPages,
      processedPages: 0,
      status: "uploading",
      pages: [],
      createdAt: new Date().toISOString(),
    };
    this.sessions.set(id, session);
    return session;
  }

  async updateSession(id: string, updates: Partial<ProcessingSession>): Promise<ProcessingSession | undefined> {
    const session = this.sessions.get(id);
    if (!session) return undefined;
    
    const updated = { ...session, ...updates };
    this.sessions.set(id, updated);
    return updated;
  }

  async getSession(id: string): Promise<ProcessingSession | undefined> {
    return this.sessions.get(id);
  }

  async addStudentToSession(sessionId: string, student: StudentData): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    const pageIndex = session.pages.findIndex(p => p.pageNumber === student.pageNumber);
    if (pageIndex >= 0) {
      session.pages[pageIndex].students.push(student);
    } else {
      session.pages.push({
        pageNumber: student.pageNumber,
        status: "completed",
        students: [student],
      });
    }
    this.sessions.set(sessionId, session);
  }
}

export const storage = new MemStorage();
