import {
  Alert,
  Box,
  Button,
  Divider,
  IconButton,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography
} from "@mui/material";
import {
  BarChart3,
  Building2,
  Flame,
  History,
  LogOut,
  Moon,
  Newspaper,
  RefreshCw,
  ShieldCheck,
  Sun,
  UserCog,
  Users
} from "lucide-react";
import { useEffect, useMemo, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import {
  bulkCreateAdminUsers,
  createAdminClass,
  createAdminGuardianLink,
  forceUsersIntoClass,
  loadAdminActivity,
  loadAdminAuditLogs,
  loadAdminClassStudents,
  loadAdminClasses,
  loadAdminDashboard,
  loadAdminHotKnowledge,
  loadAdminUsers,
  removeAdminClassStudent,
  resetAdminUserPassword,
  updateAdminClass,
  updateAdminUserProfile,
  updateAdminUserRole,
  updateAdminUserStatus,
  type AdminActivityRow,
  type AdminAuditLog,
  type AdminClassRow,
  type AdminHotKnowledgeRow,
  type AdminUserRow
} from "./api";
import type { UserProfile } from "./types";

type AdminSection = "overview" | "activity" | "knowledge" | "accounts" | "classes" | "guardians" | "audit";

type AdminDashboardData = {
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
};

type AdminClassStudent = {
  id: string;
  email: string;
  name: string;
  grade: string;
  role: UserProfile["role"];
  status: string;
  joinedAt: string;
};

const adminSections: Array<{ id: AdminSection; label: string; icon: typeof BarChart3; description: string }> = [
  { id: "overview", label: "数据总览", icon: BarChart3, description: "全校活跃、趋势、核心指标" },
  { id: "activity", label: "学习动态", icon: Newspaper, description: "最近 1000 条，每页 20 条" },
  { id: "knowledge", label: "热门知识点", icon: Flame, description: "按真实学习记录聚合" },
  { id: "accounts", label: "账号权限", icon: UserCog, description: "改角色、改密码、停用账号" },
  { id: "classes", label: "班级治理", icon: Building2, description: "建班、改班、强制入班" },
  { id: "guardians", label: "家校绑定", icon: Users, description: "给学生绑定家长账号" },
  { id: "audit", label: "审计日志", icon: History, description: "追踪管理员操作" }
];

export function AdminPortal({
  user,
  theme,
  onToggleTheme,
  onLogout
}: {
  user: UserProfile;
  theme: "light" | "dark";
  onToggleTheme: () => void;
  onLogout: () => void;
}) {
  const [section, setSection] = useState<AdminSection>("overview");
  const [data, setData] = useState<AdminDashboardData | null>(null);
  const [adminUsers, setAdminUsers] = useState<AdminUserRow[]>([]);
  const [adminClasses, setAdminClasses] = useState<AdminClassRow[]>([]);
  const [userQuery, setUserQuery] = useState("");
  const [userRoleFilter, setUserRoleFilter] = useState("");
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [targetClassId, setTargetClassId] = useState("");
  const [passwordDrafts, setPasswordDrafts] = useState<Record<string, string>>({});
  const [profileDrafts, setProfileDrafts] = useState<Record<string, { email: string; name: string; grade: string }>>({});
  const [bulkText, setBulkText] = useState("");
  const [classDraft, setClassDraft] = useState({ id: "", name: "", subject: "数学", teacherId: "" });
  const [classStudents, setClassStudents] = useState<AdminClassStudent[]>([]);
  const [guardianDraft, setGuardianDraft] = useState({ studentId: "", guardianEmail: "" });
  const [auditLogs, setAuditLogs] = useState<AdminAuditLog[]>([]);
  const [activityRows, setActivityRows] = useState<AdminActivityRow[]>([]);
  const [activityPage, setActivityPage] = useState(1);
  const [activityTotal, setActivityTotal] = useState(0);
  const [hotKnowledgeRows, setHotKnowledgeRows] = useState<AdminHotKnowledgeRow[]>([]);
  const [knowledgePage, setKnowledgePage] = useState(1);
  const [knowledgeTotal, setKnowledgeTotal] = useState(0);
  const [message, setMessage] = useState("");
  const [working, setWorking] = useState("");
  const [loading, setLoading] = useState(false);

  const selectedClass = useMemo(
    () => adminClasses.find((item) => item.id === targetClassId),
    [adminClasses, targetClassId]
  );

  async function loadDashboard() {
    setLoading(true);
    try {
      setData(await loadAdminDashboard());
    } finally {
      setLoading(false);
    }
  }

  async function refreshAdminOps() {
    setWorking("refresh");
    try {
      const [usersResult, classesResult] = await Promise.all([
        loadAdminUsers({ q: userQuery, role: userRoleFilter }),
        loadAdminClasses()
      ]);
      setAdminUsers(usersResult.users);
      setAdminClasses(classesResult.classes);
      setTargetClassId((current) => current || classesResult.classes[0]?.id || "");
      setClassDraft((current) => ({
        ...current,
        teacherId: current.teacherId || usersResult.users.find((item) => item.role === "teacher" || item.role === "admin")?.id || ""
      }));
      setSelectedUserIds((current) => current.filter((id) => usersResult.users.some((item) => item.id === id)));
      setProfileDrafts((current) => {
        const next = { ...current };
        for (const item of usersResult.users) {
          if (!next[item.id]) next[item.id] = { email: item.email, name: item.name, grade: item.grade };
        }
        return next;
      });
    } finally {
      setWorking("");
    }
  }

  async function refreshAuditLogs() {
    const result = await loadAdminAuditLogs();
    setAuditLogs(result.logs);
  }

  async function refreshActivity(page = activityPage) {
    setWorking("activity");
    try {
      const result = await loadAdminActivity(page);
      setActivityRows(result.rows);
      setActivityPage(result.page);
      setActivityTotal(result.total);
    } finally {
      setWorking("");
    }
  }

  async function refreshHotKnowledge(page = knowledgePage) {
    setWorking("knowledge");
    try {
      const result = await loadAdminHotKnowledge(page);
      setHotKnowledgeRows(result.rows);
      setKnowledgePage(result.page);
      setKnowledgeTotal(result.total);
    } finally {
      setWorking("");
    }
  }

  async function refreshAll() {
    await Promise.all([loadDashboard(), refreshAdminOps(), refreshAuditLogs(), refreshActivity(1), refreshHotKnowledge(1)]);
  }

  useEffect(() => {
    void refreshAll();
    // Initial admin load only; subsequent refreshes are explicit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const parseBulkUsers = () =>
    bulkText
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [email = "", password = "", name = "", grade = "", role = "student"] = line
          .split(/[,，\t]/)
          .map((item) => item.trim());
        return { email, password, name, grade, role: (role || "student") as UserProfile["role"] };
      });

  async function changeUserRole(id: string, role: UserProfile["role"]) {
    await runAdminAction(`role-${id}`, "角色已更新", "角色更新失败", async () => {
      await updateAdminUserRole(id, role);
      await refreshAdminOps();
      await loadDashboard();
      await refreshAuditLogs();
    });
  }

  async function resetPassword(id: string) {
    const password = passwordDrafts[id] ?? "";
    if (password.length < 8) {
      setMessage("新密码至少 8 位");
      return;
    }
    await runAdminAction(`password-${id}`, "密码已重置", "密码重置失败", async () => {
      await resetAdminUserPassword(id, password);
      setPasswordDrafts((state) => ({ ...state, [id]: "" }));
      await refreshAuditLogs();
    });
  }

  async function saveProfile(id: string) {
    const draft = profileDrafts[id];
    if (!draft?.email || !draft?.name) {
      setMessage("账号和姓名不能为空");
      return;
    }
    await runAdminAction(`profile-${id}`, "用户资料已更新", "资料更新失败", async () => {
      await updateAdminUserProfile(id, draft);
      await refreshAdminOps();
      await refreshAuditLogs();
    });
  }

  async function changeUserStatus(id: string, status: "active" | "suspended") {
    await runAdminAction(`status-${id}`, status === "suspended" ? "账号已停用" : "账号已启用", "账号状态更新失败", async () => {
      await updateAdminUserStatus(id, status);
      await refreshAdminOps();
      await refreshAuditLogs();
    });
  }

  async function addSelectedToClass() {
    if (!targetClassId || !selectedUserIds.length) {
      setMessage("请先选择班级和用户");
      return;
    }
    await runAdminAction("class-add", "所选用户已加入班级", "加入班级失败", async () => {
      const result = await forceUsersIntoClass(targetClassId, { userIds: selectedUserIds });
      setMessage(`已匹配 ${result.matched} 个账号，新加入 ${result.added} 个`);
      await refreshAdminOps();
      await loadClassRoster(targetClassId);
      await refreshAuditLogs();
    });
  }

  async function createBulkUsers() {
    const users = parseBulkUsers();
    if (!users.length) {
      setMessage("请先填写批量账号");
      return;
    }
    await runAdminAction("bulk", "批量账号已处理", "批量创建失败", async () => {
      const result = await bulkCreateAdminUsers({ classId: targetClassId || undefined, users });
      setMessage(`创建 ${result.createdCount} 个，跳过 ${result.skippedCount} 个${result.skipped.length ? `：${result.skipped.map((item) => `${item.email} ${item.reason}`).join("；")}` : ""}`);
      if (result.createdCount) setBulkText("");
      await refreshAdminOps();
      await loadDashboard();
      await refreshAuditLogs();
    });
  }

  async function saveClass() {
    if (!classDraft.name.trim() || !classDraft.subject.trim() || !classDraft.teacherId) {
      setMessage("班级名称、科目和班主任不能为空");
      return;
    }
    await runAdminAction("class-save", classDraft.id ? "班级已更新" : "班级已创建", "班级保存失败", async () => {
      if (classDraft.id) {
        await updateAdminClass(classDraft.id, classDraft);
      } else {
        await createAdminClass(classDraft);
      }
      setClassDraft({ id: "", name: "", subject: "数学", teacherId: classDraft.teacherId });
      await refreshAdminOps();
      await refreshAuditLogs();
    });
  }

  async function loadClassRoster(classId = targetClassId) {
    if (!classId) {
      setClassStudents([]);
      return;
    }
    setWorking("roster");
    try {
      const result = await loadAdminClassStudents(classId);
      setClassStudents(result.students);
      setTargetClassId(classId);
    } finally {
      setWorking("");
    }
  }

  async function removeFromClass(userId: string) {
    if (!targetClassId) return;
    await runAdminAction(`remove-${userId}`, "已移出班级成员", "移出班级失败", async () => {
      await removeAdminClassStudent(targetClassId, userId);
      await loadClassRoster(targetClassId);
      await refreshAdminOps();
      await refreshAuditLogs();
    });
  }

  async function bindGuardian() {
    if (!guardianDraft.studentId || !guardianDraft.guardianEmail.trim()) {
      setMessage("请选择学生并填写家长邮箱");
      return;
    }
    await runAdminAction("guardian", "家长绑定已创建", "家长绑定失败", async () => {
      await createAdminGuardianLink(guardianDraft);
      setGuardianDraft({ studentId: guardianDraft.studentId, guardianEmail: "" });
      await refreshAuditLogs();
    });
  }

  async function runAdminAction(key: string, success: string, fail: string, action: () => Promise<void>) {
    setWorking(key);
    setMessage("");
    try {
      await action();
      setMessage((current) => current || success);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : fail);
    } finally {
      setWorking("");
    }
  }

  const toggleSelectedUser = (id: string, checked: boolean) => {
    setSelectedUserIds((state) => (checked ? Array.from(new Set([...state, id])) : state.filter((item) => item !== id)));
  };

  return (
    <Box component="main" className="admin-portal layui-layout layui-layout-admin">
      <Paper component="aside" className="admin-sidebar layui-side layui-bg-green" elevation={0}>
        <Stack className="admin-brand" direction="row" sx={{ alignItems: "center" }}>
          <ShieldCheck aria-hidden="true" />
          <div>
            <strong>智学AI Admin</strong>
            <span>School Console</span>
          </div>
        </Stack>
        <Divider />
        <Box component="nav" className="admin-nav layui-nav layui-nav-tree" aria-label="管理员导航">
          {adminSections.map((item) => {
            const Icon = item.icon;
            return (
              <Button
                className={section === item.id ? "admin-nav-item layui-nav-item layui-this active" : "admin-nav-item layui-nav-item"}
                key={item.id}
                type="button"
                variant="text"
                onClick={() => setSection(item.id)}
              >
                <Icon aria-hidden="true" />
                <span>{item.label}</span>
                <small>{item.description}</small>
              </Button>
            );
          })}
        </Box>
      </Paper>

      <Box component="section" className="admin-main">
        <Paper component="header" className="admin-topbar layui-header" elevation={0}>
          <div>
            <Typography variant="overline">Administrator Workspace</Typography>
            <h1>{adminSections.find((item) => item.id === section)?.label ?? "校级管理"}</h1>
          </div>
          <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
            <Button type="button" variant="outlined" startIcon={<RefreshCw size={16} />} onClick={() => void refreshAll()}>
              {loading || working === "refresh" ? "刷新中" : "刷新"}
            </Button>
            <IconButton type="button" aria-label="切换主题" onClick={onToggleTheme}>
              {theme === "dark" ? <Sun aria-hidden="true" /> : <Moon aria-hidden="true" />}
            </IconButton>
            <Paper className="admin-user-chip" elevation={0}>
              <strong>{user.name || user.email}</strong>
              <span>管理员</span>
            </Paper>
            <IconButton type="button" aria-label="退出登录" onClick={onLogout}>
              <LogOut aria-hidden="true" />
            </IconButton>
          </Stack>
        </Paper>

        {message ? <Alert className="admin-message layui-anim layui-anim-upbit" severity={message.includes("失败") || message.includes("至少") ? "warning" : "success"}>{message}</Alert> : null}

        {section === "overview" ? (
          <AdminOverview data={data} loading={loading} />
        ) : null}

        {section === "activity" ? (
          <AdminActivity
            rows={activityRows}
            page={activityPage}
            total={activityTotal}
            loading={working === "activity"}
            onRefresh={() => void refreshActivity(activityPage)}
            onPageChange={(page) => void refreshActivity(page)}
          />
        ) : null}

        {section === "knowledge" ? (
          <AdminHotKnowledge
            rows={hotKnowledgeRows}
            page={knowledgePage}
            total={knowledgeTotal}
            loading={working === "knowledge"}
            onRefresh={() => void refreshHotKnowledge(knowledgePage)}
            onPageChange={(page) => void refreshHotKnowledge(page)}
          />
        ) : null}

        {section === "accounts" ? (
          <AdminAccounts
            users={adminUsers}
            userQuery={userQuery}
            userRoleFilter={userRoleFilter}
            selectedUserIds={selectedUserIds}
            targetClassId={targetClassId}
            classes={adminClasses}
            passwordDrafts={passwordDrafts}
            profileDrafts={profileDrafts}
            working={working}
            onQueryChange={setUserQuery}
            onRoleFilterChange={setUserRoleFilter}
            onTargetClassChange={setTargetClassId}
            onApplyFilter={() => void refreshAdminOps()}
            onAddSelected={() => void addSelectedToClass()}
            onToggleSelected={toggleSelectedUser}
            onProfileDraftChange={setProfileDrafts}
            onPasswordDraftChange={setPasswordDrafts}
            onChangeRole={changeUserRole}
            onResetPassword={resetPassword}
            onSaveProfile={saveProfile}
            onChangeStatus={changeUserStatus}
          />
        ) : null}

        {section === "classes" ? (
          <AdminClasses
            users={adminUsers}
            classes={adminClasses}
            classDraft={classDraft}
            selectedClass={selectedClass}
            targetClassId={targetClassId}
            classStudents={classStudents}
            bulkText={bulkText}
            working={working}
            onClassDraftChange={setClassDraft}
            onTargetClassChange={setTargetClassId}
            onBulkTextChange={setBulkText}
            onSaveClass={() => void saveClass()}
            onCreateBulkUsers={() => void createBulkUsers()}
            onLoadRoster={(classId) => void loadClassRoster(classId)}
            onRemoveFromClass={(userId) => void removeFromClass(userId)}
          />
        ) : null}

        {section === "guardians" ? (
          <AdminGuardians
            users={adminUsers}
            draft={guardianDraft}
            working={working}
            onDraftChange={setGuardianDraft}
            onBind={() => void bindGuardian()}
          />
        ) : null}

        {section === "audit" ? (
          <AdminAudit logs={auditLogs} onRefresh={() => void refreshAuditLogs()} />
        ) : null}
      </Box>
    </Box>
  );
}

function AdminOverview({ data, loading }: { data: AdminDashboardData | null; loading: boolean }) {
  if (!data) {
    return <Paper className="admin-empty-state" elevation={0}>{loading ? "正在加载校级数据..." : "暂无管理数据。"}</Paper>;
  }

  return (
    <Stack spacing={2.5}>
      <div className="dashboard-grid">
        <Metric label="总用户" value={String(data.totals.totalUsers)} />
        <Metric label="7日活跃" value={String(data.totals.activeUsers)} />
        <Metric label="累计学习分钟" value={String(data.totals.totalMinutes)} />
        <Metric label="已交作业" value={String(data.totals.submittedAssignments)} />
      </div>
      <Paper component="section" className="admin-panel-card layui-card" elevation={0}>
        <h2>学习趋势</h2>
        {data.trends.length ? (
          <div className="heatmap-list">
            {data.trends.map((item) => (
              <div key={item.day}>
                <span>{item.day} · {item.minutes} 分钟 · 对 {item.correct} / 错 {item.wrong}</span>
                <strong style={{ width: `${Math.min(100, Math.max(8, item.minutes))}%` }}>{item.minutes}</strong>
              </div>
            ))}
          </div>
        ) : <div className="empty-tool">还没有真实学习记录。学生完成 AI 辅导、测验或作业后，这里会自动产生趋势。</div>}
      </Paper>
      <div className="dashboard-grid admin-grid">
        <AdminListCard title="用户结构" items={data.roleBreakdown.map((item) => ({ label: roleLabel(item.role), value: String(item.count) }))} empty="暂无用户数据。" />
        <AdminListCard title="热门知识点概览" items={data.hotKnowledge.slice(0, 4).map((item) => ({ label: item.point, value: String(item.count) }))} empty="暂无真实学习数据。" />
        <AdminListCard title="班级平均掌握度" items={data.classMastery.map((item) => ({ label: `${item.className} · ${item.subject}`, value: `${item.averageMastery ?? 0}%` }))} empty="暂无班级数据。" />
        <AdminListCard title="最近用户" items={data.recentUsers.map((item) => ({ label: `${item.name || item.email} · ${roleLabel(item.role)}`, value: shortDate(item.createdAt) }))} empty="暂无用户。" />
      </div>
    </Stack>
  );
}

function AdminActivity({
  rows,
  page,
  total,
  loading,
  onRefresh,
  onPageChange
}: {
  rows: AdminActivityRow[];
  page: number;
  total: number;
  loading: boolean;
  onRefresh: () => void;
  onPageChange: (page: number) => void;
}) {
  const totalPages = Math.max(1, Math.ceil(total / 20));
  return (
    <Paper component="section" className="admin-panel-card layui-card" elevation={0}>
      <AdminSectionHeader
        title="学习动态"
        description="展示最近 1000 条真实学习行为，每页 20 条。"
        action={<Button size="small" type="button" variant="outlined" onClick={onRefresh}>{loading ? "刷新中" : "刷新"}</Button>}
      />
      <div className="admin-activity-list admin-readable-list">
        {rows.map((item) => {
          const meta = learningEventMeta(item.eventType);
          return (
            <div key={item.id}>
              <span>{shortDate(item.createdAt)} · {item.userName || item.userEmail} · {roleLabel(item.userRole)}</span>
              <strong>{meta.title}</strong>
              <p>{meta.description(item.knowledgePoint)} · 学习 {item.minutes} 分钟 · 正确 {item.correct} / 错误 {item.wrong}</p>
            </div>
          );
        })}
        {rows.length === 0 ? <div className="empty-tool">暂无学习动态。学生开始使用 AI 辅导、测验、错题复习后会自动出现。</div> : null}
      </div>
      <AdminPager page={page} totalPages={totalPages} total={total} onPageChange={onPageChange} />
    </Paper>
  );
}

function AdminHotKnowledge({
  rows,
  page,
  total,
  loading,
  onRefresh,
  onPageChange
}: {
  rows: AdminHotKnowledgeRow[];
  page: number;
  total: number;
  loading: boolean;
  onRefresh: () => void;
  onPageChange: (page: number) => void;
}) {
  const totalPages = Math.max(1, Math.ceil(total / 20));
  return (
    <Paper component="section" className="admin-panel-card layui-card" elevation={0}>
      <AdminSectionHeader
        title="热门知识点"
        description="基于最近 1000 条学习记录聚合，帮助校领导快速看到学生最常接触和最容易出错的内容。"
        action={<Button size="small" type="button" variant="outlined" onClick={onRefresh}>{loading ? "刷新中" : "刷新"}</Button>}
      />
      <div className="admin-knowledge-table">
        {rows.map((item, index) => (
          <div key={item.point}>
            <span className="admin-rank">{(page - 1) * 20 + index + 1}</span>
            <strong>{item.point || "未归类知识点"}</strong>
            <span>出现 {item.count} 次</span>
            <span>学习 {item.minutes} 分钟</span>
            <span>正确 {item.correct} / 错误 {item.wrong}</span>
            <span>{shortDate(item.lastSeenAt)}</span>
          </div>
        ))}
        {rows.length === 0 ? <div className="empty-tool">暂无热门知识点。系统不会使用模拟数据，学生产生真实学习记录后这里才会统计。</div> : null}
      </div>
      <AdminPager page={page} totalPages={totalPages} total={total} onPageChange={onPageChange} />
    </Paper>
  );
}

function AdminAccounts({
  users,
  userQuery,
  userRoleFilter,
  selectedUserIds,
  targetClassId,
  classes,
  passwordDrafts,
  profileDrafts,
  working,
  onQueryChange,
  onRoleFilterChange,
  onTargetClassChange,
  onApplyFilter,
  onAddSelected,
  onToggleSelected,
  onProfileDraftChange,
  onPasswordDraftChange,
  onChangeRole,
  onResetPassword,
  onSaveProfile,
  onChangeStatus
}: {
  users: AdminUserRow[];
  userQuery: string;
  userRoleFilter: string;
  selectedUserIds: string[];
  targetClassId: string;
  classes: AdminClassRow[];
  passwordDrafts: Record<string, string>;
  profileDrafts: Record<string, { email: string; name: string; grade: string }>;
  working: string;
  onQueryChange: (value: string) => void;
  onRoleFilterChange: (value: string) => void;
  onTargetClassChange: (value: string) => void;
  onApplyFilter: () => void;
  onAddSelected: () => void;
  onToggleSelected: (id: string, checked: boolean) => void;
  onProfileDraftChange: Dispatch<SetStateAction<Record<string, { email: string; name: string; grade: string }>>>;
  onPasswordDraftChange: Dispatch<SetStateAction<Record<string, string>>>;
  onChangeRole: (id: string, role: UserProfile["role"]) => Promise<void>;
  onResetPassword: (id: string) => Promise<void>;
  onSaveProfile: (id: string) => Promise<void>;
  onChangeStatus: (id: string, status: "active" | "suspended") => Promise<void>;
}) {
  return (
    <Paper component="section" className="admin-panel-card layui-card" elevation={0}>
      <Stack direction={{ xs: "column", md: "row" }} spacing={2} sx={{ alignItems: { xs: "stretch", md: "center" }, justifyContent: "space-between" }}>
        <Box>
          <h2>账号与权限</h2>
          <p>搜索账号、授予管理员权限、重置密码、停用账号，并批量拉入班级。</p>
        </Box>
        <Button type="button" variant="outlined" onClick={onApplyFilter}>
          {working === "refresh" ? "加载中..." : "刷新用户"}
        </Button>
      </Stack>
      <div className="form-grid admin-control-grid">
        <TextField label="搜索用户" size="small" value={userQuery} onChange={(event) => onQueryChange(event.target.value)} />
        <TextField select label="角色" size="small" value={userRoleFilter} onChange={(event) => onRoleFilterChange(event.target.value)}>
          <MenuItem value="">全部角色</MenuItem>
          <MenuItem value="student">学生</MenuItem>
          <MenuItem value="teacher">老师</MenuItem>
          <MenuItem value="parent">家长</MenuItem>
          <MenuItem value="admin">管理员</MenuItem>
        </TextField>
        <TextField select label="目标班级" size="small" value={targetClassId} onChange={(event) => onTargetClassChange(event.target.value)}>
          <MenuItem value="">不选择班级</MenuItem>
          {classes.map((item) => (
            <MenuItem key={item.id} value={item.id}>{item.name} · {item.subject} · {item.teacherName || item.teacherEmail}</MenuItem>
          ))}
        </TextField>
        <Button className="layui-btn-primary-action" type="button" variant="contained" disabled={!targetClassId || !selectedUserIds.length || working === "class-add"} onClick={onAddSelected}>
          加入所选用户
        </Button>
        <Button type="button" variant="outlined" onClick={onApplyFilter}>应用筛选</Button>
      </div>
      <div className="admin-user-table">
        {users.map((item) => (
          <div className="admin-user-row" key={item.id}>
            <label className="admin-select-user">
              <input
                type="checkbox"
                checked={selectedUserIds.includes(item.id)}
                onChange={(event) => onToggleSelected(item.id, event.target.checked)}
              />
              <span>
                <strong>{item.name || item.email}</strong>
                <small>{item.email} · {item.grade || "未填写"} · {item.classes || "未入班"} · {item.status === "suspended" ? "已停用" : "正常"}</small>
              </span>
            </label>
            <div className="admin-profile-fields">
              <TextField label="账号" size="small" value={profileDrafts[item.id]?.email ?? item.email} onChange={(event) => onProfileDraftChange((state) => ({ ...state, [item.id]: { ...(state[item.id] ?? { email: item.email, name: item.name, grade: item.grade }), email: event.target.value } }))} />
              <TextField label="姓名" size="small" value={profileDrafts[item.id]?.name ?? item.name} onChange={(event) => onProfileDraftChange((state) => ({ ...state, [item.id]: { ...(state[item.id] ?? { email: item.email, name: item.name, grade: item.grade }), name: event.target.value } }))} />
              <TextField label="年级/备注" size="small" value={profileDrafts[item.id]?.grade ?? item.grade} onChange={(event) => onProfileDraftChange((state) => ({ ...state, [item.id]: { ...(state[item.id] ?? { email: item.email, name: item.name, grade: item.grade }), grade: event.target.value } }))} />
            </div>
            <TextField select label="角色" size="small" value={item.role} onChange={(event) => void onChangeRole(item.id, event.target.value as UserProfile["role"])}>
              <MenuItem value="student">学生</MenuItem>
              <MenuItem value="teacher">老师</MenuItem>
              <MenuItem value="parent">家长</MenuItem>
              <MenuItem value="admin">管理员</MenuItem>
            </TextField>
            <TextField
              label="新密码"
              size="small"
              type="password"
              value={passwordDrafts[item.id] ?? ""}
              onChange={(event) => onPasswordDraftChange((state) => ({ ...state, [item.id]: event.target.value }))}
            />
            <Button type="button" variant="outlined" disabled={working === `password-${item.id}`} onClick={() => void onResetPassword(item.id)}>
              重置密码
            </Button>
            <Button type="button" variant="outlined" disabled={working === `profile-${item.id}`} onClick={() => void onSaveProfile(item.id)}>
              保存资料
            </Button>
            <Button type="button" variant={item.status === "suspended" ? "contained" : "outlined"} disabled={working === `status-${item.id}`} onClick={() => void onChangeStatus(item.id, item.status === "suspended" ? "active" : "suspended")}>
              {item.status === "suspended" ? "启用" : "停用"}
            </Button>
          </div>
        ))}
        {users.length === 0 ? <div className="empty-tool">没有匹配的用户。</div> : null}
      </div>
    </Paper>
  );
}

function AdminClasses({
  users,
  classes,
  classDraft,
  selectedClass,
  targetClassId,
  classStudents,
  bulkText,
  working,
  onClassDraftChange,
  onTargetClassChange,
  onBulkTextChange,
  onSaveClass,
  onCreateBulkUsers,
  onLoadRoster,
  onRemoveFromClass
}: {
  users: AdminUserRow[];
  classes: AdminClassRow[];
  classDraft: { id: string; name: string; subject: string; teacherId: string };
  selectedClass?: AdminClassRow;
  targetClassId: string;
  classStudents: AdminClassStudent[];
  bulkText: string;
  working: string;
  onClassDraftChange: Dispatch<SetStateAction<{ id: string; name: string; subject: string; teacherId: string }>>;
  onTargetClassChange: (value: string) => void;
  onBulkTextChange: (value: string) => void;
  onSaveClass: () => void;
  onCreateBulkUsers: () => void;
  onLoadRoster: (classId?: string) => void;
  onRemoveFromClass: (userId: string) => void;
}) {
  return (
    <Stack spacing={2.5}>
      <Paper component="section" className="admin-panel-card layui-card" elevation={0}>
        <h2>班级治理</h2>
        <div className="admin-management-grid">
          <Paper component="section" className="admin-subcard layui-card" elevation={0}>
            <h4>{classDraft.id ? "编辑班级" : "校级创建班级"}</h4>
            <TextField label="班级名称" size="small" value={classDraft.name} onChange={(event) => onClassDraftChange((state) => ({ ...state, name: event.target.value }))} />
            <TextField label="科目" size="small" value={classDraft.subject} onChange={(event) => onClassDraftChange((state) => ({ ...state, subject: event.target.value }))} />
            <TextField select label="班主任/负责老师" size="small" value={classDraft.teacherId} onChange={(event) => onClassDraftChange((state) => ({ ...state, teacherId: event.target.value }))}>
              <MenuItem value="">请选择</MenuItem>
              {users.filter((item) => item.role === "teacher" || item.role === "admin").map((item) => (
                <MenuItem key={item.id} value={item.id}>{item.name || item.email} · {roleLabel(item.role)}</MenuItem>
              ))}
            </TextField>
            <div className="button-row">
              <Button className="layui-btn-primary-action" type="button" variant="contained" disabled={working === "class-save"} onClick={onSaveClass}>
                {classDraft.id ? "保存班级" : "创建班级"}
              </Button>
              {classDraft.id ? <Button type="button" variant="outlined" onClick={() => onClassDraftChange({ id: "", name: "", subject: "数学", teacherId: classDraft.teacherId })}>取消编辑</Button> : null}
            </div>
          </Paper>
          <Paper component="section" className="admin-subcard layui-card" elevation={0}>
            <h4>批量创建账号并入班</h4>
            <TextField select label="目标班级" size="small" value={targetClassId} onChange={(event) => onTargetClassChange(event.target.value)}>
              <MenuItem value="">不选择班级</MenuItem>
              {classes.map((item) => (
                <MenuItem key={item.id} value={item.id}>{item.name} · {item.subject}</MenuItem>
              ))}
            </TextField>
            <TextField
              label="批量账号"
              placeholder="每行：账号,密码,姓名,年级,角色&#10;例如：stu001,cocode1234,小草,初三,student"
              value={bulkText}
              onChange={(event) => onBulkTextChange(event.target.value)}
              multiline
              minRows={5}
            />
            <Button className="layui-btn-primary-action" type="button" variant="contained" disabled={working === "bulk"} onClick={onCreateBulkUsers}>
              {working === "bulk" ? "创建中..." : "批量创建"}
            </Button>
          </Paper>
        </div>
      </Paper>
      <Paper component="section" className="admin-panel-card layui-card" elevation={0}>
        <Stack direction={{ xs: "column", md: "row" }} spacing={2} sx={{ alignItems: { xs: "stretch", md: "center" }, justifyContent: "space-between" }}>
          <Box>
            <h2>全校班级</h2>
            <p>{selectedClass ? `当前查看：${selectedClass.name} · ${selectedClass.subject}` : "选择班级后可查看花名册并移出成员。"}</p>
          </Box>
          <TextField select label="查看班级" size="small" value={targetClassId} onChange={(event) => { onTargetClassChange(event.target.value); onLoadRoster(event.target.value); }}>
            <MenuItem value="">请选择</MenuItem>
            {classes.map((item) => (
              <MenuItem key={item.id} value={item.id}>{item.name} · {item.subject} · {item.studentCount} 人</MenuItem>
            ))}
          </TextField>
        </Stack>
        <div className="admin-list admin-class-list">
          {classes.map((item) => (
            <div key={item.id}>
              <span>{item.name} · {item.subject} · {item.studentCount} 人</span>
              <strong>{item.teacherName || item.teacherEmail}</strong>
              <div className="button-row compact-row">
                <Button size="small" type="button" variant="outlined" onClick={() => onClassDraftChange({ id: item.id, name: item.name, subject: item.subject, teacherId: item.teacherId })}>编辑</Button>
                <Button size="small" type="button" variant="outlined" onClick={() => onLoadRoster(item.id)}>花名册</Button>
              </div>
            </div>
          ))}
          {classes.length === 0 ? <p>暂无班级。</p> : null}
        </div>
        {classStudents.length ? (
          <Paper component="section" className="admin-subcard admin-roster layui-card" elevation={0}>
            <h4>当前班级花名册</h4>
            <div className="admin-list">
              {classStudents.map((student) => (
                <div key={student.id}>
                  <span>{student.name || student.email} · {student.email} · {student.grade || "未填写"}</span>
                  <strong>{roleLabel(student.role)}</strong>
                  <Button size="small" type="button" variant="outlined" disabled={working === `remove-${student.id}`} onClick={() => onRemoveFromClass(student.id)}>
                    移出班级
                  </Button>
                </div>
              ))}
            </div>
          </Paper>
        ) : null}
      </Paper>
    </Stack>
  );
}

function AdminGuardians({
  users,
  draft,
  working,
  onDraftChange,
  onBind
}: {
  users: AdminUserRow[];
  draft: { studentId: string; guardianEmail: string };
  working: string;
  onDraftChange: Dispatch<SetStateAction<{ studentId: string; guardianEmail: string }>>;
  onBind: () => void;
}) {
  return (
    <Paper component="section" className="admin-panel-card admin-narrow-panel layui-card" elevation={0}>
      <h2>家校绑定</h2>
      <p>管理员可为学生绑定家长邮箱，家长使用同邮箱账号登录后查看学习报告。</p>
      <TextField select label="学生" size="small" value={draft.studentId} onChange={(event) => onDraftChange((state) => ({ ...state, studentId: event.target.value }))}>
        <MenuItem value="">请选择学生</MenuItem>
        {users.filter((item) => item.role === "student").map((item) => (
          <MenuItem key={item.id} value={item.id}>{item.name || item.email} · {item.grade || "未填写"}</MenuItem>
        ))}
      </TextField>
      <TextField label="家长邮箱" size="small" value={draft.guardianEmail} onChange={(event) => onDraftChange((state) => ({ ...state, guardianEmail: event.target.value }))} />
      <Button className="layui-btn-primary-action" type="button" variant="contained" disabled={working === "guardian"} onClick={onBind}>绑定家长</Button>
    </Paper>
  );
}

function AdminAudit({ logs, onRefresh }: { logs: AdminAuditLog[]; onRefresh: () => void }) {
  return (
    <Paper component="section" className="admin-panel-card layui-card" elevation={0}>
      <AdminSectionHeader
        title="管理员审计日志"
        description="记录角色、密码、班级、家校绑定等敏感操作。"
        action={<Button size="small" type="button" variant="outlined" onClick={onRefresh}>刷新日志</Button>}
      />
      <div className="admin-activity-list">
        {logs.map((log) => {
          const action = adminActionMeta(log.action);
          return (
            <div key={log.id}>
              <span>{shortDate(log.createdAt)} · 操作人：{log.adminName || log.adminEmail}</span>
              <strong>{action} · {adminTargetLabel(log.targetType)}：{friendlyTargetId(log.targetId)}</strong>
              <p>{friendlyDetail(log.detail)}</p>
            </div>
          );
        })}
        {logs.length === 0 ? <div className="empty-tool">暂无管理员操作日志。</div> : null}
      </div>
    </Paper>
  );
}

function AdminSectionHeader({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return (
    <Stack className="admin-section-heading" direction="row" spacing={2} sx={{ alignItems: "center", justifyContent: "space-between" }}>
      <Box>
        <h2>{title}</h2>
        <p>{description}</p>
      </Box>
      {action}
    </Stack>
  );
}

function AdminPager({
  page,
  totalPages,
  total,
  onPageChange
}: {
  page: number;
  totalPages: number;
  total: number;
  onPageChange: (page: number) => void;
}) {
  return (
    <Stack className="admin-pager" direction="row" spacing={1.5} sx={{ alignItems: "center", justifyContent: "flex-end" }}>
      <span>共 {total} 条 · 第 {page} / {totalPages} 页</span>
      <Button size="small" type="button" variant="outlined" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>上一页</Button>
      <Button size="small" type="button" variant="outlined" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}>下一页</Button>
    </Stack>
  );
}

function AdminListCard({ title, items, empty }: { title: string; items: Array<{ label: string; value: string }>; empty: string }) {
  return (
    <Paper component="section" className="feature-card layui-card" elevation={0}>
      <h3>{title}</h3>
      <div className="admin-list">
        {items.length ? items.map((item) => (
          <div key={`${item.label}-${item.value}`}>
            <span>{item.label}</span>
            <strong>{item.value}</strong>
          </div>
        )) : <p>{empty}</p>}
      </div>
    </Paper>
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

function roleLabel(role: string) {
  if (role === "admin") return "管理员";
  if (role === "teacher") return "老师";
  if (role === "parent") return "家长";
  return "学生";
}

function learningEventMeta(eventType: string) {
  const labels: Record<string, { title: string; verb: string }> = {
    chat: { title: "AI 辅导对话", verb: "围绕知识点学习" },
    manual_wrong: { title: "手动加入错题", verb: "整理错题知识点" },
    master_wrong: { title: "掌握错题", verb: "完成错题掌握" },
    wrong_review: { title: "错题复习", verb: "复习错题知识点" },
    knowledge_card: { title: "生成知识卡片", verb: "沉淀知识卡片" },
    study_plan: { title: "生成学习计划", verb: "制定学习计划" },
    quiz_generate: { title: "生成 AI 测验", verb: "创建测验主题" },
    grading_wrong: { title: "批改后记录错题", verb: "从批改结果沉淀错题" }
  };
  const fallback = labels[eventType] ?? { title: humanizeToken(eventType), verb: "记录学习行为" };
  return {
    title: fallback.title,
    description: (point: string) => `${fallback.verb}：${point || "未归类知识点"}`
  };
}

function adminActionMeta(action: string) {
  const labels: Record<string, string> = {
    "user.role.update": "调整用户角色",
    "user.password.reset": "重置用户密码",
    "user.profile.update": "修改用户资料",
    "user.status.update": "调整账号状态",
    "class.students.force_add": "强制加入班级",
    "users.bulk_create": "批量创建账号",
    "class.create": "创建班级",
    "class.update": "修改班级",
    "class.student.remove": "移出班级成员",
    "guardian.link.create": "创建家长绑定"
  };
  return labels[action] ?? humanizeToken(action);
}

function adminTargetLabel(targetType: string) {
  const labels: Record<string, string> = {
    user: "用户",
    users: "用户",
    class: "班级",
    student: "学生",
    guardian: "家长绑定"
  };
  return labels[targetType] ?? humanizeToken(targetType);
}

function friendlyTargetId(value: string) {
  if (!value) return "未记录";
  return value.replace(/^user_/, "用户 ").replace(/^class_/, "班级 ").replace(/^student_/, "学生 ");
}

function friendlyDetail(value: string) {
  if (!value) return "无补充详情";
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    const labels: Record<string, string> = {
      guardianEmail: "家长邮箱",
      role: "角色",
      nextRole: "新角色",
      status: "账号状态",
      email: "邮箱",
      name: "姓名",
      grade: "年级/身份",
      classId: "班级",
      createdCount: "创建数量",
      skippedCount: "跳过数量",
      added: "新加入",
      matched: "匹配账号"
    };
    return Object.entries(parsed)
      .map(([key, item]) => `${labels[key] ?? humanizeToken(key)}：${String(item)}`)
      .join("；") || "无补充详情";
  } catch {
    return value;
  }
}

function humanizeToken(value: string) {
  return value
    .replace(/[._-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function shortDate(value: string) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.slice(0, 10);
  return date.toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}
