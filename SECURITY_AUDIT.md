# EnglishPod 项目安全审查报告

> 范围：本报告基于仓库当前代码进行静态审计与有限的本地验证（无外网安全情报拉取）。  
> 目标：从“蓝军”视角发现可被利用的风险点，并给出修复建议与优先级。

## 0. 技术栈与范围

- 后端：NestJS + Express（`apps/api-nest`）
- ORM/数据库：Prisma + PostgreSQL（`apps/api-nest/prisma/schema.prisma`）
- 前端：Next.js（`apps/web-next`）
- 旧版/原型服务：Node `http` server（`apps/api/server.js`）
- 对象存储：MinIO（`docker-compose.yml`、`tools/minio/cors.json`）

## 1. 结论摘要（蓝军视角）

当前存在多处“可被直接利用”的高危问题，涉及：**未授权数据篡改、任意上传/存储滥用、XSS、CSRF/SSRF 组合风险、目录穿越**。如对公网开放，建议在上线前完成“最高优先级修复清单”。

### 最高优先级修复清单（必须优先）

1) 立即下线或加鉴权：未授权写接口 `PUT /lessons/:id/transcript`（Dev-only 但无保护）  
2) 上传链路重做：`/upload/presign` + `/upload/put` 当前任何人可用，token 仅“存在即通过”  
3) 修复前端 XSS：`dangerouslySetInnerHTML` 拼接未转义内容  
4) 引入 CSRF 防护：Cookie 会话 + 多个写接口当前缺少 CSRF token / Origin 校验  
5) 旧版 Node server 静态文件路径拼接存在目录穿越风险（若仍对外开放）

## 2. 认证与授权安全

### 2.1 未授权写接口（高危）

- 位置：`apps/api-nest/src/routes/lessons.controller.ts`（`@Put(':id/transcript')`）
- 问题：接口标注 Dev-only，但无登录/管理员校验，任何人可写入任意课程 transcript。
- 影响：数据完整性被破坏，可进一步联动前端 XSS（见第 8 节）。

### 2.2 上传接口未鉴权 + token 形同虚设（高危）

- 位置：`apps/api-nest/src/routes/upload.controller.ts`
- 问题：
  - `/upload/presign` 未鉴权，任何人可获取上传 key
  - `/upload/put` 只校验 query 中 token 参数“存在即通过”，无签名/绑定 key/过期控制
- 影响：可用于任意写入 uploads（资源耗尽/存储污染/恶意文件投递），并可能联动其它读取接口。

### 2.3 首个注册用户自动成为 admin（中危）

- 位置：`apps/api-nest/src/routes/auth.controller.ts`
- 问题：以 `user.count()==0` 决定 admin，存在并发竞争导致多 admin。
- 建议：使用事务/初始化标记/手工创建首个管理员。

### 2.4 会话 token 明文存储（中危）

- 位置：`apps/api-nest/src/services/auth.service.ts`、`apps/api-nest/prisma/schema.prisma`
- 问题：`session_token` 明文入库；DB 泄露可直接接管会话。
- 建议：入库保存 token 哈希，并兼容迁移旧 token。

### 2.5 密码哈希参数偏弱（中危）

- 位置：`apps/api-nest/src/utils/auth.ts`
- 问题：PBKDF2 迭代次数偏低（10k），建议 Argon2id 或提升迭代次数并参数版本化。

### 2.6 Cookie 解析易被畸形输入打崩（中危）

- 位置：`apps/api-nest/src/utils/auth.ts`
- 问题：`decodeURIComponent` 对非法编码会抛异常，可能造成 DoS 或隐蔽的认证异常。
- 建议：对单个 cookie 值 decode 加 try/catch，失败时忽略该键。

## 3. 输入验证与注入防护

### 3.1 `@Body() any` 普遍存在（中危）

- 风险：类型污染、越界值、超长 payload、业务逻辑绕过
- 建议：启用全局 ValidationPipe + DTO（class-validator / class-transformer），或至少对关键接口做严格的手写校验与大小限制。

### 3.2 未发现 Prisma Raw SQL 注入点（低）

- 静态扫描未发现 `$queryRaw/$executeRaw` 等危险调用。

## 4. 文件上传安全

- 关键问题见 2.2（高危）。
- 额外建议：
  - 限制上传大小、文件类型（不仅扩展名，最好加 magic 校验/AV 扫描）
  - 绑定用户与配额，避免滥用
  - 对本地文件读取/直传路径做“安全 join”，阻止目录穿越

## 5. API 安全

### 5.1 缺少全局限流/防刷（中危）

- 现状：仅登录/注册有内存限流，其他写接口无统一限流。
- 建议：全局速率限制（按 IP/用户/路由维度）。

### 5.2 缺少安全响应头（中危）

- 建议：Helmet 或等价的安全头（CSP、X-Content-Type-Options、X-Frame-Options 等）。

## 6. 数据库安全

- 会话 token 明文存储（见 2.4）。
- 部署侧建议：最小权限账号、强密码、限制来源 IP、启用 TLS、审计与备份。

## 7. 环境变量与敏感信息

### 7.1 本地存在 `.env`（中危）

- `.env` 已被 `.gitignore` 忽略，但在镜像构建/打包上下文/误上传时仍可能泄露。
- 建议：生产使用 Secrets 管理，构建时排除 `.env`。

### 7.2 部署文档含弱密码示例（低/中）

- 位置：`docs/deployment.md`
- 建议：避免提供可复制粘贴的弱密码，改为提示“使用强随机密码”。

## 8. CSRF / XSS / SSRF

### 8.1 前端 XSS（高危）

- 位置：`apps/web-next/pages/practice/[id].tsx`
- 问题：`dangerouslySetInnerHTML` 插入拼接字符串，`passage/options` 未做任何 HTML/属性转义。
- 影响：一旦数据被污染，可触发存储型/反射型 XSS，进一步盗用会话或发起 CSRF。

### 8.2 缺少 CSRF 防护（高危）

- 现状：Cookie 会话 + 多个写接口缺少 CSRF token / Origin 校验。
- 建议：引入 CSRF token 机制或严格 Origin/Referer 校验，覆盖所有写操作。

### 8.3 管理员接口 SSRF 面（中危）

- 位置：`apps/api-nest/src/routes/model-config.controller.ts`
- 风险：部分接口允许从 query 覆盖 base 并服务端 fetch，若管理员被诱导点击特制链接，可能对内网发起探测。
- 建议：生产禁用 query 覆盖，或做 allowlist/私网地址拦截，配合 CSRF 防护。

## 9. 依赖项安全

- 由于当前环境外网受限，无法在本次审计中拉取 `npm audit` 漏洞库并给出精确 CVE 列表。
- 建议：在可联网环境运行 `npm audit --omit=dev`，并在 CI 接入 SCA（Dependabot/Snyk/GHAS）。

## 10. 代码规范性与健壮性

- 建议把安全策略“平台化”：统一校验、统一异常处理、统一安全头、统一限流，而不是分散在各 Controller 手写。
- Dev-only 功能应通过环境开关、路由隔离、鉴权/白名单进行严格隔离。

