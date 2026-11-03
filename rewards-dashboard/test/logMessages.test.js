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
