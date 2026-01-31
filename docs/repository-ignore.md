# EnglishPod 365 — 上传/发布前的排除清单

部署或推送到公共仓库前，请务必确认以下目录/文件未被提交，或已在 `.gitignore` 中忽略。

## 1. 构建产物与依赖

- `node_modules/`
- `apps/web-next/.next/`
- `apps/api-nest/dist/`
- `scripts/ops/backups/`（备份输出目录）
- `test-results/`、`playwright-report/`
- `apps/web-next/.vercel/`、`.turbo/` 等托管工具生成的配置

## 2. 私密配置与临时数据

- `.env`（以及包含秘钥的 `.env.*`）
- `data/` 下的实际课程/用户数据（如 `data/lessons/`、`data/users/`、`data/uploads/`、`data/tts-cache/`）
- `dump.sql`、`lesson_import.zip`、任何导出的 SQL/ZIP 备份
- 运行时生成的 `apps/web-next/public/` 临时文件（除资源、静态文件以外）
- 生产环境导出的日志、备份包
- PWA/Service Worker 产物：`apps/web-next/public/sw.js`、`apps/web-next/public/workbox-*.js`、`apps/web-next/public/offline/*`

## 3. 本地开发相关

- `.DS_Store`、`Thumbs.db` 等系统文件
- IDE 目录（如 `.idea/`、`.vscode/`）
- `tmp/`、`logs/` 等临时目录（若有）

## 4. 建议做法

1. 发布到 GitHub/GitLab 前执行 `git status`，确认无敏感文件处于暂存区；
2. 将上述路径加入 `.gitignore`；
3. 备份文件、数据库导出建议保存在私有对象存储或加密硬盘，不要随项目同步；
4. 如需与团队共享配置，可通过密码管理器或 Vault 派发，不要直接提交秘钥。

遵循以上清单，可避免泄露账号秘钥、过期构建产物或体积过大的资源文件。
