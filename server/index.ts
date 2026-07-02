import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { requireAuth, signToken, hashPassword, verifyPassword, type AuthedRequest } from "./auth.js";
import { db, newId, nowIso, reviewDue } from "./db.js";
import {
  extractTextFromImage,
  generateConversationTitle,
  generateGoalPlan,
  generateVariantPractice,
  getAiReply,
  getLearningJson,
  gradeLearningWork,
  streamAiReply
} from "./ai.js";
import type { ChatRequest } from "./types.js";

dotenv.config();

const app = express();
const port = Number(process.env.PORT ?? 8787);
type UserRole = "student" | "teacher" | "parent" | "admin";

const allowedOrigins = parseOrigins(process.env.APP_ORIGINS);

app.set("trust proxy", 1);
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" }
  })
);
app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error("cors_origin_not_allowed"));
    }
  })
);
app.use(express.json({ limit: "1mb" }));

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 600,
  standardHeaders: "draft-8",
  legacyHeaders: false
});
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: "draft-8",
  legacyHeaders: false
});
const aiLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 120,
  standardHeaders: "draft-8",
  legacyHeaders: false
});

app.use("/api", apiLimiter);
app.use("/api/auth", authLimiter);
app.use(
  [
    "/api/chat",
    "/api/chat/stream",
    "/api/knowledge-cards/generate",
    "/api/study-plans/generate",
    "/api/quizzes/generate",
    "/api/ocr",
    "/api/adaptive-practices/generate",
    "/api/goals"
  ],
  aiLimiter
);

function parseOrigins(value: string | undefined) {
  const origins = (value ?? "http://127.0.0.1:5173,http://localhost:5173")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  return origins.length > 0 ? origins : ["http://127.0.0.1:5173", "http://localhost:5173"];
}

function normalizeRole(value: unknown, grade = ""): UserRole {
  const role = String(value ?? "").trim();
  if (role === "teacher" || role === "parent" || role === "admin") return role;
  if (["老师", "管理员", "运营"].includes(grade)) return grade === "老师" ? "teacher" : "admin";
  if (grade === "家长") return "parent";
  if (role === "student") return "student";
  return "student";
}

function normalizePublicRegistrationRole(value: unknown, grade = ""): Exclude<UserRole, "admin"> {
  const role = normalizeRole(value, grade);
  return role === "admin" ? "student" : role;
}

function getUserRole(userId: string): UserRole {
  const user = db.prepare("SELECT role, grade FROM users WHERE id = ?").get(userId) as { role?: string; grade: string } | undefined;
  return normalizeRole(user?.role, user?.grade ?? "");
}

function requireRole(req: AuthedRequest, res: express.Response, roles: UserRole[]) {
  const role = getUserRole(req.user!.id);
  if (!roles.includes(role)) {
    res.status(403).json({ error: "forbidden" });
    return false;
  }
  return true;
}

function toClientUser<T extends { grade: string; role?: string }>(user: T | undefined) {
  return user ? { ...user, role: normalizeRole(user.role, user.grade) } : user;
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "zhixue-ai-api" });
});

app.get("/api/ai-health", (_req, res) => {
  res.json({
    ok: true,
    baseConfigured: Boolean(process.env.AI_API_BASE),
    keyConfigured: Boolean(process.env.AI_API_KEY),
    modelConfigured: Boolean(process.env.AI_MODEL),
    visionModelConfigured: Boolean(process.env.AI_VISION_MODEL)
  });
});

app.post("/api/auth/register", async (req, res) => {
  const email = String(req.body.email ?? "").trim().toLowerCase();
  const password = String(req.body.password ?? "");
  const name = String(req.body.name ?? "学习者").trim() || "学习者";
  const grade = String(req.body.grade ?? "").trim();
  const role = normalizePublicRegistrationRole(req.body.role, grade);

  if (!email.includes("@") || password.length < 8) {
    res.status(400).json({ error: "invalid_register_payload" });
    return;
  }

  const exists = db.prepare("SELECT id FROM users WHERE email = ?").get(email);
  if (exists) {
    res.status(409).json({ error: "email_exists" });
    return;
  }

  const user = {
    id: newId("user"),
    email,
    password_hash: await hashPassword(password),
    name,
    grade,
    role,
    created_at: nowIso()
  };

  db.prepare(
    "INSERT INTO users (id, email, password_hash, name, grade, role, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
  ).run(user.id, user.email, user.password_hash, user.name, user.grade, user.role, user.created_at);

  res.json({
    token: signToken({ id: user.id, email: user.email }),
    user: { id: user.id, email: user.email, name: user.name, grade: user.grade, role: user.role }
  });
});

app.post("/api/auth/login", async (req, res) => {
  const email = String(req.body.email ?? "").trim().toLowerCase();
  const password = String(req.body.password ?? "");
  const user = db
    .prepare("SELECT id, email, password_hash, name, grade, role FROM users WHERE email = ?")
    .get(email) as { id: string; email: string; password_hash: string; name: string; grade: string; role?: string } | undefined;

  if (!user || !(await verifyPassword(password, user.password_hash))) {
    res.status(401).json({ error: "invalid_credentials" });
    return;
  }

  res.json({
    token: signToken({ id: user.id, email: user.email }),
    user: { id: user.id, email: user.email, name: user.name, grade: user.grade, role: normalizeRole(user.role, user.grade) }
  });
});

app.get("/api/me", requireAuth, (req: AuthedRequest, res) => {
  const user = db
    .prepare("SELECT id, email, name, grade, role, avatar_url AS avatarUrl, created_at FROM users WHERE id = ?")
    .get(req.user!.id) as { id: string; email: string; name: string; grade: string; role?: string; avatarUrl?: string; created_at: string } | undefined;
  if (!user) {
    res.status(404).json({ error: "user_not_found" });
    return;
  }
  res.json({ user: toClientUser(user) });
});

app.patch("/api/me", requireAuth, (req: AuthedRequest, res) => {
  const name = String(req.body.name ?? "").trim().slice(0, 30);
  const grade = String(req.body.grade ?? "").trim().slice(0, 20);
  const avatarUrl = String(req.body.avatarUrl ?? "").trim();
  const safeAvatar =
    avatarUrl.startsWith("data:image/") || avatarUrl.startsWith("https://") || avatarUrl === "" ? avatarUrl.slice(0, 200_000) : "";
  if (!name) {
    res.status(400).json({ error: "name_required" });
    return;
  }
  db.prepare("UPDATE users SET name = ?, grade = ?, avatar_url = ? WHERE id = ?").run(name, grade, safeAvatar, req.user!.id);
  const user = db
    .prepare("SELECT id, email, name, grade, role, avatar_url AS avatarUrl FROM users WHERE id = ?")
    .get(req.user!.id) as { id: string; email: string; name: string; grade: string; role?: string; avatarUrl?: string } | undefined;
  res.json({ user: toClientUser(user) });
});

app.get("/api/me/export", requireAuth, (req: AuthedRequest, res) => {
  const userId = req.user!.id;
  const user = db
    .prepare("SELECT id, email, name, grade, role, avatar_url AS avatarUrl, created_at AS createdAt FROM users WHERE id = ?")
    .get(userId) as { id: string; email: string; name: string; grade: string; role?: string; avatarUrl?: string; createdAt: string } | undefined;
  const conversations = db
    .prepare("SELECT id, title, mode, created_at AS createdAt, updated_at AS updatedAt FROM conversations WHERE user_id = ? ORDER BY updated_at DESC")
    .all(userId);
  const messages = db
    .prepare("SELECT conversation_id AS conversationId, role, content, created_at AS createdAt FROM messages WHERE user_id = ? ORDER BY created_at ASC")
    .all(userId);
  const wrongQuestions = db
    .prepare(
      "SELECT id, title, reason, knowledge_point AS knowledgePoint, status, attempts, correct_streak AS correctStreak, created_at AS createdAt, review_due AS reviewDue FROM wrong_questions WHERE user_id = ? ORDER BY created_at DESC"
    )
    .all(userId);
  const reviewAttempts = db
    .prepare(
      "SELECT wrong_question_id AS wrongQuestionId, answer, report, score, created_at AS createdAt FROM wrong_question_reviews WHERE user_id = ? ORDER BY created_at DESC"
    )
    .all(userId);
  const records = db
    .prepare("SELECT event_type AS eventType, knowledge_point AS knowledgePoint, minutes, correct, wrong, created_at AS createdAt FROM learning_records WHERE user_id = ? ORDER BY created_at DESC")
    .all(userId);
  const cards = db.prepare("SELECT title, definition, key_points AS keyPoints, mistakes, related, created_at AS createdAt FROM knowledge_cards WHERE user_id = ? ORDER BY created_at DESC").all(userId);
  const goals = db
    .prepare("SELECT title, subject, duration_days AS durationDays, plan, progress, status, created_at AS createdAt FROM learning_goals WHERE user_id = ? ORDER BY created_at DESC")
    .all(userId)
    .map((goal: any) => ({ ...goal, plan: safeJsonParse(goal.plan) }));
  res.json({ exportedAt: nowIso(), user: toClientUser(user), stats: getStats(userId), conversations, messages, wrongQuestions, reviewAttempts, records, cards, goals });
});

app.delete("/api/me", requireAuth, (req: AuthedRequest, res) => {
  db.prepare("DELETE FROM users WHERE id = ?").run(req.user!.id);
  res.json({ ok: true });
});

app.get("/api/bootstrap", requireAuth, (req: AuthedRequest, res) => {
  const userId = req.user!.id;
  const user = db
    .prepare("SELECT id, email, name, grade, role, avatar_url AS avatarUrl FROM users WHERE id = ?")
    .get(userId) as { id: string; email: string; name: string; grade: string; role?: string; avatarUrl?: string } | undefined;
  const conversations = db
    .prepare("SELECT id, title, mode, created_at, updated_at FROM conversations WHERE user_id = ? ORDER BY updated_at DESC")
    .all(userId);
  const activeConversation = conversations[0] as { id: string } | undefined;
  const messages = activeConversation
    ? db
        .prepare("SELECT id, role, content, created_at FROM messages WHERE user_id = ? AND conversation_id = ? ORDER BY created_at ASC")
        .all(userId, activeConversation.id)
    : [];
  const wrongQuestions = db
    .prepare(
      "SELECT id, title, reason, knowledge_point AS knowledgePoint, status, attempts, correct_streak AS correctStreak, created_at AS createdAt, review_due AS reviewDue FROM wrong_questions WHERE user_id = ? AND status = 'active' ORDER BY review_due ASC"
    )
    .all(userId);
  const knowledgeCards = db
    .prepare("SELECT id, title, definition, key_points AS keyPoints, mistakes, related, created_at AS createdAt FROM knowledge_cards WHERE user_id = ? ORDER BY created_at DESC")
    .all(userId);
  const latestPlan = db
    .prepare("SELECT plan_text AS planText FROM study_plans WHERE user_id = ? ORDER BY created_at DESC LIMIT 1")
    .get(userId) as { planText: string } | undefined;
  const latestQuiz = db
    .prepare("SELECT id, content FROM quiz_sessions WHERE user_id = ? ORDER BY created_at DESC LIMIT 1")
    .get(userId) as { id: string; content: string } | undefined;
  const stats = getStats(userId);

  res.json({
    user: toClientUser(user),
    conversations,
    activeConversationId: activeConversation?.id ?? "",
    messages,
    wrongQuestions,
    knowledgeCards,
    latestPlan: latestPlan ? safeJsonParse(latestPlan.planText) : null,
    latestQuiz: latestQuiz ? { ...safeJsonParse(latestQuiz.content), id: latestQuiz.id } : null,
    stats
  });
});

app.get("/api/conversations", requireAuth, (req: AuthedRequest, res) => {
  const userId = req.user!.id;
  const conversations = db
    .prepare("SELECT id, title, mode, created_at AS createdAt, updated_at AS updatedAt FROM conversations WHERE user_id = ? ORDER BY updated_at DESC")
    .all(userId);
  res.json({ conversations });
});

app.post("/api/conversations", requireAuth, (req: AuthedRequest, res) => {
  const userId = req.user!.id;
  const mode = String(req.body.mode ?? "tutor");
  const title = String(req.body.title ?? modeTitle(mode)).trim().slice(0, 40) || modeTitle(mode);
  const id = newId("conv");
  const createdAt = nowIso();
  db.prepare("INSERT INTO conversations (id, user_id, title, mode, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)").run(
    id,
    userId,
    title,
    mode,
    createdAt,
    createdAt
  );
  res.json({
    conversation: { id, title, mode, createdAt, updatedAt: createdAt },
    messages: []
  });
});

app.get("/api/conversations/:id", requireAuth, (req: AuthedRequest, res) => {
  const userId = req.user!.id;
  const conversation = db
    .prepare("SELECT id, title, mode, created_at AS createdAt, updated_at AS updatedAt FROM conversations WHERE id = ? AND user_id = ?")
    .get(req.params.id, userId);
  if (!conversation) {
    res.status(404).json({ error: "conversation_not_found" });
    return;
  }
  const messages = db
    .prepare("SELECT id, role, content, created_at AS createdAt FROM messages WHERE user_id = ? AND conversation_id = ? ORDER BY created_at ASC")
    .all(userId, req.params.id);
  res.json({ conversation, messages });
});

app.delete("/api/conversations/:id", requireAuth, (req: AuthedRequest, res) => {
  const result = db.prepare("DELETE FROM conversations WHERE id = ? AND user_id = ?").run(req.params.id, req.user!.id);
  if (result.changes === 0) {
    res.status(404).json({ error: "conversation_not_found" });
    return;
  }
  res.json({ ok: true });
});

app.post("/api/chat", requireAuth, async (req: AuthedRequest, res) => {
  const userId = req.user!.id;
  const body = req.body as ChatRequest;
  const message = String(body.message ?? "").trim();
  const mode = body.mode ?? "tutor";

  if (!message) {
    res.status(400).json({ error: "message_required" });
    return;
  }

  const conversationId = ensureConversation(userId, body.conversationId, mode);
  const userMessageId = newId("msg");
  db.prepare("INSERT INTO messages (id, conversation_id, user_id, role, content, created_at) VALUES (?, ?, ?, ?, ?, ?)").run(
    userMessageId,
    conversationId,
    userId,
    "user",
    message,
    nowIso()
  );

  const history = db
    .prepare("SELECT role, content FROM messages WHERE user_id = ? AND conversation_id = ? ORDER BY created_at ASC")
    .all(userId, conversationId) as Array<{ role: "user" | "assistant"; content: string }>;

  let payload;
  try {
    payload = await getAiReply(mode, message, history);
  } catch (error) {
    console.error(
      "AI API request failed",
      error instanceof Error ? error.message : "unknown_error"
    );
    res.status(502).json({
      error: "ai_api_unavailable",
      message: "AI接口暂时不可用，请检查服务端AI_API_KEY、AI_API_BASE和AI_MODEL配置。"
    });
    return;
  }
  const assistantContent = `${payload.reply}\n\n${payload.question_to_user}`;
  const assistantMessageId = newId("msg");
  db.prepare("INSERT INTO messages (id, conversation_id, user_id, role, content, created_at) VALUES (?, ?, ?, ?, ?, ?)").run(
    assistantMessageId,
    conversationId,
    userId,
    "assistant",
    assistantContent,
    nowIso()
  );
  db.prepare("UPDATE conversations SET updated_at = ? WHERE id = ? AND user_id = ?").run(nowIso(), conversationId, userId);

  const knowledgePoint = payload.knowledge_points[0] ?? "待AI归类";
  let wrongQuestion = null;
  if (payload.actions.save_wrong_question) {
    wrongQuestion = {
      id: newId("wrong"),
      title: message.slice(0, 80),
      reason: payload.actions.recommend_concept_learning ? "概念或方法卡住" : "需要复习",
      knowledgePoint,
      status: "active",
      attempts: 1,
      correctStreak: 0,
      createdAt: nowIso(),
      reviewDue: reviewDue(1)
    };
    db.prepare(
      "INSERT INTO wrong_questions (id, user_id, conversation_id, title, reason, knowledge_point, status, attempts, correct_streak, created_at, review_due) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    ).run(
      wrongQuestion.id,
      userId,
      conversationId,
      wrongQuestion.title,
      wrongQuestion.reason,
      wrongQuestion.knowledgePoint,
      wrongQuestion.status,
      wrongQuestion.attempts,
      wrongQuestion.correctStreak,
      wrongQuestion.createdAt,
      wrongQuestion.reviewDue
    );
  }

  db.prepare(
    "INSERT INTO learning_records (id, user_id, event_type, knowledge_point, minutes, correct, wrong, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
  ).run(newId("record"), userId, "chat", knowledgePoint, 3, payload.actions.save_wrong_question ? 0 : 1, payload.actions.save_wrong_question ? 1 : 0, nowIso());
  updateMasteryByKnowledgePoint(userId, knowledgePoint, payload.actions.save_wrong_question ? -12 : 8);

  res.json({
    conversationId,
    message: {
      id: assistantMessageId,
      role: "assistant",
      content: assistantContent,
      createdAt: nowIso()
    },
    payload,
    wrongQuestion,
    stats: getStats(userId)
  });
});

app.post("/api/chat/stream", requireAuth, async (req: AuthedRequest, res) => {
  const userId = req.user!.id;
  const body = req.body as ChatRequest;
  const message = String(body.message ?? "").trim();
  const mode = body.mode ?? "tutor";

  if (!message) {
    res.status(400).json({ error: "message_required" });
    return;
  }

  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();

  const sendEvent = (event: string, data: unknown) => {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  try {
    const conversationId = ensureConversation(userId, body.conversationId, mode);
    const userMessageId = newId("msg");
    db.prepare("INSERT INTO messages (id, conversation_id, user_id, role, content, created_at) VALUES (?, ?, ?, ?, ?, ?)").run(
      userMessageId,
      conversationId,
      userId,
      "user",
      message,
      nowIso()
    );

    sendEvent("meta", { conversationId });

    const history = db
      .prepare("SELECT role, content FROM messages WHERE user_id = ? AND conversation_id = ? ORDER BY created_at ASC")
      .all(userId, conversationId) as Array<{ role: "user" | "assistant"; content: string }>;

    let streamedContent = "";
    const payload = await streamAiReply(mode, message, history, (delta) => {
      streamedContent += delta;
      sendEvent("delta", { delta });
    });

    const assistantContent = streamedContent.trim() || `${payload.reply}\n\n${payload.question_to_user}`;
    const assistantMessageId = newId("msg");
    db.prepare("INSERT INTO messages (id, conversation_id, user_id, role, content, created_at) VALUES (?, ?, ?, ?, ?, ?)").run(
      assistantMessageId,
      conversationId,
      userId,
      "assistant",
      assistantContent,
      nowIso()
    );
    db.prepare("UPDATE conversations SET updated_at = ? WHERE id = ? AND user_id = ?").run(nowIso(), conversationId, userId);

    const knowledgePoint = payload.knowledge_points[0] ?? "待AI归类";
    let wrongQuestion = null;
    if (payload.actions.save_wrong_question) {
      wrongQuestion = {
        id: newId("wrong"),
        title: message.slice(0, 80),
        reason: payload.actions.recommend_concept_learning ? "概念或方法卡住" : "需要复习",
        knowledgePoint,
        status: "active",
        attempts: 1,
        correctStreak: 0,
        createdAt: nowIso(),
        reviewDue: reviewDue(1)
      };
      db.prepare(
        "INSERT INTO wrong_questions (id, user_id, conversation_id, title, reason, knowledge_point, status, attempts, correct_streak, created_at, review_due) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
      ).run(
        wrongQuestion.id,
        userId,
        conversationId,
        wrongQuestion.title,
        wrongQuestion.reason,
        wrongQuestion.knowledgePoint,
        wrongQuestion.status,
        wrongQuestion.attempts,
        wrongQuestion.correctStreak,
        wrongQuestion.createdAt,
        wrongQuestion.reviewDue
      );
    }

    db.prepare(
      "INSERT INTO learning_records (id, user_id, event_type, knowledge_point, minutes, correct, wrong, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    ).run(newId("record"), userId, "chat", knowledgePoint, 3, payload.actions.save_wrong_question ? 0 : 1, payload.actions.save_wrong_question ? 1 : 0, nowIso());
    updateMasteryByKnowledgePoint(userId, knowledgePoint, payload.actions.save_wrong_question ? -12 : 8);

    sendEvent("done", {
      conversationId,
      message: {
        id: assistantMessageId,
        role: "assistant",
        content: assistantContent,
        createdAt: nowIso()
      },
      wrongQuestion,
      stats: getStats(userId)
    });
    res.end();

    void updateConversationTitleAsync(userId, conversationId, mode, message, assistantContent);
  } catch (error) {
    console.error("AI stream request failed", error instanceof Error ? error.message : "unknown_error");
    sendEvent("error", { message: "AI流式接口暂时不可用，请检查服务端配置。" });
    res.end();
  }
});

app.post("/api/wrong-questions", requireAuth, (req: AuthedRequest, res) => {
  const userId = req.user!.id;
  const title = String(req.body.title ?? "").trim();
  const knowledgePoint = String(req.body.knowledgePoint ?? "待AI归类").trim() || "待AI归类";
  if (!title) {
    res.status(400).json({ error: "title_required" });
    return;
  }

  const item = {
    id: newId("wrong"),
    title: title.slice(0, 80),
    reason: "手动添加",
    knowledgePoint,
    status: "active",
    attempts: 0,
    correctStreak: 0,
    createdAt: nowIso(),
    reviewDue: reviewDue(1)
  };

  db.prepare(
    "INSERT INTO wrong_questions (id, user_id, title, reason, knowledge_point, status, attempts, correct_streak, created_at, review_due) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
  ).run(
    item.id,
    userId,
    item.title,
    item.reason,
    item.knowledgePoint,
    item.status,
    item.attempts,
    item.correctStreak,
    item.createdAt,
    item.reviewDue
  );
  db.prepare(
    "INSERT INTO learning_records (id, user_id, event_type, knowledge_point, minutes, correct, wrong, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
  ).run(newId("record"), userId, "manual_wrong", knowledgePoint, 0, 0, 1, nowIso());

  res.json({ wrongQuestion: item, stats: getStats(userId) });
});

app.post("/api/wrong-questions/:id/master", requireAuth, (req: AuthedRequest, res) => {
  const userId = req.user!.id;
  const result = db
    .prepare("UPDATE wrong_questions SET status = 'mastered', correct_streak = correct_streak + 1 WHERE id = ? AND user_id = ?")
    .run(req.params.id, userId);

  if (result.changes === 0) {
    res.status(404).json({ error: "not_found" });
    return;
  }

  db.prepare(
    "INSERT INTO learning_records (id, user_id, event_type, knowledge_point, minutes, correct, wrong, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
  ).run(newId("record"), userId, "master_wrong", "错题复习", 2, 1, 0, nowIso());
  const wrong = db
    .prepare("SELECT knowledge_point AS knowledgePoint FROM wrong_questions WHERE id = ? AND user_id = ?")
    .get(req.params.id, userId) as { knowledgePoint: string } | undefined;
  if (wrong) updateMasteryByKnowledgePoint(userId, wrong.knowledgePoint, 10);

  res.json({ ok: true, stats: getStats(userId) });
});

app.post("/api/wrong-questions/:id/review", requireAuth, async (req: AuthedRequest, res) => {
  const userId = req.user!.id;
  const answer = String(req.body.answer ?? "").trim();
  if (!answer) {
    res.status(400).json({ error: "answer_required" });
    return;
  }
  const wrong = db
    .prepare("SELECT id, title, reason, knowledge_point AS knowledgePoint, attempts, correct_streak AS correctStreak FROM wrong_questions WHERE id = ? AND user_id = ? AND status = 'active'")
    .get(req.params.id, userId) as
    | { id: string; title: string; reason: string; knowledgePoint: string; attempts: number; correctStreak: number }
    | undefined;
  if (!wrong) {
    res.status(404).json({ error: "wrong_question_not_found" });
    return;
  }
  try {
    const report = (await gradeLearningWork("批改错题重做", { wrongQuestion: wrong, answer })) as Record<string, any>;
    const score = Math.max(0, Math.min(100, Number(report.score ?? 0)));
    db.prepare(
      "INSERT INTO wrong_question_reviews (id, wrong_question_id, user_id, answer, report, score, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
    ).run(newId("wrongreview"), wrong.id, userId, answer, JSON.stringify(report), score, nowIso());

    const correct = score >= 80 ? 1 : 0;
    const nextStreak = correct ? wrong.correctStreak + 1 : 0;
    const nextStatus = nextStreak >= 3 ? "mastered" : "active";
    const nextDue = correct ? reviewDue(nextStreak >= 2 ? 14 : 7) : reviewDue(1);
    db.prepare(
      "UPDATE wrong_questions SET attempts = attempts + 1, correct_streak = ?, status = ?, review_due = ? WHERE id = ? AND user_id = ?"
    ).run(nextStreak, nextStatus, nextDue, wrong.id, userId);
    db.prepare(
      "INSERT INTO learning_records (id, user_id, event_type, knowledge_point, minutes, correct, wrong, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    ).run(newId("record"), userId, "wrong_review", wrong.knowledgePoint, 4, correct, correct ? 0 : 1, nowIso());
    updateMasteryByKnowledgePoint(userId, wrong.knowledgePoint, correct ? 10 : -6);
    res.json({ report: { ...report, score }, mastered: nextStatus === "mastered", stats: getStats(userId) });
  } catch {
    res.status(502).json({ error: "wrong_review_grading_failed" });
  }
});

app.get("/api/knowledge-cards", requireAuth, (req: AuthedRequest, res) => {
  const cards = db
    .prepare("SELECT id, title, definition, key_points AS keyPoints, mistakes, related, created_at AS createdAt FROM knowledge_cards WHERE user_id = ? ORDER BY created_at DESC")
    .all(req.user!.id);
  res.json({ cards });
});

app.post("/api/knowledge-cards/generate", requireAuth, async (req: AuthedRequest, res) => {
  const concept = String(req.body.concept ?? "").trim();
  if (!concept) {
    res.status(400).json({ error: "concept_required" });
    return;
  }
  try {
    const json = await getLearningJson(
      "生成知识卡片。JSON字段：title, definition, key_points数组, mistakes, related数组。",
      concept
    );
    const card = {
      id: newId("card"),
      title: String(json.title ?? concept),
      definition: String(json.definition ?? ""),
      keyPoints: JSON.stringify(json.key_points ?? []),
      mistakes: String(json.mistakes ?? ""),
      related: JSON.stringify(json.related ?? []),
      createdAt: nowIso()
    };
    db.prepare(
      "INSERT INTO knowledge_cards (id, user_id, title, definition, key_points, mistakes, related, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    ).run(card.id, req.user!.id, card.title, card.definition, card.keyPoints, card.mistakes, card.related, card.createdAt);
    db.prepare(
      "INSERT INTO learning_records (id, user_id, event_type, knowledge_point, minutes, correct, wrong, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    ).run(newId("record"), req.user!.id, "knowledge_card", card.title, 2, 0, 0, nowIso());
    res.json({ card, stats: getStats(req.user!.id) });
  } catch {
    res.status(502).json({ error: "ai_api_unavailable" });
  }
});

app.post("/api/study-plans/generate", requireAuth, async (req: AuthedRequest, res) => {
  const subject = String(req.body.subject ?? "数学").trim();
  const grade = String(req.body.grade ?? "").trim();
  const currentScore = Number(req.body.currentScore ?? 60);
  const targetScore = Number(req.body.targetScore ?? 85);
  const selfWeakness = String(req.body.selfWeakness ?? "").trim();
  const userId = req.user!.id;
  try {
    const profile = buildLearningProfile(userId, subject);
    const json = await getLearningJson(
      [
        "生成高级个性化学习计划。",
        "必须结合：年级、当前分、目标分、用户自填薄弱点、历史学习记录、错题知识点、最近对话。",
        "不要泛泛而谈，任务必须具体到每天。",
        "JSON字段：summary字符串；weakness_analysis数组，每项包含point,evidence,priority；daily_plan数组，每项包含day,concept,practice,review,minutes；review_plan数组；acceptance_checks数组。",
        "daily_plan至少7天，每天15-30分钟。practice要写清题型和数量，review要写复习哪些错题/知识点。"
      ].join("\n"),
      JSON.stringify({
        grade,
        subject,
        currentScore,
        targetScore,
        selfWeakness,
        profile
      })
    );
    const planText = JSON.stringify(json);
    const plan = {
      id: newId("plan"),
      subject,
      currentScore,
      targetScore,
      planText,
      createdAt: nowIso()
    };
    db.prepare(
      "INSERT INTO study_plans (id, user_id, subject, current_score, target_score, plan_text, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
    ).run(plan.id, req.user!.id, plan.subject, plan.currentScore, plan.targetScore, plan.planText, plan.createdAt);
    db.prepare(
      "INSERT INTO learning_records (id, user_id, event_type, knowledge_point, minutes, correct, wrong, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    ).run(newId("record"), req.user!.id, "study_plan", subject, 3, 0, 0, nowIso());
    res.json({ plan: { ...plan, content: json }, stats: getStats(req.user!.id) });
  } catch {
    res.status(502).json({ error: "ai_api_unavailable" });
  }
});

app.post("/api/quizzes/generate", requireAuth, async (req: AuthedRequest, res) => {
  const subject = String(req.body.subject ?? "数学").trim();
  const topic = String(req.body.topic ?? "综合").trim();
  const questionCount = Math.min(10, Math.max(3, Number(req.body.questionCount ?? 5)));
  try {
    const json = await getLearningJson(
      "生成测验。JSON字段：title, questions数组。每个question包含type, question, answer, knowledge_point。题目不要太长。",
      `${subject} ${topic} ${questionCount}题`
    );
    const quiz = {
      id: newId("quiz"),
      subject,
      topic,
      questionCount,
      content: JSON.stringify(json),
      createdAt: nowIso()
    };
    db.prepare(
      "INSERT INTO quiz_sessions (id, user_id, subject, topic, question_count, content, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
    ).run(quiz.id, req.user!.id, quiz.subject, quiz.topic, quiz.questionCount, quiz.content, quiz.createdAt);
    db.prepare(
      "INSERT INTO learning_records (id, user_id, event_type, knowledge_point, minutes, correct, wrong, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    ).run(newId("record"), req.user!.id, "quiz_generate", topic, 2, 0, 0, nowIso());
    res.json({ quiz: { ...quiz, content: json }, stats: getStats(req.user!.id) });
  } catch {
    res.status(502).json({ error: "ai_api_unavailable" });
  }
});

app.post("/api/ocr", requireAuth, async (req: AuthedRequest, res) => {
  const dataUrl = String(req.body.dataUrl ?? "");
  const fileName = String(req.body.fileName ?? "question-image").slice(0, 120);
  const mimeMatch = dataUrl.match(/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/);
  if (!mimeMatch) {
    res.status(400).json({ error: "invalid_image_data" });
    return;
  }
  const mimeType = mimeMatch[1];
  const base64 = mimeMatch[2];
  const fileSize = Math.floor((base64.length * 3) / 4);
  if (fileSize > 5 * 1024 * 1024) {
    res.status(413).json({ error: "image_too_large" });
    return;
  }

  const jobId = newId("ocr");
  db.prepare(
    "INSERT INTO ocr_jobs (id, user_id, file_name, mime_type, file_size, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
  ).run(jobId, req.user!.id, fileName, mimeType, fileSize, "processing", nowIso());

  try {
    const text = await extractTextFromImage(dataUrl);
    db.prepare("UPDATE ocr_jobs SET status = 'done', extracted_text = ? WHERE id = ? AND user_id = ?").run(
      text,
      jobId,
      req.user!.id
    );
    res.json({ job: { id: jobId, status: "done", extractedText: text } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "ocr_failed";
    db.prepare("UPDATE ocr_jobs SET status = 'failed', error = ? WHERE id = ? AND user_id = ?").run(
      message,
      jobId,
      req.user!.id
    );
    res.status(502).json({ error: "ocr_failed", message });
  }
});

app.get("/api/knowledge-map", requireAuth, (req: AuthedRequest, res) => {
  const subject = String(req.query.subject ?? "数学");
  const userId = req.user!.id;
  const role = getUserRole(userId);
  const rawNodes = role === "student" || role === "parent"
    ? db
        .prepare(
          `SELECT n.id, n.subject, n.grade_band AS gradeBand, n.title, n.description,
                  COALESCE(m.mastery, 0) AS mastery
           FROM knowledge_nodes n
           LEFT JOIN user_mastery m ON m.node_id = n.id AND m.user_id = ?
           WHERE n.subject = ?
           ORDER BY n.grade_band, n.title`
        )
        .all(userId, subject)
    : role === "admin"
      ? db
          .prepare(
            `SELECT n.id, n.subject, n.grade_band AS gradeBand, n.title, n.description,
                    COALESCE(ROUND(AVG(um.mastery)), 0) AS mastery
             FROM knowledge_nodes n
             LEFT JOIN class_students cs ON 1 = 1
             LEFT JOIN user_mastery um ON um.node_id = n.id AND um.user_id = cs.student_id
             WHERE n.subject = ?
             GROUP BY n.id
             ORDER BY n.grade_band, n.title`
          )
          .all(subject)
      : db
          .prepare(
            `SELECT n.id, n.subject, n.grade_band AS gradeBand, n.title, n.description,
                    COALESCE(ROUND(AVG(um.mastery)), 0) AS mastery
             FROM knowledge_nodes n
             LEFT JOIN classes c ON c.teacher_id = ? AND c.subject = n.subject
             LEFT JOIN class_students cs ON cs.class_id = c.id
             LEFT JOIN user_mastery um ON um.node_id = n.id AND um.user_id = cs.student_id
             WHERE n.subject = ?
             GROUP BY n.id
             ORDER BY n.grade_band, n.title`
          )
          .all(userId, subject);
  const nodes = rawNodes.map((node: any) => {
    const mastery = Number(node.mastery ?? 0);
    return {
      ...node,
      mastery,
      status: mastery >= 80 ? "mastered" : mastery > 0 ? "learning" : "not_started"
    };
  });
  const edges = db
    .prepare("SELECT id, from_node_id AS fromNodeId, to_node_id AS toNodeId, relation FROM knowledge_edges WHERE subject = ?")
    .all(subject);
  res.json({ nodes, edges });
});

app.post("/api/knowledge-map/nodes", requireAuth, (req: AuthedRequest, res) => {
  if (!requireRole(req, res, ["teacher", "admin"])) return;
  const subject = String(req.body.subject ?? "").trim();
  const gradeBand = String(req.body.gradeBand ?? "").trim() || "通用";
  const title = String(req.body.title ?? "").trim();
  const description = String(req.body.description ?? "").trim();
  if (!subject || !title || !description) {
    res.status(400).json({ error: "knowledge_node_payload_required" });
    return;
  }
  const node = { id: newId("node"), subject, gradeBand, title, description };
  db.prepare("INSERT INTO knowledge_nodes (id, subject, grade_band, title, description) VALUES (?, ?, ?, ?, ?)").run(
    node.id,
    node.subject,
    node.gradeBand,
    node.title,
    node.description
  );
  res.json({ node: { ...node, status: "not_started", mastery: 0 } });
});

app.patch("/api/knowledge-map/nodes/:nodeId", requireAuth, (req: AuthedRequest, res) => {
  if (!requireRole(req, res, ["teacher", "admin"])) return;
  const title = String(req.body.title ?? "").trim();
  const description = String(req.body.description ?? "").trim();
  const gradeBand = String(req.body.gradeBand ?? "").trim();
  if (!title || !description || !gradeBand) {
    res.status(400).json({ error: "knowledge_node_payload_required" });
    return;
  }
  const result = db
    .prepare("UPDATE knowledge_nodes SET title = ?, description = ?, grade_band = ? WHERE id = ?")
    .run(title, description, gradeBand, req.params.nodeId);
  if (!result.changes) {
    res.status(404).json({ error: "knowledge_node_not_found" });
    return;
  }
  res.json({ ok: true });
});

app.post("/api/knowledge-map/edges", requireAuth, (req: AuthedRequest, res) => {
  if (!requireRole(req, res, ["teacher", "admin"])) return;
  const subject = String(req.body.subject ?? "").trim();
  const fromNodeId = String(req.body.fromNodeId ?? "").trim();
  const toNodeId = String(req.body.toNodeId ?? "").trim();
  const relation = String(req.body.relation ?? "前置").trim();
  const from = db.prepare("SELECT id FROM knowledge_nodes WHERE id = ? AND subject = ?").get(fromNodeId, subject);
  const to = db.prepare("SELECT id FROM knowledge_nodes WHERE id = ? AND subject = ?").get(toNodeId, subject);
  if (!subject || !from || !to || fromNodeId === toNodeId) {
    res.status(400).json({ error: "knowledge_edge_payload_required" });
    return;
  }
  const edge = { id: newId("edge"), subject, fromNodeId, toNodeId, relation };
  db.prepare("INSERT INTO knowledge_edges (id, subject, from_node_id, to_node_id, relation) VALUES (?, ?, ?, ?, ?)").run(
    edge.id,
    edge.subject,
    edge.fromNodeId,
    edge.toNodeId,
    edge.relation
  );
  res.json({ edge });
});

app.post("/api/knowledge-map/:nodeId/mastery", requireAuth, (req: AuthedRequest, res) => {
  const mastery = Math.max(0, Math.min(100, Number(req.body.mastery ?? 0)));
  const status = mastery >= 80 ? "mastered" : mastery > 0 ? "learning" : "not_started";
  db.prepare(
    `INSERT INTO user_mastery (user_id, node_id, status, mastery, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(user_id, node_id) DO UPDATE SET status = excluded.status, mastery = excluded.mastery, updated_at = excluded.updated_at`
  ).run(req.user!.id, req.params.nodeId, status, mastery, nowIso());
  res.json({ ok: true, status, mastery });
});

app.post("/api/guardian-links", requireAuth, (req: AuthedRequest, res) => {
  const guardianEmail = String(req.body.guardianEmail ?? "").trim().toLowerCase();
  if (!guardianEmail.includes("@")) {
    res.status(400).json({ error: "invalid_guardian_email" });
    return;
  }
  const link = {
    id: newId("guardian"),
    studentId: req.user!.id,
    guardianEmail,
    status: "active",
    createdAt: nowIso()
  };
  db.prepare(
    "INSERT INTO guardian_links (id, student_id, guardian_email, status, created_at) VALUES (?, ?, ?, ?, ?)"
  ).run(link.id, link.studentId, link.guardianEmail, link.status, link.createdAt);
  res.json({ link });
});

app.get("/api/guardian/report", requireAuth, (req: AuthedRequest, res) => {
  if (!requireRole(req, res, ["parent", "admin"])) return;
  const guardianEmail = req.user!.email.toLowerCase();
  const links = db
    .prepare(
      `SELECT gl.id, gl.student_id AS studentId, u.name, u.grade
       FROM guardian_links gl
       JOIN users u ON u.id = gl.student_id
       WHERE gl.guardian_email = ? AND gl.status = 'active'`
    )
    .all(guardianEmail) as Array<{ studentId: string; name: string; grade: string }>;
  const students = links.map((link) => ({
    ...link,
    stats: getStats(link.studentId),
    weakPoints: db
      .prepare("SELECT knowledge_point AS point, COUNT(*) AS count FROM wrong_questions WHERE user_id = ? AND status = 'active' GROUP BY knowledge_point ORDER BY count DESC LIMIT 3")
      .all(link.studentId)
  }));
  res.json({ students });
});

app.post("/api/classes", requireAuth, (req: AuthedRequest, res) => {
  if (!requireRole(req, res, ["teacher", "admin"])) return;
  const name = String(req.body.name ?? "").trim();
  const subject = String(req.body.subject ?? "数学").trim();
  if (!name) {
    res.status(400).json({ error: "class_name_required" });
    return;
  }
  const klass = { id: newId("class"), teacherId: req.user!.id, name, subject, createdAt: nowIso() };
  db.prepare("INSERT INTO classes (id, teacher_id, name, subject, created_at) VALUES (?, ?, ?, ?, ?)").run(
    klass.id,
    klass.teacherId,
    klass.name,
    klass.subject,
    klass.createdAt
  );
  res.json({ class: klass });
});

app.get("/api/classes", requireAuth, (req: AuthedRequest, res) => {
  if (!requireRole(req, res, ["teacher", "admin"])) return;
  const classes = db
    .prepare(
      `SELECT c.id, c.name, c.subject, c.created_at AS createdAt,
              COUNT(cs.student_id) AS studentCount
       FROM classes c
       LEFT JOIN class_students cs ON cs.class_id = c.id
       WHERE c.teacher_id = ?
       GROUP BY c.id
       ORDER BY c.created_at DESC`
    )
    .all(req.user!.id);
  res.json({ classes });
});

app.post("/api/classes/:id/students", requireAuth, (req: AuthedRequest, res) => {
  if (!requireRole(req, res, ["teacher", "admin"])) return;
  const email = String(req.body.email ?? "").trim().toLowerCase();
  const klass = db.prepare("SELECT id FROM classes WHERE id = ? AND teacher_id = ?").get(req.params.id, req.user!.id);
  if (!klass) {
    res.status(404).json({ error: "class_not_found" });
    return;
  }
  const student = db.prepare("SELECT id FROM users WHERE email = ?").get(email) as { id: string } | undefined;
  if (!student) {
    res.status(404).json({ error: "student_not_found" });
    return;
  }
  db.prepare("INSERT OR IGNORE INTO class_students (class_id, student_id, created_at) VALUES (?, ?, ?)").run(
    req.params.id,
    student.id,
    nowIso()
  );
  res.json({ ok: true });
});

app.get("/api/classes/:id/report", requireAuth, (req: AuthedRequest, res) => {
  if (!requireRole(req, res, ["teacher", "admin"])) return;
  const classId = String(req.params.id);
  const klass = db.prepare("SELECT id, name, subject FROM classes WHERE id = ? AND teacher_id = ?").get(classId, req.user!.id);
  if (!klass) {
    res.status(404).json({ error: "class_not_found" });
    return;
  }
  const students = db
    .prepare(
      `SELECT u.id, u.name, u.grade
       FROM class_students cs
       JOIN users u ON u.id = cs.student_id
       WHERE cs.class_id = ?`
    )
    .all(classId) as Array<{ id: string; name: string; grade: string }>;
  res.json({
    class: klass,
    heatmap: buildClassHeatmap(classId),
    students: students.map((student) => ({
      ...student,
      stats: getStats(student.id),
      weakPoints: db
        .prepare("SELECT knowledge_point AS point, COUNT(*) AS count FROM wrong_questions WHERE user_id = ? AND status = 'active' GROUP BY knowledge_point ORDER BY count DESC LIMIT 3")
        .all(student.id)
    }))
  });
});

app.post("/api/classes/:id/assignments", requireAuth, (req: AuthedRequest, res) => {
  if (!requireRole(req, res, ["teacher", "admin"])) return;
  const klass = db.prepare("SELECT id FROM classes WHERE id = ? AND teacher_id = ?").get(req.params.id, req.user!.id);
  if (!klass) {
    res.status(404).json({ error: "class_not_found" });
    return;
  }
  const title = String(req.body.title ?? "").trim();
  const knowledgePoint = String(req.body.knowledgePoint ?? "").trim();
  const questionsText = String(req.body.questionsText ?? "").trim();
  const questionCount = Math.max(1, Math.min(30, Number(req.body.questionCount ?? 5)));
  const dueAt = String(req.body.dueAt ?? reviewDue(3));
  if (!title || !knowledgePoint || !questionsText) {
    res.status(400).json({ error: "assignment_payload_required" });
    return;
  }
  const assignment = { id: newId("assign"), classId: req.params.id, title, knowledgePoint, questionsText, questionCount, dueAt, createdAt: nowIso() };
  db.prepare(
    "INSERT INTO assignments (id, class_id, teacher_id, title, knowledge_point, questions_text, question_count, due_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
  ).run(assignment.id, assignment.classId, req.user!.id, assignment.title, assignment.knowledgePoint, assignment.questionsText, assignment.questionCount, assignment.dueAt, assignment.createdAt);
  const students = db.prepare("SELECT student_id AS studentId FROM class_students WHERE class_id = ?").all(req.params.id) as Array<{ studentId: string }>;
  const insertSubmission = db.prepare(
    "INSERT OR IGNORE INTO assignment_submissions (id, assignment_id, student_id) VALUES (?, ?, ?)"
  );
  for (const student of students) insertSubmission.run(newId("submission"), assignment.id, student.studentId);
  res.json({ assignment, assignedCount: students.length });
});

app.get("/api/classes/:id/assignments", requireAuth, (req: AuthedRequest, res) => {
  if (!requireRole(req, res, ["teacher", "admin"])) return;
  const klass = db.prepare("SELECT id FROM classes WHERE id = ? AND teacher_id = ?").get(req.params.id, req.user!.id);
  if (!klass) {
    res.status(404).json({ error: "class_not_found" });
    return;
  }
  const assignments = db
    .prepare("SELECT id, title, knowledge_point AS knowledgePoint, questions_text AS questionsText, question_count AS questionCount, due_at AS dueAt, created_at AS createdAt FROM assignments WHERE class_id = ? ORDER BY created_at DESC")
    .all(req.params.id);
  res.json({ assignments });
});

app.patch("/api/classes/:id/assignments/:assignmentId", requireAuth, (req: AuthedRequest, res) => {
  if (!requireRole(req, res, ["teacher", "admin"])) return;
  const title = String(req.body.title ?? "").trim();
  const knowledgePoint = String(req.body.knowledgePoint ?? "").trim();
  const questionsText = String(req.body.questionsText ?? "").trim();
  const questionCount = Math.max(1, Math.min(30, Number(req.body.questionCount ?? 5)));
  const dueAt = String(req.body.dueAt ?? reviewDue(3));
  if (!title || !knowledgePoint || !questionsText) {
    res.status(400).json({ error: "assignment_payload_required" });
    return;
  }
  const result = db
    .prepare(
      `UPDATE assignments
       SET title = ?, knowledge_point = ?, questions_text = ?, question_count = ?, due_at = ?
       WHERE id = ? AND class_id = ? AND teacher_id = ?`
    )
    .run(title, knowledgePoint, questionsText, questionCount, dueAt, req.params.assignmentId, req.params.id, req.user!.id);
  if (!result.changes) {
    res.status(404).json({ error: "assignment_not_found" });
    return;
  }
  res.json({ ok: true });
});

app.get("/api/classes/:id/assignments/:assignmentId/submissions", requireAuth, (req: AuthedRequest, res) => {
  if (!requireRole(req, res, ["teacher", "admin"])) return;
  const classId = String(req.params.id);
  const assignmentId = String(req.params.assignmentId);
  const assignment = db
    .prepare(
      `SELECT a.id, a.title, a.knowledge_point AS knowledgePoint, a.questions_text AS questionsText, a.question_count AS questionCount, a.due_at AS dueAt
       FROM assignments a
       JOIN classes c ON c.id = a.class_id
       WHERE a.id = ? AND a.class_id = ? AND c.teacher_id = ?`
    )
    .get(assignmentId, classId, req.user!.id);
  if (!assignment) {
    res.status(404).json({ error: "assignment_not_found" });
    return;
  }
  const submissions = db
    .prepare(
      `SELECT u.id AS studentId, u.name, u.grade, s.status, s.score, s.report, s.submitted_at AS submittedAt
       FROM assignment_submissions s
       JOIN users u ON u.id = s.student_id
       WHERE s.assignment_id = ?
       ORDER BY s.status DESC, s.score ASC, u.name ASC`
    )
    .all(assignmentId)
    .map((item: any) => ({ ...item, report: safeJsonParse(item.report) }));
  res.json({ assignment, submissions });
});

app.post("/api/classes/:id/announcements", requireAuth, (req: AuthedRequest, res) => {
  if (!requireRole(req, res, ["teacher", "admin"])) return;
  const classId = String(req.params.id);
  const klass = db.prepare("SELECT id FROM classes WHERE id = ? AND teacher_id = ?").get(classId, req.user!.id);
  if (!klass) {
    res.status(404).json({ error: "class_not_found" });
    return;
  }
  const title = String(req.body.title ?? "").trim();
  const content = String(req.body.content ?? "").trim();
  const assignmentId = String(req.body.assignmentId ?? "");
  if (!title || !content) {
    res.status(400).json({ error: "announcement_payload_required" });
    return;
  }
  const announcement = { id: newId("notice"), classId, title, content, assignmentId, createdAt: nowIso() };
  db.prepare(
    "INSERT INTO class_announcements (id, class_id, teacher_id, title, content, assignment_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
  ).run(announcement.id, classId, req.user!.id, title, content, assignmentId, announcement.createdAt);
  res.json({ announcement });
});

app.get("/api/announcements", requireAuth, (req: AuthedRequest, res) => {
  const announcements = db
    .prepare(
      `SELECT n.id, n.title, n.content, n.assignment_id AS assignmentId, n.created_at AS createdAt, c.name AS className
       FROM class_announcements n
       JOIN class_students cs ON cs.class_id = n.class_id
       JOIN classes c ON c.id = n.class_id
       WHERE cs.student_id = ?
       ORDER BY n.created_at DESC`
    )
    .all(req.user!.id);
  res.json({ announcements });
});

app.get("/api/achievements", requireAuth, (req: AuthedRequest, res) => {
  const achievements = evaluateAchievements(req.user!.id);
  res.json({ achievements });
});

app.get("/api/admin/dashboard", requireAuth, (_req: AuthedRequest, res) => {
  if (!requireRole(_req, res, ["teacher", "admin"])) return;
  const totals = db
    .prepare(
      `SELECT
         (SELECT COUNT(*) FROM users) AS totalUsers,
         (SELECT COUNT(DISTINCT user_id) FROM learning_records WHERE created_at >= datetime('now', '-7 day')) AS activeUsers,
         (SELECT COALESCE(SUM(minutes), 0) FROM learning_records) AS totalMinutes,
         (SELECT COUNT(*) FROM assignment_submissions WHERE status = 'submitted') AS submittedAssignments`
    )
    .get();
  const trends = db
    .prepare(
      `SELECT substr(created_at, 1, 10) AS day, COALESCE(SUM(minutes), 0) AS minutes, COALESCE(SUM(correct), 0) AS correct, COALESCE(SUM(wrong), 0) AS wrong
       FROM learning_records
       GROUP BY substr(created_at, 1, 10)
       ORDER BY day DESC
       LIMIT 14`
    )
    .all();
  const hotKnowledge = db
    .prepare(
      `SELECT knowledge_point AS point, COUNT(*) AS count
       FROM learning_records
       GROUP BY knowledge_point
       ORDER BY count DESC
       LIMIT 10`
    )
    .all();
  const classMastery = db
    .prepare(
      `SELECT c.name AS className, c.subject, ROUND(AVG(COALESCE(um.mastery, 0)), 1) AS averageMastery
       FROM classes c
       LEFT JOIN class_students cs ON cs.class_id = c.id
       LEFT JOIN user_mastery um ON um.user_id = cs.student_id
       GROUP BY c.id
       ORDER BY averageMastery DESC`
    )
    .all();
  res.json({ totals, trends, hotKnowledge, classMastery });
});

app.get("/api/assignments", requireAuth, (req: AuthedRequest, res) => {
  const assignments = db
    .prepare(
      `SELECT a.id, a.title, a.knowledge_point AS knowledgePoint, a.questions_text AS questionsText, a.question_count AS questionCount,
              a.due_at AS dueAt, a.created_at AS createdAt, c.name AS className,
              COALESCE(s.status, 'assigned') AS status, COALESCE(s.score, 0) AS score
       FROM assignment_submissions s
       JOIN assignments a ON a.id = s.assignment_id
       JOIN classes c ON c.id = a.class_id
       WHERE s.student_id = ?
       ORDER BY a.due_at ASC`
    )
    .all(req.user!.id);
  res.json({ assignments });
});

app.post("/api/assignments/:id/submit", requireAuth, async (req: AuthedRequest, res) => {
  const assignmentId = String(req.params.id);
  const studentId = req.user!.id;
  const answer = String(req.body.answer ?? "").trim();
  if (!answer) {
    res.status(400).json({ error: "answer_required" });
    return;
  }
  const assignment = db
    .prepare(
      `SELECT a.id, a.title, a.knowledge_point AS knowledgePoint, a.questions_text AS questionsText, a.question_count AS questionCount
       FROM assignment_submissions s
       JOIN assignments a ON a.id = s.assignment_id
       WHERE s.assignment_id = ? AND s.student_id = ?`
    )
    .get(assignmentId, studentId) as
    | { id: string; title: string; knowledgePoint: string; questionsText: string; questionCount: number }
    | undefined;
  if (!assignment) {
    res.status(404).json({ error: "assignment_not_found" });
    return;
  }
  try {
    const report = (await gradeLearningWork("批改学生作业", { assignment, answer })) as Record<string, any>;
    const score = Math.max(0, Math.min(100, Number(report.score ?? 0)));
    db.prepare(
      "UPDATE assignment_submissions SET status = 'submitted', score = ?, report = ?, submitted_at = ? WHERE assignment_id = ? AND student_id = ?"
    ).run(score, JSON.stringify(report), nowIso(), assignmentId, studentId);
    persistGradingWrongQuestions(studentId, String(assignment.id), report);
    updateMasteryByKnowledgePoint(studentId, assignment.knowledgePoint, score >= 80 ? 10 : -10);
    res.json({ report: { ...report, score } });
  } catch {
    res.status(502).json({ error: "ai_grading_failed" });
  }
});

app.post("/api/quizzes/:id/submit", requireAuth, async (req: AuthedRequest, res) => {
  const quizId = String(req.params.id);
  const answers = req.body.answers ?? {};
  const quiz = db
    .prepare("SELECT id, subject, topic, content FROM quiz_sessions WHERE id = ? AND user_id = ?")
    .get(quizId, req.user!.id) as { id: string; subject: string; topic: string; content: string } | undefined;
  if (!quiz) {
    res.status(404).json({ error: "quiz_not_found" });
    return;
  }
  try {
    const content = JSON.parse(quiz.content);
    const report = (await gradeLearningWork("批改AI测验", { quiz: content, answers })) as Record<string, any>;
    const score = Math.max(0, Math.min(100, Number(report.score ?? 0)));
    db.prepare("UPDATE quiz_sessions SET report = ?, score = ? WHERE id = ? AND user_id = ?").run(
      JSON.stringify(report),
      score,
      quizId,
      req.user!.id
    );
    persistGradingWrongQuestions(req.user!.id, quizId, report);
    res.json({ report: { ...report, score } });
  } catch {
    res.status(502).json({ error: "ai_grading_failed" });
  }
});

app.get("/api/reports", requireAuth, (req: AuthedRequest, res) => {
  const assignmentReports = db
    .prepare(
      `SELECT a.id AS sourceId, 'assignment' AS type, a.title, s.score, s.report, s.submitted_at AS createdAt
       FROM assignment_submissions s
       JOIN assignments a ON a.id = s.assignment_id
       WHERE s.student_id = ? AND s.status = 'submitted'
       ORDER BY s.submitted_at DESC`
    )
    .all(req.user!.id);
  const quizReports = db
    .prepare(
      "SELECT id AS sourceId, 'quiz' AS type, topic AS title, score, report, created_at AS createdAt FROM quiz_sessions WHERE user_id = ? AND report != '' ORDER BY created_at DESC"
    )
    .all(req.user!.id);
  res.json({ reports: [...assignmentReports, ...quizReports] });
});

app.post("/api/adaptive-practices/generate", requireAuth, async (req: AuthedRequest, res) => {
  const sourceType = String(req.body.sourceType ?? "wrong_question");
  const sourceId = String(req.body.sourceId ?? "");
  const knowledgePoint = String(req.body.knowledgePoint ?? "待AI归类");
  const sourceText = String(req.body.sourceText ?? "");
  try {
    const content = await generateVariantPractice({ sourceType, sourceId, knowledgePoint, sourceText });
    const practice = {
      id: newId("practice"),
      sourceType,
      sourceId,
      knowledgePoint,
      content,
      createdAt: nowIso()
    };
    db.prepare(
      "INSERT INTO adaptive_practices (id, user_id, source_type, source_id, knowledge_point, content, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
    ).run(practice.id, req.user!.id, sourceType, sourceId, knowledgePoint, JSON.stringify(content), practice.createdAt);
    res.json({ practice });
  } catch {
    res.status(502).json({ error: "variant_generation_failed" });
  }
});

app.post("/api/adaptive-practices/:id/submit", requireAuth, async (req: AuthedRequest, res) => {
  const practice = db
    .prepare("SELECT id, knowledge_point AS knowledgePoint, content FROM adaptive_practices WHERE id = ? AND user_id = ?")
    .get(req.params.id, req.user!.id) as { id: string; knowledgePoint: string; content: string } | undefined;
  if (!practice) {
    res.status(404).json({ error: "practice_not_found" });
    return;
  }
  try {
    const report = (await gradeLearningWork("批改变式练习", {
      practice: JSON.parse(practice.content),
      answers: req.body.answers ?? {}
    })) as Record<string, any>;
    const score = Math.max(0, Math.min(100, Number(report.score ?? 0)));
    db.prepare("UPDATE adaptive_practices SET report = ?, status = ? WHERE id = ? AND user_id = ?").run(
      JSON.stringify(report),
      score >= 80 ? "mastered" : "needs_retry",
      practice.id,
      req.user!.id
    );
    persistGradingWrongQuestions(req.user!.id, practice.id, report);
    updateMasteryByKnowledgePoint(req.user!.id, practice.knowledgePoint, score >= 80 ? 12 : -6);
    res.json({ report: { ...report, score } });
  } catch {
    res.status(502).json({ error: "practice_grading_failed" });
  }
});

app.post("/api/goals", requireAuth, async (req: AuthedRequest, res) => {
  const title = String(req.body.title ?? "").trim();
  const subject = String(req.body.subject ?? "数学").trim();
  const durationDays = Math.max(3, Math.min(14, Number(req.body.durationDays ?? 7)));
  if (!title) {
    res.status(400).json({ error: "goal_title_required" });
    return;
  }
  try {
    const plan = await generateGoalPlan({ title, subject, durationDays, profile: buildLearningProfile(req.user!.id, subject) });
    const goal = { id: newId("goal"), title, subject, durationDays, plan, progress: 0, status: "active", createdAt: nowIso() };
    db.prepare(
      "INSERT INTO learning_goals (id, user_id, title, subject, duration_days, plan, progress, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
    ).run(goal.id, req.user!.id, title, subject, durationDays, JSON.stringify(plan), goal.progress, goal.status, goal.createdAt);
    res.json({ goal });
  } catch {
    res.status(502).json({ error: "goal_generation_failed" });
  }
});

app.get("/api/goals", requireAuth, (req: AuthedRequest, res) => {
  const goals = db
    .prepare("SELECT id, title, subject, duration_days AS durationDays, plan, progress, status, created_at AS createdAt FROM learning_goals WHERE user_id = ? ORDER BY created_at DESC")
    .all(req.user!.id)
    .map((goal: any) => ({ ...goal, plan: safeJsonParse(goal.plan) }));
  res.json({ goals });
});

app.post("/api/goals/:id/progress", requireAuth, (req: AuthedRequest, res) => {
  const progress = Math.max(0, Math.min(100, Number(req.body.progress ?? 0)));
  db.prepare("UPDATE learning_goals SET progress = ?, status = ? WHERE id = ? AND user_id = ?").run(
    progress,
    progress >= 100 ? "completed" : "active",
    req.params.id,
    req.user!.id
  );
  res.json({ ok: true, progress });
});

function ensureConversation(userId: string, requestedId: string | undefined, mode: string) {
  if (requestedId) {
    const exists = db.prepare("SELECT id FROM conversations WHERE id = ? AND user_id = ?").get(requestedId, userId);
    if (exists) return requestedId;
  }

  const id = newId("conv");
  const createdAt = nowIso();
  db.prepare("INSERT INTO conversations (id, user_id, title, mode, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)").run(
    id,
    userId,
    modeTitle(mode),
    mode,
    createdAt,
    createdAt
  );
  return id;
}

async function updateConversationTitleAsync(
  userId: string,
  conversationId: string,
  mode: string,
  firstMessage: string,
  assistantContent: string
) {
  try {
    const current = db
      .prepare("SELECT title FROM conversations WHERE id = ? AND user_id = ?")
      .get(conversationId, userId) as { title: string } | undefined;
    if (!current || current.title !== modeTitle(mode)) return;
    const title = await generateConversationTitle(mode as ChatRequest["mode"], firstMessage, assistantContent);
    db.prepare("UPDATE conversations SET title = ?, updated_at = ? WHERE id = ? AND user_id = ?").run(
      title,
      nowIso(),
      conversationId,
      userId
    );
  } catch (error) {
    console.error("conversation title generation failed", error instanceof Error ? error.message : "unknown_error");
  }
}

function modeTitle(mode: string) {
  if (mode === "concept") return "概念学习";
  if (mode === "free") return "自由问答";
  return "引导讲题";
}

function safeJsonParse(text: string) {
  try {
    return JSON.parse(text || "{}");
  } catch {
    return {};
  }
}

function getStats(userId: string) {
  const row = db
    .prepare(
      "SELECT COALESCE(SUM(minutes), 0) AS learnedMinutes, COALESCE(SUM(correct), 0) AS solvedCount, COALESCE(SUM(wrong), 0) AS wrongCount FROM learning_records WHERE user_id = ?"
    )
    .get(userId) as { learnedMinutes: number; solvedCount: number; wrongCount: number };
  const activeWrong = db
    .prepare("SELECT COUNT(*) AS count FROM wrong_questions WHERE user_id = ? AND status = 'active'")
    .get(userId) as { count: number };
  return {
    learnedMinutes: row.learnedMinutes,
    solvedCount: row.solvedCount,
    wrongCount: activeWrong.count,
    streakDays: 1
  };
}

function buildLearningProfile(userId: string, subject: string) {
  const wrongPoints = db
    .prepare(
      "SELECT knowledge_point AS point, COUNT(*) AS count FROM wrong_questions WHERE user_id = ? AND status = 'active' GROUP BY knowledge_point ORDER BY count DESC LIMIT 8"
    )
    .all(userId);
  const records = db
    .prepare(
      "SELECT knowledge_point AS point, SUM(correct) AS correct, SUM(wrong) AS wrong, SUM(minutes) AS minutes FROM learning_records WHERE user_id = ? GROUP BY knowledge_point ORDER BY wrong DESC, minutes DESC LIMIT 8"
    )
    .all(userId);
  const recentMessages = db
    .prepare(
      "SELECT content FROM messages WHERE user_id = ? ORDER BY created_at DESC LIMIT 8"
    )
    .all(userId) as Array<{ content: string }>;
  const activeWrongSamples = db
    .prepare(
      "SELECT title, reason, knowledge_point AS knowledgePoint FROM wrong_questions WHERE user_id = ? AND status = 'active' ORDER BY created_at DESC LIMIT 8"
    )
    .all(userId);

  return {
    subject,
    wrongPointSummary: wrongPoints,
    learningRecordSummary: records,
    activeWrongSamples,
    recentConversationSignals: recentMessages.map((item) => item.content.slice(0, 160))
  };
}

function updateMasteryByKnowledgePoint(userId: string, knowledgePoint: string, delta: number) {
  const node = db
    .prepare("SELECT id FROM knowledge_nodes WHERE title = ? OR title LIKE ? LIMIT 1")
    .get(knowledgePoint, `%${knowledgePoint}%`) as { id: string } | undefined;
  if (!node) return;
  const current = db
    .prepare("SELECT mastery FROM user_mastery WHERE user_id = ? AND node_id = ?")
    .get(userId, node.id) as { mastery: number } | undefined;
  const mastery = Math.max(0, Math.min(100, (current?.mastery ?? 0) + delta));
  const status = mastery >= 80 ? "mastered" : mastery > 0 ? "learning" : "not_started";
  db.prepare(
    `INSERT INTO user_mastery (user_id, node_id, status, mastery, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(user_id, node_id) DO UPDATE SET status = excluded.status, mastery = excluded.mastery, updated_at = excluded.updated_at`
  ).run(userId, node.id, status, mastery, nowIso());
}

function buildClassHeatmap(classId: string) {
  return db
    .prepare(
      `SELECT w.knowledge_point AS point, COUNT(*) AS count
       FROM class_students cs
       JOIN wrong_questions w ON w.user_id = cs.student_id
       WHERE cs.class_id = ? AND w.status = 'active'
       GROUP BY w.knowledge_point
       ORDER BY count DESC
       LIMIT 10`
    )
    .all(classId);
}

function persistGradingWrongQuestions(userId: string, sourceId: string, report: Record<string, any>) {
  const wrongQuestions = Array.isArray(report.wrong_questions) ? report.wrong_questions : [];
  const insertWrong = db.prepare(
    "INSERT INTO wrong_questions (id, user_id, title, reason, knowledge_point, status, attempts, correct_streak, created_at, review_due) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
  );
  const insertRecord = db.prepare(
    "INSERT INTO learning_records (id, user_id, event_type, knowledge_point, minutes, correct, wrong, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
  );
  for (const item of wrongQuestions.slice(0, 10)) {
    const title = String(item.title ?? sourceId).slice(0, 80);
    const reason = String(item.reason ?? "批改发现薄弱点").slice(0, 120);
    const knowledgePoint = String(item.knowledge_point ?? "待AI归类").slice(0, 40);
    insertWrong.run(newId("wrong"), userId, title, reason, knowledgePoint, "active", 1, 0, nowIso(), reviewDue(1));
    insertRecord.run(newId("record"), userId, "grading_wrong", knowledgePoint, 0, 0, 1, nowIso());
    updateMasteryByKnowledgePoint(userId, knowledgePoint, -8);
  }
}

function evaluateAchievements(userId: string) {
  const stats = getStats(userId);
  const mastered = db
    .prepare("SELECT COUNT(*) AS count FROM user_mastery WHERE user_id = ? AND status = 'mastered'")
    .get(userId) as { count: number };
  const submitted = db
    .prepare("SELECT COUNT(*) AS count FROM assignment_submissions WHERE student_id = ? AND status = 'submitted'")
    .get(userId) as { count: number };
  const candidates = [
    { code: "study_3_days", title: "坚持之星", description: "累计学习达到3天", unlocked: stats.learnedMinutes >= 45 },
    { code: "master_10", title: "学霸入门", description: "掌握10个知识点", unlocked: mastered.count >= 10 },
    { code: "homework_5", title: "作业达人", description: "完成5次作业", unlocked: submitted.count >= 5 }
  ];
  const insert = db.prepare(
    "INSERT OR IGNORE INTO user_achievements (user_id, code, title, description, unlocked_at) VALUES (?, ?, ?, ?, ?)"
  );
  for (const item of candidates) {
    if (item.unlocked) insert.run(userId, item.code, item.title, item.description, nowIso());
  }
  return db
    .prepare("SELECT code, title, description, unlocked_at AS unlockedAt FROM user_achievements WHERE user_id = ? ORDER BY unlocked_at DESC")
    .all(userId);
}

app.listen(port, "127.0.0.1", () => {
  console.log(`zhixue-ai api listening on http://127.0.0.1:${port}`);
});
