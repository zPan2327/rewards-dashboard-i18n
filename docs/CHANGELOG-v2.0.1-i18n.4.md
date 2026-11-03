# v2.0.1-i18n.4 — 实机日志第 4 批补齐

> 配套脚本：**[zPan2327/Microsoft-Rewards-Script-Ch](https://github.com/zPan2327/Microsoft-Rewards-Script-Ch) `5.0.0-ch.2`** — 两者配套使用。

## 目标

**除专业名词外全部中文化**。专业名词保留原文，方便复制到 issue 排查：
`SIGTERM`、`page.waitForURL`、`browserContext.cookies`、`Storage.getCookies`、
`config.json`、`PATCH`、URL 路径、十六进制 id。

## 新增词条（40+ 短语 / 25+ 字段名）

| 类别 | 例子 |
| --- | --- |
| 运行生命周期 | 运行已启动（进程号 N）/ 正在停止运行（SIGTERM）/ 运行已取消（代码 N）/ 全部账户已处理完毕 |
| 搜索 | 开始 Bing 搜索 / 剩余搜索积分 / 第 N/M 次搜索失败，重试前重新加载 Bing / Bing 搜索重试 N 次后仍失败 |
| 阅读赚积分 | 浏览器端「阅读赚积分」不可用，改用应用 API / 改用「阅读赚积分」API 兜底 / 「阅读赚积分」获得积分 |
| 打卡与促销 | 打卡子任务 / 子步骤未完成 / 开始处理「更多促销」条目 / 不支持的促销类型 |
| 配额与奖励 | 移动端搜索配额 / 桌面端搜索配额 / 配额不可用 / 可领取奖励积分无法确认，跳过领取请求 |
| 登录 | 在 account.live.com/interrupt/passkey/enroll 遇到未知状态，等待中 |
| 风控 | 检测到微软机器人评分警告 |
| 配置 | 未找到 config.json，已按内置默认值生成于… / config.json 已通过 API 更新（PATCH），下次运行生效 |

## 修掉的三个结构性 bug

1. **引号内嵌 ` | ` 把分段切碎**
   `reason="… | query=… | page.waitForURL: …"` 里的分隔符导致后续字段名全部漏翻。
   → 新增 `splitSegments()`，按引号感知切分。
2. **中英混排取值整段跳过**
   `reason="Punchcard child: step incomplete; … | query="九寨沟" | …"` 里既有英文模板又有中文查询词。
   → 新增 `translateValueParts()`，保留分隔符、只翻不含中文的子段。
3. **混排行只翻取值不翻键名 / 值含中文时整段跳过**
   `pointsGained=17`、`query="九寨沟"` 这类键名漏翻。
   → 键名与取值分别处理，取值已是中文时仍翻键名。

另：`{rest}` 尾巴过片段表、`Timeout Nms exceeded` 通用替换、具体模式优先于通用模式。

## 覆盖率（实机 692 行，严格口径）

| 级别 | 覆盖率 |
| --- | --- |
| debug | **100%** |
| info | 91.8% |
| warn | 54.8% |
| error | 18.2% |
| **合计** | **93.5%**（补前 82.4%） |

warn/error 里残留的英文**全部是上述专业名词**（SIGTERM、Playwright API 名、URL、十六进制 id），
按约定不翻译。

## 测试

`npm test` **18/18**（新增 3 例：引号内分隔符、中英混排取值、新模板批量）。
`npm run i18n:check` 612/612。

## 升级

```bash
docker pull ghcr.io/zpan2327/rewards-dashboard-i18n:v2.0.1-i18n.4
```

## 链接

- 本仓库：<https://github.com/zPan2327/rewards-dashboard-i18n>
- 配套脚本：<https://github.com/zPan2327/Microsoft-Rewards-Script-Ch>
- 日志中文化设计：[docs/i18n.md](https://github.com/zPan2327/rewards-dashboard-i18n/blob/main/docs/i18n.md)
