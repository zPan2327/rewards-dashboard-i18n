"use strict";

// 日志正文中文化的回归测试。
// logMessages.js 是 ESM，这里用动态 import 加载（本文件保持 CJS 以匹配 npm test 的 glob）。

const test = require("node:test");
const assert = require("node:assert/strict");

const load = () => import("../public/i18n/logMessages.js");

test("前缀短语按模板渲染，变量保留", async () => {
  const { translateLogMessage } = await load();
  assert.equal(
    translateLogMessage("Still waiting... (35/60 seconds elapsed)", "zh-CN"),
    "仍在等待…（35/60 秒）",
  );
  assert.equal(
    translateLogMessage("Applied 8 override(s).", "zh-CN"),
    "已应用 8 项配置覆盖",
  );
});

test("结构化正文：短语与字段名中文化，值保持原样", async () => {
  const { translateLogMessage } = await load();
  assert.equal(
    translateLogMessage(
      "Account balance observed | currentBalance=18457 | initialPoints=18457",
      "zh-CN",
    ),
    "账户余额 | 当前余额=18457 | 初始积分=18457",
  );
});

test("未命中的正文原样返回（不出现空串或半截文本）", async () => {
  const { translateLogMessage } = await load();
  const unknown = "Some brand new upstream message nobody translated yet";
  assert.equal(translateLogMessage(unknown, "zh-CN"), unknown);
});

test("已经是中文的行不再处理", async () => {
  const { translateLogMessage } = await load();
  const zh = "本轮结束 | 状态=部分完成 | 账户=1/1";
  assert.equal(translateLogMessage(zh, "zh-CN"), zh);
});

test("英文界面不翻译", async () => {
  const { translateLogMessage } = await load();
  const en = "Applied 8 override(s).";
  assert.equal(translateLogMessage(en, "en"), en);
});

test("配置覆盖行的标记中文化，键名保持原样", async () => {
  const { translateLogMessage } = await load();
  assert.equal(
    translateLogMessage(".workers.doPunchCards = [set]", "zh-CN"),
    ".workers.doPunchCards = [已设置]",
  );
});

test("空值安全", async () => {
  const { translateLogMessage } = await load();
  assert.equal(translateLogMessage("", "zh-CN"), "");
  assert.equal(translateLogMessage(null, "zh-CN"), "");
});

// ── 双语模式契约：两个方向都不许互串 ────────────────────────────────

test("English 模式：正文一律不改动（不出现中文）", async () => {
  const { translateLogMessage } = await load();
  const samples = [
    "Applied 8 override(s).",
    "Account balance observed | currentBalance=18457 | initialPoints=18457",
    "Current state: LOGIN_PASSWORDLESS",
    "Still waiting... (35/60 seconds elapsed)",
  ];
  for (const s of samples) {
    const out = translateLogMessage(s, "en");
    assert.equal(out, s, `English 模式不应改动: ${s}`);
    assert.ok(!/[\u4e00-\u9fa5]/.test(out), `English 模式不应出现中文: ${out}`);
  }
});

test("简体中文模式：常见日志不留整句英文", async () => {
  const { translateLogMessage } = await load();
  const samples = [
    "Applied 8 override(s).",
    "Account balance observed | currentBalance=18457 | initialPoints=18457",
    "Current state: LOGIN_PASSWORDLESS",
    "Task delay checked | activity=doDailySet | waitMs=10424",
    "Dismissed: cookie consent banner (Accept)",
  ];
  for (const s of samples) {
    const out = translateLogMessage(s, "zh-CN");
    assert.notEqual(out, s, `简体中文模式应翻译: ${s}`);
    assert.ok(/[\u4e00-\u9fa5]/.test(out), `简体中文模式应有中文: ${out}`);
  }
});

test("简体中文模式：已经是中文的行保持原样（不二次处理）", async () => {
  const { translateLogMessage } = await load();
  const zh = "本轮结束 | 状态=部分完成 | 账户=1/1";
  assert.equal(translateLogMessage(zh, "zh-CN"), zh);
  assert.equal(translateLogMessage(zh, "en"), zh, "数据层是中文时，英文界面也不改它（由视图层隐藏）");
});

// ── 混排行与尾句：不能被 {rest} 贪婪吞掉 ──────────────────────────

test("中文摘要行里的英文取值要就地翻译，纯中文取值不动", async () => {
  const { translateLogMessage } = await load();
  const mixed =
    "账户结束 | 账户=a@b.com | 状态=部分完成 | 原因=Visual Search: Offer activation could not be started because its rendered control was not found";
  const out = translateLogMessage(mixed, "zh-CN");
  assert.ok(out.includes("原因=图片搜索：未找到渲染控件，无法开始任务激活"), out);
  assert.ok(!out.includes("could not be started"), out);

  const pure = "本轮结束 | 状态=部分完成 | 账户=1/1 | 获得积分=480";
  assert.equal(translateLogMessage(pure, "zh-CN"), pure);
});

test("英文标签 + 中文取值：只翻标签", async () => {
  const { translateLogMessage } = await load();
  const out = translateLogMessage("Available sign-in methods: 批准登录请求", "zh-CN");
  assert.equal(out, "可用登录方式：批准登录请求");
});

test("短语里的 {rest} 尾巴也要翻（遇到句号再切一次）", async () => {
  const { translateLogMessage } = await load();
  const out = translateLogMessage(
    "App-only API exceptions enabled in browser mode: doDailyCheckIn, doAppPromotions. These workers still obtain an app access token and use the Microsoft Rewards app-platform API.",
    "zh-CN",
  );
  assert.ok(out.startsWith("浏览器模式下仅走 API 的任务例外：doDailyCheckIn"), out);
  assert.ok(out.includes("这些任务仍会获取应用访问令牌"), out);
  assert.ok(!out.includes("These workers"), out);
});

test("中文摘要里的英文计数尾巴要本地化", async () => {
  const { translateLogMessage } = await load();
  const out = translateLogMessage(
    "账号处理结束 | 任务数：1 completed, 3 incomplete, 2 unavailable, 2 not applicable",
    "zh-CN",
  );
  assert.equal(out, "账号处理结束 | 任务数：已完成 1、未完成 3、不可用 2、不适用 2");
});

test("带引号的 reason 值也要逐段翻译", async () => {
  const { translateLogMessage } = await load();
  const out = translateLogMessage(
    'Finished account: a@b.com | status=partial | reason="Visual Search: claimable bonus unknown; Bonus point claim: claimable bonus unknown"',
    "zh-CN",
  );
  assert.ok(out.includes('原因="图片搜索：可领取奖励未知；奖励积分领取：可领取奖励未知"'), out);
});

// ── 实机第 4 批：引号内分隔符 / 中英混排取值 / 贪婪 rest ─────────────

test("引号内的 ` | ` 不能把分段切碎（reason 内嵌整条错误）", async () => {
  const { translateLogMessage } = await load();
  const out = translateLogMessage(
    'Finished account: a@b.com | pointsGained=17 | status=partial | reason="Punchcard child: step incomplete; Search: Bing search failed after 5 attempt(s) | query="九寨沟" | page.waitForURL: Timeout 42910ms exceeded." | activities: 3 completed, 5 incomplete, 2 unavailable, 1 not applicable',
    "zh-CN",
  );
  // 引号外的字段名必须翻，引号内嵌的 ` | ` 不能切碎
  assert.ok(out.includes("获得积分=17"), out);
  assert.ok(out.includes("状态=部分完成"), out);
  assert.ok(out.includes("原因="), out);
  assert.ok(out.includes("打卡子任务：子步骤未完成"), out);
  assert.ok(out.includes("任务数：已完成 3"), out);
});

test("中英混排的取值逐段翻译，中文子段原样保留", async () => {
  const { translateLogMessage } = await load();
  const out = translateLogMessage(
    'reason="Mobile search quota: quota unavailable; Search: Bing search failed | query="九寨沟" | page.waitForURL: Timeout 42910ms exceeded."',
    "zh-CN",
  );
  assert.ok(out.includes("移动端搜索配额：配额不可用"), out);
  assert.ok(out.includes("九寨沟"), "中文查询词必须原样保留");
  assert.ok(out.includes("page.waitForURL：超时 42910ms"), out);
});

test("阅读赚积分 / 搜索配额 / 打卡子任务等新模板", async () => {
  const { translateLogMessage } = await load();
  const samples = [
    ["Read to Earn | completed | points earned: 9", "阅读赚积分"],
    ["Mobile search quota | completion not confirmed | quota unavailable", "移动端搜索配额"],
    ["Punchcard child | completion not confirmed | step incomplete", "打卡子任务"],
    ["Stopping run (SIGTERM)…", "正在停止运行"],
    ["SIGTERM received; closing sessions and flushing output", "正在关闭会话"],
    ["Unknown state at account.live.com/interrupt/passkey/enroll, waiting", "遇到未知状态"],
    ["Waiting 142.9 seconds before starting the next account (a@b.com)", "等待 142.9 秒后开始下一个账户"],
    ["Microsoft bot-score warning detected", "检测到微软机器人评分警告"],
  ];
  for (const [raw, want] of samples) {
    const out = translateLogMessage(raw, "zh-CN");
    assert.ok(out.includes(want), `${raw} => ${out}`);
  }
});
