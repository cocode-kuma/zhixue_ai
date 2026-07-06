import type {
  ChatMessage,
  ConversationSummary,
  KnowledgeCard,
  KnowledgeEdge,
  KnowledgeNode,
  StudyMode,
  StudyStats,
  UserProfile,
  WrongQuestion
} from "./types";

const TOKEN_KEY = "zhixue_token";

export function getToken() {
  return localStorage.getItem(TOKEN_KEY) ?? "";
}

export function setToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const response = await fetch(path, { ...init, headers });
  if (!response.ok) {
    throw new Error(await readableError(response));
  }
  return response.json() as Promise<T>;
}

async function readableError(response: Response) {
  try {
    const body = (await response.json()) as { error?: string; message?: string };
    return friendlyErrorMessage(body.message ?? body.error, response.status);
  } catch {
    return friendlyErrorMessage(undefined, response.status);
  }
}

const friendlyErrors: Record<string, string> = {
  unauthorized: "登录已过期，请重新登录。",
  forbidden: "当前账号没有权限执行这个操作。",
  invalid_credentials: "账号或密码不正确，请检查后再试。",
  account_suspended: "这个账号已被停用，请联系管理员。",
  invalid_register_payload: "请填写有效邮箱，密码至少 8 位。",
  email_exists: "这个邮箱或账号已经被注册。",
  user_not_found: "没有找到这个用户。",
  name_required: "请填写昵称。",
  message_required: "请输入要发送的内容。",
  conversation_not_found: "没有找到这条对话，可能已被删除。",
  title_required: "请填写题目内容。",
  answer_required: "请先填写答案。",
  not_found: "没有找到对应内容。",
  wrong_question_not_found: "没有找到这道错题。",
  wrong_review_grading_failed: "错题批改暂时失败，请稍后再试。",
  concept_required: "请填写知识点。",
  ai_api_unavailable: "AI 服务暂时不可用，请稍后再试。",
  ai_api_empty_content: "AI 暂时没有返回内容，请稍后再试。",
  learning_api_empty_content: "学习分析暂时没有返回内容，请稍后再试。",
  invalid_image_data: "图片格式不正确，请上传 PNG、JPG 或 WebP。",
  image_too_large: "图片太大了，请换一张更小的图片。",
  ocr_no_text_detected: "没有识别到清晰文字，请换一张更清楚的图片。",
  ocr_config_invalid: "OCR 配置异常，请联系管理员。",
  ocr_failed: "OCR 识别暂时不可用，请稍后再试。",
  ocr_empty_content: "OCR 暂时没有识别到内容，请换一张更清楚的图片。",
  local_ocr_empty_content: "本地 OCR 暂时没有识别到内容，请换一张更清楚的图片。",
  invalid_ocr_cache_method: "OCR 缓存配置异常，请联系管理员。",
  invalid_json_response: "AI 返回格式异常，请稍后再试。",
  knowledge_node_payload_required: "请填写完整的知识点信息。",
  knowledge_node_not_found: "没有找到这个知识点。",
  knowledge_edge_payload_required: "请选择有效的知识点关系。",
  invalid_guardian_email: "请填写有效的家长邮箱。",
  class_name_required: "请填写班级名称。",
  class_not_found: "没有找到这个班级。",
  student_not_found: "没有找到这个学生账号。",
  assignment_payload_required: "请填写完整的作业信息。",
  assignment_not_found: "没有找到这份作业。",
  announcement_payload_required: "请填写公告标题和内容。",
  cannot_demote_self: "不能取消自己的管理员权限。",
  last_admin_required: "至少需要保留一个可用管理员。",
  password_too_short: "新密码至少需要 8 位。",
  profile_required: "请填写账号和姓名。",
  cannot_suspend_self: "不能停用自己的账号。",
  students_required: "请先选择要加入班级的用户。",
  teacher_not_found: "请选择有效的老师或管理员作为班主任。",
  class_payload_required: "请填写班级名称、科目和负责老师。",
  guardian_link_payload_required: "请选择学生并填写有效的家长邮箱。",
  ai_grading_failed: "AI 批改暂时失败，请稍后再试。",
  practice_grading_failed: "AI 批改暂时失败，请稍后再试。",
  quiz_not_found: "没有找到这次测验。",
  variant_generation_failed: "变式题生成失败，请稍后再试。",
  practice_not_found: "没有找到这次练习。",
  goal_title_required: "请填写学习目标。",
  goal_generation_failed: "学习目标生成失败，请稍后再试。"
};

function friendlyErrorMessage(raw?: string, status?: number) {
  const value = raw?.trim();
  if (!value) return statusErrorMessage(status);
  if (friendlyErrors[value]) return friendlyErrors[value];
  if (value.startsWith("ai_api_error:")) return "AI 服务暂时不可用，请稍后再试。";
  if (value.startsWith("learning_api_error:")) return "学习分析服务暂时不可用，请稍后再试。";
  if (value.startsWith("ocr_api_error:")) return "OCR 识别暂时不可用，请稍后再试。";
  if (value.startsWith("ai_stream_error:")) return "AI 流式输出暂时中断，请稍后再试。";
  if (/[\u4e00-\u9fff]/.test(value)) return value;
  if (/^[a-z][a-z0-9_:-]*$/i.test(value)) return statusErrorMessage(status);
  return value;
}

function statusErrorMessage(status?: number) {
  if (status === 400) return "请求内容有误，请检查后再试。";
  if (status === 401) return "登录已过期，请重新登录。";
  if (status === 403) return "当前账号没有权限执行这个操作。";
  if (status === 404) return "没有找到对应内容。";
  if (status === 409) return "内容已存在，请换一个再试。";
  if (status === 413) return "上传内容太大了。";
  if (status === 429) return "操作太频繁了，请稍后再试。";
  if (status && status >= 500) return "服务暂时不可用，请稍后再试。";
  return "请求失败，请稍后再试。";
}

export async function register(payload: { email: string; password: string; name: string; grade: string; role: UserProfile["role"] }) {
  return request<{ token: string; user: UserProfile }>("/api/auth/register", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function login(payload: { email: string; password: string }) {
  return request<{ token: string; user: UserProfile }>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function bootstrap() {
  return request<{
    user: UserProfile;
    conversations: ConversationSummary[];
    activeConversationId: string;
    messages: ChatMessage[];
    wrongQuestions: WrongQuestion[];
    knowledgeCards: KnowledgeCard[];
    latestPlan: null | {
      summary?: string;
      weakness_analysis?: Array<{ point: string; evidence: string; priority: string }>;
      daily_plan?: Array<{ day: string; concept: string; practice: string; review: string; minutes: number }>;
      review_plan?: string[];
      acceptance_checks?: string[];
      tasks?: unknown[];
      milestones?: unknown[];
    };
    latestQuiz: null | {
      id?: string;
      title?: string;
      questions?: Array<{ type: string; question: string; answer: string; knowledge_point: string }>;
    };
    stats: StudyStats;
  }>("/api/bootstrap");
}

export async function updateProfile(payload: { name: string; grade: string; avatarUrl: string }) {
  return request<{ user: UserProfile }>("/api/me", {
    method: "PATCH",
    body: JSON.stringify(payload)
  });
}

export async function exportMyData() {
  return request<Record<string, unknown>>("/api/me/export");
}

export async function deleteMyAccount() {
  return request<{ ok: boolean }>("/api/me", {
    method: "DELETE"
  });
}

export async function createConversation(mode: StudyMode) {
  return request<{ conversation: ConversationSummary; messages: ChatMessage[] }>("/api/conversations", {
    method: "POST",
    body: JSON.stringify({ mode })
  });
}

export async function listConversations() {
  return request<{ conversations: ConversationSummary[] }>("/api/conversations");
}

export async function loadConversation(id: string) {
  return request<{ conversation: ConversationSummary; messages: ChatMessage[] }>(`/api/conversations/${id}`);
}

export async function deleteConversation(id: string) {
  return request<{ ok: boolean }>(`/api/conversations/${id}`, {
    method: "DELETE"
  });
}

export async function sendChatMessage(
  mode: StudyMode,
  message: string,
  conversationId: string
): Promise<{
  conversationId: string;
  message: ChatMessage;
  wrongQuestion: WrongQuestion | null;
  stats: StudyStats;
}> {
  return request("/api/chat", {
    method: "POST",
    body: JSON.stringify({
      mode,
      message,
      conversationId
    })
  });
}

export async function streamChatMessage(
  mode: StudyMode,
  message: string,
  conversationId: string,
  handlers: {
    onMeta?: (data: { conversationId: string }) => void;
    onDelta: (delta: string) => void;
    onDone: (data: {
      conversationId: string;
      message: ChatMessage;
      wrongQuestion: WrongQuestion | null;
      stats: StudyStats;
    }) => void;
  }
) {
  const token = getToken();
  const response = await fetch("/api/chat/stream", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: JSON.stringify({ mode, message, conversationId })
  });

  if (!response.ok) {
    throw new Error(await readableError(response));
  }

  if (!response.body) {
    throw new Error(friendlyErrorMessage("ai_stream_error"));
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split(/\n\n/);
    buffer = events.pop() ?? "";

    for (const rawEvent of events) {
      const parsed = parseSseEvent(rawEvent);
      if (!parsed) continue;
      if (parsed.event === "meta") {
        handlers.onMeta?.(parsed.data as { conversationId: string });
      }
      if (parsed.event === "delta") {
        handlers.onDelta((parsed.data as { delta: string }).delta);
      }
      if (parsed.event === "done") {
        handlers.onDone(
          parsed.data as {
            conversationId: string;
            message: ChatMessage;
            wrongQuestion: WrongQuestion | null;
            stats: StudyStats;
          }
        );
      }
      if (parsed.event === "error") {
        const data = parsed.data as { error?: string; message?: string };
        throw new Error(friendlyErrorMessage(data.message ?? data.error ?? "ai_stream_error"));
      }
    }
  }
}

function parseSseEvent(rawEvent: string) {
  const eventLine = rawEvent.split(/\r?\n/).find((line) => line.startsWith("event:"));
  const dataLine = rawEvent.split(/\r?\n/).find((line) => line.startsWith("data:"));
  if (!eventLine || !dataLine) return null;
  return {
    event: eventLine.slice("event:".length).trim(),
    data: JSON.parse(dataLine.slice("data:".length).trim()) as unknown
  };
}

export async function createWrongQuestion(title: string) {
  return request<{ wrongQuestion: WrongQuestion; stats: StudyStats }>("/api/wrong-questions", {
    method: "POST",
    body: JSON.stringify({ title })
  });
}

export async function masterWrongQuestion(id: string) {
  return request<{ ok: boolean; stats: StudyStats }>(`/api/wrong-questions/${id}/master`, {
    method: "POST",
    body: JSON.stringify({})
  });
}

export async function submitWrongQuestionReview(id: string, answer: string) {
  return request<{ report: GradingReport; mastered: boolean; stats: StudyStats }>(`/api/wrong-questions/${id}/review`, {
    method: "POST",
    body: JSON.stringify({ answer })
  });
}

export async function generateKnowledgeCard(concept: string) {
  return request<{ card: KnowledgeCard; stats: StudyStats }>("/api/knowledge-cards/generate", {
    method: "POST",
    body: JSON.stringify({ concept })
  });
}

export async function generateStudyPlan(payload: {
  grade: string;
  subject: string;
  currentScore: number;
  targetScore: number;
  selfWeakness: string;
}) {
  return request<{
    plan: {
      id: string;
      content: {
        summary?: string;
        weakness_analysis?: Array<{ point: string; evidence: string; priority: string }>;
        daily_plan?: Array<{ day: string; concept: string; practice: string; review: string; minutes: number }>;
      review_plan?: string[];
      acceptance_checks?: string[];
      tasks?: unknown[];
      milestones?: unknown[];
      };
    };
    stats: StudyStats;
  }>(
    "/api/study-plans/generate",
    {
      method: "POST",
      body: JSON.stringify(payload)
    }
  );
}

export async function generateQuiz(payload: { subject: string; topic: string; questionCount: number }) {
  return request<{
    quiz: {
      id: string;
      content: {
        title?: string;
        questions?: Array<{ type: string; question: string; answer: string; knowledge_point: string }>;
      };
    };
    stats: StudyStats;
  }>("/api/quizzes/generate", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function runOcr(payload: { dataUrl: string; fileName: string }) {
  return request<{ job: { id: string; status: string; extractedText: string } }>("/api/ocr", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function loadKnowledgeMap(subject: string) {
  return request<{ nodes: KnowledgeNode[]; edges: KnowledgeEdge[] }>(
    `/api/knowledge-map?subject=${encodeURIComponent(subject)}`
  );
}

export async function createKnowledgeNode(payload: { subject: string; gradeBand: string; title: string; description: string }) {
  return request<{ node: KnowledgeNode }>("/api/knowledge-map/nodes", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function updateKnowledgeNode(nodeId: string, payload: { gradeBand: string; title: string; description: string }) {
  return request<{ ok: boolean }>(`/api/knowledge-map/nodes/${nodeId}`, {
    method: "PATCH",
    body: JSON.stringify(payload)
  });
}

export async function createKnowledgeEdge(payload: { subject: string; fromNodeId: string; toNodeId: string; relation: string }) {
  return request<{ edge: KnowledgeEdge }>("/api/knowledge-map/edges", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function updateMastery(nodeId: string, mastery: number) {
  return request<{ ok: boolean; status: KnowledgeNode["status"]; mastery: number }>(
    `/api/knowledge-map/${nodeId}/mastery`,
    {
      method: "POST",
      body: JSON.stringify({ mastery })
    }
  );
}

export async function createGuardianLink(guardianEmail: string) {
  return request<{ link: { id: string; guardianEmail: string; status: string } }>("/api/guardian-links", {
    method: "POST",
    body: JSON.stringify({ guardianEmail })
  });
}

export async function loadGuardianReport() {
  return request<{ students: Array<{ name: string; grade: string; stats: StudyStats; weakPoints: Array<{ point: string; count: number }> }> }>(
    "/api/guardian/report"
  );
}

export async function createClass(payload: { name: string; subject: string }) {
  return request<{ class: { id: string; name: string; subject: string } }>("/api/classes", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function loadTeacherClasses() {
  return request<{
    classes: Array<{ id: string; name: string; subject: string; studentCount: number; createdAt: string }>;
  }>("/api/classes");
}

export async function addStudentToClass(classId: string, email: string) {
  return request<{ ok: boolean }>(`/api/classes/${classId}/students`, {
    method: "POST",
    body: JSON.stringify({ email })
  });
}

export async function loadClassReport(classId: string) {
  return request<{
    class: { id: string; name: string; subject: string };
    heatmap: Array<{ point: string; count: number }>;
    students: Array<{ id: string; name: string; grade: string; stats: StudyStats; weakPoints: Array<{ point: string; count: number }> }>;
  }>(`/api/classes/${classId}/report`);
}

export async function loadClassAssignments(classId: string) {
  return request<{
    assignments: Array<{ id: string; title: string; knowledgePoint: string; questionsText: string; questionCount: number; dueAt: string; createdAt: string }>;
  }>(`/api/classes/${classId}/assignments`);
}

export async function createAssignment(
  classId: string,
  payload: { title: string; knowledgePoint: string; questionsText: string; questionCount: number; dueAt: string }
) {
  return request<{ assignment: { id: string; title: string; knowledgePoint: string; questionsText: string }; assignedCount: number }>(
    `/api/classes/${classId}/assignments`,
    {
      method: "POST",
      body: JSON.stringify(payload)
    }
  );
}

export async function updateAssignment(
  classId: string,
  assignmentId: string,
  payload: { title: string; knowledgePoint: string; questionsText: string; questionCount: number; dueAt: string }
) {
  return request<{ ok: boolean }>(`/api/classes/${classId}/assignments/${assignmentId}`, {
    method: "PATCH",
    body: JSON.stringify(payload)
  });
}

export async function loadAssignmentSubmissions(classId: string, assignmentId: string) {
  return request<{
    assignment: { id: string; title: string; knowledgePoint: string; questionsText: string; questionCount: number; dueAt: string };
    submissions: Array<{
      studentId: string;
      name: string;
      grade: string;
      status: string;
      score: number;
      report: GradingReport;
      submittedAt: string;
    }>;
  }>(`/api/classes/${classId}/assignments/${assignmentId}/submissions`);
}

export async function loadStudentAssignments() {
  return request<{
    assignments: Array<{
      id: string;
      title: string;
      knowledgePoint: string;
      questionsText: string;
      questionCount: number;
      dueAt: string;
      className: string;
      status: string;
      score: number;
    }>;
  }>("/api/assignments");
}

export async function submitAssignment(id: string, answer: string) {
  return request<{ report: GradingReport }>(`/api/assignments/${id}/submit`, {
    method: "POST",
    body: JSON.stringify({ answer })
  });
}

export async function submitQuiz(id: string, answers: Record<string, string>) {
  return request<{ report: GradingReport }>(`/api/quizzes/${id}/submit`, {
    method: "POST",
    body: JSON.stringify({ answers })
  });
}

export interface GradingReport {
  score: number;
  summary?: string;
  correct_points?: string[];
  wrong_points?: string[];
  suggestions?: string[];
  wrong_questions?: Array<{ title: string; reason: string; knowledge_point: string }>;
}

export async function loadReports() {
  return request<{
    reports: Array<{ sourceId: string; type: string; title: string; score: number; report: string; createdAt: string }>;
  }>("/api/reports");
}

export async function generateAdaptivePractice(payload: {
  sourceType: string;
  sourceId: string;
  knowledgePoint: string;
  sourceText: string;
}) {
  return request<{
    practice: {
      id: string;
      content: { title?: string; knowledge_point?: string; questions?: Array<{ question: string; answer: string; hint: string; difficulty: string }> };
    };
  }>("/api/adaptive-practices/generate", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function submitAdaptivePractice(id: string, answers: Record<string, string>) {
  return request<{ report: GradingReport }>(`/api/adaptive-practices/${id}/submit`, {
    method: "POST",
    body: JSON.stringify({ answers })
  });
}

export async function createGoal(payload: { title: string; subject: string; durationDays: number }) {
  return request<{ goal: { id: string; title: string; plan: { summary?: string; days?: unknown[]; checkpoints?: unknown[] }; progress: number } }>(
    "/api/goals",
    {
      method: "POST",
      body: JSON.stringify(payload)
    }
  );
}

export async function loadGoals() {
  return request<{ goals: Array<{ id: string; title: string; subject: string; plan: { summary?: string; days?: unknown[]; checkpoints?: unknown[] }; progress: number; status: string }> }>("/api/goals");
}

export async function updateGoalProgress(id: string, progress: number) {
  return request<{ ok: boolean; progress: number }>(`/api/goals/${id}/progress`, {
    method: "POST",
    body: JSON.stringify({ progress })
  });
}

export async function createAnnouncement(classId: string, payload: { title: string; content: string; assignmentId?: string }) {
  return request<{ announcement: { id: string; title: string } }>(`/api/classes/${classId}/announcements`, {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function loadAnnouncements() {
  return request<{ announcements: Array<{ id: string; title: string; content: string; assignmentId: string; className: string; createdAt: string }> }>(
    "/api/announcements"
  );
}

export async function loadAchievements() {
  return request<{ achievements: Array<{ code: string; title: string; description: string; unlockedAt: string }> }>("/api/achievements");
}

export async function loadAdminDashboard() {
  return request<{
    totals: { totalUsers: number; activeUsers: number; totalMinutes: number; submittedAssignments: number };
    trends: Array<{ day: string; minutes: number; correct: number; wrong: number }>;
    hotKnowledge: Array<{ point: string; count: number }>;
    classMastery: Array<{ className: string; subject: string; averageMastery: number }>;
    roleBreakdown: Array<{ role: string; count: number }>;
    recentUsers: Array<{ id: string; email: string; name: string; grade: string; role: string; createdAt: string }>;
    recentActivity: Array<{
      eventType: string;
      knowledgePoint: string;
      minutes: number;
      correct: number;
      wrong: number;
      createdAt: string;
      userName: string;
      userEmail: string;
    }>;
  }>("/api/admin/dashboard");
}

export interface AdminActivityRow {
  id: string;
  eventType: string;
  knowledgePoint: string;
  minutes: number;
  correct: number;
  wrong: number;
  createdAt: string;
  userName: string;
  userEmail: string;
  userRole: UserProfile["role"];
}

export interface AdminHotKnowledgeRow {
  point: string;
  count: number;
  minutes: number;
  correct: number;
  wrong: number;
  lastSeenAt: string;
}

export async function loadAdminActivity(page = 1) {
  return request<{ rows: AdminActivityRow[]; page: number; pageSize: number; total: number; maxRows: number }>(
    `/api/admin/activity?page=${encodeURIComponent(String(page))}&pageSize=20`
  );
}

export async function loadAdminHotKnowledge(page = 1) {
  return request<{ rows: AdminHotKnowledgeRow[]; page: number; pageSize: number; total: number; maxRows: number }>(
    `/api/admin/hot-knowledge?page=${encodeURIComponent(String(page))}&pageSize=20`
  );
}

export interface AdminUserRow {
  id: string;
  email: string;
  name: string;
  grade: string;
  role: UserProfile["role"];
  status: "active" | "suspended";
  createdAt: string;
  classCount: number;
  classes: string;
}

export interface AdminClassRow {
  id: string;
  name: string;
  subject: string;
  createdAt: string;
  teacherId: string;
  teacherName: string;
  teacherEmail: string;
  studentCount: number;
}

export interface AdminAuditLog {
  id: string;
  action: string;
  targetType: string;
  targetId: string;
  detail: string;
  createdAt: string;
  adminName: string;
  adminEmail: string;
}

export async function loadAdminUsers(payload: { q?: string; role?: string } = {}) {
  const params = new URLSearchParams();
  if (payload.q) params.set("q", payload.q);
  if (payload.role) params.set("role", payload.role);
  const suffix = params.toString() ? `?${params.toString()}` : "";
  return request<{ users: AdminUserRow[] }>(`/api/admin/users${suffix}`);
}

export async function loadAdminClasses() {
  return request<{ classes: AdminClassRow[] }>("/api/admin/classes");
}

export async function updateAdminUserRole(id: string, role: UserProfile["role"]) {
  return request<{ ok: boolean; role: UserProfile["role"] }>(`/api/admin/users/${id}/role`, {
    method: "POST",
    body: JSON.stringify({ role })
  });
}

export async function resetAdminUserPassword(id: string, password: string) {
  return request<{ ok: boolean }>(`/api/admin/users/${id}/password`, {
    method: "POST",
    body: JSON.stringify({ password })
  });
}

export async function updateAdminUserProfile(id: string, payload: { email: string; name: string; grade: string }) {
  return request<{ ok: boolean }>(`/api/admin/users/${id}/profile`, {
    method: "PATCH",
    body: JSON.stringify(payload)
  });
}

export async function updateAdminUserStatus(id: string, status: "active" | "suspended") {
  return request<{ ok: boolean; status: "active" | "suspended" }>(`/api/admin/users/${id}/status`, {
    method: "POST",
    body: JSON.stringify({ status })
  });
}

export async function forceUsersIntoClass(classId: string, payload: { userIds?: string[]; accounts?: string[] }) {
  return request<{ ok: boolean; matched: number; added: number }>(`/api/admin/classes/${classId}/students`, {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function bulkCreateAdminUsers(payload: {
  classId?: string;
  users: Array<{ email: string; password: string; name: string; grade: string; role: UserProfile["role"] }>;
}) {
  return request<{
    created: Array<{ id: string; email: string; name: string; role: UserProfile["role"] }>;
    skipped: Array<{ email: string; reason: string }>;
    createdCount: number;
    skippedCount: number;
  }>("/api/admin/bulk-users", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function createAdminClass(payload: { name: string; subject: string; teacherId: string }) {
  return request<{ class: { id: string; name: string; subject: string; teacherId: string; createdAt: string } }>("/api/admin/classes", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function updateAdminClass(id: string, payload: { name: string; subject: string; teacherId: string }) {
  return request<{ ok: boolean }>(`/api/admin/classes/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload)
  });
}

export async function loadAdminClassStudents(id: string) {
  return request<{
    class: { id: string; name: string; subject: string };
    students: Array<{ id: string; email: string; name: string; grade: string; role: UserProfile["role"]; status: string; joinedAt: string }>;
  }>(`/api/admin/classes/${id}/students`);
}

export async function removeAdminClassStudent(classId: string, userId: string) {
  return request<{ ok: boolean; removed: number }>(`/api/admin/classes/${classId}/students/${userId}`, {
    method: "DELETE"
  });
}

export async function createAdminGuardianLink(payload: { studentId: string; guardianEmail: string }) {
  return request<{ link: { id: string; studentId: string; guardianEmail: string; status: string; createdAt: string } }>("/api/admin/guardian-links", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function loadAdminAuditLogs() {
  return request<{ logs: AdminAuditLog[] }>("/api/admin/audit-logs");
}
