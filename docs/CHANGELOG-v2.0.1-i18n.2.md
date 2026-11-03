# v2.0.1-i18n.2 发布说明

> **Rewards Dashboard（简体中文 / i18n 版）** —— [`mgrimace/rewards-dashboard`](https://github.com/mgrimace/rewards-dashboard) 的多语言分支。
>
> 本版本与 **[zPan2327/Microsoft-Rewards-Script-Ch](https://github.com/zPan2327/Microsoft-Rewards-Script-Ch)**（配套脚本）**配套使用**。

| | |
| --- | --- |
| 版本 | `v2.0.1-i18n.2` |
| 发布日期 | 2026-11-03 |
| 配套脚本 | [Microsoft-Rewards-Script-Ch `5.0.0-ch.2`](https://github.com/zPan2327/Microsoft-Rewards-Script-Ch/releases/tag/v5.0.0-ch.2) |
| 上游基线 | [`mgrimace/rewards-dashboard`](https://github.com/mgrimace/rewards-dashboard) |
| 许可证 | MIT |
| 镜像 | `ghcr.io/zpan2327/rewards-dashboard-i18n:v2.0.1-i18n.2` |

---

## 本次新增：日志中文化

之前版本只有**界面文案**是中文，日志正文仍是英文原文。这个版本把日志也中文化了。

### 为什么放在仪表盘侧

脚本侧刻意保持日志原文，有两个硬理由：

1. **解析依赖英文原文**：`lib/parser.js` 用 17 处英文正则匹配日志
   （`points earned:`、`8 completed, 6 incomplete` 等），改写正文会让活动明细 / 积分 / 连续天数三张表变空。
2. **可复制性**：日志要能直接复制到 issue 里排查，翻译后反而不便对照上游。

因此中文化做成**展示层字典**——只改渲染，不动数据。`message` 字段、CSV 导出、parser、搜索索引全都保持英文原文。

### 架构

| 文件 | 职责 |
| --- | --- |
| `public/i18n/logTitles.js` | 日志标题字典（`RUN-START` → 「开始运行」） |
| `public/i18n/logMessages.js` | 正文字典：短语模板 + 占位符、字段名、枚举值、整段、状态机 |
| `public/i18n/index.js` | `logTitle()` / `logMessage()`，跟随界面语言 |
| `public/views/logs.js` | 渲染接入：按语言显示、悬停显示英文原文、搜索双语匹配 |

翻译规则是**可预测的**：

- 短语模板带占位符（`{n}` `{s}` `{rest}` `{state}`），命中才替换，命不中原样返回；
- `localeId !== "zh-CN"` 直接原样返回 —— English 模式**不会出现中文**；
- 已是中文的行跳过，避免二次处理；
- 未收录的新日志只会「保持英文」，绝不会出现空串或半截文本。

### 双语模式契约

| 模式 | 行为 |
| --- | --- |
| **English** | 界面与日志全英文，不出现任何中文 |
| **简体中文** | 界面与日志全中文，不出现英文整句 |

仅有的例外是**不该翻的值**：路径、版本号、请求头、平台标识、任务 ID、配置键名
（`.workers.doPunchCards` 这类要复制回 `config.json` 用的）。这些翻掉反而有害。

### 覆盖率

按实机 855 行日志（info 91 / warn 20 / debug 744）严格口径统计
（译后仍残留成段英文即不算通过）：

| 级别 | 覆盖率 |
| --- | --- |
| warn | **100%** |
| info | 93.9% |
| debug | 93.9% |
| **合计** | **94.1%** |

剩余全部是路径 / 版本号 / 请求头 / 任务 ID / 枚举码等不可译内容。

### 本次修复的结构性漏网

真实日志暴露的四类问题（都不是「缺词条」）：

| 现象 | 例子 | 处理 |
| --- | --- | --- |
| `{rest}` 吞掉后续整句 | `…例外：a, b. These workers still …` | 译完句头后再按句号切一次 |
| 中文行里挂着英文取值 | `原因=Visual Search: claimable bonus unknown` | 按 `; ` 拆段就地翻译 |
| 英文标签 + 中文取值 | `Available sign-in methods: 批准登录请求` | 只翻标签 |
| 计数尾巴未本地化 | `任务数：1 completed, 3 incomplete, …` | 整段换「已完成 1、未完成 3…」 |

---

## 测试

- `npm test`：**15 例全通过**，含 5 例双语模式契约
  （English 不出中文、简体中文不出英文整句、混排行、贪婪尾句、计数尾巴）
- `npm run i18n:check`：界面文案 611/611 全翻译，占位符全部对齐

---

## 安装

```bash
docker pull ghcr.io/zpan2327/rewards-dashboard-i18n:v2.0.1-i18n.2
```

或从源码：

```bash
git clone https://github.com/zPan2327/rewards-dashboard-i18n.git
cd rewards-dashboard-i18n
git checkout v2.0.1-i18n.2

cp .env.example .env   # API_TOKEN 必须与脚本侧 Control API 完全一致
docker compose up -d --build
```

### 与配套脚本一起跑

```bash
# 脚本侧（Control API）
docker pull ghcr.io/zpan2327/microsoft-rewards-script-v5:5.0.0-ch.2

# 仪表盘侧
docker pull ghcr.io/zpan2327/rewards-dashboard-i18n:v2.0.1-i18n.2
```

两个容器放同一个 Docker 网络，仪表盘用 `CONTROL_API_URL=http://microsoft-rewards-script:3010`
和相同的 `API_TOKEN` 即可对接。详细步骤见
[脚本侧的发布说明](https://github.com/zPan2327/Microsoft-Rewards-Script-Ch/blob/v5-china/docs/release-notes-v5.0.0-ch.2.md)。

---

## 安全提示

- `.env.example` 里只有占位符，真实 `API_TOKEN` 请写在本地 `.env`（已 `.gitignore`），**不要提交**。
- `API_TOKEN` 请使用长随机串，脚本与仪表盘必须一致。
- 日志中文化只影响显示；CSV 导出与 API 返回的 `message` 仍是英文原文，可能包含邮箱、路径与账号标识，对外分享前请自行脱敏。

---

## 链接

- 本仓库：<https://github.com/zPan2327/rewards-dashboard-i18n>
- 配套脚本：<https://github.com/zPan2327/Microsoft-Rewards-Script-Ch>
- 日志中文化设计：[docs/i18n.md](../docs/i18n.md)
- 中文日志解析补丁：[docs/parser-zh.md](../docs/parser-zh.md)
- 上游项目：<https://github.com/mgrimace/rewards-dashboard>
