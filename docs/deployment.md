# EnglishPod 365 — 部署与运维指南（公有云 / 自建环境）

> 面向刚接手项目的同学，按步骤执行即可在 Linux 服务器完成部署。  
> 主要组件：Next.js 前端（`apps/web-next`）、NestJS 后端（`apps/api-nest`）、PostgreSQL 数据库、对象存储（可选）。

---

## 1. 总览与准备

### 1.1 目标环境

| 角色 | 推荐配置 |
| --- | --- |
| 应用服务器 | Ubuntu 22.04 / CentOS 7+, 2 核 4G 以上 |
| 数据库 | PostgreSQL 13+（可使用云数据库） |
| 对象存储（可选） | MinIO / S3 兼容服务，用于课程音频和截图等资源 |
| 域名与证书 | 主站 `https://example.com`，API `https://api.example.com` |

### 1.2 软件依赖

- Node.js ≥ 18（推荐 20 LTS）
- npm ≥ 9
- Git、`build-essential`、`curl`
- `pg_dump`（备份数据库用）
- Nginx（或其他反向代理）
- 可选：Docker（若用容器化部署）

### 1.3 仓库目录结构

```
englishpod365/
 ├─ apps/
 │   ├─ web-next      # Next.js 前端
 │   └─ api-nest      # NestJS 后端
 ├─ data/             # 数据目录（课程音频、tts 缓存等）
 ├─ scripts/ops/      # 部署 / 备份脚本
 └─ docs/             # 文档
```

准备一台应用服务器，将仓库放在 `/srv/englishpod/src`，数据目录 `/srv/englishpod/data`（建议挂载云盘）。

---

## 2. 公有云部署指南

### 第 1 步：申请云资源

1. **服务器**：创建 1 台 Linux 云主机（2C4G 起），开放 22、80、443、3000、4000 等端口（生产环境建议走 80/443，应用层监听内网端口）。
2. **数据库**：创建 PostgreSQL 实例，记录连接串 `postgresql://user:pass@host:5432/englishpod`。
3. **对象存储（可选）**：若需托管音频或导入文件，准备 S3 兼容存储，获取 `endpoint/access_key/secret_key/bucket`。
4. **域名和证书**：准备主站和 API 子域，并在 DNS 上指向服务器或负载均衡，证书可用 Let’s Encrypt。

### 第 2 步：服务器基础配置

```bash
sudo apt update && sudo apt install -y git curl build-essential nginx postgresql-client
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
node -v && npm -v    # 确认版本
```

创建项目目录：

```bash
sudo mkdir -p /srv/englishpod/{src,data,backups}
sudo chown -R $USER:$USER /srv/englishpod
```

### 第 3 步：拉取代码与目录绑定

```bash
cd /srv/englishpod/src
git clone <repo-url> .
ln -s /srv/englishpod/data data       # 软链接数据目录
```

> 如果仓库已有 `.env.example`，复制为 `.env` 备用。

### 第 4 步：配置环境变量

在仓库根目录创建 `.env`：

```env
PORT=4000
NEXT_PUBLIC_API_BASE=https://api.example.com
DATABASE_URL=postgresql://ep365:devpass@db-host:5432/englishpod
DATA_DIR=/srv/englishpod/data

# 可选：对象存储（若启用直传）
S3_ENDPOINT=https://s3.example.com
S3_BUCKET=ep-uploads
S3_REGION=us-east-1
S3_ACCESS_KEY=xxxx
S3_SECRET_KEY=xxxx
S3_FORCE_PATH_STYLE=true
```

如有 TTS、评分模型配置，可在上线后通过后台 `/admin/settings/models` 设置，系统会写入数据库的 `app_setting`。

### 第 5 步：数据库初始化

1. 确保 PostgreSQL 可访问；
2. 使用仓库脚本执行迁移：

```bash
cd /srv/englishpod/src
npm install
npm run prisma:generate
npx prisma migrate deploy --schema apps/api-nest/prisma/schema.prisma
```

3. 如果需要导入示例课程，可执行：

```bash
npm run export:sql > /srv/englishpod/backups/demo-lessons.sql
psql "$DATABASE_URL" -f /srv/englishpod/backups/demo-lessons.sql
```

### 第 6 步：构建与启动

推荐使用仓库自带脚本：

```bash
cd /srv/englishpod/src
chmod +x scripts/ops/*.sh
scripts/ops/deploy-production.sh
NEXT_PUBLIC_API_BASE=https://api.example.com scripts/ops/start-production.sh
```

- `deploy-production.sh`：安装依赖、生成 Prisma Client、应用迁移并构建前后端。
- `start-production.sh`：启动 API（默认端口 4000）与 Web（默认 3000），会根据 `NEXT_PUBLIC_API_BASE` 指向 API 域名。

如需以 PM2/systemd 管理，可将 `scripts/ops/start-production.sh` 包装为服务。

### 第 7 步：配置反向代理与 HTTPS

以 Nginx 为例，设置主站与 API：

```nginx
# /etc/nginx/sites-enabled/englishpod.conf
server {
    listen 80;
    server_name example.com;
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

重新加载 Nginx 并申请证书（可用 `certbot`）。

### 第 8 步：日常运维

- **备份**：定期执行 `scripts/ops/backup-db.sh /srv/englishpod/backups`，生成 SQL + TTS 缓存压缩包。
- **重启**：更新代码后运行 `git pull`、`scripts/ops/deploy-production.sh`、`scripts/ops/start-production.sh`。
- **日志**：关注 Node 服务输出、Nginx 日志、`data/tts-cache/tts-errors.log`。
- **监控**：至少监控 CPU/内存/磁盘、PostgreSQL 连接数、API 的 4xx/5xx。

### 第 9 步：上线验收清单

1. 前端首页能看到已发布课程；
2. 登录 `/admin`，完成课程发布、TTS 预生成、模型健康检查；
3. 课程页缓存一门课程 → `/settings/offline` 能显示缓存状态；
4. 做一遍完形/作文，首页“今日课程”指向最近课程；
5. `/reviews/today` 返回数据，复习流程正常；
6. 检查备份目录是否生成新的 SQL/TAR 包；
7. 域名证书、HTTP→HTTPS 重定向、生效；
8. 默认账号安全策略满足要求（验证码、登录限流）。

---

## 3. 独立服务器 / 本地部署

适合内网 PoC 或个人调试，步骤与公有云类似，只是数据库与服务都在单机。

### 第 1 步：安装基础环境

```bash
sudo apt update && sudo apt install -y git curl build-essential postgresql
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
```

### 第 2 步：准备目录与数据库

```bash
sudo mkdir -p /srv/englishpod/{src,data}
sudo chown -R $USER:$USER /srv/englishpod

# 创建数据库和用户
sudo -u postgres psql -c "CREATE ROLE ep365 WITH LOGIN PASSWORD 'devpass';"
sudo -u postgres psql -c "CREATE DATABASE englishpod OWNER ep365;"
```

### 第 3 步：获取代码并安装依赖

```bash
cd /srv/englishpod/src
git clone <repo-url> .
ln -s /srv/englishpod/data data
npm install
```

### 第 4 步：配置 `.env`

```env
DATABASE_URL=postgresql://ep365:devpass@127.0.0.1:5432/englishpod
NEXT_PUBLIC_API_BASE=http://localhost:4000
DATA_DIR=/srv/englishpod/data
PORT=4000
```

### 第 5 步：数据库迁移与构建

```bash
npm run prisma:generate
npx prisma migrate deploy --schema apps/api-nest/prisma/schema.prisma
scripts/ops/deploy-production.sh
```

### 第 6 步：启动服务

```bash
NEXT_PUBLIC_API_BASE=http://localhost:4000 scripts/ops/start-production.sh
```

此命令会在前台运行，按 `Ctrl+C` 可停止。若希望后台运行，可在 `apps/api-nest/dist/main.js` 与 `npm run start --workspace apps/web-next` 上自行配置 PM2 或 systemd。

### 第 7 步：访问与本地缓存

- Web 端：`http://localhost:3000`
- API：`http://localhost:4000`
- 离线缓存默认缓存在浏览器 Cache Storage 中，可在 `/settings/offline` 查看。

### 第 8 步：备份

```bash
scripts/ops/backup-db.sh ./backups
```

会在 `./backups` 下生成 `db-backup-*.sql` 和可选的 `tts-cache-*.tar.gz`。

### 第 9 步：常见问题

| 问题 | 解决方案 |
| --- | --- |
| 端口占用 | 修改 `.env` 中的 `PORT` 或 `WEB_PORT`，再运行启动脚本 |
| Prisma 找不到数据库 | 确认 `DATABASE_URL` 正确；运行 `psql` 测试连接 |
| 课程音频 404 | 确认 `data/uploads/` 中存在音频；后台重新上传或同步到对象存储 |
| TTS 播放失败 | 查看 `data/tts-cache/tts-errors.log`，在 `/admin/settings/models/tts` 重新配置或做健康检查 |

---

## 4. 附录

### 4.1 运维脚本速查

| 脚本 | 说明 |
| --- | --- |
| `scripts/ops/deploy-production.sh` | 安装依赖 → 生成 Prisma Client → 应用迁移 → 构建前后端 |
| `scripts/ops/start-production.sh` | 启动 API + Web（需先构建） |
| `scripts/ops/backup-db.sh` | 调用 `pg_dump` 备份数据库并可打包 `tts-cache` |

### 4.2 常用命令

```bash
# 仅构建前端 / 后端
npm run --workspace apps/web-next build
npm run --workspace apps/api-nest build

# 仅启动开发环境
npm run dev:api
npm run dev:web

# 生成 Prisma Client
npm run prisma:generate
```

### 4.3 关键环境变量

| 变量 | 说明 | 默认 |
| --- | --- | --- |
| `PORT` | 后端监听端口 | 4000 |
| `NEXT_PUBLIC_API_BASE` | 前端访问 API 的地址 | `http://localhost:4000` |
| `DATABASE_URL` | Postgres 连接串 | 无（必填） |
| `DATA_DIR` | 数据目录 | `./data` |
| `S3_*` | 对象存储配置 | 无（可选） |

### 4.4 发布检查列表

- [ ] API/WEB 服务均启动且无 4xx/5xx 错误；
- [ ] `/admin` 能发布课程、预生成 TTS；
- [ ] 课程页缓存 → `/settings/offline` 成功显示；
- [ ] 完形/作文提交、复习流程正常；
- [ ] HTTPS 证书有效，HTTP 自动跳转；
- [ ] 定时备份/监控已配置；
- [ ] `.env`、备份 SQL 等敏感文件未提交到仓库（参考 `docs/repository-ignore.md`）。

至此，EnglishPod 365 已可在公有云或自建服务器上运行，并具备离线缓存、课程管理、大模型评分等功能。祝部署顺利！ 😄

