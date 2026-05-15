## mailSilver

```bash
npm install
cp .env.example .env   # 修改其中的 EMAIL_SECRET
npm run dev
```

默认静态站与 API 同端口（见 `src/config.ts`）。

`npm run dev` / `npm start` 会通过 Node 22 的 `--env-file-if-exists=.env`
自动加载根目录下的 `.env`（不存在则忽略）。变量也可用进程环境变量覆盖。

### 环境变量

| 变量 | 说明 |
|------|------|
| `PORT` | 监听端口，默认 `23879` |
| `EMAIL_SECRET` | **必填（非 development）**：Cloudflare Worker 调用 `POST /api/email` 时在请求头 `x-webhook-secret` 中携带 |
| `DB_PATH` | SQLite 文件路径，默认 `./data/mail.db` |
| `MAX_RAW_BYTES` | 单封邮件 raw 最大字节，默认 25MB |
| `MAIL_DOMAIN` | 用户邮箱固定后缀，默认 `@kt.sb`（用于注册时拼接、收件人过滤） |
| `SESSION_TTL_MS` | 登录会话有效期（毫秒），默认 30 天 |
| `COOKIE_SECURE` | HTTPS 部署时建议显式置 `true`；缺省按 `NODE_ENV` 推断 |
| `COOKIE_NAME` | 会话 Cookie 名，默认 `mail_session` |
| `NODE_ENV` | 设为 `development` 时，未配置 `EMAIL_SECRET` 仅告警；否则进程启动会失败 |

### 邮件 Webhook

- `POST /api/email` — Body 为完整 `.eml`，需头 `x-webhook-secret: <EMAIL_SECRET>`
  - 成功响应额外返回 `recipients`：命中本服务域名（`MAIL_DOMAIN`）的全部收件人地址
- `GET /api/email` — **需登录**。仅返回收件人匹配当前用户前缀的邮件，参数 `?limit=&before=`
- `GET /api/email/:id` — **需登录** + 收件人匹配；返回 404 而非 403 以避免信息泄露
- `GET /api/email/:id/raw` — 同上，下载原始邮件
- `GET /api/email/stream` — **需登录**。`text/event-stream`，新邮件命中当前用户时实时推送
  - `event: ready`：连接建立
  - `event: mail` + `id` + `data: <EmailListItem JSON>`：新邮件到达
  - `event: ping`：约 25 秒心跳

### 注册 / 登录

- `POST /api/auth/register` — Body `{ "prefix": "yourname", "password": "..." }`
  - 前缀规则：`^[a-z0-9](?:[a-z0-9._-]{0,30}[a-z0-9])?$`，最终邮箱为 `<prefix>${MAIL_DOMAIN}`
  - 密码长度 6–128
  - 成功后下发 `mail_session` Cookie 并返回 `{ user }`
- `POST /api/auth/login` — Body 同上
- `POST /api/auth/logout` — 清空 Cookie 并失效会话
- `GET /api/auth/me` — 当前会话状态（未登录返回 `{ user: null }`）
