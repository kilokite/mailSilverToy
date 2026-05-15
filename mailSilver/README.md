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
| `NODE_ENV` | 设为 `development` 时，未配置 `EMAIL_SECRET` 仅告警；否则进程启动会失败 |

### 邮件 Webhook

- `POST /api/email` — Body 为完整 `.eml`，需头 `x-webhook-secret: <EMAIL_SECRET>`
- `GET /api/email` — 列表 `?limit=&before=`
- `GET /api/email/:id` — 详情
- `GET /api/email/:id/raw` — 下载原始邮件
