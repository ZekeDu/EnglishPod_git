# EnglishPod 365 — 部署与运维指南（公有云 / 自建环境）

> 面向第一次接手项目的同学，即使你是 IT 小白，也可以照着本指南一步步完成部署。建议跟着顺序做，不要跳步，每一步都包含“为什么”和“做到什么程度算完成”的解释。  
> 核心组件：Next.js 前端（`apps/web-next`）、NestJS 后端（`apps/api-nest`）、PostgreSQL 数据库、对象存储（可选）。

---

## 1. 总览与准备

### 1.1 目标环境

| 角色 | 推荐配置 |
| --- | --- |
| 应用服务器 | Ubuntu 22.04 / CentOS 7+，2 核 4G 以上，40G SSD |
| 数据库 | PostgreSQL 13+ 云数据库或自建实例 |
| 对象存储（可选） | MinIO / AWS S3 / 阿里云 OSS，用于课程音频与截图 |
| 域名与证书 | 主站 `https://example.com`，API `https://api.example.com` |

> **为什么需要这些？** 平台会同时运行 Web 与 API 两个 Node.js 进程并连接数据库；至少 2C4G 才能保证构建和运行不被 OOM 杀死。域名与证书便于学员访问并开启 HTTPS。

### 1.2 软件依赖

| 依赖 | 作用 | 检查方式 |
| --- | --- | --- |
| Node.js ≥ 18（建议 20 LTS） | 运行与构建 Web、API | `node -v` |
| npm ≥ 9 | 管理依赖与脚本 | `npm -v` |
| Git | 拉取代码 | `git --version` |
| build-essential / gcc / make | 编译原生依赖 | `dpkg -l build-essential` |
| curl | 下载脚本 | `curl --version` |
| pg_dump / psql | 管理 PostgreSQL | `psql --version` |
| Nginx 或其他反向代理 | 暴露 80/443 端口 | `nginx -v` |
| 可选 Docker | 如果选择容器化 | `docker -v` |

> **安装小贴士**：在 Ubuntu 上执行 `sudo apt update && sudo apt install -y git curl build-essential nginx postgresql-client` 即可满足大部分依赖，Node.js 使用官方安装脚本。

### 1.3 仓库目录结构

```
englishpod365/
 ├─ apps/
 │   ├─ web-next      # Next.js 前端
 │   └─ api-nest      # NestJS 后端
 ├─ data/             # 数据目录（课程音频、TTS 缓存等）
 ├─ scripts/ops/      # 部署 / 备份脚本
 └─ docs/             # 文档
```

> **操作习惯**：我们默认代码放在 `/srv/englishpod/src`，数据放在 `/srv/englishpod/data`。这样后续迁移或扩容只需挂载整块数据盘。

### 1.4 必备账号与信息清单

- 仓库访问方式（SSH Key 或 HTTPS 凭证）。
- PostgreSQL 连接串及账号密码。
- 对象存储的 `endpoint/access_key/secret_key/bucket`（如果要托管音频）。
- 域名解析控制台和获取证书（或能使用 Let’s Encrypt）。
- 服务器的 root 或 sudo 账号。

准备好这些信息可以避免部署中途卡住。

### 1.5 命令行约定

- 文档默认你已经通过 `ssh user@server-ip` 登录到服务器。
- `<>` 代表需要替换的内容，例如 `<repo-url>` 换成你自己的 Git 仓库地址。
- 运行命令前先确认所在目录，常用目录：`/srv/englishpod/src`（代码）、`/srv/englishpod/data`（数据）。

---

## 2. 公有云部署指南

> **阅读顺序建议**：每一步都附带“操作目的”“完成标志”“常见坑”。照着做 + 对照检查表，就算遇到问题也能快速定位。

### 第 1 步：申请云资源（准备跑得起来的机器）

> **操作目的**：提前把服务器、数据库、存储、域名准备好，后面部署才有目标。  
> **完成标志**：你手里有服务器登录方式、数据库连接串、对象存储配置以及已解析的域名。

1. **服务器**：在云厂商创建 1 台 2C4G 以上的 Linux 主机，开放 22（SSH）、80/443（HTTP/HTTPS），以及供内部访问的 3000/4000 端口。 
2. **数据库**：创建 PostgreSQL 13+ 实例，记录好 `postgresql://user:pass@host:5432/englishpod` 格式的连接串。若暂时没有数据可先建空库。 
3. **对象存储（可选）**：若课程资源较大，申请一份 S3 兼容存储（MinIO/AWS/Aliyun/腾讯云都行），保存 `endpoint/bucket/ak/sk`。 
4. **域名和证书**：将主站和 API 子域解析到服务器公网 IP，证书可先占位，稍后用 `certbot` 生成。

> **常见坑**：忘记开数据库白名单、服务器被安全组挡掉 443、域名解析 TTL 太长导致验证慢。

### 第 2 步：服务器基础配置（把系统环境打好补丁）

> **操作目的**：让系统具备构建与运行 Node.js 的能力。  
> **完成标志**：`node -v`、`npm -v`、`nginx -v` 等命令能成功输出版本。

1. SSH 登录服务器后执行：

```bash
sudo apt update && sudo apt install -y git curl build-essential nginx postgresql-client
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
node -v && npm -v
```

2. 准备项目目录：

```bash
sudo mkdir -p /srv/englishpod/{src,data,backups}
sudo chown -R "$USER:$USER" /srv/englishpod
```

> **命令说明**：第一段命令安装常用工具并把 Node.js 20 加入 apt 仓库；第二段命令创建统一的代码、数据、备份目录并赋予当前用户写权限。

### 第 3 步：拉取代码并绑定数据目录

> **操作目的**：把仓库同步到服务器本地，并让项目里的 `data/` 指向持久化存储。  
> **完成标志**：`/srv/englishpod/src` 目录下能看到 `apps/ docs/ scripts/` 等子目录。

```bash
cd /srv/englishpod/src
git clone <repo-url> .
ln -s /srv/englishpod/data data
ls -al
```

- 如果仓库已有 `.env.example`，先复制一份备用：`cp .env.example .env`。
- `ln -s` 会创建软链接，确保后续上传的音频都进数据盘。

### 第 4 步：配置环境变量（告诉程序去哪里找服务）

> **操作目的**：让前后端知道监听端口、数据库地址、数据目录等信息。  
> **完成标志**：仓库根目录存在 `.env`，内容能对应你的真实环境。

1. 在仓库根目录新建 `.env`：

```env
PORT=4000
NEXT_PUBLIC_API_BASE=https://api.example.com
DATABASE_URL=postgresql://ep365:devpass@db-host:5432/englishpod
DATA_DIR=/srv/englishpod/data

# 可选：对象存储（启用直传或同步时使用）
S3_ENDPOINT=https://s3.example.com
S3_BUCKET=ep-uploads
S3_REGION=us-east-1
S3_ACCESS_KEY=xxxx
S3_SECRET_KEY=xxxx
S3_FORCE_PATH_STYLE=true
```

2. 说明：
   - `PORT`：API 实际监听端口，默认 4000。
   - `NEXT_PUBLIC_API_BASE`：前端访问 API 的地址，必须与实际域名一致，包含 `https://`。
   - `DATABASE_URL`：务必确认账号、密码、库名正确，可用 `psql "$DATABASE_URL" -c "SELECT 1"` 测试。
   - `DATA_DIR`：放课程音频、TTS 缓存的真实路径。

> **常见坑**：`.env` 不要带引号；文件权限不要设为 777，保持默认即可。

### 第 5 步：初始化数据库（让表结构就位）

> **操作目的**：生成 Prisma Client 并把数据库迁移脚本真正应用到 PostgreSQL 中。  
> **完成标志**：终端输出 `Prisma schema loaded`、`Migration ... applied`，数据库能看到业务表。

```bash
cd /srv/englishpod/src
npm install
npm run prisma:generate
npx prisma migrate deploy --schema apps/api-nest/prisma/schema.prisma
```

- `npm install` 会下载所有工作区依赖（首次执行时间较长）。
- `npm run prisma:generate` 根据 schema 生成 TypeScript 客户端。
- `npx prisma migrate deploy` 会读取 `apps/api-nest/prisma/migrations` 并逐个执行。

如需导入示例课程，可额外执行：

```bash
npm run export:sql > /srv/englishpod/backups/demo-lessons.sql
psql "$DATABASE_URL" -f /srv/englishpod/backups/demo-lessons.sql
```

> **常见坑**：数据库连不上多半是 IP 白名单未放行或密码写错；使用云数据库时记得允许 0.0.0.0/0 仅用于测试，生产请限制来源。

### 第 6 步：构建与启动（把代码变成可运行程序）

> **操作目的**：在服务器上编译前端、后端，并以生产模式运行。  
> **完成标志**：终端看到 `API started`、`ready - started server on 0.0.0.0:3000` 等日志。

```bash
cd /srv/englishpod/src
chmod +x scripts/ops/*.sh
scripts/ops/deploy-production.sh
NEXT_PUBLIC_API_BASE=https://api.example.com scripts/ops/start-production.sh
```

- `deploy-production.sh`：安装依赖 → 生成 Prisma Client → 应用迁移 → 构建 api/web。
- `start-production.sh`：一次性启动 API（4000）与 Web（3000/`process.env.WEB_PORT`）。

> **提示**：正式环境建议用 PM2 或 systemd 将 `start-production.sh` 包装成服务，避免 SSH 断开后进程退出。

### 第 7 步：配置反向代理与 HTTPS（让用户能访问）

> **操作目的**：把公网 80/443 请求转发到本地 3000/4000，并启用 TLS。  
> **完成标志**：访问 `https://example.com` 可以看到站点，`curl -I https://api.example.com` 返回 200/304。

1. 创建 Nginx 配置：

```nginx
# /etc/nginx/sites-enabled/englishpod.conf
server {
    listen 80;
    server_name example.com api.example.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name example.com;
    ssl_certificate     /etc/letsencrypt/live/example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/example.com/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}

server {
    listen 443 ssl http2;
    server_name api.example.com;
    ssl_certificate     /etc/letsencrypt/live/api.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.example.com/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:4000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

2. 申请证书：`sudo certbot --nginx -d example.com -d api.example.com`。
3. 重载 Nginx：`sudo systemctl reload nginx`。

> **常见坑**：证书目录要与你的域名匹配；如果 Web/API 在同一域名下，需要根据路径拆流；若 80 端口未开放，Let’s Encrypt 验证会失败。

### 第 8 步：日常运维（让服务持续稳定）

> **操作目的**：建立可重复的维护动作，避免“上线就算完事”。  
> **完成标志**：有清晰的备份、更新、日志查看方法。

- **备份**：`scripts/ops/backup-db.sh /srv/englishpod/backups`，会生成 `db-backup-YYYYMMDD.sql` 与可选的 `tts-cache-*.tar.gz`。把备份同步到对象存储或 OSS Glacier 更安全。
- **更新代码**：`git pull` → `scripts/ops/deploy-production.sh` → 重启服务。若使用 PM2，可 `pm2 restart englishpod`。
- **查看日志**：
  - API/Web：`journalctl -u englishpod-api -f`（假设你用 systemd）。
  - TTS 错误：`tail -f /srv/englishpod/data/tts-cache/tts-errors.log`。
  - Nginx：`sudo tail -f /var/log/nginx/access.log`。
- **监控建议**：CPU、内存、磁盘、PostgreSQL 连接数、API 5xx 数量、TTS 缓存命中率。

### 第 9 步：上线验收清单（确认没有遗漏）

1. 打开 `https://example.com`，能看到课程列表且加载无报错。
2. 登录 `/admin`，发布一节课程、触发 TTS 预生成、在“模型设置”里检查各模型都为绿色。
3. 体验完形填空/作文提交，确保 API 返回 200 且评分展示正常。
4. 打开 `/reviews/today`，确认复习数据存在且状态正确。
5. 查看 `/srv/englishpod/backups` 是否出现当日 SQL/TAR 文件，确认备份脚本可用。
6. 访问 `http://example.com` 是否自动跳转到 HTTPS，证书是否显示安全。
7. 检查后台登录安全策略（验证码、登录限制），必要时配置 WAF/Fail2ban。

> ✅ **全部通过后**，可以把检查清单截图或记录保存，方便下次复盘。

---

## 3. 独立服务器 / 本地部署（单机体验版）

适合内网 PoC 或个人调试，所有服务跑在同一台机器上，步骤与公有云类似但更精简。

### 第 1 步：安装基础环境

```bash
sudo apt update && sudo apt install -y git curl build-essential postgresql
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
```

> **说明**：这里直接安装本机 PostgreSQL，后面不需要单独的云数据库。

### 第 2 步：准备目录与数据库

```bash
sudo mkdir -p /srv/englishpod/{src,data}
sudo chown -R "$USER:$USER" /srv/englishpod

sudo -u postgres psql -c "CREATE ROLE ep365 WITH LOGIN PASSWORD 'devpass';"
sudo -u postgres psql -c "CREATE DATABASE englishpod OWNER ep365;"
```

- 第三行创建本地数据库用户，密码可以先用简单值（别忘了记住）。
- 第四行新建数据库并指定所有者。

### 第 3 步：获取代码并安装依赖

```bash
cd /srv/englishpod/src
git clone <repo-url> .
ln -s /srv/englishpod/data data
npm install
```

> **提示**：本地目录同样推荐软链接数据目录，方便清理与备份。

### 第 4 步：配置 `.env`

```env
DATABASE_URL=postgresql://ep365:devpass@127.0.0.1:5432/englishpod
NEXT_PUBLIC_API_BASE=http://localhost:4000
DATA_DIR=/srv/englishpod/data
PORT=4000
```

- 如果要在局域网给其他人访问，可把 `NEXT_PUBLIC_API_BASE` 换成 `http://<局域网IP>:4000`。

### 第 5 步：数据库迁移与构建

```bash
npm run prisma:generate
npx prisma migrate deploy --schema apps/api-nest/prisma/schema.prisma
scripts/ops/deploy-production.sh
```

> **顺序原因**：先生成 Prisma Client，再执行迁移，最后构建，避免出现“表不存在”或“Client 缺失”。

### 第 6 步：启动服务

```bash
NEXT_PUBLIC_API_BASE=http://localhost:4000 scripts/ops/start-production.sh
```

- 命令会在终端前台输出日志，按 `Ctrl+C` 可停止。
- 若想后台运行，可安装 PM2：`npm install -g pm2`，再 `pm2 start scripts/ops/start-production.sh --name englishpod-local`。

### 第 7 步：访问服务

- Web 端：`http://localhost:3000`
- API：`http://localhost:4000`

### 第 8 步：备份

```bash
scripts/ops/backup-db.sh ./backups
```

- 会在当前仓库的 `backups/` 目录生成 SQL（数据库）与可选的 TTS 缓存压缩包。
- 记得把文件复制到安全位置，例如外接硬盘或云盘。

### 第 9 步：常见问题速查

| 问题 | 解决方案 |
| --- | --- |
| 端口被占用 | `lsof -i :3000` 找到进程并停止，或在 `.env` 修改 `PORT/WEB_PORT` 后重启 |
| Prisma 无法连接数据库 | 检查 PostgreSQL 是否启动：`sudo systemctl status postgresql`；用 `psql "$DATABASE_URL" -c 'SELECT 1'` 验证 |
| 课程音频 404 | 确认音频被放在 `data/uploads/`，或在后台重新上传 |
| TTS 播放失败 | 查看 `data/tts-cache/tts-errors.log`，在 `/admin/settings/models/tts` 重新配置密钥 |

---

## 4. 附录

### 4.1 运维脚本速查

| 脚本 | 作用 | 备注 |
| --- | --- | --- |
| `scripts/ops/deploy-production.sh` | 安装依赖 → 生成 Prisma Client → 应用迁移 → 构建前后端 | 可以多次执行，脚本会自动跳过重复安装 |
| `scripts/ops/start-production.sh` | 启动 API + Web | 默认前台运行，可用 PM2/systemd 托管 |
| `scripts/ops/backup-db.sh` | 调用 `pg_dump` 备份数据库，并可打包 `tts-cache` | 需要本地已安装 `pg_dump` |

### 4.2 常用命令

```bash
# 仅构建前端 / 后端
npm run --workspace apps/web-next build
npm run --workspace apps/api-nest build

# 仅启动开发环境（热更新）
npm run dev:api
npm run dev:web

# 生成 Prisma Client（修改 schema 后必跑）
npm run prisma:generate
```

### 4.3 关键环境变量

| 变量 | 说明 | 默认 |
| --- | --- | --- |
| `PORT` | API 监听端口 | 4000 |
| `WEB_PORT` | Web 监听端口（在脚本里可选） | 3000 |
| `NEXT_PUBLIC_API_BASE` | 前端访问 API 的完整地址 | `http://localhost:4000` |
| `DATABASE_URL` | PostgreSQL 连接串 | 无（必填） |
| `DATA_DIR` | 数据目录 | `./data` |
| `S3_*` | 对象存储配置，启用直传时必填 | 无（可选） |

### 4.4 发布检查列表（打印出来打勾更安心）

- [ ] API/Web 服务都在运行，`curl -f http://127.0.0.1:4000/health` 返回 200。
- [ ] `/admin` 可登录且能创建/发布课程。
- [ ] TTS、作文评分、完形填空等 AI 能力测试通过。
- [ ] HTTPS 证书有效并且 HTTP 自动跳转。
- [ ] 备份脚本最近 24 小时有产物，且文件可成功恢复（抽查一次）。
- [ ] `.env`、备份 SQL 等敏感文件未被提交到 Git（使用 `.gitignore`）。

做到以上，各环境都可稳定运行 EnglishPod 365。祝部署顺利！
