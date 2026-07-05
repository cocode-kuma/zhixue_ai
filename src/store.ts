import { create } from "zustand";
import {
  bootstrap,
  clearToken,
  createConversation,
  createWrongQuestion,
  deleteConversation,
  generateKnowledgeCard,
  generateQuiz,
  generateStudyPlan,
  getToken,
  listConversations,
  loadConversation,
  login,
  masterWrongQuestion,
  register,
  streamChatMessage,
  setToken
} from "./api";
import type { ChatMessage, ConversationSummary, KnowledgeCard, StudyMode, StudyStats, UserProfile, WrongQuestion } from "./types";

type StreamDoneResult = {
  conversationId: string;
  message: ChatMessage;
  wrongQuestion: WrongQuestion | null;
  stats: StudyStats;
};

interface StudyState {
  user: UserProfile | null;
  authReady: boolean;
  authMode: "login" | "register";
  authError: string;
  conversationId: string;
  conversations: ConversationSummary[];
  view:
    | "dashboard"
    | "tutor"
    | "review"
    | "quiz"
    | "assignments"
    | "reports"
    | "plan"
    | "goals"
    | "cards"
    | "ocr"
    | "map"
    | "parent"
    | "teacher"
    | "admin"
    | "about"
    | "settings";
  mode: StudyMode;
  input: string;
  drafts: Record<string, string>;
  loading: boolean;
  pendingTask: "" | "chat" | "card" | "plan" | "quiz";
  chatLoadingConversationId: string;
  chatLoadingRequestId: string;
  chatLoadingByConversationId: Record<string, string>;
  unreadConversationIds: Record<string, string>;
  error: string;
  messages: ChatMessage[];
  wrongQuestions: WrongQuestion[];
  knowledgeCards: KnowledgeCard[];
  generatedPlan: {
    summary?: string;
    weakness_analysis?: Array<{ point: string; evidence: string; priority: string }>;
    daily_plan?: Array<{ day: string; concept: string; practice: string; review: string; minutes: number }>;
    review_plan?: string[];
    acceptance_checks?: string[];
    tasks?: unknown[];
    milestones?: unknown[];
  } | null;
  generatedQuiz:
    | {
        id?: string;
        title?: string;
        questions?: Array<{ type: string; question: string; answer: string; knowledge_point: string }>;
      }
    | null;
  stats: StudyStats;
  setAuthMode: (mode: "login" | "register") => void;
  registerUser: (payload: { email: string; password: string; name: string; grade: string; role: UserProfile["role"] }) => Promise<void>;
  loginUser: (payload: { email: string; password: string }) => Promise<void>;
  logout: () => void;
  loadInitialData: () => Promise<void>;
  setView: (view: StudyState["view"]) => void;
  newConversation: (mode?: StudyMode) => Promise<void>;
  beginConversationWithInput: (mode: StudyMode, input: string) => Promise<void>;
  selectConversation: (id: string) => Promise<void>;
  removeConversation: (id: string) => Promise<void>;
  setMode: (mode: StudyMode) => void;
  setInput: (input: string) => void;
  refreshConversations: () => Promise<void>;
  sendMessage: () => Promise<void>;
  markConversationRead: (id: string) => void;
  markWrongMastered: (id: string) => void;
  addManualWrong: () => void;
  createKnowledgeCard: (concept: string) => Promise<void>;
  createStudyPlan: (payload: {
    grade: string;
    subject: string;
    currentScore: number;
    targetScore: number;
    selfWeakness: string;
  }) => Promise<void>;
  createQuiz: (payload: { subject: string; topic: string; questionCount: number }) => Promise<void>;
}

function now() {
  return new Date().toISOString();
}

function id(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function removeRecordKey<T>(record: Record<string, T>, key: string) {
  if (!key || !(key in record)) return record;
  const next = { ...record };
  delete next[key];
  return next;
}

function modeTitle(mode: StudyMode) {
  if (mode === "concept") return "概念学习";
  if (mode === "free") return "学习问答";
  return "引导讲题";
}

const welcomeMessage: ChatMessage = {
  id: "assistant_welcome",
  role: "assistant",
  content:
    "你好，我是智学AI。把题目、概念或你卡住的地方发给我，我会一步步带你想，不会直接把答案塞给你。",
  createdAt: now()
};

export const useStudyStore = create<StudyState>((set, get) => ({
  user: null,
  authReady: false,
  authMode: "login",
  authError: "",
  conversationId: "",
  conversations: [],
  view: "dashboard",
  mode: "tutor",
  input: "",
  drafts: {},
  loading: false,
  pendingTask: "",
  chatLoadingConversationId: "",
  chatLoadingRequestId: "",
  chatLoadingByConversationId: {},
  unreadConversationIds: {},
  error: "",
  messages: [welcomeMessage],
  wrongQuestions: [],
  knowledgeCards: [],
  generatedPlan: null,
  generatedQuiz: null,
  stats: {
    learnedMinutes: 0,
    solvedCount: 0,
    wrongCount: 0,
    streakDays: 1
  },
  setAuthMode: (authMode) => set({ authMode, authError: "" }),
  registerUser: async (payload) => {
    set({ loading: true, pendingTask: "", authError: "" });
    try {
      const result = await register(payload);
      setToken(result.token);
      set({ user: result.user, loading: false, pendingTask: "", authReady: true });
      await get().loadInitialData();
    } catch (error) {
      set({ loading: false, pendingTask: "", authError: error instanceof Error ? error.message : "注册失败" });
    }
  },
  loginUser: async (payload) => {
    set({ loading: true, pendingTask: "", authError: "" });
    try {
      const result = await login(payload);
      setToken(result.token);
      set({ user: result.user, loading: false, pendingTask: "", authReady: true });
      await get().loadInitialData();
    } catch (error) {
      set({ loading: false, pendingTask: "", authError: error instanceof Error ? error.message : "登录失败" });
    }
  },
  logout: () => {
    clearToken();
    set({
      user: null,
      authReady: true,
      pendingTask: "",
      chatLoadingConversationId: "",
      chatLoadingRequestId: "",
      chatLoadingByConversationId: {},
      unreadConversationIds: {},
      conversationId: "",
      conversations: [],
      view: "dashboard",
      messages: [welcomeMessage],
      drafts: {},
      wrongQuestions: [],
      knowledgeCards: [],
      generatedPlan: null,
      generatedQuiz: null,
      stats: {
        learnedMinutes: 0,
        solvedCount: 0,
        wrongCount: 0,
        streakDays: 1
      }
    });
  },
  loadInitialData: async () => {
    if (!getToken()) {
      set({ authReady: true });
      return;
    }
    try {
      const data = await bootstrap();
      set({
        authReady: true,
        user: data.user,
        conversations: data.conversations,
        conversationId: data.activeConversationId,
        messages: data.messages.length > 0 ? data.messages : [welcomeMessage],
        input: data.activeConversationId ? get().drafts[data.activeConversationId] ?? "" : "",
        wrongQuestions: data.wrongQuestions ?? [],
        knowledgeCards: data.knowledgeCards ?? [],
        generatedPlan: data.latestPlan ?? null,
        generatedQuiz: data.latestQuiz ?? null,
        stats: data.stats
      });
    } catch {
      clearToken();
      set({ authReady: true, user: null });
    }
  },
  setView: (view) => set({ view }),
  newConversation: async (nextMode) => {
    const mode = nextMode ?? get().mode;
    const data = await createConversation(mode);
    set((state) => ({
      mode,
      conversationId: data.conversation.id,
      conversations: [data.conversation, ...state.conversations],
      messages: [welcomeMessage],
      input: state.drafts[`mode:${mode}`] ?? state.drafts[data.conversation.id] ?? "",
      drafts: {
        ...state.drafts,
        [data.conversation.id]: state.drafts[`mode:${mode}`] ?? state.drafts[data.conversation.id] ?? ""
      },
      error: ""
    }));
  },
  beginConversationWithInput: async (nextMode, nextInput) => {
    const data = await createConversation(nextMode);
    set((state) => ({
      view: "tutor",
      mode: nextMode,
      conversationId: data.conversation.id,
      conversations: [data.conversation, ...state.conversations],
      messages: [welcomeMessage],
      input: nextInput,
      drafts: {
        ...state.drafts,
        [data.conversation.id]: nextInput,
        [`mode:${nextMode}`]: nextInput
      },
      error: ""
    }));
    await get().sendMessage();
  },
  selectConversation: async (idToLoad) => {
    const data = await loadConversation(idToLoad);
    set((state) => ({
      conversationId: data.conversation.id,
      mode: data.conversation.mode,
      messages: data.messages.length ? data.messages : [welcomeMessage],
      input: state.drafts[data.conversation.id] ?? "",
      unreadConversationIds: removeRecordKey(state.unreadConversationIds, data.conversation.id),
      error: ""
    }));
  },
  removeConversation: async (idToRemove) => {
    await deleteConversation(idToRemove);
    set((state) => {
      const conversations = state.conversations.filter((item) => item.id !== idToRemove);
      const removedActive = state.conversationId === idToRemove;
      return {
        conversations,
        conversationId: removedActive ? "" : state.conversationId,
        messages: removedActive ? [welcomeMessage] : state.messages,
        chatLoadingByConversationId: removeRecordKey(state.chatLoadingByConversationId, idToRemove),
        unreadConversationIds: removeRecordKey(state.unreadConversationIds, idToRemove)
      };
    });
  },
  setMode: (mode) => {
    void get().newConversation(mode);
  },
  setInput: (input) =>
    set((state) => ({
      input,
      drafts: { ...state.drafts, [state.conversationId || `mode:${state.mode}`]: input }
    })),
  refreshConversations: async () => {
    const result = await listConversations();
    set({ conversations: result.conversations });
  },
  sendMessage: async () => {
    const { input, mode } = get();
    const trimmed = input.trim();
    if (!trimmed) return;
    const requestId = id("chat_request");

    let targetConversationId = get().conversationId;
    if (!targetConversationId) {
      const data = await createConversation(mode);
      targetConversationId = data.conversation.id;
      set((state) => ({
        conversationId: data.conversation.id,
        conversations: [data.conversation, ...state.conversations],
        drafts: {
          ...state.drafts,
          [data.conversation.id]: state.drafts[`mode:${mode}`] ?? ""
        }
      }));
    }

    if (get().chatLoadingByConversationId[targetConversationId]) return;

    const userMessage: ChatMessage = {
      id: id("user"),
      role: "user",
      content: trimmed,
      createdAt: now()
    };

    set((state) => ({
      input: "",
      chatLoadingConversationId: targetConversationId,
      chatLoadingRequestId: requestId,
      chatLoadingByConversationId: {
        ...state.chatLoadingByConversationId,
        [targetConversationId]: requestId
      },
      error: "",
      drafts: { ...state.drafts, [targetConversationId]: "" },
      messages: state.conversationId === targetConversationId ? [...state.messages, userMessage] : state.messages
    }));

    const assistantId = id("assistant_stream");

    try {
      set((state) => ({
        messages: [
          ...state.messages,
          {
            id: assistantId,
            role: "assistant",
            content: "",
            createdAt: now()
          }
        ]
      }));

      const streamResult: { current: StreamDoneResult | null } = { current: null };

      await streamChatMessage(mode, trimmed, targetConversationId, {
        onMeta: (data) =>
          set((state) => ({
            chatLoadingConversationId: state.chatLoadingRequestId === requestId ? data.conversationId : state.chatLoadingConversationId,
            chatLoadingByConversationId:
              data.conversationId === targetConversationId
                ? state.chatLoadingByConversationId
                : {
                    ...state.chatLoadingByConversationId,
                    [data.conversationId]: requestId
                  }
          })),
        onDelta: (delta) =>
          set((state) => ({
            messages:
              state.chatLoadingByConversationId[targetConversationId] === requestId && state.conversationId === targetConversationId
                ? state.messages.map((item) =>
                    item.id === assistantId ? { ...item, content: item.content + delta } : item
                  )
                : state.messages
          })),
        onDone: (data) => {
          streamResult.current = data;
        }
      });

      if (!streamResult.current) {
        throw new Error("AI流式响应没有正常结束");
      }

      const result = streamResult.current;

      set((state) => ({
        chatLoadingConversationId: state.chatLoadingRequestId === requestId ? "" : state.chatLoadingConversationId,
        chatLoadingRequestId: state.chatLoadingRequestId === requestId ? "" : state.chatLoadingRequestId,
        chatLoadingByConversationId: removeRecordKey(
          removeRecordKey(state.chatLoadingByConversationId, targetConversationId),
          result.conversationId
        ),
        conversations:
          state.conversations.length > 0 && state.conversations.some((item) => item.id === result.conversationId)
            ? state.conversations.map((item) =>
                item.id === result.conversationId
                  ? { ...item, updatedAt: new Date().toISOString() }
                  : item
              )
            : [
                {
                  id: result.conversationId,
                  title: modeTitle(mode),
                  mode,
                  createdAt: new Date().toISOString(),
                  updatedAt: new Date().toISOString()
                },
                ...state.conversations
              ],
        messages:
          state.conversationId === result.conversationId
            ? state.messages.some((item) => item.id === assistantId)
              ? state.messages.map((item) =>
                  item.id === assistantId ? { ...result.message, content: result.message.content || item.content } : item
                )
              : [...state.messages, result.message]
            : state.messages,
        unreadConversationIds:
          state.conversationId === result.conversationId
            ? removeRecordKey(state.unreadConversationIds, result.conversationId)
            : { ...state.unreadConversationIds, [result.conversationId]: now() },
        wrongQuestions: result.wrongQuestion ? [result.wrongQuestion, ...state.wrongQuestions] : state.wrongQuestions,
        stats: result.stats
      }));
      window.setTimeout(() => {
        void get().refreshConversations();
      }, 1400);
    } catch (error) {
      set((state) => ({
        chatLoadingConversationId: "",
        chatLoadingRequestId: "",
        chatLoadingByConversationId: removeRecordKey(state.chatLoadingByConversationId, targetConversationId),
        error: error instanceof Error ? error.message : "发送失败，请稍后再试",
        messages: state.messages.some((item) => item.id === assistantId)
          ? state.messages.filter((item) => item.id !== assistantId)
          : state.messages
      }));
    }
  },
  markConversationRead: (idToRead) =>
    set((state) => ({
      unreadConversationIds: removeRecordKey(state.unreadConversationIds, idToRead)
    })),
  markWrongMastered: async (idToRemove) => {
    const result = await masterWrongQuestion(idToRemove);
    set((state) => ({
      wrongQuestions: state.wrongQuestions.filter((item) => item.id !== idToRemove),
      stats: result.stats
    }));
  },
  addManualWrong: async () => {
    const { input } = get();
    const title = input.trim() || "手动添加的错题";
    const result = await createWrongQuestion(title);
    set((state) => ({
      input: "",
      wrongQuestions: [result.wrongQuestion, ...state.wrongQuestions],
      stats: result.stats
    }));
  },
  createKnowledgeCard: async (concept) => {
    set({ loading: true, pendingTask: "card", error: "" });
    try {
      const result = await generateKnowledgeCard(concept);
      set((state) => ({
        loading: false,
        pendingTask: "",
        knowledgeCards: [result.card, ...state.knowledgeCards],
        stats: result.stats
      }));
    } catch (error) {
      set({ loading: false, pendingTask: "", error: error instanceof Error ? error.message : "生成知识卡片失败" });
    }
  },
  createStudyPlan: async (payload) => {
    set({ loading: true, pendingTask: "plan", error: "" });
    try {
      const result = await generateStudyPlan(payload);
      set({ loading: false, pendingTask: "", generatedPlan: result.plan.content, stats: result.stats });
    } catch (error) {
      set({ loading: false, pendingTask: "", error: error instanceof Error ? error.message : "生成学习计划失败" });
    }
  },
  createQuiz: async (payload) => {
    set({ loading: true, pendingTask: "quiz", error: "" });
    try {
      const result = await generateQuiz(payload);
      set({
        loading: false,
        pendingTask: "",
        generatedQuiz: { ...result.quiz.content, id: result.quiz.id },
        stats: result.stats
      });
    } catch (error) {
      set({ loading: false, pendingTask: "", error: error instanceof Error ? error.message : "生成测验失败" });
    }
  }
}));
