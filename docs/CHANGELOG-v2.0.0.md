# v2.0.0-i18n.1 与上一版的差异

> **上一版**：`v1.3.6-i18n.3`（上游 `v1.3.6`）
> **本版**：`v2.0.0-i18n.1`（上游 `v2.0.0`）
> **对比区间**：上游 `v1.3.6..v2.0.0`，共 23 个提交、34 个文件、`+3402 / −1640` 行；
> 叠加本仓库的汉化与本地适配后，`v1.3.6-i18n.3..v2.0.0-i18n.1` 合计 38 个文件、`+8368 / −1694` 行。

本文只讲**和上一版有什么不一样**，安装与日常使用见 [README](../README.md)。

> 最后更新：2026-10-23（`v2.0.0-i18n.1`；`v2.0.1-i18n.1` 的增量见第 8 节）

---

## 0. 先看结论

| 你关心的 | 上一版 | 本版 |
| --- | --- | --- |
| 支持的机器人 | Rewards Script **v4**（v4-china 中文日志） | **v4 继续可用**，同时支持 **v5** 的配置项与日志格式 |
| 账号页 | 一张卡片：状态 + 功能要点 | 重写：状态轨道 + 功能结果 chips + 批量/单独运行 + 删除 |
| 运行结果判定 | 主要看有没有 `Completed all accounts` | 四种结论：成功 / 停止 / 中断 / 失败，另有 `stalled`、`sleeping` |
| 配置页 | 按配置文件里的 key 渲染 | 按机器人版本标注 **仅 v4 / 仅 v5**，不适用的自动置灰 |
| 图标 | `unpkg.com` 现场加载 Phosphor | **仓库内置**，不再依赖第三方 CDN |
| 镜像 | 本地构建 `rewards-dashboard:prewarm-desktop-login-20261008` | `ghcr.io/zpan2327/rewards-dashboard-i18n:v2.0.0-i18n.1` |
| 部署方式 | 额外挂载 `lib/parser.js` 热修 | **不需要挂载**，解析补丁已在镜像里 |
| 中文字典 | 519 条 key | 593 条（新增 82、删除 8） |

---

## 1. 上游 23 个提交做了什么

### 1.1 运行结果：从「跑没跑完」到「为什么结束」

上一版只有粗粒度的 `running / done / error`，`stopped`、`interrupted` 这些状态虽然有样式，
但**判定逻辑并不完整**——进程被 SIGTERM 结束、脚本自己中断、集群 worker 挂掉，
常常都会落到 `error` 或一直停在 `running`。

v2.0.0 新增了 `lib/outcome.js`，把「结束原因」收敛成一个函数，优先级从高到低：

1. `run.status` 明确为 `failed` → **失败**
2. `stopped` / `cancelled` → **已停止**
3. `interrupted`（v5 新语义：没跑完）→ **中断**
4. 退出码 130/137/143 或 SIGINT/SIGTERM/SIGKILL/SIGHUP → **已停止**
5. 其它信号（SIGSEGV/SIGABRT…）→ **失败**
6. `partial` 但有 totals → **成功**（v4 的兼容写法）
7. 其它非 0 退出码 → **失败**
8. 以上都不是 → **成功**

配套的可见变化：

- 头部/控制条会显示 **「Run starts in …」**（机器人处于预运行 sleep 时）和 `sleeping` 徽标；
- 账号行在 `sleeping` 期间显示睡眠状态，而不是「空闲」；
- 总览的「异常账号」统计改用 `accountDisplayStatus()`，会跳过 watchdog 误判（`Run stalled before this account finished`）；
- 上一轮刚跑完、机器人还没回到 `idle` 时点「开始运行」，后端会自动等最多 10 秒再重试一次（以前会直接 409 报错）。

### 1.2 账号页整体重写（变化最大）

结构从「一张卡片塞所有信息」改成三段式：

```
┌─ 状态轨道 ─┬─ 邮箱 + ACCOUNT_n ─────────────┬─ 选择 ─┬─ 仅运行 ─┐
│  (纯图标)  │                                │        │          │
├────────────┴─ 折叠详情（详情/活动状态）─────┴────────┴──────────┤
├─ 保护轨道 ─┬─ 功能详情 <details> ───────────────────┬─ 删除 ────┤
└────────────┴────────────────────────────────────────┴───────────┘
```

新增的东西：

| 功能 | 新增还是改造 | 说明 |
| --- | --- | --- |
| **功能结果 chips** | 🆕 | 每次运行里每个功能（Daily set / Searches / Punchcard / Read to earn…）的结果：已完成、部分完成、不可用、未上报，都直接显示出来 |
| **outside-script 对账** | 🆕 | 脚本没记录、但余额上涨的积分单独标出（避免「脚本说 +0，余额却涨了」的困惑） |
| **删除账号** | 🆕 | 二次确认；**只删仪表盘本地历史**，不会改动机器人 `config.json` 里的账号 |
| **状态轨道** | 🆕 | 左侧纯图标列（替代原来的状态文字/圆点），带 `aria-label`，移动端自动堆叠 |
| **earnable 分项** | ♻️ | 从「一个合计徽标」改成移动端 / 桌面端 / App 三个分项 |
| **批量运行工具栏** | ♻️ | 「运行所选」v1.3.6 就有，这次改成卡片列表上方的工具栏：全选、已选计数、运行中禁用 |
| **仅运行** | ♻️ | v1.3.6 已有，位置移到主行，和选择框并排 |

这些「功能结果」不再靠日志临时推断，而是落到了新表 `account_activities`
（`email / activity / title / status / points_gained / reason / ts / run_start`），
所以**重启仪表盘、回放历史日志时也能恢复**。删除账号时会一并清理该账号的 activities。

### 1.3 配置页：按机器人版本适配

上游 v5 改了一批配置项的名字和含义，v2.0.0 因此给每个配置项打了版本标签：

- **仅 v5**：`rewardsMode`（API / Browser）、`taskDelay`（组）、`accountDelay.max`、`searchSettings.readDelay.max`、`searchSettings.maxSearchOnBingAttempts`、`searchSettings.useAccountLocale`、`experimental.browserSearchApiReport`、`continueOnBotWarning`
- **仅 v4**：`contintueOnBotWarning`（v4 的历史拼写）、`experimental.apiSearch`、`experimental.apiSearchOnBing`

仪表盘会根据 `/status` 里的机器人版本自动判断：不符的项显示 `仅 v4` / `仅 v5` 徽标并置灰，
但**仍然可见**（方便你提前了解 v5 有哪些新开关），不会提交给不支持的机器人。

另外新增：

- **「显示密钥」横幅**：勾选后可看到 `API_TOKEN`、代理密码等敏感值。
  需要机器人侧同时满足两个条件：设置 `API_ALLOW_CONFIG_REVEAL=true` **并重启机器人**，否则显示为 `——`。
  本机当前是 `false`，所以升级后默认仍然看不到明文（这是保守配置，不影响其它功能）。
- **帮助折叠**：每个分组的 `?` 按钮展开/收起说明，默认收起，页面不再被长文案撑满。
- 配置项逐条 help 文案重排，`meta` 段从配置页移除（上游认为它是内部字段）。

### 1.4 解析器：认 v5 日志，同时兼容 v4

`lib/parser.js` 新增/放宽了这些字段（上游侧）：

| 变化 | 例子 |
| --- | --- |
| `ACCOUNT-END` 尾部可选 `status=` / `reason=` / `activities=` | `Completed account: a@b.com \| pointsGained=50 … \| status=partial \| activities=…` |
| `pointsGained` 允许 `unknown`、余额允许小数 | 失败账号会报 `pointsGained=unknown` |
| `RUN-END` 支持 `Run interrupted` 和 `status=` 后缀 | 中断的运行不再被当成「没有结束」 |
| `ACCOUNT-DELAY` 支持 `\| waitMs=` | 精确毫秒 |
| `ACCOUNT-START` 支持 `geoLocale` 之后的附加字段 | — |
| `STREAK-PROTECTION` 改为命名捕获组，允许 `null` | `daysLeft=null` |
| **新增 `CONTROLLER` 行解析** | `Run completed (code 0).` / `Run interrupted (code 1).` —— 这是 v5 的权威结论行 |
| **新增 `FLOW_FAILED`** | `Account flow failed: …` |

上一版没有 `CONTROLLER` 解析；v5 机器人大量依赖它，所以这是「v5 能显示结果」的关键。

### 1.5 存储：自动迁移，旧数据直接可用

- 新表 `account_activities`（见 1.2）；
- `runs` 新增 `outcome`、`exit_signal` 两列；
- `accounts` 新增 `last_outcome`（保留脚本原始 `status=`，与仪表盘展示状态分开）；
- 启动时用 `PRAGMA table_info` + `ALTER TABLE` **自动补齐缺失列**，不需要删库；
- 运行结束判定改成多信号：`RUN-END` / `CONTROLLER` / wrapper 完成 / 进程退出，任一到达即可收尾，
  并且 `closeRunOnExit()` 会带 `summarySeen` 参数，避免把「已经正常结束」误记成异常退出。

> 实测：从 v1.3.6 的 `data/dashboard.sqlite` 原地启动，原有账号、历史积分与运行记录
> 全部保留，没有任何手工迁移。

### 1.6 后端接口

| 接口 | 变化 |
| --- | --- |
| `GET /api/accounts` | 账号对象里带上 `activities`（功能结果） |
| `GET /api/events`（SSE）推送的状态 | 新增 `botOutcome`、`pendingSleep`；`botRunning` 在「已完成」时为 `false` |
| `DELETE /api/dashboard-accounts/:email` | **新增**，账号页删除按钮用（只删本地历史） |
| 状态轮询失败 | 主动把 `bot` 置空，不再拿上一次的「运行中」快照骗人 |
| `POST /api/control/start` | 遇到 409 且机器人刚跑完时，等待其回到 idle 后自动重试一次 |

### 1.7 界面与主题

- `style.css` 重构 1507 行：间距、圆角、状态色、响应式断点；
- 13 个主题（catppuccin / dracula / nord / gruvbox / tokyo-night…）的 token 同步调整；
- 头部控件（语言、主题、状态）从两行合并到同一行；
- 总览：`stopped` / `skipped` 进入图例与统计，错误信息截断到 120 字（以前会撑破卡片）；
- 运行页：退出码/结果统一走 `statusPill()`，`interrupted`、`stopped` 不再和 `error` 混在一起；
- 日志页：每行显示账号名，时间格式统一；
- 图标统一为 Phosphor（上游用 `unpkg.com` 现场加载，见 2.3）。

---

## 2. 本仓库（中文版）额外做的事

### 2.1 字典：519 → 593（+82 / −8）

新增的 key 集中在这些命名空间：

| 命名空间 | 数量 | 对应界面 |
| --- | --- | --- |
| `accounts.source.*` | 17 | 积分来源对账（dailySet / punchcard / readToEarn / visualSearch…） |
| `accounts.activity.*` | 14 | 功能结果 chips（已完成/部分/不可用/未上报/积分…） |
| `config.toggle.*` | 9 | 新的开关项 |
| `config.field.*` | 7 | 新的字段项 |
| `accounts.delete.*` | 6 | 删除账号的二次确认与提示 |
| `accounts.earnable.*` | 4 | 移动端 / 桌面端 / App 可赚积分 |
| `runs.exit.*` | 4 | 运行页的退出状态（ok / code / meta / metaFailed） |
| `config.*` 其它 | 10 | help 折叠、reveal、addItem、versionTag、option |
| `status.*` / `ctl.*` | 7 | stopped/interrupted 等新状态与顶部控制条 |
| `accounts.protection.*` / `accounts.statusRail` / `accounts.toast.*` | 4 | 无障碍标签与操作提示 |
| **合计** | **82** | |

删除的 8 条是上游已经移除的旧界面（`accounts.earnable`、`runs.exit.*`、`config.redactedNotice` 等）。

`node tools/i18n-check.mjs --strict` 全绿：593/593 已翻译、259 处 `t()` 调用、无占位符错位、无冗余 key。

### 2.2 中文日志解析补丁：保留双语并叠加 v5 字段

上一版的补丁只覆盖 v4 中文日志的 11 条正则。这次是**把中文分支重新叠加到上游 v2.0.0 的新正则上**，
而不是用旧文件覆盖：

- 上游新增的 `status=` / `reason=` / `activities=` / `waitMs` / `interrupted` / `CONTROLLER` 全部保留；
- 中文分支（`开始处理账户` / `账户完成` / `全部账户完成` / `等待 … 秒` / `连续保护` …）一个不少；
- 取值下标同时兼容两种写法（例如 `fm[1] || fm[2]`），英文日志行为不变。

回归数据：对 4000 行真实容器日志逐行解析，得到 3974 条结构化事件，
覆盖 `account-start` / `account-end` / `account-delay` / `run-end` / `streak-protection` / `wrapper-*` 全部类型。

细节见 [docs/parser-zh.md](./parser-zh.md)。

### 2.3 三处本地适配（上游没有的）

| 改动 | 原因 |
| --- | --- |
| `public/vendor/phosphor/` 内置图标字体 | 账号状态轨道是**纯图标**的；上游从 `unpkg.com` 加载，CDN 被墙/超时的时候状态就完全看不见。内置 v2.1.1 的 CSS + woff2（约 220 KB），断网也能显示。 |
| `server.js` 补 `woff2/woff/ttf` MIME | 静态服务原来把字体当 `application/octet-stream` 返回，Chromium 会直接放弃加载，表现为图标全白。 |
| 页脚跟随语言 + `runAccountMap` 空状态防护 | 切换语言后页脚仍显示英文；首帧 `status` 未到时概览页会抛 `Cannot read properties of null`。 |

### 2.4 仓库历史与发布

- i18n 提交**整体 rebase 到上游 `v2.0.0`**，上游提交成为真正的祖先；
  以后 `git merge upstream/vX` 是正常三方合并，不用再重放历史。
- 旧历史完整保留在 `backup/v1.3.6-i18n` 分支（已推到 origin）。
- 新 tag `v2.0.0-i18n.1` → GitHub Actions 构建多架构镜像 → GHCR + GitHub Release。

---

## 3. 兼容性

| 能力 | 机器人 v4.3.2.4（本次实测） | 机器人 v5（按上游设计） |
| --- | --- | --- |
| 总览 / 账号 / 运行 / 日志 / 诊断 | ✅ | ✅ |
| 中文日志解析 | ✅ | ⚠️ 未实测（没有 v5 实例） |
| 配置页读写 | ✅ | ✅ |
| v5 专属配置项 | 显示「仅 v5」并置灰 | 可编辑 |
| 删除本地账号历史 | ✅ | ✅ |
| 单账号「仅运行」/ 批量运行 | ✅ | ✅ |
| 显示密钥 | ⚠️ 机器人支持，但本机 `API_ALLOW_CONFIG_REVEAL=false` | 需 `API_ALLOW_CONFIG_REVEAL=true` |

数据库：**自动迁移**，v1.3.6 的 `data/` 直接给新镜像用即可，回滚时旧镜像也能读（新增列会被忽略）。

---

## 4. 部署侧差异

| 项 | 上一版 | 本版 |
| --- | --- | --- |
| 镜像 | 本地构建 `rewards-dashboard:prewarm-desktop-login-20261008` | `ghcr.io/zpan2327/rewards-dashboard-i18n:v2.0.0-i18n.1` |
| `compose.yaml` | `image:` 指向上面的本地 tag | 指向 GHCR tag，旧 tag 作为回滚注释保留 |
| `compose.override.yaml` | 额外 `volumes:` 挂载 `lib/parser.js` | **已删除该挂载**（补丁进镜像，避免两份文件不一致） |
| 端口 / 网络 / 数据卷 | `8890:8890`、`rewards` 网络、`./data:/data` | 完全不变 |
| nginx 反代 | `location ^~ /MicrosoftRewards/` + 5 条 `sub_filter` | **配置不用改**；新增的 `/vendor/phosphor/` 同样会被 `href="/`、`src="/` 规则改写 |

---

## 5. 升级与回滚

升级（已在服务器执行过）：

```bash
cd /path/to/your-deploy-dir
docker compose stop rewards-dashboard
cp -a data data.bak-$(date +%Y%m%d-%H%M)      # 备份 SQLite
# 把 compose.yaml 的 image: 改成 ghcr.io/zpan2327/rewards-dashboard-i18n:v2.0.0-i18n.1
docker compose up -d
```

回滚：

```bash
cd /path/to/your-deploy-dir
# 把 image: 改回 rewards-dashboard:prewarm-desktop-login-20261008
docker compose up -d
```

---

## 6. 本次上线的验证清单

- `node tools/i18n-check.mjs --strict`：593/593 翻译、259 处 `t()`、0 警告；
- 全部前端/后端 JS 过 `node --check`；
- 4000 行真实日志解析回归：3974 条事件，类型齐全；
- Playwright（Chromium）：中/英切换、6 个页面、直连与 `/MicrosoftRewards/` 子路径两种访问方式，
  **0 控制台报错、0 CDN 请求**，图标字体 `Phosphor: loaded`，`.ph` 图标宽度 12px；
- nginx：用**与线上完全一致**的 `sub_filter` 规则起了临时实例复刻，页面内所有 `href/src` 都被正确加上前缀，
  模块、SSE、`/api/` 全部工作；
- 生产容器：`/api/health` 四项全 true，账号数、历史积分与运行记录均完整；
  中/英界面、账号页、运行页、配置页均已逐页人工核对截图。

---

## 7. 已知限制

1. **v5 机器人没有实测**：本机没有 v5 实例，v5 相关逻辑按上游代码与日志格式实现，
   配置页的 v5 项在 v4 下只做展示+置灰，不会误写。
2. **内置 Phosphor 是 2.1.1 快照**：上游升级图标时不会自动跟随，需要手动替换
   `public/vendor/phosphor/` 下的 `style.css` 与 `Phosphor.woff2`。
3. **emoji 在无 emoji 字体的环境显示豆腐块**：`🏅`、`🔥` 由系统字体渲染，
   Windows/macOS/手机都正常，只有精简的无头容器会缺字；这是截图环境的限制，不是界面 bug。
4. **`prewarmDesktopLogin` 没有版本标签**：它是机器人端较新的字段，上游 `TOGGLE_GROUPS` 里还没有对应的
   v5 标记，所以走「动态回退显示」，v4/v5 下都能看到；等上游补标记后会自动跟随。

---

## 8. v2.0.1-i18n.1（2026-10-23）

这一版只改界面文案，接口、数据结构、解析器、部署方式全部不变：

| 变化 | 说明 |
| --- | --- |
| **默认语言改为简体中文** | 浏览器没有保存过语言选择时，首次打开直接是中文，`<html lang>` 与日期格式同步为 `zh-CN`；选过 English 的浏览器仍按记忆显示英文（记忆优先于默认值）。 |
| **主题下拉框汉化** | 13 个主题名进入字典（`themes.*`）：默认、卡布奇诺、德古拉、常青森林、墨纸、灰盒、神奈川、神奈川·浪、北境、玫瑰松、科学、日光、东京夜。英文界面仍显示原名；中文界面下 `<option title>` 保留英文原名，鼠标悬停或查 DOM 都能对照。 |
| **补齐 5 个状态标签** | `pill.full / partial / skipped / stalled / sleeping` 之前只在 `util.js` 的 `PILLS` 表里引用了 key、字典里没有条目，`#runs` 页会原样显示 `pill.stalled`。现在是 已满 / 部分完成 / 已跳过 / **已停滞** / 休眠中。 |
| 字典规模 | 593 → 611 条（+18），`node tools/i18n-check.mjs --strict` 全绿。 |

升级不需要迁移数据；回滚到 `v2.0.0-i18n.1` 即可（两个镜像的数据卷格式相同）。
