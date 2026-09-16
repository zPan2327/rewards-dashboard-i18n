# 中文日志解析补丁（总览数据修复）

本仓库在 i18n 之外，**额外维护了一处对 `lib/parser.js` 的补丁**，用于让总览页正确解析中文日志。
这份文档说明它为什么存在、改了什么，以及在跟随上游更新时如何保住它。

> 对应提交：`23e5a67` `fix: parser 兼容中文日志，修复总览数据解析`
> 对应文件：`rewards-dashboard/lib/parser.js`

---

## 1. 现象

仪表盘的「总览」页大面积空白：没有运行记录、没有账户列表、没有历史曲线，只有零星几条数据。

同时，配套的 `microsoft-rewards-script` 机器人那一侧**一切正常** ——
它的 Control API `/accounts`、`/status` 都能返回完整的账户与积分数据。

也就是说：**数据是有的，只是没被解析出来。**

## 2. 根因

仪表盘不直接读机器人的数据库，它通过 Control API 的 SSE 流（`/events`）接收日志，
再用 `lib/parser.js` 把**日志文本**解析成结构化事件，写进自己的 SQLite。

问题就出在这一步：`lib/parser.js` 里的正则**只认英文**，例如：

```js
/^Starting account:\s(\S+)\s\|\sgeoLocale:\s([^|]+?)\s*(?:\|.*)?\s*$/
/^Completed account:\s(\S+)\s\|\spointsGained=(-?\d+)\s\|\spreviousBalance=(\d+)\s\|...
```

而机器人 `V4-china` 分支已经把日志**全部中文化**了：

```
[ACCOUNT-START] 开始处理账户: account1@example.com | geoLocale: CN | locale: zh-CN
[ACCOUNT-END]   账户完成: account1@example.com | 获得积分=50 | 原余额=5292 | 现余额=5342 | 持续秒数=7163.8
[RUN-START]     启动微软奖励脚本 | v4.3.2.3 | 账户数: 4 | 集群数: 2
```

英文正则匹配不到中文行 → 结构化事件数为 0 → 总览页自然什么都没有。

**这是一个「契约不一致」问题**：机器人 `scripts/api/logParser.js` 是中文感知的，
而仪表盘这一份是英文专用的，两边对同一份日志文本的约定不同。

> ⚠️ 注意：**机器人侧的 `scripts/api/logParser.js` 才是契约来源**。
> 它解析中文日志，机器人的 `/accounts`、`/status` 统计全靠它。
> 所以「把机器人换成英文镜像」并不能解决问题 —— 那会反过来让机器人自己的统计挂掉。

## 3. 修复内容

让 `lib/parser.js` 的每条正则**同时接受英文与中文两种写法**，中文侧字段名与
机器人 `scripts/api/logParser.js` 完全对齐。

共 11 条正则 + 3 处取值下标修正：

| 事件 | 中文侧日志 |
| --- | --- |
| `RUN_START` | `启动微软奖励脚本 \| v4.3.2.3 \| 账户数: 4 \| 集群数: 2` |
| `RUN_END` | `全部账户完成 \| 处理账户数=4 \| 获得积分=... \| 原余额=... \| 现余额=... \| 运行分钟数=...` |
| `ACCOUNT_START` | `开始处理账户: ... \| geoLocale: CN` |
| `ACCOUNT_END` | `账户完成: ... \| 获得积分=... \| 原余额=... \| 现余额=... \| 持续秒数=...` |
| `ACCOUNT_ERR` | `<email>: <错误>` / `<email> \| 错误=<...>` |
| `FLOW_FAILED` | `... 的移动端流程失败: ...` |
| `ACCOUNT_DELAY` | `等待 123 秒后开始下一个账户` |
| `STREAK_PROTECTION` | `快照完成 \| offers=... \| 可上报=... \| streaks=... \| 连续保护已启用=... \| 连续保护剩余天数=... \| 连续计数=... \| 等级=... \| 账户=...` |
| `LOGIN_NUMBER` | `请批准登录并选择数字: 42` |
| `CLUSTER_WORKER_EXIT` | `worker 3 退出 \| 代码: 0 \| 信号: ... \| 活跃worker数: 1` |

写法上统一成「英文在前、中文在后」的二选一，例如：

```js
const ACCOUNT_START_RE =
  /^(?:Starting account|开始处理账户):\s(\S+)\s\|\sgeoLocale:\s([^|]+?)\s*(?:\|.*)?\s*$/
```

因为中文分支多了一个捕获组，取值下标要跟着调整：

```js
email: fm[1] || fm[2],
error: fm[3],
```

英文分支下 `fm[2]` / `fm[3]` 为 `undefined`，回退到原来的 `fm[1]` / `fm[2]`，**英文行为不变**。

## 4. 验证结果

在一份 1655 行的真实机器人日志上跑修复前后的对比：

| | 修复前 | 修复后 |
| --- | --- | --- |
| 解析出的结构化事件 | 1 | 18 |
| `/api/runs` | `[]` | 有完整运行记录 |
| 账户状态 `observed` | — | 3 个账户全部 true |
| 账户历史 | 空 | 已填充 |
| 连续保护字段 | — | 与 Control API `/accounts` 完全一致 |

线上验证方式（单文件挂载，不重建镜像）：

```yaml
services:
  rewards-dashboard:
    volumes:
      - /path/to/rewards-dashboard-i18n/rewards-dashboard/lib/parser.js:/usr/src/rewards-dashboard/lib/parser.js:ro
```

> 挂载后**必须清掉 SQLite 里的事件游标**才会回填。
> 因为 `store.js` 会记住最后一条事件的 `ts`，重启时丢弃所有 `ts <= _lastTs` 的旧事件
> （见 `store.js` 中恢复 `_lastTs` 与丢弃重放事件的两处逻辑）。
> 不清游标的话，即使解析修好了，历史数据也不会补回来。

## 5. 跟随上游更新时如何保住它

这份补丁只改了 `lib/parser.js` 一个文件，所以：

```bash
# 1. 正常同步上游
git remote add upstream https://github.com/mgrimace/rewards-dashboard.git
git fetch upstream --tags
git merge upstream/v1.3.7

# 2. 检查 parser 是否被上游覆盖
grep -c "开始处理账户" rewards-dashboard/lib/parser.js

# 3. 如果输出 0，说明被覆盖了，需要重新应用本补丁
```

被覆盖时的判断方法：打开 `rewards-dashboard/lib/parser.js`，
如果正则里只有 `Starting account` 没有 `开始处理账户`，就是丢补丁了。

## 6. 相关文件

| 文件 | 作用 |
| --- | --- |
| `rewards-dashboard/lib/parser.js` | 本补丁的修改对象 |
| 机器人 `scripts/api/logParser.js` | **契约来源**，中文日志的权威定义 |
| `rewards-dashboard/lib/store.js` | 事件写入 SQLite；游标决定能否回填历史 |
