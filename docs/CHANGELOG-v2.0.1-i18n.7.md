# v2.0.1-i18n.7

配套脚本：**5.0.0-ch.4**（修复中国大陆环境下的 Bing 搜索超时，并修正移动搜索配额口径）

## 新增译文

| 原文（`message` 字段，保持英文）                                                            | 中文渲染                                 |
| ------------------------------------------------------------------------------------------- | ---------------------------------------- |
| `Not offered in the latest account data; the service did not provide an eligibility reason` | 该账号最新数据中未提供此活动（服务端未给出原因） |

## 背景

配套脚本 ch.4 起，账号数据里没有 `mobileSearch` 计数时（中国区账号普遍如此），搜索配额记为
`skipped` / `offer-not-present`，日志原文由

```text
Mobile search quota | completion not confirmed | quota unavailable
```

变为

```text
Mobile search quota | unavailable (skipped) | points earned: 0 | Not offered in the latest account data; ...
```

`unavailable (skipped)` 此前已有译文，缺的是这条新出现的原因句。本次补上后整行可完整中文化：

> 移动端搜索配额 | 不可用（已跳过） | 获得积分：0 | 该账号最新数据中未提供此活动（服务端未给出原因）

## 文档

- README 新增「界面预览」：截图更新为 `v2.0.1-i18n.7` + 脚本 `5.0.0-ch.4` 的实机画面（总览 / 实时日志 / 移动端）。
- `docs/Screenshot-dash.png`、`docs/Screenshot-mobile.png` 原为 v4.1.0 时代的英文界面，已一并替换；
  新增 `docs/Screenshot-logs.png`，展示「界面中文、数据层英文」的双语契约。

## 测试

`npm test` 22 项通过。新增用例断言该日志整行渲染为中文，且不再出现 `completion not confirmed`。
