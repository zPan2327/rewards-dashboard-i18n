/**
 * 日志正文（`message`）→ 中文渲染。
 *
 * 与 `logTitles.js` 同一思路：日志数据保持英文原样（`lib/parser.js`、日志搜索、
 * CSV 导出都靠英文关键词与 `key=value` 匹配），只在**渲染时**查字典替换。
 *
 * 为什么不是逐句翻译：
 *   一轮真实运行的 472 行日志里有 207 个不同模板，逐句翻既跟不上上游更新，
 *   也会让「没见过的日志」永远是英文。而其中一半以上是结构化形态：
 *
 *       Account balance observed | currentBalance=18457 | initialPoints=18457
 *
 *   所以拆成两个有限集合去翻：**前缀短语** + **字段名**。
 *   值是标识符或数字（`offerId=ENWW_...`、`currentBalance=18457`），照原样保留。
 *
 * 占位符：
 *   {n}   数字（含小数）
 *   {s}   单个非空白 token（邮箱、路径、时区等）
 *   {rest} 行尾剩余内容
 */

const PHRASES = [
  // ── 启动 / 配置 ────────────────────────────────────────────────
  ["Starting Microsoft Rewards Script", "启动微软奖励脚本"],
  ["Config ready.", "配置就绪"],
  ["config.json is up to date.", "config.json 已是最新"],
  ["Applied {n} override(s).", "已应用 {n} 项配置覆盖"],
  ["Scheduler started (TZ={s})", "调度器已启动（时区={s}）"],
  ["Applied env schedule: {rest}", "已应用环境变量调度：{rest}"],
  ["Starting Control API on {s}", "启动控制接口：{s}"],
  ["Found {n} account(s) in environment", "环境变量中发现 {n} 个账号"],
  ["Starting run: {rest}", "开始运行：{rest}"],
  ["Run started (pid {n}).", "运行已启动（进程 {n}）"],
  [
    "Browser mode enabled - starting desktop-first, trying Daily Set and More Rewards in the flyout before /earn fallbacks, and using rendered controls for web activities.",
    "浏览器模式已启用：先走桌面端，在 flyout 里尝试每日任务与更多奖励，再回落到 /earn，网页任务使用页面渲染控件"
  ],

  // ── 账号 ───────────────────────────────────────────────────────
  ["Starting account: {s}", "开始处理账号：{s}"],
  ["Finished account: {s}", "账号处理结束：{s}"],
  ["Completed all accounts", "所有账号处理完成"],
  ["Account balance observed", "账户余额"],
  ["Account information observed", "账号信息"],

  // ── 登录 ───────────────────────────────────────────────────────
  ["Starting login process", "开始登录"],
  ["Successfully logged in", "登录成功"],
  ["Selecting Microsoft Authenticator sign-in", "选择 Microsoft Authenticator 登录"],
  ["Please approve login on your authenticator app", "请在 Authenticator 上批准登录"],
  ["Waiting for approval... (timeout after {n} seconds)", "等待批准…（{n} 秒后超时）"],
  ["Still waiting... ({n}/{n} seconds elapsed)", "仍在等待…（{n}/{n} 秒）"],
  ["Approval detected", "已检测到批准"],
  ["Login approved successfully", "登录批准成功"],
  ["State check iteration {n}/{n}", "登录状态检查 {n}/{n}"],
  ["Accepting KMSI prompt", "接受「保持登录」提示"],
  ["Skipping Passkey prompt", "跳过 Passkey 提示"],
  [
    "Discarding saved cookies because the paired fingerprint is unavailable or incompatible",
    "丢弃已保存的 Cookie：配对指纹缺失或不兼容"
  ],
  ["Entering email", "输入邮箱"],
  ["Email entered successfully", "邮箱已输入"],
  ["Entering password", "输入密码"],
  ["Password entered successfully", "密码已输入"],

  // ── 浏览器 ─────────────────────────────────────────────────────
  ["Desktop browser started", "桌面浏览器已启动"],
  ["Mobile browser started", "移动浏览器已启动"],
  ["Browser context closed", "浏览器上下文已关闭"],
  ["Browser was already closed.", "浏览器已关闭"],
  ["Mobile opened for: {s}", "已打开移动端：{s}"],
  ["No rendered visual-search activation control matched", "未找到可用的图片搜索激活控件"],

  // ── 任务 ───────────────────────────────────────────────────────
  ["Starting flyout task pass", "开始 flyout 任务轮"],
  ["Starting /earn task pass for remaining tasks", "开始 /earn 任务轮（剩余任务）"],
  ["Completed flyout and earn task passes", "flyout 与 /earn 任务轮完成"],
  ["Waiting before next task", "等待下一个任务"],
  ["Bing Search Streak completed today", "Bing 搜索连续天数今日已完成"],
  ["Daily Set Streak completed today", "每日任务连续天数今日已完成"],
  ["Bing App Streak completed today", "Bing 应用连续天数今日已完成"],
  [
    "Bing App Streak is already completed today; skipping Daily Check-In",
    "Bing 应用连续天数今日已完成，跳过每日签到"
  ],
  ["Claimable bonus points could not be verified; skipping claim request", "无法确认可领取的奖励积分，跳过领取"],
  ["Bonus point claim", "奖励积分领取"],
  ["Search perk", "搜索加成"],
  ["Streak protection", "连续保护"],
  ["Visual Search", "图片搜索"],
  ["Earnable today", "今日可获取"],
  ["App points available: {n}", "应用端可获取积分：{n}"],
  ["Search summary", "搜索汇总"],
  ["User data source unavailable", "用户数据源不可用"],
  ["Run partial (code {n}).", "运行部分完成（退出码 {n}）"],
  ["Applied {n} response cookie(s) and persisted the updated session", "已应用 {n} 个响应 Cookie 并保存会话"],
  ["Refreshed cookie cache", "刷新 Cookie 缓存"],

  // ── 搜索 ───────────────────────────────────────────────────────
  ["Queries acquired", "搜索词获取完成"],
  ["Search activity", "搜索任务"],
  ["Waiting before next search", "等待下一次搜索"],
  ["Scrolling results", "滚动搜索结果"],
  ["Clicked a result", "点击了一个结果"],
  ["Visit finished", "访问完成"]
];

const FIELDS = {
  // 通用
  status: "状态",
  reason: "原因",
  message: "消息",
  source: "来源",
  via: "经由",
  path: "路径",
  attempt: "尝试次数",
  total: "总数",
  level: "等级",
  warnings: "警告",
  activity: "任务",
  offerId: "任务ID",
  progress: "进度",
  page: "页面",
  pages: "页数",
  chunks: "分块",
  length: "长度",
  reportable: "可上报",

  // 积分 / 连续
  pointsGained: "获得积分",
  previousBalance: "运行前余额",
  currentBalance: "当前余额",
  initialPoints: "初始积分",
  pointsProgress: "积分类别进度",
  pointsRemaining: "剩余积分",
  bonus: "奖励",
  streak: "连续天数",
  streakCounter: "连续计数",
  durationSeconds: "用时(秒)",
  runtimeMinutes: "耗时(分钟)",
  accountsProcessed: "处理账号数",

  // 时间 / 会话
  waitMs: "等待毫秒",
  elapsedMs: "已耗时(毫秒)",
  remainingMs: "剩余(毫秒)",
  localDate: "本地日期",
  mobile: "移动端",
  desktop: "桌面端",
  shouldUseFingerprint: "需用指纹",
  savedFingerprintPresent: "已存指纹",
  profileMatch: "配置匹配",
  localeMatch: "语言匹配",

  // 任务 / 搜索
  expectedCards: "预期卡片",
  renderedCards: "已渲染卡片",
  maxSearches: "最大搜索次数",
  completedSearches: "已完成搜索"
};

/** 把 `{n}` / `{s}` / `{rest}` 模板编译成可复用正则。 */
function compile(pattern) {
  const slots = [];
  let source = "";
  for (let i = 0; i < pattern.length; i += 1) {
    if (pattern.startsWith("{n}", i)) {
      slots.push("n");
      source += "(-?\\d+(?:\\.\\d+)?)";
      i += 2;
    } else if (pattern.startsWith("{s}", i)) {
      slots.push("s");
      source += "(\\S+)";
      i += 2;
    } else if (pattern.startsWith("{rest}", i)) {
      slots.push("rest");
      source += "([\\s\\S]+)";
      i += 5;
    } else {
      source += pattern[i].replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    }
  }
  return { re: new RegExp(`^${source}$`), slots };
}

const COMPILED = PHRASES.map(([pattern, zh]) => ({ ...compile(pattern), zh }));

/** 按模板渲染成中文；未命中返回 null。 */
function renderPhrase(text) {
  for (const { re, slots, zh } of COMPILED) {
    const m = text.match(re);
    if (!m) continue;
    let i = 0;
    // 中文模板里的占位符按出现顺序依次替换为捕获到的值
    return zh.replace(/\{(?:n|s|rest)\}/g, () => m[++i] ?? "");
  }
  return null;
}

/** 只翻 `name=value` 里的字段名，值保持原样。 */
function renderFieldSegment(segment) {
  const m = segment.match(/^([A-Za-z][\w.]*)(\s*=\s*)([\s\S]*)$/);
  if (!m) return null;
  const zh = FIELDS[m[1]];
  if (!zh) return null;
  return `${zh}${m[2]}${m[3]}`;
}

/**
 * 把一条日志正文渲染成中文。
 *
 * 未命中任何规则时**原样返回** —— 宁可显示英文，也不要出现空串或半截文本，
 * 因此上游新增日志只会「保持英文」，不会让界面坏掉。
 */
export function translateLogMessage(message, localeId) {
  if (!message) return "";
  if (localeId !== "zh-CN") return message;

  // 已经是中文的行（机器人侧的中文摘要）原样返回，避免二次处理
  if (/[\u4e00-\u9fa5]/.test(message)) return message;

  const parts = String(message).split(" | ");
  let changed = false;

  const head = renderPhrase(parts[0]);
  if (head != null) {
    parts[0] = head;
    changed = true;
  }

  for (let i = 1; i < parts.length; i += 1) {
    const seg = renderFieldSegment(parts[i]);
    if (seg != null) {
      parts[i] = seg;
      changed = true;
    }
  }

  // 配置覆盖行（`.workers.doPunchCards = [set]`）没有短语也没有字段，
  // 只有末尾的标记需要中文化，因此单独判断一次。
  const hasMarker = /\[set\]|\(forced\)/.test(message);
  if (!changed && !hasMarker) return message;

  // 配置覆盖那类标记顺手中文化（键名本身保持原样，见 docs/i18n.md 的术语约定）
  return parts.join(" | ").replace(/\[set\]/g, "[已设置]").replace(/\(forced\)/g, "（强制）");
}

export default PHRASES;
