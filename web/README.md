# mailSilver 前端（React + Vite + shadcn/ui）

经典三栏邮件客户端：左侧文件夹导航，中间邮件列表，右侧邮件详情。
后端：[`../mailSilver`](../mailSilver)（Hono on Node，默认端口 `23879`）。

## 与后端的接入方式

前端代码统一调用同源相对路径 `/api/...`，dev 与 prod 的差异在 Vite 这一层屏蔽掉：

| 场景 | 前端请求 | 实际命中 |
| --- | --- | --- |
| dev：`npm run dev`（5173） | `/api/email` | Vite proxy → `http://localhost:23879/api/email` |
| prod：`mailSilver` 同源托管 | `/api/email` | 同进程的 Hono 路由 |
| 特殊：前端独立部署 | `/api/email` | `VITE_API_BASE` 指定的绝对地址 |

### dev

1. 启动后端
   ```bash
   cd ../mailSilver
   npm run dev    # tsx watch src/index.ts，监听 23879
   ```
2. 启动前端
   ```bash
   npm run dev    # Vite 5173，/api 自动代理到 23879
   ```

后端地址不是默认的话，改 `.env.development`：

```env
VITE_DEV_BACKEND=http://localhost:9000
```

### prod

```bash
# 项目根目录
node build.mjs
```

会先 `vite build`（产物输出到 `mailSilver/public/`），再 `tsc` 编译后端。
启动后端（`mailSilver/`）后，访问 `http://<host>:23879/`，前端与 API 同源。

如果要把前端独立部署到别的域名/CDN，构建时给一个绝对 base：

```bash
VITE_API_BASE=https://api.example.com npm run build
```

## 目录结构

```
src/
├─ App.tsx                       # 三栏布局 + 数据加载
├─ components/
│  ├─ ui/                        # shadcn 组件（仅保留用到的：button/input/separator）
│  └─ dashboard/
│     ├─ Sidebar.tsx             # 左：文件夹
│     ├─ MailList.tsx            # 中：邮件列表（搜索、状态标）
│     └─ MailView.tsx            # 右：邮件详情（text 优先，HTML 走 sandbox iframe）
├─ lib/
│  ├─ api.ts                     # 后端类型与 fetch 封装
│  └─ utils.ts                   # cn()
└─ index.css                     # Tailwind v4 + shadcn 主题
```
