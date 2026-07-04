import {
  Alert,
  Box,
  Button,
  CssBaseline,
  Divider,
  IconButton,
  MenuItem,
  Paper,
  Stack,
  TextField,
  ThemeProvider,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
  createTheme
} from "@mui/material";
import {
  BarChart3,
  Bell,
  BookOpen,
  CheckCircle2,
  ClipboardList,
  FileText,
  History,
  Image,
  Lightbulb,
  LogOut,
  Menu,
  Moon,
  MessageCircle,
  BookOpenText,
  Plus,
  ShieldCheck,
  Sparkles,
  Send,
  Settings,
  Sun,
  Trash2,
  Brain,
  Network,
  Users,
  School
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from "react";
import ReactMarkdown from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkMath from "remark-math";
import "katex/dist/katex.min.css";
import {
  addStudentToClass,
  createAnnouncement,
  createAssignment,
  createClass,
  createGoal,
  createKnowledgeEdge,
  createKnowledgeNode,
  deleteMyAccount,
  exportMyData,
  generateAdaptivePractice,
  createGuardianLink,
  loadClassReport,
  loadAdminDashboard,
  loadAssignmentSubmissions,
  loadClassAssignments,
  loadGuardianReport,
  loadKnowledgeMap,
  loadAchievements,
  loadAnnouncements,
  loadGoals,
  loadReports,
  loadStudentAssignments,
  loadTeacherClasses,
  runOcr,
  submitAssignment,
  submitAdaptivePractice,
  submitQuiz,
  submitWrongQuestionReview,
  updateProfile,
  updateGoalProgress,
  updateAssignment,
  updateKnowledgeNode,
  updateMastery
} from "./api";
import { useStudyStore } from "./store";
import type { StudyMode, UserProfile } from "./types";

type UserRole = UserProfile["role"];
type ViewId =
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
  | "settings";
type ViewGroup = "常用" | "学习" | "规划" | "知识" | "管理" | "系统";
type KnowledgeNodeView = { id: string; subject?: string; gradeBand?: string; title: string; description: string; status: string; mastery: number };
type KnowledgeEdgeView = { id: string; fromNodeId: string; toNodeId: string; relation: string };
type AppNotification = {
  id: string;
  kind: "pending" | "success" | "error";
  title: string;
  message: string;
  createdAt: string;
  read: boolean;
};

const modes: Array<{ id: StudyMode; label: string; icon: typeof Brain; tone: string }> = [
  { id: "tutor", label: "讲题", icon: BookOpenText, tone: "引导审题、拆解、提示" },
  { id: "concept", label: "概念", icon: Brain, tone: "例子、定义、检查理解" },
  { id: "free", label: "问答", icon: MessageCircle, tone: "学习问题随时问" }
];

const views: Array<{
  id: ViewId;
  label: string;
  icon: typeof BarChart3;
  group: ViewGroup;
  roles: UserRole[];
}> = [
  { id: "dashboard", label: "首页", icon: BarChart3, group: "常用", roles: ["student", "teacher", "parent", "admin"] },
  { id: "tutor", label: "AI辅导", icon: MessageCircle, group: "常用", roles: ["student", "teacher", "parent", "admin"] },
  { id: "review", label: "错题复习", icon: BookOpen, group: "学习", roles: ["student"] },
  { id: "quiz", label: "测验", icon: ClipboardList, group: "学习", roles: ["student"] },
  { id: "assignments", label: "作业", icon: FileText, group: "学习", roles: ["student"] },
  { id: "reports", label: "报告", icon: ClipboardList, group: "学习", roles: ["student"] },
  { id: "plan", label: "计划", icon: FileText, group: "规划", roles: ["student"] },
  { id: "goals", label: "目标", icon: CheckCircle2, group: "规划", roles: ["student"] },
  { id: "cards", label: "知识卡片", icon: Lightbulb, group: "知识", roles: ["student"] },
  { id: "ocr", label: "拍照识题", icon: Image, group: "知识", roles: ["student"] },
  { id: "map", label: "知识地图", icon: Network, group: "知识", roles: ["student", "teacher"] },
  { id: "parent", label: "家长端", icon: Users, group: "管理", roles: ["parent", "admin"] },
  { id: "teacher", label: "老师端", icon: School, group: "管理", roles: ["teacher", "admin"] },
  { id: "admin", label: "数据", icon: BarChart3, group: "管理", roles: ["teacher", "admin"] },
  { id: "settings", label: "设置", icon: Settings, group: "系统", roles: ["student", "teacher", "parent", "admin"] }
] as const;

const navGroups: ViewGroup[] = ["常用", "学习", "规划", "知识", "管理", "系统"];

export function App() {
  const [theme, setTheme] = useState<"light" | "dark">(() =>
    localStorage.getItem("zhixue-theme") === "dark" ? "dark" : "light"
  );
  const lastManualSendAt = useRef(0);
  const {
    user,
    authReady,
    authMode,
    authError,
    view,
    conversations,
    conversationId,
    mode,
    input,
    loading,
    pendingTask,
    chatLoadingByConversationId,
    unreadConversationIds,
    error,
    messages,
    wrongQuestions,
    stats,
    knowledgeCards,
    generatedPlan,
    generatedQuiz,
    setAuthMode,
    registerUser,
    loginUser,
    logout,
    loadInitialData,
    setView,
    newConversation,
    selectConversation,
    removeConversation,
    setMode,
    setInput,
    beginConversationWithInput,
    sendMessage,
    markConversationRead,
    markWrongMastered,
    createKnowledgeCard,
    createStudyPlan,
    createQuiz
  } = useStudyStore();
  const [ocrUploading, setOcrUploading] = useState(false);
  const [mobileRailOpen, setMobileRailOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [toast, setToast] = useState<null | { kind: "error" | "pending"; message: string; id: number }>(null);
  const previousPendingTask = useRef<"" | "chat" | "card" | "plan" | "quiz">("");

  useEffect(() => {
    void loadInitialData();
  }, [loadInitialData]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("zhixue-theme", theme);
  }, [theme]);

  const pushNotification = useCallback((item: Omit<AppNotification, "id" | "createdAt" | "read">) => {
    setNotifications((state) => [
      {
        ...item,
        id: `notice_${Date.now()}_${Math.random().toString(16).slice(2)}`,
        createdAt: new Date().toISOString(),
        read: false
      },
      ...state
    ].slice(0, 100));
  }, []);

  const markNotificationsRead = useCallback(() => {
    setNotifications((state) => state.map((item) => (item.read ? item : { ...item, read: true })));
  }, []);

  useEffect(() => {
    if (!error) return;
    const id = Date.now();
    setToast({ kind: "error", message: error, id });
    pushNotification({
      kind: "error",
      title: "请求失败",
      message: error
    });
    const timer = window.setTimeout(() => {
      setToast((current) => (current?.id === id ? null : current));
    }, 4600);
    return () => window.clearTimeout(timer);
  }, [error, pushNotification]);

  useEffect(() => {
    const previous = previousPendingTask.current;
    if (pendingTask && pendingTask !== "chat" && previous !== pendingTask) {
      const id = Date.now();
      const label = pendingLabel(pendingTask);
      setToast({ kind: "pending", message: `${label}，可继续浏览其他内容。`, id });
      pushNotification({
        kind: "pending",
        title: label,
        message: "任务已开始，完成后会继续提醒。"
      });
      window.setTimeout(() => {
        setToast((current) => (current?.id === id ? null : current));
      }, 3200);
    }
    if (!pendingTask && previous && previous !== "chat" && !error) {
      pushNotification({
        kind: "success",
        title: `${pendingLabel(previous)}完成`,
        message: "结果已经更新到当前工作区。"
      });
    }
    previousPendingTask.current = pendingTask;
  }, [error, pendingTask, pushNotification]);

  useEffect(() => {
    if (notificationsOpen) markNotificationsRead();
  }, [markNotificationsRead, notifications.length, notificationsOpen]);

  const accuracy = useMemo(() => {
    const total = stats.solvedCount + stats.wrongCount;
    return total ? Math.round((stats.solvedCount / total) * 100) : 100;
  }, [stats.solvedCount, stats.wrongCount]);
  const currentRole = user?.role ?? "student";
  const currentChatLoading = Boolean(conversationId && chatLoadingByConversationId[conversationId]);
  const showChatThinking = currentChatLoading;
  const unreadNotificationCount = useMemo(
    () => notifications.filter((item) => !item.read).length,
    [notifications]
  );
  const accessibleViews = useMemo(
    () => views.filter((item) => item.roles.includes(currentRole)),
    [currentRole]
  );
  const materialTheme = useMemo(
    () =>
      createTheme({
        palette: {
          mode: theme,
          primary: {
            main: theme === "dark" ? "#7dd3fc" : "#0ea5e9",
            light: theme === "dark" ? "#082f49" : "#f0f9ff",
            dark: theme === "dark" ? "#e0f2fe" : "#0284c7"
          },
          secondary: {
            main: theme === "dark" ? "#6ad7c4" : "#087f74"
          },
          divider: theme === "dark" ? "#272a31" : "#e6e8ef",
          action: {
            hover: theme === "dark" ? "rgba(255,255,255,0.06)" : "rgba(14,165,233,0.07)",
            selected: theme === "dark" ? "rgba(125,211,252,0.16)" : "rgba(14,165,233,0.11)"
          },
          background: {
            default: theme === "dark" ? "#0f172a" : "#f0f9ff",
            paper: theme === "dark" ? "#111827" : "#ffffff"
          },
          text: {
            primary: theme === "dark" ? "#f8fafc" : "#171923",
            secondary: theme === "dark" ? "#cbd5e1" : "#667085"
          }
        },
        shape: {
          borderRadius: 14
        },
        typography: {
          fontFamily:
            'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei", sans-serif',
          h1: {
            fontWeight: 760,
            letterSpacing: 0
          },
          h2: {
            fontWeight: 740,
            letterSpacing: 0
          },
          h3: {
            fontWeight: 720,
            letterSpacing: 0
          },
          button: {
            fontWeight: 700,
            letterSpacing: 0,
            textTransform: "none"
          }
        },
        components: {
          MuiButton: {
            styleOverrides: {
              root: {
                borderRadius: 12,
                minHeight: 40,
                boxShadow: "none",
                "&.MuiButton-containedPrimary": {
                  border: `1px solid ${theme === "dark" ? "#38bdf8" : "#7dd3fc"}`,
                  backgroundColor: theme === "dark" ? "#0c4a6e" : "#e0f2fe",
                  backgroundImage: "none",
                  color: theme === "dark" ? "#e0f2fe" : "#0369a1",
                  boxShadow: "none",
                  "&:hover": {
                    borderColor: theme === "dark" ? "#7dd3fc" : "#38bdf8",
                    backgroundColor: theme === "dark" ? "#075985" : "#bae6fd",
                    backgroundImage: "none",
                    boxShadow: "none"
                  },
                  "&:disabled": {
                    borderColor: theme === "dark" ? "#30343d" : "#d9deea",
                    backgroundColor: theme === "dark" ? "#1d2027" : "#eef2f7",
                    color: theme === "dark" ? "#727986" : "#98a2b3"
                  }
                },
              }
            }
          },
          MuiPaper: {
            styleOverrides: {
              root: {
                backgroundImage: "none",
                borderRadius: 14
              }
            }
          },
          MuiIconButton: {
            styleOverrides: {
              root: {
                borderRadius: 12
              }
            }
          },
          MuiTextField: {
            defaultProps: {
              variant: "outlined"
            }
          },
          MuiOutlinedInput: {
            styleOverrides: {
              root: {
                borderRadius: 12,
                backgroundColor: theme === "dark" ? "#1d2027" : "#ffffff"
              },
              input: {
                color: theme === "dark" ? "#f2f3f5" : "#171923"
              },
              notchedOutline: {
                borderColor: theme === "dark" ? "#30343d" : "#e1e4eb"
              }
            }
          }
        }
      }),
    [theme]
  );
  const renderWithTheme = (node: ReactElement) => (
    <ThemeProvider theme={materialTheme}>
      <CssBaseline />
      {node}
    </ThemeProvider>
  );

  useEffect(() => {
    if (user && !accessibleViews.some((item) => item.id === view)) {
      setView("dashboard");
    }
  }, [accessibleViews, setView, user, view]);

  if (!authReady) {
    return renderWithTheme(
      <main className="loading-screen">
        <Sparkles className="spin" aria-hidden="true" />
        <span>正在加载学习空间...</span>
      </main>
    );
  }

  if (!user) {
    return renderWithTheme(
      <AuthScreen
        authError={authError}
        authMode={authMode}
        loading={loading}
        onLogin={loginUser}
        onRegister={registerUser}
        onSwitch={setAuthMode}
      />
    );
  }

  const activeMode = modes.find((item) => item.id === mode) ?? modes[0];
  const pageTitle = view === "tutor" ? `${activeMode.label}模式` : views.find((item) => item.id === view)?.label ?? "学习";
  const pageSubtitle = view === "tutor" ? activeMode.tone : "完整学习闭环，而不只是聊天";
  const handleSendRequest = () => {
    const current = Date.now();
    if (current - lastManualSendAt.current < 500) return;
    lastManualSendAt.current = current;
    if (!currentChatLoading && input.trim()) void sendMessage();
  };
  const startTutorWithText = (text: string, nextMode: StudyMode = "tutor") => {
    void beginConversationWithInput(nextMode, text);
  };
  const handlePromptImage = async (file: File | null) => {
    if (!file || ocrUploading) return;
    setOcrUploading(true);
    try {
      const dataUrl = await fileToDataUrl(file);
      const result = await runOcr({ dataUrl, fileName: file.name });
      setView("tutor");
      setInput(`请带我一步步做这道题：\n${result.job.extractedText}`);
    } finally {
      setOcrUploading(false);
    }
  };

  return renderWithTheme(
    <Box component="main" className={mobileRailOpen ? "chat-app rail-open" : "chat-app"}>
      <Paper component="aside" className="rail" elevation={0}>
        <Stack className="rail-brand" direction="row" sx={{ alignItems: "center" }}>
          <Sparkles aria-hidden="true" />
          <span>智学AI</span>
        </Stack>

        <Button
          className="theme-toggle"
          type="button"
          variant="text"
          onClick={() => setTheme((value) => (value === "dark" ? "light" : "dark"))}
        >
          {theme === "dark" ? <Sun aria-hidden="true" /> : <Moon aria-hidden="true" />}
          <span>{theme === "dark" ? "浅色模式" : "深色模式"}</span>
        </Button>

        <Button className="new-chat-button" type="button" variant="contained" onClick={() => { setView("tutor"); setMobileRailOpen(false); void newConversation(mode); }}>
          <Plus aria-hidden="true" />
          <span>新对话</span>
        </Button>

        <Box component="nav" className="app-nav" aria-label="功能导航">
          {navGroups.map((group) => (
            <Box component="section" className="nav-group" key={group} aria-label={group}>
              <div className="nav-group-title">{group}</div>
              {accessibleViews.filter((item) => item.group === group).map((item) => {
                const Icon = item.icon;
                return (
                  <Button
                    className={view === item.id ? "nav-button active" : "nav-button"}
                    key={item.id}
                    type="button"
                    variant="text"
                    onClick={() => {
                      setView(item.id);
                      setMobileRailOpen(false);
                    }}
                  >
                    <Icon aria-hidden="true" />
                    <span>{item.label}</span>
                  </Button>
                );
              })}
            </Box>
          ))}
        </Box>

        <Divider className="rail-divider" />

        <Stack className="mode-tabs" aria-label="学习模式">
          {modes.map((item) => {
            const Icon = item.icon;
            return (
              <Button
                className={mode === item.id ? "mode-tab active" : "mode-tab"}
                key={item.id}
                type="button"
                variant="text"
                title={item.tone}
                onClick={() => {
                  setView("tutor");
                  setMode(item.id);
                  setMobileRailOpen(false);
                }}
              >
                <Icon aria-hidden="true" />
                <span>{item.label}</span>
              </Button>
            );
          })}
        </Stack>

        <Paper component="section" className="history-section" elevation={0}>
          <div className="section-title">
            <History aria-hidden="true" />
            <span>历史记录</span>
          </div>
          <div className="conversation-list">
            {conversations.length === 0 ? (
              <p className="muted-text">开始一次新学习后会保存到这里。</p>
            ) : (
              conversations.map((item) => (
                <div
                  className={[
                    "conversation-row",
                    conversationId === item.id ? "active" : "",
                    unreadConversationIds[item.id] ? "unread" : "",
                    chatLoadingByConversationId[item.id] ? "busy" : ""
                  ].filter(Boolean).join(" ")}
                  key={item.id}
                >
                  <Button
                    type="button"
                    variant="text"
                    onClick={() => {
                      setView("tutor");
                      setMobileRailOpen(false);
                      markConversationRead(item.id);
                      void selectConversation(item.id);
                    }}
                  >
                    <span>{item.title}</span>
                    <small>{modeLabel(item.mode)}</small>
                  </Button>
                  <IconButton
                    className="icon-button danger"
                    type="button"
                    aria-label={`删除 ${item.title}`}
                    onClick={() => void removeConversation(item.id)}
                  >
                    <Trash2 aria-hidden="true" />
                  </IconButton>
                </div>
              ))
            )}
          </div>
        </Paper>

        <Box component="section" className="mini-stats">
          <Metric label="学习" value={`${stats.learnedMinutes}分`} />
          <Metric label="完成" value={`${stats.solvedCount}题`} />
          <Metric label="错题" value={`${stats.wrongCount}题`} />
          <Metric label="正确率" value={`${accuracy}%`} />
        </Box>

        <Button className="logout-button" type="button" variant="text" onClick={logout}>
          <LogOut aria-hidden="true" />
          退出登录
        </Button>
      </Paper>
      <div className="mobile-rail-backdrop" onClick={() => setMobileRailOpen(false)} />
      <AppToast toast={toast} onClose={() => setToast(null)} />

      <Paper component="section" className="chat-main" elevation={0}>
        <Stack component="header" className="chat-topbar" direction="row" sx={{ alignItems: "center" }}>
          <IconButton className="mobile-menu-button" type="button" aria-label="打开菜单" onClick={() => setMobileRailOpen(true)}>
            <Menu aria-hidden="true" />
          </IconButton>
          <Box>
            <Typography component="p">{pageSubtitle}</Typography>
            <Typography component="h1" variant="h1">{pageTitle}</Typography>
          </Box>
          <Stack className="topbar-actions" direction="row" sx={{ alignItems: "center" }}>
            <NotificationCenter
              notifications={notifications}
              open={notificationsOpen}
              unreadCount={unreadNotificationCount}
              onToggle={() => {
                setNotificationsOpen((value) => !value);
                markNotificationsRead();
              }}
            />
            <Stack className="topbar-badge" direction="row" sx={{ alignItems: "center" }}>
              <ShieldCheck aria-hidden="true" />
              <span>真实AI流式引导</span>
            </Stack>
          </Stack>
        </Stack>

        {view === "tutor" ? (
          <>
            <Box component="section" className="message-canvas" data-testid="message-list">
              {messages.length === 1 && !conversationId ? <WelcomePanel onPrompt={(prompt) => startTutorWithText(prompt, "tutor")} /> : null}

              {messages.map((message) => (
                <Box component="article" className={`bubble ${message.role}`} key={message.id}>
                  <div className="bubble-avatar">{message.role === "assistant" ? "AI" : user.name.slice(0, 1)}</div>
                  <Paper className="bubble-content" elevation={0}>
                    <div className="bubble-name">{message.role === "assistant" ? "智学AI" : user.name}</div>
                    <MarkdownView>{message.content || " "}</MarkdownView>
                  </Paper>
                </Box>
              ))}

              {showChatThinking ? (
                <Box component="article" className="bubble assistant">
                  <div className="bubble-avatar">AI</div>
                  <Paper className="bubble-content thinking" elevation={0}>
                    <span />
                    <span />
                    <span />
                  </Paper>
                </Box>
              ) : null}
            </Box>

            <Paper
              component="form"
              className="prompt-box"
              elevation={0}
              onSubmit={(event) => {
                event.preventDefault();
                if (!currentChatLoading && input.trim()) void sendMessage();
              }}
            >
              <textarea
                aria-label="输入题目或问题"
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => {
                  if ((event.ctrlKey || event.metaKey) && event.key === "Enter" && input.trim() && !currentChatLoading) {
                    event.preventDefault();
                    handleSendRequest();
                  }
                }}
                placeholder={mode === "concept" ? "输入你想学习的概念..." : "输入题目，或者说说你卡在哪一步..."}
              />
              <label className={ocrUploading ? "upload-action busy" : "upload-action"} title="上传题目图片">
                <Image aria-hidden="true" />
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  disabled={ocrUploading}
                  onChange={(event) => {
                    void handlePromptImage(event.target.files?.[0] ?? null);
                    event.currentTarget.value = "";
                  }}
                />
              </label>
              <IconButton
                className="send-button"
                type="button"
                aria-label="发送"
                disabled={currentChatLoading || !input.trim()}
                onPointerDown={(event) => {
                  if (event.pointerType !== "mouse") {
                    event.preventDefault();
                    handleSendRequest();
                  }
                }}
                onMouseDown={(event) => {
                  if (event.detail === 0) {
                    event.preventDefault();
                    handleSendRequest();
                  }
                }}
                onClick={() => handleSendRequest()}
              >
                <Send aria-hidden="true" />
              </IconButton>
            </Paper>
          </>
        ) : (
          <LearningWorkspace
            view={view}
            stats={stats}
            wrongQuestions={wrongQuestions}
            knowledgeCards={knowledgeCards}
            generatedPlan={generatedPlan}
            generatedQuiz={generatedQuiz}
            user={user}
            loading={loading}
            pendingTask={pendingTask}
            error={error}
            onGoTutor={() => setView("tutor")}
            onMaster={markWrongMastered}
            onCreateCard={createKnowledgeCard}
            onCreatePlan={createStudyPlan}
            onCreateQuiz={createQuiz}
            onGoTutorWithText={(text, nextMode = "tutor") => {
              startTutorWithText(text, nextMode);
            }}
          />
        )}
      </Paper>

      <Paper component="aside" className="study-panel" elevation={0}>
        <Paper component="section" className="side-card" elevation={0}>
          <div className="section-title">
            <BookOpen aria-hidden="true" />
            <span>今日复习</span>
          </div>
          {wrongQuestions.length === 0 ? (
            <p className="muted-text">暂无待复习错题。</p>
          ) : (
            <div className="wrong-stack">
              {wrongQuestions.slice(0, 5).map((item) => (
                <Paper component="article" className="wrong-item" elevation={0} key={item.id}>
                  <strong>{item.title}</strong>
                  <span>{item.knowledgePoint}</span>
                  <Button type="button" variant="outlined" onClick={() => void markWrongMastered(item.id)}>
                    <CheckCircle2 aria-hidden="true" />
                    已掌握
                  </Button>
                </Paper>
              ))}
            </div>
          )}
        </Paper>

        <Paper component="section" className="side-card" elevation={0}>
          <div className="section-title">
            <Lightbulb aria-hidden="true" />
            <span>学习建议</span>
          </div>
          <p className="muted-text">每次只推进一步。先说条件，再说目标，最后再考虑公式或方法。</p>
        </Paper>
      </Paper>
    </Box>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <Paper className="metric-card" elevation={0}>
      <strong>{value}</strong>
      <span>{label}</span>
    </Paper>
  );
}

function WelcomePanel({ onPrompt }: { onPrompt: (prompt: string) => void }) {
  const prompts = ["拍照或粘贴一道题", "讲一个没听懂的概念", "按我的错题做复习计划"];
  return (
    <Paper component="section" className="welcome-panel" elevation={0}>
      <Sparkles aria-hidden="true" />
      <h2>今天想学什么？</h2>
      <p>我会边问边提示，尽量让你自己想出来。</p>
      <Stack direction="row" sx={{ flexWrap: "wrap", justifyContent: "center" }}>
        {prompts.map((prompt) => (
          <Button type="button" key={prompt} variant="outlined" onClick={() => onPrompt(prompt)}>
            {prompt}
          </Button>
        ))}
      </Stack>
    </Paper>
  );
}

function NotificationCenter({
  notifications,
  open,
  unreadCount,
  onToggle
}: {
  notifications: AppNotification[];
  open: boolean;
  unreadCount: number;
  onToggle: () => void;
}) {
  return (
    <Box className="notification-center">
      <IconButton className="notification-trigger" type="button" aria-label="通知" onClick={onToggle}>
        <Bell aria-hidden="true" />
        {unreadCount > 0 ? <span className="notification-count">{Math.min(99, unreadCount)}</span> : null}
      </IconButton>
      {open ? (
        <Paper className="notification-menu" elevation={0}>
          <div className="notification-menu-header">
            <strong>通知</strong>
            <span>{notifications.length} / 100</span>
          </div>
          {notifications.length ? (
            <div className="notification-list">
              {notifications.map((item) => (
                <article className={item.read ? `notification-item ${item.kind}` : `notification-item ${item.kind} unread`} key={item.id}>
                  <div>
                    <strong>{item.title}</strong>
                    <time>{formatNoticeTime(item.createdAt)}</time>
                  </div>
                  <p>{item.message}</p>
                </article>
              ))}
            </div>
          ) : (
            <p className="notification-empty">暂无通知。</p>
          )}
        </Paper>
      ) : null}
    </Box>
  );
}

function AppToast({
  toast,
  onClose
}: {
  toast: null | { kind: "error" | "pending"; message: string };
  onClose: () => void;
}) {
  if (!toast) return null;
  return (
    <Paper className={`app-toast ${toast.kind}`} elevation={0} role="status">
      <span className={toast.kind === "pending" ? "progress-dot" : "toast-dot"} />
      <strong>{toast.message}</strong>
      <IconButton type="button" aria-label="关闭提示" onClick={onClose}>
        ×
      </IconButton>
    </Paper>
  );
}

function formatNoticeTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
}

function LearningWorkspace({
  view,
  user,
  stats,
  wrongQuestions,
  knowledgeCards,
  generatedPlan,
  generatedQuiz,
  loading,
  pendingTask,
  error,
  onGoTutor,
  onMaster,
  onCreateCard,
  onCreatePlan,
  onCreateQuiz,
  onGoTutorWithText
}: {
  view:
    | "dashboard"
    | "review"
    | "quiz"
    | "assignments"
    | "reports"
    | "plan"
    | "goals"
    | "cards"
    | "tutor"
    | "ocr"
    | "map"
    | "parent"
    | "teacher"
    | "admin"
    | "settings";
  user: { id: string; email: string; name: string; grade: string; avatarUrl?: string };
  stats: { learnedMinutes: number; solvedCount: number; wrongCount: number; streakDays: number };
  wrongQuestions: Array<{ id: string; title: string; knowledgePoint: string; reason: string }>;
  knowledgeCards: Array<{ id: string; title: string; definition: string; keyPoints: string; mistakes: string; related: string }>;
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
        title?: string;
        id?: string;
        questions?: Array<{ type: string; question: string; answer: string; knowledge_point: string }>;
      }
    | null;
  loading: boolean;
  pendingTask: "" | "chat" | "card" | "plan" | "quiz";
  error: string;
  onGoTutor: () => void;
  onMaster: (id: string) => void;
  onCreateCard: (concept: string) => Promise<void>;
  onCreatePlan: (payload: {
    grade: string;
    subject: string;
    currentScore: number;
    targetScore: number;
    selfWeakness: string;
  }) => Promise<void>;
  onCreateQuiz: (payload: { subject: string; topic: string; questionCount: number }) => Promise<void>;
  onGoTutorWithText: (text: string, nextMode?: StudyMode) => void;
}) {
  const [concept, setConcept] = useState("");
  const [grade, setGrade] = useState(user.grade || "");
  const [subject, setSubject] = useState("");
  const [topic, setTopic] = useState("");
  const [currentScore, setCurrentScore] = useState(60);
  const [targetScore, setTargetScore] = useState(85);
  const [selfWeakness, setSelfWeakness] = useState("");
  const [quizAnswers, setQuizAnswers] = useState<Record<string, string>>({});
  const [quizReport, setQuizReport] = useState<null | { score: number; summary?: string; suggestions?: string[]; wrong_points?: string[] }>(null);
  const [gradingQuiz, setGradingQuiz] = useState(false);
  const [achievements, setAchievements] = useState<Array<{ code: string; title: string; description: string; unlockedAt: string }>>([]);
  const [announcements, setAnnouncements] = useState<Array<{ id: string; title: string; content: string; className: string; createdAt: string }>>([]);

  useEffect(() => {
    if (view !== "dashboard") return;
    let cancelled = false;
    async function loadDashboardExtras() {
      const [achievementResult, announcementResult] = await Promise.allSettled([loadAchievements(), loadAnnouncements()]);
      if (cancelled) return;
      if (achievementResult.status === "fulfilled") setAchievements(achievementResult.value.achievements);
      if (announcementResult.status === "fulfilled") setAnnouncements(announcementResult.value.announcements);
    }
    void loadDashboardExtras();
    return () => {
      cancelled = true;
    };
  }, [view]);

  return (
    <section className="learning-page">
      {view === "dashboard" ? (
        <>
          <Paper component="section" className="dashboard-hero" elevation={0}>
            <div>
              <p>今日任务</p>
              <h2>先诊断卡点，再进入 AI 辅导</h2>
              <span>建议完成：1次讲题、1张知识卡片、2道错题复习。</span>
            </div>
            <Button type="button" variant="contained" onClick={onGoTutor}>
              开始学习
            </Button>
          </Paper>
          <div className="dashboard-grid">
            <FeatureCard title="AI辅导" text="流式讲题，不直接给最终答案。" action="去讲题" onClick={onGoTutor} />
            <FeatureCard title="错题复习" text={`当前待复习 ${wrongQuestions.length} 题。`} />
            <FeatureCard title="学习统计" text={`今日 ${stats.learnedMinutes} 分钟，完成 ${stats.solvedCount} 题。`} />
            <FeatureCard title="知识卡片" text={`已保存 ${knowledgeCards.length} 张卡片。`} />
          </div>
          <div className="dashboard-grid secondary-grid">
            <Paper component="section" className="feature-card" elevation={0}>
              <h3>班级公告</h3>
              {announcements.length ? (
                announcements.slice(0, 3).map((item) => (
                  <p key={item.id}>
                    <strong>{item.title}</strong> · {item.className}
                  </p>
                ))
              ) : (
                <p>暂无老师公告。</p>
              )}
            </Paper>
            <Paper component="section" className="feature-card" elevation={0}>
              <h3>学习成就</h3>
              {achievements.length ? (
                achievements.slice(0, 4).map((item) => (
                  <p key={item.code}>
                    <strong>{item.title}</strong> · {item.description}
                  </p>
                ))
              ) : (
                <p>继续完成学习任务，成就会自动点亮。</p>
              )}
            </Paper>
          </div>
        </>
      ) : null}

      {view === "review" ? (
        <ReviewPanel wrongQuestions={wrongQuestions} onMaster={onMaster} />
      ) : null}

      {view === "quiz" ? (
        <section className="tool-surface">
          <h2>AI 测验</h2>
          <p>生成一份小测验，用来发现薄弱点。</p>
          <div className="form-grid">
            <label>科目<input placeholder="例如：数学 / 物理" value={subject} onChange={(event) => setSubject(event.target.value)} /></label>
            <label>知识点<input placeholder="输入本次测验范围" value={topic} onChange={(event) => setTopic(event.target.value)} /></label>
            <label>题数<input type="number" min={3} max={10} value={5} readOnly /></label>
            <Button disabled={loading || !subject.trim() || !topic.trim()} onClick={() => void onCreateQuiz({ subject, topic, questionCount: 5 })} type="button" variant="contained">
              {pendingTask === "quiz" ? "生成中..." : "生成测验"}
            </Button>
          </div>
          {generatedQuiz ? (
            <div className="result-block">
              <h3>{generatedQuiz.title ?? "测验"}</h3>
              {generatedQuiz.questions?.map((question, index) => (
                <article key={`${question.question}-${index}`}>
                  <strong>{index + 1}. {formatAiValue(question.type)}</strong>
                  <MarkdownView>{formatAiValue(question.question)}</MarkdownView>
                  <textarea
                    placeholder="输入你的答案"
                    value={quizAnswers[String(index)] ?? ""}
                    onChange={(event) => setQuizAnswers((state) => ({ ...state, [String(index)]: event.target.value }))}
                  />
                  <details>
                    <summary>查看参考答案</summary>
                    <MarkdownView>{formatAiValue(question.answer)}</MarkdownView>
                  </details>
                </article>
              ))}
              <Button type="button" variant="contained" disabled={gradingQuiz || !generatedQuiz.id} onClick={async () => {
                if (!generatedQuiz.id) return;
                setGradingQuiz(true);
                setQuizReport(null);
                try {
                  const result = await submitQuiz(generatedQuiz.id, quizAnswers);
                  setQuizReport(result.report);
                } finally {
                  setGradingQuiz(false);
                }
              }}>{gradingQuiz ? "AI批改中..." : "提交批改"}</Button>
              {gradingQuiz ? <p className="muted-text">AI 正在批改测验，请稍等一会。</p> : null}
              {quizReport ? <GradingReportView report={quizReport} /> : null}
            </div>
          ) : null}
        </section>
      ) : null}

      {view === "assignments" ? <AssignmentsPanel /> : null}
      {view === "reports" ? <ReportsPanel /> : null}
      {view === "goals" ? <GoalsPanel /> : null}

      {view === "plan" ? (
        <section className="tool-surface">
          <h2>学习计划</h2>
          <p>根据历史记录、错题、自填薄弱点和目标分数生成具体计划。</p>
          <div className="form-grid plan-grid">
            <label>年级<input placeholder="例如：初三 / 高一" value={grade} onChange={(event) => setGrade(event.target.value)} /></label>
            <label>科目<input placeholder="例如：数学 / 物理" value={subject} onChange={(event) => setSubject(event.target.value)} /></label>
            <label>当前分<input type="number" value={currentScore} onChange={(event) => setCurrentScore(Number(event.target.value))} /></label>
            <label>目标分<input type="number" value={targetScore} onChange={(event) => setTargetScore(Number(event.target.value))} /></label>
            <label className="wide-field">自己觉得薄弱点<textarea placeholder="写下最近卡住的题型、知识点或考试问题" value={selfWeakness} onChange={(event) => setSelfWeakness(event.target.value)} /></label>
            <Button disabled={loading || !grade.trim() || !subject.trim()} onClick={() => void onCreatePlan({ grade, subject, currentScore, targetScore, selfWeakness })} type="button" variant="contained">
              {pendingTask === "plan" ? "生成中..." : "生成计划"}
            </Button>
          </div>
          {generatedPlan ? (
            <div className="result-block">
              <MarkdownView>{`### ${generatedPlan.summary ?? "学习计划"}`}</MarkdownView>
              {generatedPlan.weakness_analysis?.length ? (
                <>
                  <h4>薄弱点分析</h4>
                  <div className="analysis-grid">
                    {generatedPlan.weakness_analysis.map((item) => (
                      <article key={`${item.point}-${item.priority}`}>
                        <strong>{item.point}</strong>
                        <span>{item.priority}</span>
                        <MarkdownView>{item.evidence}</MarkdownView>
                      </article>
                    ))}
                  </div>
                </>
              ) : null}
              {generatedPlan.daily_plan?.length ? (
                <>
                  <h4>7天任务</h4>
                  <div className="daily-plan">
                    {generatedPlan.daily_plan.map((day) => (
                      <article key={day.day}>
                        <strong>{formatAiValue(day.day)} · {formatAiValue(day.minutes)}分钟</strong>
                        <MarkdownView>{`**概念：** ${formatAiValue(day.concept)}\n\n**练习：** ${formatAiValue(day.practice)}\n\n**复习：** ${formatAiValue(day.review)}`}</MarkdownView>
                      </article>
                    ))}
                  </div>
                </>
              ) : (
                <MarkdownView>{markdownBulletList(generatedPlan.tasks)}</MarkdownView>
              )}
              <h4>复习安排</h4>
              <MarkdownView>{markdownBulletList(generatedPlan.review_plan)}</MarkdownView>
              <h4>验收标准</h4>
              <MarkdownView>{markdownBulletList(generatedPlan.acceptance_checks ?? generatedPlan.milestones)}</MarkdownView>
            </div>
          ) : null}
        </section>
      ) : null}

      {view === "cards" ? (
        <section className="tool-surface">
          <h2>知识卡片</h2>
          <p>把学过的概念沉淀成可复习卡片。</p>
          <div className="form-grid">
            <label>概念<input placeholder="输入要沉淀的知识点" value={concept} onChange={(event) => setConcept(event.target.value)} /></label>
            <Button disabled={loading || !concept.trim()} onClick={() => void onCreateCard(concept)} type="button" variant="contained">
              {pendingTask === "card" ? "生成中..." : "生成卡片"}
            </Button>
          </div>
          <div className="tool-list">
            {knowledgeCards.map((card) => (
              <article className="tool-item" key={card.id}>
                <strong>{card.title}</strong>
                <MarkdownView>{`**一句话定义：** ${formatAiValue(card.definition)}\n\n**核心要点：**\n${markdownListFromJsonText(card.keyPoints)}\n\n**易错点：** ${formatAiValue(card.mistakes)}\n\n**关联概念：**\n${markdownListFromJsonText(card.related)}`}</MarkdownView>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {view === "ocr" ? <OcrPanel onGoTutorWithText={onGoTutorWithText} /> : null}
      {view === "map" ? <KnowledgeMapPanel onGoTutorWithText={(text) => onGoTutorWithText(text, "concept")} /> : null}
      {view === "parent" ? <ParentPanel /> : null}
      {view === "teacher" ? <TeacherPanel /> : null}
      {view === "admin" ? <AdminPanel /> : null}
      {view === "settings" ? <SettingsPanel user={user} /> : null}
    </section>
  );
}

function OcrPanel({ onGoTutorWithText }: { onGoTutorWithText: (text: string) => void }) {
  const [fileName, setFileName] = useState("");
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleFile(file: File | null) {
    if (!file) return;
    setFileName(file.name);
    setText("");
    setError("");
    setLoading(true);
    try {
      const dataUrl = await fileToDataUrl(file);
      const result = await runOcr({ dataUrl, fileName: file.name });
      setText(result.job.extractedText);
    } catch (err) {
      setError(err instanceof Error ? err.message : "OCR识别失败");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="tool-surface">
      <h2>拍照识题 OCR</h2>
      <p>上传题目图片，AI只识别文字和公式，不直接解题。</p>
      <label className="upload-box">
        <Image aria-hidden="true" />
        <span>{fileName || "选择题目图片"}</span>
        <strong className="file-picker-button">上传图片</strong>
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp"
          onChange={(event) => {
            void handleFile(event.target.files?.[0] ?? null);
            event.currentTarget.value = "";
          }}
        />
      </label>
      {loading ? <div className="progress-banner"><span className="progress-dot" /><strong>OCR识别中</strong><span>图片越清晰越准确。</span></div> : null}
      {error ? <div className="snackbar static">{error}</div> : null}
      {text ? (
        <div className="result-block">
          <h3>识别结果</h3>
          <p>{text}</p>
          <Button type="button" variant="contained" onClick={() => onGoTutorWithText(`请带我一步步做这道题：\n${text}`)}>
            带入 AI 辅导
          </Button>
        </div>
      ) : null}
    </section>
  );
}

function KnowledgeMapPanel({ onGoTutorWithText }: { onGoTutorWithText: (text: string) => void }) {
  const user = useStudyStore((state) => state.user);
  const canEdit = user?.role === "teacher" || user?.role === "admin";
  const [subject, setSubject] = useState("数学");
  const [nodes, setNodes] = useState<KnowledgeNodeView[]>([]);
  const [edges, setEdges] = useState<KnowledgeEdgeView[]>([]);
  const [loading, setLoading] = useState(false);
  const [editingNodeId, setEditingNodeId] = useState("");
  const [nodeForm, setNodeForm] = useState({ title: "", description: "", gradeBand: "初中" });
  const [edgeForm, setEdgeForm] = useState({ fromNodeId: "", toNodeId: "", relation: "前置" });
  const [message, setMessage] = useState("");

  async function load() {
    setLoading(true);
    try {
      const result = await loadKnowledgeMap(subject);
      setNodes(result.nodes);
      setEdges(result.edges);
    } finally {
      setLoading(false);
    }
  }

  async function saveNode() {
    if (!nodeForm.title.trim() || !nodeForm.description.trim()) return;
    if (editingNodeId) {
      await updateKnowledgeNode(editingNodeId, nodeForm);
      setMessage("知识点已更新");
    } else {
      await createKnowledgeNode({ subject, ...nodeForm });
      setMessage("知识点已新增");
    }
    setEditingNodeId("");
    setNodeForm({ title: "", description: "", gradeBand: nodeForm.gradeBand || "初中" });
    await load();
  }

  async function saveEdge() {
    if (!edgeForm.fromNodeId || !edgeForm.toNodeId || edgeForm.fromNodeId === edgeForm.toNodeId) return;
    await createKnowledgeEdge({ subject, ...edgeForm });
    setMessage("知识关系已新增");
    setEdgeForm({ fromNodeId: "", toNodeId: "", relation: "前置" });
    await load();
  }

  useEffect(() => {
    void load();
    // Load the selected map once on mount; manual reload uses the button.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <section className="tool-surface">
      <h2>知识地图</h2>
      <p>维护知识点、前置关系和个人掌握度。老师可以编辑地图，学生看到的是自己的掌握状态。</p>
      <div className="form-grid">
        <label>科目<input value={subject} onChange={(event) => setSubject(event.target.value)} /></label>
        <Button type="button" variant="contained" disabled={loading} onClick={() => void load()}>{loading ? "加载中..." : "加载地图"}</Button>
      </div>
      {message ? <div className="progress-banner"><strong>{message}</strong></div> : null}
      {canEdit ? (
        <div className="result-block">
          <h3>{editingNodeId ? "编辑知识点" : "新增知识点"}</h3>
          <div className="form-grid plan-grid">
            <label>名称<input value={nodeForm.title} onChange={(event) => setNodeForm((state) => ({ ...state, title: event.target.value }))} /></label>
            <label>年级段<input value={nodeForm.gradeBand} onChange={(event) => setNodeForm((state) => ({ ...state, gradeBand: event.target.value }))} /></label>
            <label className="wide-field">说明<textarea value={nodeForm.description} onChange={(event) => setNodeForm((state) => ({ ...state, description: event.target.value }))} /></label>
            <Button type="button" variant="contained" onClick={() => void saveNode()}>{editingNodeId ? "保存知识点" : "新增知识点"}</Button>
            {editingNodeId ? <Button type="button" variant="outlined" onClick={() => { setEditingNodeId(""); setNodeForm({ title: "", description: "", gradeBand: "初中" }); }}>取消编辑</Button> : null}
          </div>
          <h3>新增知识关系</h3>
          <div className="form-grid plan-grid">
            <TextField
              select
              label="前置知识"
              value={edgeForm.fromNodeId}
              onChange={(event) => setEdgeForm((state) => ({ ...state, fromNodeId: event.target.value }))}
              size="small"
            >
              <MenuItem value="">请选择</MenuItem>
              {nodes.map((node) => <MenuItem key={node.id} value={node.id}>{node.title}</MenuItem>)}
            </TextField>
            <TextField
              select
              label="目标知识"
              value={edgeForm.toNodeId}
              onChange={(event) => setEdgeForm((state) => ({ ...state, toNodeId: event.target.value }))}
              size="small"
            >
              <MenuItem value="">请选择</MenuItem>
              {nodes.map((node) => <MenuItem key={node.id} value={node.id}>{node.title}</MenuItem>)}
            </TextField>
            <label>关系<input value={edgeForm.relation} onChange={(event) => setEdgeForm((state) => ({ ...state, relation: event.target.value }))} /></label>
            <Button type="button" variant="contained" onClick={() => void saveEdge()}>新增关系</Button>
          </div>
        </div>
      ) : null}
      {nodes.length ? <KnowledgeGraph nodes={nodes} edges={edges} onLearn={onGoTutorWithText} /> : null}
      <div className="map-grid">
        {nodes.map((node) => {
          const related = edges.filter((edge) => edge.fromNodeId === node.id || edge.toNodeId === node.id);
          return (
            <article className={`map-node ${node.status}`} key={node.id}>
              <strong>{node.title}</strong>
              <p>{node.description}</p>
              <span>{node.gradeBand ?? "通用"} · {canEdit ? "班级平均掌握度" : "我的掌握度"} {node.mastery}%</span>
              {related.length ? <small>关系：{related.map((edge) => edge.fromNodeId === node.id ? `指向 ${nodes.find((item) => item.id === edge.toNodeId)?.title ?? edge.toNodeId}` : `来自 ${nodes.find((item) => item.id === edge.fromNodeId)?.title ?? edge.fromNodeId}`).join("；")}</small> : null}
              {canEdit ? (
                <small>该数值来自班级学生学习记录，不由老师手动填写。</small>
              ) : (
                <input
                  type="range"
                  min={0}
                  max={100}
                  defaultValue={node.mastery}
                  onChange={(event) => void updateMastery(node.id, Number(event.target.value))}
                />
              )}
              {canEdit ? (
                <Button type="button" variant="outlined" onClick={() => { setEditingNodeId(node.id); setNodeForm({ title: node.title, description: node.description, gradeBand: node.gradeBand ?? "初中" }); }}>
                  编辑知识点
                </Button>
              ) : null}
              <Button
                type="button"
                variant="contained"
                onClick={() => onGoTutorWithText(`我想系统学习「${node.title}」。请先用生活例子讲清楚，再检查我的理解。\n\n知识点说明：${node.description}`)}
              >
                学这个知识点
              </Button>
            </article>
          );
        })}
        {nodes.length === 0 && !loading ? <div className="empty-tool">当前科目还没有知识点。老师可以在上方新增。</div> : null}
      </div>
    </section>
  );
}

function KnowledgeGraph({
  nodes,
  edges,
  onLearn
}: {
  nodes: KnowledgeNodeView[];
  edges: KnowledgeEdgeView[];
  onLearn: (text: string) => void;
}) {
  const positions = buildKnowledgePositions(nodes, edges);
  const byId = new Map(nodes.map((node) => [node.id, node]));

  return (
    <section className="knowledge-graph" aria-label="知识关系图">
      <div className="knowledge-graph-title">
        <strong>关系图</strong>
        <span>点击节点直接进入 AI 概念学习</span>
      </div>
      <div className="knowledge-graph-canvas">
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          {edges.map((edge) => {
            const from = positions.get(edge.fromNodeId);
            const to = positions.get(edge.toNodeId);
            if (!from || !to) return null;
            return <line key={edge.id} x1={from.x} y1={from.y} x2={to.x} y2={to.y} />;
          })}
        </svg>
        {nodes.map((node) => {
          const position = positions.get(node.id) ?? { x: 50, y: 50 };
          const incoming = edges.filter((edge) => edge.toNodeId === node.id).map((edge) => byId.get(edge.fromNodeId)?.title).filter(Boolean);
          return (
            <Button
              key={node.id}
              className={`graph-node-button ${node.status}`}
              type="button"
              variant="contained"
              style={{ left: `${position.x}%`, top: `${position.y}%` }}
              onClick={() => onLearn(`我想系统学习「${node.title}」。请先用生活例子讲清楚，再检查我的理解。\n\n前置知识：${incoming.join("、") || "暂无"}\n知识点说明：${node.description}`)}
            >
              <strong>{node.title}</strong>
              <span>{node.mastery}%</span>
            </Button>
          );
        })}
      </div>
    </section>
  );
}

function buildKnowledgePositions(nodes: KnowledgeNodeView[], edges: KnowledgeEdgeView[]) {
  const incomingCount = new Map(nodes.map((node) => [node.id, 0]));
  const outgoingCount = new Map(nodes.map((node) => [node.id, 0]));
  for (const edge of edges) {
    incomingCount.set(edge.toNodeId, (incomingCount.get(edge.toNodeId) ?? 0) + 1);
    outgoingCount.set(edge.fromNodeId, (outgoingCount.get(edge.fromNodeId) ?? 0) + 1);
  }
  const levels = [
    nodes.filter((node) => (incomingCount.get(node.id) ?? 0) === 0),
    nodes.filter((node) => (incomingCount.get(node.id) ?? 0) > 0 && (outgoingCount.get(node.id) ?? 0) > 0),
    nodes.filter((node) => (incomingCount.get(node.id) ?? 0) > 0 && (outgoingCount.get(node.id) ?? 0) === 0)
  ].map((level) => level.filter((node, index, array) => array.findIndex((item) => item.id === node.id) === index));
  const used = new Set<string>();
  const result = new Map<string, { x: number; y: number }>();
  const xSlots = [16, 50, 84];

  levels.forEach((level, levelIndex) => {
    const visibleLevel = level.filter((node) => !used.has(node.id));
    visibleLevel.forEach((node, index) => {
      used.add(node.id);
      const y = visibleLevel.length === 1 ? 50 : 18 + (64 / Math.max(1, visibleLevel.length - 1)) * index;
      result.set(node.id, { x: xSlots[levelIndex], y });
    });
  });

  nodes.filter((node) => !used.has(node.id)).forEach((node, index, rest) => {
    const y = rest.length === 1 ? 50 : 18 + (64 / Math.max(1, rest.length - 1)) * index;
    result.set(node.id, { x: 50, y });
  });

  return result;
}

function ReviewPanel({
  wrongQuestions,
  onMaster
}: {
  wrongQuestions: Array<{ id: string; title: string; knowledgePoint: string; reason: string }>;
  onMaster: (id: string) => void;
}) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [reports, setReports] = useState<Record<string, { score: number; summary?: string; suggestions?: string[]; wrong_points?: string[] }>>({});
  const [submittingId, setSubmittingId] = useState("");

  async function submit(id: string) {
    setSubmittingId(id);
    try {
      const result = await submitWrongQuestionReview(id, answers[id] ?? "");
      setReports((state) => ({ ...state, [id]: result.report }));
      useStudyStore.setState((state) => ({
        stats: result.stats,
        wrongQuestions: result.mastered ? state.wrongQuestions.filter((item) => item.id !== id) : state.wrongQuestions
      }));
    } finally {
      setSubmittingId("");
    }
  }

  return (
    <section className="tool-surface">
      <h2>错题复习</h2>
      <p>复习不是重看答案，而是重新独立说出思路。</p>
      <Button type="button" variant="outlined" onClick={() => exportWrongQuestionsPdf(wrongQuestions)}>
        导出错题本 PDF
      </Button>
      <div className="tool-list">
        {wrongQuestions.length === 0 ? (
          <div className="empty-tool">没有待复习错题。</div>
        ) : (
          wrongQuestions.map((item) => (
            <article className="tool-item" key={item.id}>
              <strong>{item.title}</strong>
              <span>{item.knowledgePoint} · {item.reason}</span>
              <textarea
                placeholder="不看答案，重新写一遍你的解题思路"
                value={answers[item.id] ?? ""}
                onChange={(event) => setAnswers((state) => ({ ...state, [item.id]: event.target.value }))}
              />
              <div className="button-row">
                <Button type="button" variant="contained" disabled={submittingId === item.id || !(answers[item.id] ?? "").trim()} onClick={() => void submit(item.id)}>
                  {submittingId === item.id ? "AI批改中..." : "提交重做"}
                </Button>
                <Button type="button" variant="outlined" onClick={() => void onMaster(item.id)}>直接标记已掌握</Button>
              </div>
              {reports[item.id] ? <GradingReportView report={reports[item.id]} /> : null}
            </article>
          ))
        )}
      </div>
    </section>
  );
}

function ParentPanel() {
  const [guardianEmail, setGuardianEmail] = useState("");
  const [report, setReport] = useState<Array<{ name: string; grade: string; stats: { learnedMinutes: number; wrongCount: number }; weakPoints: Array<{ point: string; count: number }> }>>([]);
  const [message, setMessage] = useState("");

  return (
    <section className="tool-surface">
      <h2>家长端</h2>
      <p>学生可绑定家长邮箱；家长用同邮箱账号登录后查看学习报告。</p>
      <div className="form-grid">
        <label>家长邮箱<input value={guardianEmail} onChange={(event) => setGuardianEmail(event.target.value)} /></label>
        <Button type="button" variant="contained" onClick={async () => { await createGuardianLink(guardianEmail); setMessage("已绑定家长邮箱"); }}>绑定家长</Button>
        <Button type="button" variant="outlined" onClick={async () => { const result = await loadGuardianReport(); setReport(result.students); }}>查看报告</Button>
      </div>
      {message ? <div className="progress-banner"><strong>{message}</strong></div> : null}
      <ReportList items={report} />
    </section>
  );
}

function TeacherPanel() {
  const [className, setClassName] = useState("");
  const [subject, setSubject] = useState("");
  const [classId, setClassId] = useState("");
  const [classes, setClasses] = useState<Array<{ id: string; name: string; subject: string; studentCount: number; createdAt: string }>>([]);
  const [assignments, setAssignments] = useState<Array<{ id: string; title: string; knowledgePoint: string; questionsText: string; questionCount: number; dueAt: string; createdAt: string }>>([]);
  const [studentEmail, setStudentEmail] = useState("");
  const [assignmentTitle, setAssignmentTitle] = useState("");
  const [assignmentPoint, setAssignmentPoint] = useState("");
  const [assignmentQuestions, setAssignmentQuestions] = useState("");
  const [editingAssignmentId, setEditingAssignmentId] = useState("");
  const [noticeTitle, setNoticeTitle] = useState("");
  const [noticeContent, setNoticeContent] = useState("");
  const [heatmap, setHeatmap] = useState<Array<{ point: string; count: number }>>([]);
  const [assignmentMessage, setAssignmentMessage] = useState("");
  const [noticeMessage, setNoticeMessage] = useState("");
  const [teacherLoading, setTeacherLoading] = useState("");
  const [lastAssignmentId, setLastAssignmentId] = useState("");
  const [submissions, setSubmissions] = useState<Array<{ studentId: string; name: string; grade: string; status: string; score: number; report: { summary?: string; wrong_points?: string[] }; submittedAt: string }>>([]);
  const [report, setReport] = useState<Array<{ name: string; grade: string; stats: { learnedMinutes: number; wrongCount: number }; weakPoints: Array<{ point: string; count: number }> }>>([]);

  async function refreshClasses(nextSelectedId = classId) {
    setTeacherLoading("classes");
    try {
      const result = await loadTeacherClasses();
      setClasses(result.classes);
      const selected = nextSelectedId || result.classes[0]?.id || "";
      setClassId(selected);
      if (selected) await refreshAssignments(selected);
    } finally {
      setTeacherLoading("");
    }
  }

  async function refreshAssignments(nextClassId = classId) {
    if (!nextClassId) {
      setAssignments([]);
      setLastAssignmentId("");
      return;
    }
    setTeacherLoading("assignments");
    try {
      const result = await loadClassAssignments(nextClassId);
      setAssignments(result.assignments);
      setLastAssignmentId((current) => current || result.assignments[0]?.id || "");
    } finally {
      setTeacherLoading("");
    }
  }

  async function selectClass(nextClassId: string) {
    setClassId(nextClassId);
    setReport([]);
    setHeatmap([]);
    setSubmissions([]);
    setLastAssignmentId("");
    await refreshAssignments(nextClassId);
  }

  async function loadSubmissions(assignmentId = lastAssignmentId) {
    if (!classId || !assignmentId) return;
    const selected = assignments.find((item) => item.id === assignmentId);
    if (selected) {
      setEditingAssignmentId(selected.id);
      setAssignmentTitle(selected.title);
      setAssignmentPoint(selected.knowledgePoint);
      setAssignmentQuestions(selected.questionsText);
    }
    setLastAssignmentId(assignmentId);
    setTeacherLoading("submissions");
    try {
      const result = await loadAssignmentSubmissions(classId, assignmentId);
      setSubmissions(result.submissions);
    } finally {
      setTeacherLoading("");
    }
  }

  useEffect(() => {
    void refreshClasses("");
    // Load teacher data once on mount; class changes call selectClass.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <section className="tool-surface">
      <h2>老师端</h2>
      <p>创建班级、加入学生、布置作业、发布公告，并查看真实提交和班级薄弱点。</p>
      <div className="form-grid">
          <label>班级名<input placeholder="输入真实班级名称" value={className} onChange={(event) => setClassName(event.target.value)} /></label>
          <label>科目<input placeholder="输入任教学科" value={subject} onChange={(event) => setSubject(event.target.value)} /></label>
          <Button type="button" variant="contained" disabled={teacherLoading === "class"} onClick={async () => {
            if (!className.trim() || !subject.trim()) {
              setAssignmentMessage("请先填写班级名和科目");
              return;
            }
            setTeacherLoading("class");
            try {
              const result = await createClass({ name: className, subject });
            setClassId(result.class.id);
            await refreshClasses(result.class.id);
          } finally {
            setTeacherLoading("");
          }
        }}>{teacherLoading === "class" ? "创建中..." : "创建班级"}</Button>
      </div>
      <div className="result-block">
        <h3>我的班级</h3>
        {teacherLoading === "classes" ? <p>正在加载班级...</p> : null}
        <div className="class-list">
          {classes.map((item) => (
            <Button
              className={classId === item.id ? "class-chip active" : "class-chip"}
              key={item.id}
              type="button"
              onClick={() => void selectClass(item.id)}
            >
              <strong>{item.name}</strong>
              <span>{item.subject} · {item.studentCount} 名学生</span>
            </Button>
          ))}
          {classes.length === 0 && teacherLoading !== "classes" ? <div className="empty-tool">还没有班级。创建一个班级后，数据会持久保存。</div> : null}
        </div>
      </div>
      {classId ? (
        <>
          <div className="form-grid">
            <label>学生邮箱<input placeholder="输入学生注册邮箱" value={studentEmail} onChange={(event) => setStudentEmail(event.target.value)} /></label>
            <Button type="button" variant="contained" disabled={teacherLoading === "student"} onClick={async () => {
              if (!studentEmail.trim()) {
                setAssignmentMessage("请填写学生邮箱");
                return;
              }
              setTeacherLoading("student");
              try {
                await addStudentToClass(classId, studentEmail);
                setStudentEmail("");
                await refreshClasses(classId);
              } finally {
                setTeacherLoading("");
              }
            }}>{teacherLoading === "student" ? "加入中..." : "加入学生"}</Button>
            <Button type="button" variant="outlined" disabled={teacherLoading === "report"} onClick={async () => {
              setTeacherLoading("report");
              try {
                const result = await loadClassReport(classId);
                setReport(result.students);
                setHeatmap(result.heatmap);
              } finally {
                setTeacherLoading("");
              }
            }}>{teacherLoading === "report" ? "加载中..." : "查看班级报告"}</Button>
          </div>
          <div className="form-grid">
            <label>作业标题<input placeholder="输入作业标题" value={assignmentTitle} onChange={(event) => setAssignmentTitle(event.target.value)} /></label>
            <label>知识点<input placeholder="输入本次作业对应知识点" value={assignmentPoint} onChange={(event) => setAssignmentPoint(event.target.value)} /></label>
            <label className="wide-field">题目正文<textarea placeholder="逐题输入题目，支持 Markdown 和 LaTeX 公式" value={assignmentQuestions} onChange={(event) => setAssignmentQuestions(event.target.value)} /></label>
            <Button type="button" variant="contained" onClick={async () => {
              if (!assignmentTitle.trim() || !assignmentPoint.trim() || !assignmentQuestions.trim()) {
                setAssignmentMessage("请填写作业标题、知识点和题目正文");
                return;
              }
              setTeacherLoading("assignment");
              const dueAt = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
              try {
                const result = await createAssignment(classId, { title: assignmentTitle, knowledgePoint: assignmentPoint, questionsText: assignmentQuestions, questionCount: questionCountFromText(assignmentQuestions), dueAt });
                setAssignmentMessage(`已布置给 ${result.assignedCount} 名学生`);
                setLastAssignmentId(result.assignment.id);
                setEditingAssignmentId(result.assignment.id);
                setSubmissions([]);
                await refreshAssignments(classId);
              } finally {
                setTeacherLoading("");
              }
            }} disabled={teacherLoading === "assignment"}>{teacherLoading === "assignment" ? "布置中..." : "布置作业"}</Button>
            {editingAssignmentId ? (
              <Button type="button" variant="outlined" disabled={teacherLoading === "assignment-save"} onClick={async () => {
                setTeacherLoading("assignment-save");
                try {
                  const selected = assignments.find((item) => item.id === editingAssignmentId);
                  await updateAssignment(classId, editingAssignmentId, {
                    title: assignmentTitle,
                    knowledgePoint: assignmentPoint,
                    questionsText: assignmentQuestions,
                    questionCount: questionCountFromText(assignmentQuestions),
                    dueAt: selected?.dueAt ?? new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString()
                  });
                  setAssignmentMessage("作业题目已保存");
                  await refreshAssignments(classId);
                } finally {
                  setTeacherLoading("");
                }
              }}>{teacherLoading === "assignment-save" ? "保存中..." : "保存题目修改"}</Button>
            ) : null}
          </div>
          <div className="form-grid notice-grid">
            <label>公告标题<input placeholder="输入公告标题" value={noticeTitle} onChange={(event) => setNoticeTitle(event.target.value)} /></label>
            <label className="wide-field">公告内容<textarea placeholder="输入要发送给班级学生的内容" value={noticeContent} onChange={(event) => setNoticeContent(event.target.value)} /></label>
            <Button type="button" variant="contained" onClick={async () => {
              if (!noticeTitle.trim() || !noticeContent.trim()) {
                setNoticeMessage("请填写公告标题和内容");
                return;
              }
              setTeacherLoading("notice");
              try {
                const result = await createAnnouncement(classId, { title: noticeTitle, content: noticeContent });
                setNoticeMessage(`公告「${result.announcement.title}」已发布`);
              } finally {
                setTeacherLoading("");
              }
            }} disabled={teacherLoading === "notice"}>{teacherLoading === "notice" ? "发布中..." : "发布公告"}</Button>
          </div>
        </>
      ) : null}
      {assignmentMessage ? <div className="progress-banner"><strong>{assignmentMessage}</strong></div> : null}
      {noticeMessage ? <div className="progress-banner"><strong>{noticeMessage}</strong></div> : null}
      {classId ? (
        <div className="result-block">
          <h3>作业提交情况</h3>
          {teacherLoading === "assignments" ? <p>正在加载作业...</p> : null}
          <div className="class-list">
            {assignments.map((assignment) => (
              <Button
                className={lastAssignmentId === assignment.id ? "class-chip active" : "class-chip"}
                key={assignment.id}
                type="button"
                onClick={() => void loadSubmissions(assignment.id)}
              >
                <strong>{assignment.title}</strong>
                <span>{assignment.knowledgePoint} · {assignment.questionCount} 题 · 截止 {new Date(assignment.dueAt).toLocaleDateString("zh-CN")}</span>
                <small>{assignment.questionsText.slice(0, 80)}{assignment.questionsText.length > 80 ? "..." : ""}</small>
              </Button>
            ))}
            {assignments.length === 0 && teacherLoading !== "assignments" ? <div className="empty-tool">当前班级还没有作业。</div> : null}
          </div>
          <div className="tool-list">
            {submissions.map((item) => (
              <article className="tool-item" key={item.studentId}>
                <strong>{item.name} · {item.grade}</strong>
                <span>{item.status} · {item.score}分 {item.submittedAt ? `· ${new Date(item.submittedAt).toLocaleString("zh-CN")}` : ""}</span>
              {item.report?.summary ? <MarkdownView>{item.report.summary}</MarkdownView> : <p>暂未提交或暂无报告。</p>}
              {item.report?.wrong_points?.length ? <MarkdownView>{`**薄弱点：**\n${markdownBulletList(item.report.wrong_points)}`}</MarkdownView> : null}
              </article>
            ))}
            {submissions.length === 0 ? <div className="empty-tool">选择一份作业查看学生提交情况。</div> : null}
          </div>
        </div>
      ) : null}
      {heatmap.length ? (
        <div className="result-block">
          <h3>班级薄弱点热力图</h3>
          <div className="heatmap-list">
            {heatmap.map((item) => (
              <div key={item.point}>
                <span>{item.point}</span>
                <strong style={{ width: `${Math.min(100, item.count * 18)}%` }}>{item.count}</strong>
              </div>
            ))}
          </div>
        </div>
      ) : null}
      <ReportList items={report} />
    </section>
  );
}

function AssignmentsPanel() {
  const [assignments, setAssignments] = useState<Array<{ id: string; title: string; knowledgePoint: string; questionsText: string; questionCount: number; className: string; status: string; score: number; dueAt: string }>>([]);
  const [announcements, setAnnouncements] = useState<Array<{ id: string; title: string; content: string; assignmentId: string; className: string; createdAt: string }>>([]);
  const [answerMap, setAnswerMap] = useState<Record<string, string>>({});
  const [reportMap, setReportMap] = useState<Record<string, { score: number; summary?: string; suggestions?: string[]; wrong_points?: string[] }>>({});
  const [loading, setLoading] = useState(false);
  const [submittingId, setSubmittingId] = useState("");

  async function load() {
    setLoading(true);
    try {
      const [assignmentResult, announcementResult] = await Promise.all([loadStudentAssignments(), loadAnnouncements()]);
      setAssignments(assignmentResult.assignments);
      setAnnouncements(announcementResult.announcements);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  return (
    <section className="tool-surface">
      <h2>我的作业</h2>
      <p>完成老师布置的任务，AI会批改并自动把薄弱题加入错题本。</p>
      <Button type="button" variant="outlined" onClick={() => void load()}>{loading ? "刷新中..." : "刷新作业"}</Button>
      {announcements.length ? (
        <div className="announcement-wall">
          {announcements.map((item) => (
            <article key={item.id}>
              <strong>{item.title}</strong>
              <span>{item.className} · {new Date(item.createdAt).toLocaleString("zh-CN")}</span>
                <MarkdownView>{item.content}</MarkdownView>
            </article>
          ))}
        </div>
      ) : null}
      <div className="tool-list">
        {assignments.length === 0 ? <div className="empty-tool">暂无作业。</div> : null}
        {assignments.map((assignment) => (
          <article className="tool-item" key={assignment.id}>
            <strong>{assignment.title}</strong>
            <span>{assignment.className} · {assignment.knowledgePoint} · {assignment.status} · {assignment.score}分</span>
            <small>截止：{new Date(assignment.dueAt).toLocaleString("zh-CN")}</small>
            <div className="assignment-questions">
              <strong>题目</strong>
              {splitQuestionText(assignment.questionsText).map((line, index) => (
                <MarkdownView key={`${assignment.id}-question-${index}`}>{line}</MarkdownView>
              ))}
            </div>
            <textarea
              placeholder="按题号写出答案和过程"
              value={answerMap[assignment.id] ?? ""}
              onChange={(event) => setAnswerMap((state) => ({ ...state, [assignment.id]: event.target.value }))}
            />
            <Button type="button" variant="contained" onClick={async () => {
              setSubmittingId(assignment.id);
              try {
                const result = await submitAssignment(assignment.id, answerMap[assignment.id] ?? "");
                setReportMap((state) => ({ ...state, [assignment.id]: result.report }));
                await load();
              } finally {
                setSubmittingId("");
              }
            }} disabled={submittingId === assignment.id}>{submittingId === assignment.id ? "AI批改中..." : "提交批改"}</Button>
            {reportMap[assignment.id] ? <GradingReportView report={reportMap[assignment.id]} /> : null}
          </article>
        ))}
      </div>
    </section>
  );
}

function ReportsPanel() {
  const [reports, setReports] = useState<Array<{ sourceId: string; type: string; title: string; score: number; report: string; createdAt: string }>>([]);
  const [practice, setPractice] = useState<null | { id: string; content: { title?: string; knowledge_point?: string; questions?: Array<{ question: string; answer: string; hint: string }> } }>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [practiceReport, setPracticeReport] = useState<null | { score: number; summary?: string; suggestions?: string[]; wrong_points?: string[] }>(null);
  const [loading, setLoading] = useState(false);
  const [generatingId, setGeneratingId] = useState("");
  const [gradingPractice, setGradingPractice] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const result = await loadReports();
      setReports(result.reports);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  return (
    <section className="tool-surface">
      <h2>批改报告</h2>
      <p>查看作业/测验报告，并对错题生成变式题重做。</p>
      <Button type="button" variant="outlined" onClick={() => void load()}>{loading ? "刷新中..." : "刷新报告"}</Button>
      <div className="tool-list">
        {reports.length === 0 ? <div className="empty-tool">暂无批改报告。完成作业或测验后会自动出现在这里。</div> : null}
        {reports.map((item) => {
          const parsed = safeJson(item.report);
          return (
            <article className="tool-item" key={`${item.type}-${item.sourceId}`}>
              <strong>{item.title} · {item.score}分</strong>
              <span>{item.type === "quiz" ? "测验" : "作业"} · {new Date(item.createdAt).toLocaleString("zh-CN")}</span>
              <MarkdownView>{parsed.summary ?? "暂无总结"}</MarkdownView>
              {parsed.correct_points?.length ? <MarkdownView>{`**已掌握：**\n${markdownBulletList(parsed.correct_points)}`}</MarkdownView> : null}
              <MarkdownView>{`**错因：**\n${markdownBulletList(parsed.wrong_points) || "暂无"}`}</MarkdownView>
              <Button type="button" variant="contained" onClick={async () => {
                const wrong = parsed.wrong_questions?.[0];
                setGeneratingId(item.sourceId);
                try {
                  const result = await generateAdaptivePractice({
                    sourceType: item.type,
                    sourceId: item.sourceId,
                    knowledgePoint: wrong?.knowledge_point ?? item.title,
                    sourceText: wrong?.title ?? item.title
                  });
                  setPractice(result.practice);
                  setPracticeReport(null);
                  setAnswers({});
                } finally {
                  setGeneratingId("");
                }
              }} disabled={generatingId === item.sourceId}>
                {generatingId === item.sourceId ? "正在生成变式题..." : "生成变式题重做"}
              </Button>
            </article>
          );
        })}
      </div>
      {practice ? (
        <div className="result-block">
          <h3>{practice.content.title ?? "变式练习"}</h3>
          {practice.content.questions?.map((question, index) => (
            <article key={`${question.question}-${index}`}>
              <MarkdownView>{`**${index + 1}.** ${formatAiValue(question.question)}\n\n**提示：** ${formatAiValue(question.hint)}`}</MarkdownView>
              <textarea value={answers[String(index)] ?? ""} onChange={(event) => setAnswers((state) => ({ ...state, [String(index)]: event.target.value }))} />
            </article>
          ))}
          <Button type="button" variant="contained" onClick={async () => {
            setGradingPractice(true);
            try {
              const result = await submitAdaptivePractice(practice.id, answers);
              setPracticeReport(result.report);
              await load();
            } finally {
              setGradingPractice(false);
            }
          }} disabled={gradingPractice}>{gradingPractice ? "AI批改中..." : "提交重做批改"}</Button>
          {practiceReport ? <GradingReportView report={practiceReport} /> : null}
        </div>
      ) : null}
    </section>
  );
}

function GoalsPanel() {
  const [title, setTitle] = useState("");
  const [subject, setSubject] = useState("");
  const [durationDays, setDurationDays] = useState(7);
  const [goals, setGoals] = useState<Array<{ id: string; title: string; plan: { summary?: string; days?: unknown[]; checkpoints?: unknown[] }; progress: number; status: string }>>([]);

  async function load() {
    const result = await loadGoals();
    setGoals(result.goals);
  }

  useEffect(() => {
    void load();
  }, []);

  return (
    <section className="tool-surface">
      <h2>学习目标</h2>
      <p>设定阶段目标，AI会拆成每日任务并追踪完成度。</p>
      <div className="form-grid">
        <label>目标<input placeholder="输入这阶段想达成的学习目标" value={title} onChange={(event) => setTitle(event.target.value)} /></label>
        <label>科目<input placeholder="输入科目" value={subject} onChange={(event) => setSubject(event.target.value)} /></label>
        <label>天数<input type="number" value={durationDays} onChange={(event) => setDurationDays(Number(event.target.value))} /></label>
        <Button type="button" variant="contained" disabled={!title.trim() || !subject.trim()} onClick={async () => { await createGoal({ title, subject, durationDays }); await load(); }}>生成目标计划</Button>
      </div>
      <div className="tool-list">
        {goals.map((goal) => (
          <article className="tool-item" key={goal.id}>
            <strong>{goal.title} · {goal.progress}%</strong>
            <MarkdownView>{goal.plan.summary ?? ""}</MarkdownView>
            <input type="range" min={0} max={100} value={goal.progress} onChange={async (event) => {
              const progress = Number(event.target.value);
              await updateGoalProgress(goal.id, progress);
              setGoals((state) => state.map((item) => item.id === goal.id ? { ...item, progress } : item));
            }} />
            <MarkdownView>{markdownBulletList(goal.plan.days ?? goal.plan.checkpoints)}</MarkdownView>
          </article>
        ))}
      </div>
    </section>
  );
}

function AdminPanel() {
  const [data, setData] = useState<null | {
    totals: { totalUsers: number; activeUsers: number; totalMinutes: number; submittedAssignments: number };
    trends: Array<{ day: string; minutes: number; correct: number; wrong: number }>;
    hotKnowledge: Array<{ point: string; count: number }>;
    classMastery: Array<{ className: string; subject: string; averageMastery: number }>;
  }>(null);
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const result = await loadAdminDashboard();
      setData(result);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  return (
    <section className="tool-surface">
      <h2>运营数据看板</h2>
      <p>用于查看整体学习活跃、热门知识点和班级掌握度。</p>
      <Button type="button" variant="outlined" onClick={() => void load()}>{loading ? "刷新中..." : "刷新数据"}</Button>
      {data ? (
        <>
          <div className="dashboard-grid">
            <Metric label="总用户" value={String(data.totals.totalUsers)} />
            <Metric label="7日活跃" value={String(data.totals.activeUsers)} />
            <Metric label="总学习分钟" value={String(data.totals.totalMinutes)} />
            <Metric label="已交作业" value={String(data.totals.submittedAssignments)} />
          </div>
          <p className="data-source-note">数据来自当前数据库的用户、学习记录、班级、作业提交和掌握度表。</p>
          <div className="result-block">
            <h3>学习趋势</h3>
            {data.trends.length ? (
              <div className="heatmap-list">
                {data.trends.map((item) => (
                  <div key={item.day}>
                    <span>{item.day} · {item.minutes}分钟 · 对{item.correct}/错{item.wrong}</span>
                    <strong style={{ width: `${Math.min(100, Math.max(8, item.minutes))}%` }}>{item.minutes}</strong>
                  </div>
                ))}
              </div>
            ) : <div className="empty-tool">还没有真实学习记录。学生完成 AI 辅导、测验或作业后，这里会自动产生趋势。</div>}
          </div>
          <div className="dashboard-grid">
            <section className="feature-card">
              <h3>热门知识点</h3>
              {data.hotKnowledge.length ? data.hotKnowledge.map((item) => <p key={item.point}>{item.point} · {item.count}</p>) : <p>暂无真实学习数据。</p>}
            </section>
            <section className="feature-card">
              <h3>班级平均掌握度</h3>
              {data.classMastery.length ? data.classMastery.map((item) => (
                <p key={`${item.className}-${item.subject}`}>{item.className} · {item.subject} · {item.averageMastery ?? 0}%</p>
              )) : <p>暂无班级数据。</p>}
            </section>
          </div>
        </>
      ) : null}
    </section>
  );
}

function SettingsPanel({ user }: { user: { name: string; grade: string; email: string; avatarUrl?: string } }) {
  const [name, setName] = useState(user.name);
  const [grade, setGrade] = useState(user.grade);
  const [avatarUrl, setAvatarUrl] = useState(user.avatarUrl ?? "");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const logout = useStudyStore((state) => state.logout);

  async function save() {
    setLoading(true);
    setMessage("");
    try {
      const result = await updateProfile({ name, grade, avatarUrl });
      useStudyStore.setState({ user: result.user });
      setMessage("资料已保存");
    } finally {
      setLoading(false);
    }
  }

  async function pickAvatar(file: File | null) {
    if (!file) return;
    const dataUrl = await fileToDataUrl(file);
    setAvatarUrl(dataUrl);
  }

  async function exportData() {
    const data = await exportMyData();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `zhixue-data-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function deleteAccount() {
    const confirmed = window.confirm("确认注销账号并删除本账号的学习数据吗？此操作无法恢复。");
    if (!confirmed) return;
    await deleteMyAccount();
    logout();
  }

  return (
    <section className="tool-surface">
      <h2>个人设置</h2>
      <p>昵称、年级和头像会保存到账号，下次登录自动恢复。</p>
      <div className="profile-editor">
        <div className="profile-avatar">{avatarUrl ? <img src={avatarUrl} alt="头像" /> : name.slice(0, 1)}</div>
        <div className="form-grid">
          <label>昵称<input value={name} onChange={(event) => setName(event.target.value)} /></label>
          <label>年级<input value={grade} onChange={(event) => setGrade(event.target.value)} /></label>
          <label>邮箱<input value={user.email} readOnly /></label>
          <label className="wide-field avatar-upload-field">
            <span>头像</span>
            <strong className="file-picker-button">{avatarUrl ? "更换头像" : "上传头像"}</strong>
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={(event) => {
                void pickAvatar(event.target.files?.[0] ?? null);
                event.currentTarget.value = "";
              }}
            />
          </label>
          <Button type="button" variant="contained" disabled={loading || !name.trim()} onClick={() => void save()}>
            {loading ? "保存中..." : "保存资料"}
          </Button>
        </div>
      </div>
      {message ? <div className="progress-banner"><strong>{message}</strong></div> : null}
      <div className="danger-zone">
        <h3>数据与账号</h3>
        <p>可以导出自己的学习数据；注销会删除当前账号及其关联学习数据。</p>
        <div className="button-row">
          <Button type="button" variant="outlined" onClick={() => void exportData()}>导出我的数据</Button>
          <Button className="danger-action" type="button" variant="contained" color="error" onClick={() => void deleteAccount()}>注销账号</Button>
        </div>
      </div>
    </section>
  );
}

function safeJson(text: string): any {
  try {
    return JSON.parse(text || "{}");
  } catch {
    return {};
  }
}

function MarkdownView({ children }: { children: string }) {
  return (
    <div className="markdown-view">
      <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
        {children || " "}
      </ReactMarkdown>
    </div>
  );
}

function markdownListFromJsonText(value: string) {
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) return markdownBulletList(parsed);
  } catch {
    // Keep existing plain text when older records are not JSON arrays.
  }
  return value;
}

function markdownBulletList(value: unknown) {
  const items = Array.isArray(value) ? value : value ? [value] : [];
  return items.map((item) => `- ${formatAiValue(item)}`).join("\n");
}

function formatAiValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map(formatAiValue).filter(Boolean).join("；");
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const primary = ["day", "title", "task", "concept", "practice", "review", "check", "standard", "point", "summary"]
      .map((key) => formatField(key, record[key]))
      .filter(Boolean);
    const rest = Object.entries(record)
      .filter(([key]) => !["day", "title", "task", "concept", "practice", "review", "check", "standard", "point", "summary"].includes(key))
      .map(([key, item]) => formatField(key, item))
      .filter(Boolean);
    return [...primary, ...rest].join("；");
  }
  return String(value);
}

function formatField(key: string, value: unknown) {
  const text = formatAiValue(value);
  if (!text) return "";
  const labels: Record<string, string> = {
    acceptance: "验收",
    check: "检查",
    concept: "概念",
    day: "时间",
    evidence: "依据",
    minutes: "分钟",
    point: "知识点",
    practice: "练习",
    priority: "优先级",
    review: "复习",
    standard: "标准",
    summary: "总结",
    task: "任务",
    title: "标题"
  };
  return `**${labels[key] ?? key}：** ${text}`;
}

function splitQuestionText(text: string) {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function questionCountFromText(text: string) {
  return Math.max(1, Math.min(30, splitQuestionText(text).length || 1));
}

function exportWrongQuestionsPdf(items: Array<{ title: string; knowledgePoint: string; reason: string }>) {
  const win = window.open("", "_blank", "width=900,height=700");
  if (!win) return;
  const rows = items.length
    ? items
        .map(
          (item, index) => `
            <article>
              <h2>${index + 1}. ${escapeHtml(item.title)}</h2>
              <p><strong>知识点：</strong>${escapeHtml(item.knowledgePoint)}</p>
              <p><strong>错因：</strong>${escapeHtml(item.reason)}</p>
              <div class="blank">重做过程：</div>
            </article>`
        )
        .join("")
    : "<p>当前没有待复习错题。</p>";
  win.document.write(`
    <!doctype html>
    <html lang="zh-CN">
      <head>
        <meta charset="utf-8" />
        <title>智学AI错题本</title>
        <style>
          body { font-family: "Microsoft YaHei", Arial, sans-serif; margin: 32px; color: #202124; }
          header { border-bottom: 2px solid #0b57d0; margin-bottom: 20px; padding-bottom: 12px; }
          h1 { margin: 0; font-size: 26px; }
          article { break-inside: avoid; border: 1px solid #dde3ea; border-radius: 10px; margin: 14px 0; padding: 16px; }
          h2 { margin: 0 0 10px; font-size: 17px; }
          p { margin: 6px 0; }
          .blank { margin-top: 14px; min-height: 90px; border-top: 1px dashed #9aa0a6; padding-top: 10px; }
          @media print { button { display: none; } body { margin: 18mm; } }
        </style>
      </head>
      <body>
        <button onclick="window.print()">保存为 PDF / 打印</button>
        <header>
          <h1>智学AI错题本</h1>
          <p>生成时间：${new Date().toLocaleString("zh-CN")}</p>
        </header>
        ${rows}
      </body>
    </html>
  `);
  win.document.close();
  win.focus();
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function GradingReportView({ report }: { report: { score: number; summary?: string; suggestions?: string[]; wrong_points?: string[] } }) {
  return (
    <div className="grading-report">
      <strong>批改结果：{report.score}分</strong>
      {report.summary ? <MarkdownView>{report.summary}</MarkdownView> : null}
      {report.wrong_points?.length ? <MarkdownView>{`**问题：**\n${markdownBulletList(report.wrong_points)}`}</MarkdownView> : null}
      {report.suggestions?.length ? <MarkdownView>{`**建议：**\n${markdownBulletList(report.suggestions)}`}</MarkdownView> : null}
    </div>
  );
}

function ReportList({ items }: { items: Array<{ name: string; grade: string; stats: { learnedMinutes: number; wrongCount: number }; weakPoints: Array<{ point: string; count: number }> }> }) {
  if (!items.length) return null;
  return (
    <div className="tool-list">
      {items.map((item) => (
        <article className="tool-item" key={`${item.name}-${item.grade}`}>
          <strong>{item.name} · {item.grade}</strong>
          <span>学习 {item.stats.learnedMinutes} 分钟 · 待复习错题 {item.stats.wrongCount}</span>
          <p>薄弱点：{item.weakPoints.map((point) => `${point.point}(${point.count})`).join("、") || "暂无"}</p>
        </article>
      ))}
    </div>
  );
}

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("读取图片失败"));
    reader.readAsDataURL(file);
  });
}

function pendingLabel(task: "" | "chat" | "card" | "plan" | "quiz") {
  if (task === "quiz") return "测验生成中";
  if (task === "plan") return "学习计划生成中";
  if (task === "card") return "知识卡片生成中";
  return "处理中";
}

function FeatureCard({ title, text, action, onClick }: { title: string; text: string; action?: string; onClick?: () => void }) {
  return (
    <Paper component="article" className="feature-card" elevation={0}>
      <h3>{title}</h3>
      <p>{text}</p>
      {action ? <Button type="button" variant="contained" onClick={onClick}>{action}</Button> : null}
    </Paper>
  );
}

function modeLabel(mode: StudyMode) {
  return modes.find((item) => item.id === mode)?.label ?? "学习";
}

function AuthScreen({
  authMode,
  loading,
  authError,
  onSwitch,
  onLogin,
  onRegister
}: {
  authMode: "login" | "register";
  loading: boolean;
  authError: string;
  onSwitch: (mode: "login" | "register") => void;
  onLogin: (payload: { email: string; password: string }) => Promise<void>;
  onRegister: (payload: { email: string; password: string; name: string; grade: string; role: UserProfile["role"] }) => Promise<void>;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [grade, setGrade] = useState("");
  const [role, setRole] = useState<UserProfile["role"]>("student");
  const isRegister = authMode === "register";
  const roleOptions: Array<{ value: UserProfile["role"]; label: string; helper: string }> = [
    { value: "student", label: "学生", helper: "学习、练习、错题本" },
    { value: "teacher", label: "老师", helper: "班级、作业、报告" },
    { value: "parent", label: "家长", helper: "查看孩子学习报告" }
  ];
  const handleRoleChange = (_event: unknown, nextRole: UserProfile["role"] | null) => {
    if (!nextRole) return;
    setRole(nextRole);
    if (nextRole === "teacher" && ["初三", "家长"].includes(grade)) setGrade("");
    if (nextRole === "parent" && ["初三", "老师"].includes(grade)) setGrade("");
  };
  const profileLabel = role === "student" ? "年级" : role === "teacher" ? "任教年级/科目" : "孩子年级/备注";
  const profilePlaceholder = role === "student" ? "例如：初三" : role === "teacher" ? "例如：初三数学" : "例如：孩子初二";

  return (
    <main className="auth-screen">
      <Paper className="auth-card" elevation={0}>
        <div className="rail-brand">
          <Sparkles aria-hidden="true" />
          <span>智学AI</span>
        </div>
        <h1>登录学习空间</h1>
        <p>对话、错题和学习统计会持续保存。</p>

        <div className="auth-tabs" role="tablist" aria-label="登录注册切换">
          <Button
            className={!isRegister ? "active" : ""}
            onClick={() => onSwitch("login")}
            type="button"
            variant={!isRegister ? "contained" : "text"}
          >
            登录
          </Button>
          <Button
            className={isRegister ? "active" : ""}
            onClick={() => onSwitch("register")}
            type="button"
            variant={isRegister ? "contained" : "text"}
          >
            注册
          </Button>
        </div>

        <form
          className="auth-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (isRegister) void onRegister({ email, password, name, grade, role });
            else void onLogin({ email, password });
          }}
        >
          {isRegister ? (
            <>
              <TextField
                fullWidth
                label="昵称"
                placeholder="输入昵称"
                value={name}
                onChange={(event) => setName(event.target.value)}
                variant="outlined"
              />
              <TextField
                fullWidth
                label={profileLabel}
                placeholder={profilePlaceholder}
                value={grade}
                onChange={(event) => setGrade(event.target.value)}
                variant="outlined"
              />
              <div className="role-picker">
                <span>身份</span>
                <ToggleButtonGroup
                  exclusive
                  fullWidth
                  value={role}
                  onChange={handleRoleChange}
                  aria-label="选择账号身份"
                >
                  {roleOptions.map((item) => (
                    <ToggleButton key={item.value} value={item.value} aria-label={item.label}>
                      <strong>{item.label}</strong>
                      <small>{item.helper}</small>
                    </ToggleButton>
                  ))}
                </ToggleButtonGroup>
              </div>
            </>
          ) : null}
          <TextField
            fullWidth
            label="邮箱"
            type="email"
            placeholder="输入邮箱"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            variant="outlined"
          />
          <TextField
            fullWidth
            label="密码"
            type="password"
            placeholder={isRegister ? "至少 8 位密码" : "输入密码"}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            variant="outlined"
          />
          {authError ? <Alert severity="error">{authError}</Alert> : null}
          <Button className="auth-submit" disabled={loading} type="submit" variant="contained" size="large">
            {isRegister ? "创建账号" : "登录"}
          </Button>
        </form>
      </Paper>
    </main>
  );
}
