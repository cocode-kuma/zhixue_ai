# 智学AI

智学AI 是一个 AI 学习伙伴项目。核心目标不是直接给答案，而是通过提问、提示、练习、批改、复习和学习记录，帮助学生真正学会。

## 功能

- AI 引导式讲题与概念学习，支持流式输出
- Markdown 与 LaTeX 数学公式渲染
- 多会话历史、AI 自动标题、历史删除
- 错题本、错题复习、错题导出 PDF
- AI 测验生成、提交批改、批改报告
- 老师端班级、学生、作业、公告、班级报告
- 学生端作业查看、提交与批改报告
- 错题变式题重做与再次批改
- 学习目标、学习计划、成就系统
- OCR 拍照识题
- 可编辑知识地图与掌握度记录
- 家长端学习报告
- 运营数据看板
- 用户头像、昵称、年级设置
- 深色模式与移动端适配
- SQLite 本地持久化
- JWT 登录鉴权

## 技术栈

- React
- TypeScript
- Vite
- Zustand
- Material UI
- Express
- SQLite
- OpenAI-compatible Chat Completions
- Tesseract.js 本地 OCR

## 本地运行

安装依赖：

```bash
npm install
```

复制环境变量：

```bash
cp .env.example .env
```

在 `.env` 中配置服务端密钥。不要把 `.env` 提交或打包给别人。

启动开发服务：

```bash
npm run dev
```

默认地址：

- Web: http://127.0.0.1:5173
- API: http://127.0.0.1:8787

构建前端：

```bash
npm run build
```

## AI 配置

服务端读取：

- `AI_API_BASE`
- `AI_API_KEY`
- `AI_MODEL`
- `AI_VISION_MODEL`，可选；不配置时拍照识题使用本地 OCR
- `AI_REQUEST_TIMEOUT_MS`
- `OCR_LANG`，默认 `chi_sim+eng`，同时识别简体中文和英文
- `OCR_LANG_PATH`，可选；私有化离线部署时填写本地 traineddata 目录或内网地址
- `OCR_CACHE_PATH`，可选；Tesseract 语言包缓存目录，默认 `data/ocr-cache`
- `OCR_CACHE_METHOD`，可选；`write`、`readOnly`、`refresh` 或 `none`
- `JWT_SECRET`
- `APP_ORIGINS`

AI Key 和 JWT 密钥只允许放在服务端环境变量中，前端代码、README、日志、压缩包都不能包含真实密钥。

`APP_ORIGINS` 使用英文逗号分隔允许访问 API 的前端域名；私有化部署时应改成学校实际域名。

## OCR 配置

拍照识题优先使用 `AI_VISION_MODEL` 调用视觉模型；未配置视觉模型时，会自动使用 Tesseract.js 本地 OCR。

`OCR_LANG=chi_sim+eng` 表示同时加载简体中文和英文语言包，也可以写成 `chi_sim,eng`。私有化或离线部署时，把 `chi_sim.traineddata(.gz)` 和 `eng.traineddata(.gz)` 放到服务器本地目录，并配置 `OCR_LANG_PATH` 指向该目录。默认语言包缓存放在 `data/ocr-cache`，不会进入仓库或源码包。

## 安全与授权

- 服务端启用安全响应头、CORS 白名单、登录限流、通用 API 限流和 AI 接口限流。
- 公开注册不能直接授予管理员身份。
- `.env`、数据库、依赖目录、构建产物和日志不应提交或打包。

## 许可证

本项目为专有商业源码，详见 [LICENSE](./LICENSE)。未经授权不得复制、分发、转售、再授权或公开部署。

## 数据

默认数据库：

```text
data/zhixue.sqlite
```

该目录用于本地持久化，不应提交到仓库或公开下载目录。

## 部署

宝塔部署见：

[DEPLOYMENT.md](./DEPLOYMENT.md)
