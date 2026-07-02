export type ChatMode = "tutor" | "concept" | "free";

export interface ChatRequest {
  mode: ChatMode;
  message: string;
  conversationId?: string;
}
