# 智学AI宝塔部署文档

## 1. 安装软件

在宝塔面板安装：

- Nginx
- Node.js 20 或更高
- PM2 管理器

## 2. 上传项目

上传到服务器目录，例如：

```text
/www/wwwroot/zhixue-ai
```

进入目录：

```bash
cd /www/wwwroot/zhixue-ai
```

## 3. 安装依赖

```bash
npm install
```

## 4. 配置环境变量

复制配置文件：

```bash
cp .env.example .env
```

编辑 `.env`：

```env
AI_API_BASE=https://你的AI网关地址/v1
AI_API_KEY=你的真实API_KEY
AI_MODEL=你的文本模型名
AI_VISION_MODEL=
AI_REQUEST_TIMEOUT_MS=120000
OCR_LANG=chi_sim+eng
OCR_LANG_PATH=
OCR_CACHE_PATH=
OCR_CACHE_METHOD=write
JWT_SECRET=请改成一串很长的随机字符串
APP_ORIGINS=https://你的学校域名
PORT=8787
```

不要把 `.env` 放到公开下载目录，也不要发给别人。

拍照识题有两种部署方式：

- 配置 `AI_VISION_MODEL` 后，服务端会调用视觉模型识别题目图片。
- 不配置 `AI_VISION_MODEL` 时，服务端自动使用 Tesseract.js 本地 OCR。`OCR_LANG=chi_sim+eng` 会同时识别简体中文和英文；离线部署时请把 `chi_sim.traineddata(.gz)` 和 `eng.traineddata(.gz)` 放到服务器本地目录，并把 `OCR_LANG_PATH` 指向该目录。默认缓存目录是 `data/ocr-cache`，不要放到公开下载目录。

## 5. 构建前端

```bash
npm run build
```

成功后会生成：

```text
dist/
```

## 6. 创建网站

宝塔面板进入：

```text
网站 -> 添加站点
```

网站根目录填写：

```text
/www/wwwroot/zhixue-ai/dist
```

## 7. 启动后端

在项目目录执行：

```bash
pm2 start "npx tsx server/index.ts" --name zhixue-ai-api
pm2 save
```

后端默认运行在：

```text
http://127.0.0.1:8787
```

## 8. 配置 Nginx 反向代理

宝塔进入：

```text
网站 -> 当前站点 -> 配置文件
```

在 `server { ... }` 内加入：

```nginx
location /api/ {
    proxy_pass http://127.0.0.1:8787/api/;
    proxy_http_version 1.1;
    proxy_buffering off;
    proxy_cache off;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
}
```

保存后重载 Nginx。

## 9. 开启 HTTPS

宝塔进入：

```text
网站 -> SSL
```

申请证书并开启强制 HTTPS。

## 10. 上线检查

访问你的域名，确认：

- 注册和登录正常
- AI 辅导可以流式输出
- 测验、作业、批改报告可以真实调用 AI
- 老师端可以创建班级、作业和公告
- 学生端可以查看作业并提交
- 数据刷新后仍然保留

## 11. 常用命令

查看后端状态：

```bash
pm2 status
```

查看后端日志：

```bash
pm2 logs zhixue-ai-api
```

重启后端：

```bash
pm2 restart zhixue-ai-api
```

重新部署前端：

```bash
cd /www/wwwroot/zhixue-ai
npm run build
```

## 12. 数据备份

默认数据库在：

```text
/www/wwwroot/zhixue-ai/data/zhixue.sqlite
```

建议定期备份：

```text
/www/wwwroot/zhixue-ai/data/
```
