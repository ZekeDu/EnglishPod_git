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

本文档聚焦于本地开发、手工导入、环境配置、对象存储直传、AI 服务配置以及数据库迁移落地步骤。

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

- 生成 Prisma Client（首次运行建议执行；`npm run dev:api` 会自动执行一次）：
  ```
  npm run prisma:generate
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
注意：`NEXT_PUBLIC_API_BASE` 是前端 **构建期** 变量（生产改动后需要重新构建前端）。

### 本地启动排障（常见报错）

- `Environment variable not found: DATABASE_URL`：确认仓库根目录 `.env` 里有 `DATABASE_URL=...`，且本地 Postgres 可连通。
- `@prisma/client did not initialize yet`：先跑 `npm run prisma:generate`（`npm run dev:api` 会自动执行）；如依旧失败，删除 `node_modules/@prisma` 后重装依赖再试。
- 访问写接口返回 `403 csrf_*`：
  - 浏览器：确认当前访问域名在允许列表（`CORS_ORIGINS` 或默认 `http://localhost:3000`）。
  - 脚本/curl：无 `Origin` 头但携带 Cookie 时，需要加 `X-CSRF-Token`（可通过 `GET /auth/csrf` 获取）。
- 管理端上传/导入返回 403：`/upload/*` 仅管理员可用，先用首个账号注册登录（默认成为 `admin`）。
- 登录后 Cookie 不生效：本地 HTTP 环境不要设置 `NODE_ENV=production`/`COOKIE_SECURE=true`（否则 Secure Cookie 不会被浏览器发送）。

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
export DATABASE_URL="postgresql://ep365:devpass@127.0.0.1:5432/englishpod"
export NEXT_PUBLIC_API_BASE="https://api.englishpod365.com"

scripts/ops/deploy-production.sh
scripts/ops/start-production.sh
```

---

## 环境配置（必读）

- `PORT`：API 端口（默认 4000，可顺延占用 4001/4002）
- `NEXT_PUBLIC_API_BASE`：前端请求后端地址，开发态默认 `http://localhost:4000`
- `DATA_DIR`：数据根目录；默认仓库下 `data/`，建议使用绝对路径以避免 IDE/脚本工作目录差异
- `DATABASE_URL`：Postgres 连接串（必填）
- `SESSION_SECRET`：会话/CSRF 密钥（生产必填；开发建议设置一个非空值）
- （可选）S3/MinIO：若需在生产保留历史录音或集中存储音频，可配置 `S3_*` 变量；默认使用本地文件即可。

保存 `.env` 后重新启动服务生效。

> **模型 API Key 存储**  
> 大模型评分 / TTS 的 `apiKey` 并不放在 `.env`。后台“模型服务管理”保存后，会写入数据库表 `app_setting` 的 `model-config` 项（默认同时写入 `DATA_DIR/config/models.json` 作为回退）。如需排查，可执行 `node apps/api-nest/scripts/show-model-keys.ts` 输出当前配置。

---

## 数据与目录结构

- 课程数据：持久化在 Postgres（`lesson`、`transcript`、`vocab`、`practice`、`lesson_podcast`、`lesson_history` 等表）；`data/lessons/{id}/` 仅作为导入/备份介质。
  - `meta.json`、`transcript.json`、`vocab.json`、`practice/*.json` 可由导入脚本或备份脚本生成。
  - 主持人播客的 meta 与 transcript 已写入 `lesson_podcast` 表，`podcast_meta.json`、`podcast_transcript.json` 仍会作为备份导出。
- 列表顺序由 `lesson.lesson_no` 和 `lesson.published` 控制；后台发布后实时生效。`data/lessons/index.json` 只在离线导出时生成。
- 用户与会话：账号、进度、SRS、练习记录等写入 Postgres；`data/users/` 可以作为历史导入备份保留。
- TTS 缓存：`data/tts-cache/`

---
（如需要对象存储，可在生产环境单独部署 MinIO/S3 服务，并在 `.env` 中配置 `S3_*` 相关参数。）

---

## 课程导入（数据准备）

### 生成课程 JSON

- HTML/PDF → JSON 脚本：`tools/pdf2jason_v2/ep365_json_builder_v8.py`
  - 单课模式：
    ```bash
    python tools/pdf2jason_v2/ep365_json_builder_v8.py \
      --lesson_pdf path/to/englishpod_001.html \
      --host_pdf path/to/host.pdf \
      --outdir tools/pdf2jason_v2/output/<lesson_id>
    ```
    支持直接解析课程 HTML（`englishpod_###.html`）或旧版课文 PDF，输出 `lesson_###.json`（含 meta/transcript/vocab/podcast/practice）。
  - 批量模式：将 `Lesson_###/englishpod_###.html` 与 `Lesson_###/### - Host.pdf` 放在同级目录，例如 `tools/pdf2jason_v2/EnglishPod_Lessons/`。然后运行：
    ```bash
    python tools/pdf2jason_v2/ep365_json_builder_v8.py \
      --batch_dir tools/pdf2jason_v2/EnglishPod_Lessons \
      --outdir tools/pdf2jason_v2/output_html
      --llm auto --api_key <DeepSeek 或 OpenAI Key>
    ```
    每个 Lesson 会输出 `lesson_<id>.json`，并自动写入 `lessons.json`（可直接打包 Zip 导入）。
  - 可选参数：`--no_practice`（跳过练习生成）、`--no_strip_footers`、`--provider`/`--model`。脚本默认会调用 DeepSeek/LLM 生成完形与作文提示；如无 Key，会回落到启发式模板。

### 写入本地数据目录

生成的 JSON 可通过以下任一方式导入到应用：

- 管理后台 Zip 导入（推荐非技术同学）
  - 路径：`/admin` → “批量导入”
  - 包含 `lessons.json` + 可选 `audio/` 目录，详见 `docs/import-format.md`
  - 支持参数：`dry_run=1`（仅校验）、`overwrite`、`publish=1`
  - 示例：管理端“下载示例 Zip”或 `GET /admin/import/sample.zip`

- 文件夹直投（面向开发者，最终会直接写入数据库）
  1. 在 `data/lessons/<lesson_id>/` 下准备 `meta.json`、`transcript.json`、`vocab.json`、`practice/*` 等文件。
  2. 运行校验脚本：
     ```bash
     node packages/scripts/import-lessons.js
     ```
     检查错误并在失败时返回非零退出码。
  3. 使用导入脚本或管理端批量导入，将校验后的 JSON 写入数据库。脚本会根据 `lesson_no` 和 `published` 自动维护排序。

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

## 账户与权限（开发态）

- 登录：`/login`（首个注册用户为 `admin`，其余为 `user`），用户名 + 密码。
- 会话：`user_sessions` 表存储 Cookie 会话；默认 7 天有效，`POST /auth/logout` 会失效并清理 Cookie。
- 验证码：连续 5 次失败（10 分钟窗口，按用户/IP）后需要在登录体内携带 `captchaToken` + `captcha`，可通过 `GET /auth/captcha` 获取 base64 SVG。
- 账户页：`/account`（查看角色、模拟订阅入口），订阅状态写入 `user_subscriptions`。
- 管理端守卫：所有 `/admin/*` 需管理员角色。
- 上传与预签名：`/upload/*` 仅管理员可用（用于管理端上传音频/导入等场景）。
- CSRF：浏览器请求会校验 `Origin` 是否在允许列表；脚本/运维工具（无 `Origin`）若携带 Cookie，需要加 `X-CSRF-Token`（可通过 `GET /auth/csrf` 获取）。
- 可选环境变量：`SESSION_COOKIE_NAME`（默认 `sid`）、`SESSION_SECRET`（生产必填）、`TRUST_PROXY`、`COOKIE_SECURE`、`CORS_ORIGINS`、`AUTH_LOGIN_MAX_FAILURES`、`AUTH_LOGIN_WINDOW_MS`、`AUTH_CAPTCHA_TTL_MS` 可调整策略。

生产建议：启用 HTTPS + Secure Cookie、配置 `CORS_ORIGINS`、设置 `SESSION_SECRET`、接入全局限流/WAF、提供邮箱/短信验证与密码重置、完善操作审计与备份。

---

## 数据库迁移（文件 → Postgres）

迁移目标与表结构详见 `docs/db-schema.md`，Prisma 定义位于 `apps/api-nest/prisma/schema.prisma`。当前 API 默认以 Postgres 为权威数据源（确保设置 `DATABASE_URL`）。首次切换流程建议：

1) 准备 Postgres 与扩展
   ```sql
   CREATE EXTENSION IF NOT EXISTS pgcrypto;
   CREATE EXTENSION IF NOT EXISTS pg_trgm; -- 可选
   ```
2) 应用 Prisma 迁移
   ```bash
   npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script > /tmp/initial.sql
   psql "$DATABASE_URL" -f /tmp/initial.sql
   ```
   或直接使用仓库里的 `apps/api-nest/prisma/migrations/*/migration.sql`。
3) 生成并导入课程/用户历史数据
   ```bash
   npm run export:sql > /tmp/lessons.sql
   psql "$DATABASE_URL" -f /tmp/lessons.sql
   ```
   导出脚本会同步写入 `lesson/transcript/vocab/practice/lesson_podcast/lesson_history` 等表；后续可补充用户/进度导出脚本，对应写入 `users/*`、`user_progress`、`user_reviews` 等表。
4) 更新环境变量并启动
  ```bash
  DATABASE_URL=postgres://ep365:devpass@127.0.0.1:5432/englishpod npm run dev:api
  ```
5) 保留 `data/` 目录作为热备；按需要执行双写或回滚（可通过 `tools/db/backup.sh` 定期导出数据库与音频资源）。

### 配置与音频存储

- **全局配置**：后台的模型服务（TTS、评分）配置已存入 `AppSetting` 表。首次访问会自动从 `data/config/models.json` 导入一份默认值。
- **课程音频**：课程音频映射保存在 `LessonAudio` 表，`/media/lesson/:id/{main|podcast}` 会优先读取数据库，再回退到文件。
- **迁移脚本**：如果历史项目中还保留 `data/media/lesson-audio.json`，可执行 `node tools/migrate-lesson-audio.js` 将旧映射写入数据库。

---

## SEO & Sitemap（构建期生成）

- 生成脚本：`apps/web-next/scripts/generate-sitemap.js`
- 触发：在 `apps/web-next` 构建前（`prebuild`）自动运行
- 数据来源：通过 `NEXT_PUBLIC_API_BASE` 调用 `/lessons` 接口，仅生成 `published=true` 的课程
- 站点根：`SITE_ORIGIN`（默认 `http://localhost:3000`），输出到 `apps/web-next/public/sitemap.xml`
- 手动运行示例：
  ```
  SITE_ORIGIN=https://your-domain.com node apps/web-next/scripts/generate-sitemap.js
  ```

---

## 其他资料

- `docs/deployment.md`：生产部署详细步骤
- `docs/db-schema.md`：数据库结构说明
- `docs/ui-mobile-design.md`：移动优先 UI 设计规范
- `docs/repository-ignore.md`：提交/发布前需要排除的文件列表

---

## 脚本与测试

- 导入校验：`node packages/scripts/import-lessons.js`（打印每课错误报告；含测试 `packages/scripts/tests/import-lessons.test.js`）
- 直传自检：`API_BASE=http://localhost:4000 npm run check:upload`
  - 说明：`/upload/presign` 仅管理员可用，脚本需要携带登录后的 Cookie（见 `packages/scripts/check-upload.js`）
- API 集成测试（本地）：`node tests/api.integration.js`
- 备份脚本：`DATABASE_URL=... DATA_DIR=... tools/db/backup.sh ./backups`（输出 pg_dump + 音频/缓存压缩包）
- 旧版音频映射迁移：`node tools/migrate-lesson-audio.js`

---

- 课程列表为空：确认 Nest API 已启动且连接 Postgres；检查 `lesson` 表是否有已发布课程（`published=true`），并确保前端 `NEXT_PUBLIC_API_BASE` 指向正确地址
- 发布被拦截：查看编辑页“时间戳质检”错误项（重叠/空文本/无效时间等）并修正

---
