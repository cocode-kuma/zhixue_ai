export type StudyMode = "tutor" | "concept" | "free";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
}

export interface ConversationSummary {
  id: string;
  title: string;
  mode: StudyMode;
  createdAt: string;
  updatedAt: string;
}

export interface AiPayload {
  agent: string;
  mode: StudyMode;
  stage: string;
  reply: string;
  question_to_user: string;
  hint_level: number;
  knowledge_points: string[];
  actions: {
    save_wrong_question: boolean;
    create_review_task: boolean;
    recommend_concept_learning: boolean;
  };
  safety: {
    direct_answer_leak: boolean;
    cheating_risk: boolean;
    needs_human_attention: boolean;
  };
}

export interface WrongQuestion {
  id: string;
  title: string;
  reason: string;
  knowledgePoint: string;
  status?: string;
  createdAt: string;
  reviewDue: string;
  attempts: number;
  correctStreak?: number;
}

export interface StudyStats {
  learnedMinutes: number;
  solvedCount: number;
  wrongCount: number;
  streakDays: number;
}

export interface UserProfile {
  id: string;
  email: string;
  name: string;
  grade: string;
  role: "student" | "teacher" | "parent" | "admin";
  avatarUrl?: string;
}

export interface KnowledgeCard {
  id: string;
  title: string;
  definition: string;
  keyPoints: string;
  mistakes: string;
  related: string;
  createdAt: string;
}

export interface KnowledgeNode {
  id: string;
  subject: string;
  gradeBand: string;
  title: string;
  description: string;
  status: "not_started" | "learning" | "mastered";
  mastery: number;
}

export interface KnowledgeEdge {
  id: string;
  fromNodeId: string;
  toNodeId: string;
  relation: string;
}
