/**
 * 日志标题（logger 的 `title` 字段）→ 可读标签。
 *
 * 为什么单独放一个模块：
 *   - `locales/en.js` 是界面文案的唯一来源，但那 1000+ 行不该再被 80 个
 *     日志标签撑大；日志标题属于「运行期数据」的展示层，不是界面文案。
 *   - 日志行里的 `title` 仍保持英文原样（`lib/parser.js`、搜索框、CSV 导出
 *     都依赖它做匹配），本模块只负责把它渲染成人能读的标签。
 *
 * 约定：
 *   - 每项是 `[英文, 简体中文]`，英文即 is the source label（未翻译的语言回退到它）。
 *   - 未收录的标题原样返回（例如 v5 新增的中文摘要 `RUN-END-摘要`）。
 *   - 新增标题时只需在这里补一行，视图与解析代码都不用动。
 */

const TITLES = {
  // ── 运行与账号 ───────────────────────────────────────────────
  "RUN-START": ["Run start", "开始运行"],
  "ACCOUNT-START": ["Account start", "开始处理账号"],
  "ACCOUNT-INFO": ["Account info", "账号信息"],
  "ACCOUNT-BALANCE": ["Account balance", "账号余额"],
  "RUN-PLAN": ["Run plan", "运行计划"],
  POINTS: ["Points", "积分"],
  "REWARDS-MODE": ["Rewards mode", "运行模式"],
  "REWARDS-RESET": ["Rewards reset", "面板重置"],
  CONTROLLER: ["Run controller", "运行控制器"],
  FLOW: ["Task flow", "任务流程"],
  PROCESS: ["Process", "子进程"],
  SCHEDULE: ["Schedule", "定时任务"],
  ENTRYPOINT: ["Entrypoint", "容器入口"],
  API: ["Control API", "控制接口"],

  // ── 配置与会话 ───────────────────────────────────────────────
  "CONFIG-SYNC": ["Config sync", "配置同步"],
  "CONFIG-OVERRIDES": ["Config overrides", "配置覆盖"],
  SESSION: ["Session", "会话"],
  "SESSION-GENERATION": ["Session generation", "会话生成"],
  "COOKIE-SYNC": ["Cookie sync", "Cookie 同步"],
  BOOTSTRAP: ["Bootstrap", "启动准备"],

  // ── 浏览器 ───────────────────────────────────────────────────
  BROWSER: ["Browser", "浏览器"],
  "BROWSER-ENGINE": ["Browser engine", "浏览器引擎"],
  "BROWSER-FINGERPRINT": ["Browser fingerprint", "浏览器指纹"],
  "BROWSER-MODE": ["Browser mode", "浏览器模式"],
  "BROWSER-TIMEZONE": ["Browser timezone", "浏览器时区"],
  "BROWSER-TASKS": ["Browser tasks", "浏览器任务"],
  "CLOSE-BROWSER": ["Close browser", "关闭浏览器"],
  "PRE-BROWSER-CLOSE": ["Pre-close browser", "关闭前收尾"],
  "RELOAD-BAD-PAGE": ["Reload bad page", "重载异常页面"],
  "REACT-PARSE": ["Page data parse", "页面数据解析"],

  // ── 登录 ─────────────────────────────────────────────────────
  LOGIN: ["Login", "登录"],
  "LOGIN-APP": ["App login", "应用登录"],
  "LOGIN-BING": ["Bing login", "Bing 登录"],
  "LOGIN-CHECKPOINT": ["Login checkpoint", "登录安全检查"],
  "LOGIN-CODE": ["Login code", "登录验证码"],
  "LOGIN-ENTER-EMAIL": ["Enter email", "输入邮箱"],
  "LOGIN-ENTER-PASSWORD": ["Enter password", "输入密码"],
  "LOGIN-PASSWORDLESS": ["Passwordless login", "免密登录（验证器批准）"],
  "LOGIN-RECOVERY": ["Recovery email login", "备用邮箱验证"],
  "LOGIN-TOTP": ["TOTP login", "验证器验证码登录"],
  "DETECT-STATE": ["Login state detect", "登录状态识别"],
  "HANDLE-STATE": ["Login state handle", "处理登录状态"],
  "DISABLE-FIDO": ["Disable FIDO", "禁用 FIDO 验证"],
  "DISMISS-ALL-MESSAGES": ["Dismiss messages", "关闭提示弹窗"],

  // ── 任务 ─────────────────────────────────────────────────────
  "DAILY-SET": ["Daily set", "每日任务"],
  "DAILY-CHECK-IN": ["Daily check-in", "每日签到"],
  "MORE-PROMOTIONS": ["More promotions", "更多推广任务"],
  "APP-PROMOTIONS": ["App promotions", "应用推广任务"],
  PUNCHCARD: ["Punchcard", "打卡任务"],
  "PUNCHCARD-BROWSER": ["Punchcard (browser)", "打卡任务（浏览器）"],
  "PUNCHCARD-PROGRESS": ["Punchcard progress", "打卡进度"],
  "EARN-TASKS": ["Earn tasks", "赚取任务"],
  "READ-TO-EARN": ["Read to earn", "阅读赚积分"],
  "URL-REWARD-API": ["URL reward", "链接奖励"],
  "CLAIM-REWARD": ["Reward claim", "兑换奖励"],
  "CLAIM-BONUS-POINTS": ["Bonus points", "奖励积分领取"],
  "ENABLE-STREAK-PROTECTION": ["Streak protection", "连续保护"],
  STREAKS: ["Streaks", "连续天数"],
  "ACTIVATE-SEARCH-PERK-BROWSER": ["Search perk activation", "激活搜索加成"],

  // ── 任务结果 ─────────────────────────────────────────────────
  "ACTIVITY-RESULT": ["Activity result", "任务结果"],
  "ACTIVITY-DETAIL": ["Activity detail", "任务详情"],
  "ACTIVITY-ERROR": ["Activity error", "任务异常"],
  "TASK-DELAY": ["Task delay", "任务间隔"],

  // ── 搜索与取词 ───────────────────────────────────────────────
  "SEARCH-MANAGER": ["Search manager", "搜索管理"],
  "SEARCH-DELAY": ["Search delay", "搜索间隔"],
  "SEARCH-DETAIL": ["Search detail", "搜索详情"],
  "SEARCH-BING": ["Bing search", "Bing 搜索"],
  "SEARCH-BING-RELATED": ["Related searches", "相关搜索"],
  "SEARCH-BING-SUGGESTIONS": ["Search suggestions", "搜索建议"],
  "SEARCH-ON-BING-SEARCH": ["Search activity", "搜索任务"],
  "SEARCH-API-REPORT": ["Search API report", "搜索接口上报"],
  "SEARCH-CHINA": ["China hot search", "中国热搜取词"],
  "SEARCH-RSS": ["RSS queries", "RSS 取词"],
  "SEARCH-REDDIT": ["Reddit queries", "Reddit 取词"],
  "SEARCH-HACKERNEWS": ["Hacker News queries", "Hacker News 取词"],
  "VISUAL-SEARCH": ["Visual search", "图片搜索"],
  "VISUAL-SEARCH-BROWSER": ["Visual search (browser)", "图片搜索（浏览器）"],
  "GET-DASHBOARD-DATA": ["Dashboard data", "获取面板数据"],
  "GET-REWARD-SESSION": ["Reward session", "获取奖励会话"],
  "GET-APP-TOKEN": ["App token", "获取应用令牌"],

  // ── 集群与异常 ───────────────────────────────────────────────
  "CLUSTER-PRIMARY": ["Cluster primary", "集群主进程"],
  "CLUSTER-WORKER-START": ["Cluster worker start", "集群工作进程启动"],
  "CLUSTER-WORKER-DISCONNECT": ["Cluster worker lost", "集群工作进程断开"],
  "UNCAUGHT-EXCEPTION": ["Uncaught exception", "未捕获异常"],
  "UNHANDLED-REJECTION": ["Unhandled rejection", "未处理的 Promise 拒绝"],
};

/** 某个语言下该标题的标签；未收录返回 null。 */
function labelFor(title, localeId) {
  const entry = TITLES[title];
  if (!entry) return null;
  const [en, zh] = entry;
  return localeId === "zh-CN" ? zh || en : en;
}

/** 该标题是否已收录（供调用方决定要不要加悬停原文）。 */
export function hasLogTitle(title) {
  return Object.prototype.hasOwnProperty.call(TITLES, title);
}

/**
 * 把 `title` 渲染成当前语言的标签。
 *
 * 未收录的标题原样返回 —— 宁可显示 `SOME-NEW-TAG`，也不要显示 `undefined`
 * 或空标签。因此上游新增日志标题不会让界面坏掉。
 */
export function logTitleLabel(title, localeId) {
  if (!title) return "";
  return labelFor(title, localeId) || title;
}

export default TITLES;
