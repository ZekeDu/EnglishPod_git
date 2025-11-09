# English Pod 365 — 应用说明与运维手册（最新）

本仓库是围绕 English Pod 365 的学习应用原型（Monorepo）。包含：
- Web 前端：Next.js（`apps/web-next`）
- API 后端：NestJS（`apps/api-nest`）
- 本地数据：`data/`（课程、字幕、词汇、练习、用户/会话、TTS 缓存）
- 工具脚本与运维：`packages/scripts`、`tools/`

## 应用功能概览

English Pod 365 面向英语学习场景，提供以下核心能力：
- 课程浏览与试听：按难度、标签筛选课程，在线播放主音频与播客。
- 字幕联动：逐句字幕随时间轴滚动，支持多语种切换与时间戳质检提示。
- 词汇卡片：展示词义、词性、例句，可一键加入个人复习列表。
- 互动练习：完形填空与作文任务在线作答，后台支持评分与点评。
- 复习调度：内置 SM-2 算法跟踪掌握度并生成复习计划。
- 内容运营：后台导入/编辑课程、回滚历史、发布上线。

## 用户地图（普通用户）

1. 注册或登录账号，进入首页。
2. 在课程列表中按主题或难度选择喜欢的课程。
3. 播放主音频或播客，配合字幕阅读对话。
4. 查看词汇卡片，勾选「加入复习」，在复习页查看待练项目。
5. 完成完形和作文练习，提交后等待教师点评或自我复盘。
6. 在个人主页追踪学习时长、已完成课程与复习进度。

### 账号与安全提示

- 登录地址：访问根域名后点击右上角「登录」，或直接打开 `/login`；支持 `redirect` 参数回跳。
- 密码要求：注册时至少 8 位，并同时包含大小写字母与数字；连续错误将触发图形验证码。
- 频率限制：登录与注册接口对同一 IP / 账号设有速率限制，触发后会返回“操作过于频繁”提示，请稍后再试。
- 会话安全：登录成功后会写入 HttpOnly Cookie，支持在「账户」页面手动退出并清理所有会话。
- 后台权限：所有 `/admin/*` 接口已通过统一 Guard 校验，仅管理员角色可访问。
- 免费体验范围：未注册访客仅能试听 Lesson 001–010，且无法访问「复习」与「我」页面；进阶课程与进度同步需登录后解锁。
- 练习提交：完形填空与作文在未登录状态下仅可预览，一旦点击“提交”会跳转至注册/登录页；登录后才会保存成绩、生成 AI 反馈。

本文档聚焦于本地开发、手工导入、环境配置、对象存储直传、离线能力、以及数据库迁移落地步骤。

---

## 快速开始

- 前置要求：
  - Node.js 18+（建议 20），npm 9+（或 pnpm/yarn）
  - Docker（用于本地 MinIO；可选但推荐）
  - macOS/Linux/WSL2 任意一项

- 安装依赖（仓库根目录）：
  ```
  npm install
  ```

- 启动后端（Nest，默认 4000 起，自动占用空闲端口）：
  ```
  npm run dev:api
  ```

- 启动前端（Next.js，默认 3000）：
  ```
  npm run dev:web
  ```

- 访问地址：
  - Web：`http://localhost:3000`
  - API：`http://localhost:4000/lessons`

提示：环境变量示例见 `.env.example`，可复制为 `.env` 并按需修改。

### 运维常用脚本

仓库根目录的 `scripts/ops/` 提供以下脚本，方便部署与日常运维：

| 脚本 | 功能 |
| --- | --- |
| `deploy-production.sh` | 安装依赖、生成 Prisma Client、应用迁移并构建前后端 |
| `start-production.sh` | 在已有构建产物的前提下启动 API（默认 `PORT=4000`）与 Web（默认 `WEB_PORT=3000`） |
| `backup-db.sh` | 使用 `pg_dump` 导出 Postgres，并可选打包 `DATA_DIR/tts-cache` |

> 首次使用前记得赋予执行权限：`chmod +x scripts/ops/*.sh`

使用示例：

```bash
export DATABASE_URL="postgresql://ep12345:devpass12345@127.0.0.1:5432/englishpod"
export NEXT_PUBLIC_API_BASE="https://api.englishpod365.com"

scripts/ops/deploy-production.sh
scripts/ops/start-production.sh
```

---

## CMS（内容管理）

- 入口：`/admin`（首个注册用户自动授予 `admin`）
- 能力：课程检索、Meta/字幕/词汇/练习编辑、预览、版本与回滚、发布/下线、批量导入
- 时间戳质检（保存时提示 + 发布拦截）：检测无效时间、重叠、空文本等问题
- 课程发布：勾选「已发布」即更新数据库中的 `lesson.published`，前端列表同步展示；导出备份时脚本会生成对应的 `meta.json`/`index.json` 快照。
- 词汇复习：课程页可添加/移除词汇进入复习列表，复习页按 SM-2 调度并展示「生词总数 / 已掌握 / 复习中」统计
- 当前存储：课程与用户数据写入 Postgres，`DATA_DIR` 主要用于音频缓存、配置与备份。

### TTS 语音服务配置

- 路径：`/admin/settings/models` → “TTS 配置”
- 支持供应商：
  - **阿里云**：填写 `AccessKeyId`、`AccessKeySecret`、`AppKey`、`Region`（如 `cn-shanghai`）、默认 `Voice` 与 `Sample Rate`（Hz）。
  - **Azure**：填写 `Key`、`Region`（如 `eastasia`）、`Voice`（如 `en-US-JennyNeural`），可选输出格式。
  - **本地服务**：配置 `Base`（例如 `http://localhost:5000`，需提供 `POST /tts` 接口）与默认 `Voice`。
- 设置后：
  - 课程页词汇朗读按钮通过 `/tts` 接口播放真实语音；命中缓存则直接读取 `data/tts-cache/<hash>.wav`。
  - 管理端“预生成 TTS（词汇）”会批量请求并缓存词汇朗读音频；若失败则回退静音并记录 `data/tts-cache/tts-errors.log`。
  - `/tts` 响应会返回 `{ provider, cached, fallback, error }`，方便排查是否降级。

---
