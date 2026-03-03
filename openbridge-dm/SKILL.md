# OpenBridge Discord DM 支持 Skill

## 作用
为 OpenBridge 添加 Discord 私信（DM）支持，用户可以直接给机器人发私信

## 原理
OpenBridge 原版只支持服务器频道，不支持私信
通过 monkey-patch 方式修改 Discord 适配器，添加 DM 支持

## 修改内容

1. 添加 DirectMessages 意图（Gateway Intent）
2. 修改消息处理逻辑，DM 中直接使用 channelId 作为 threadId
3. 自动为每个 DM 用户创建会话

## 使用方法

### 测试模式（与原版共存）
./start-dm.sh

### 排查
tail -f ~/.openbridge-ai/dm.log

## 注意事项
- 需要在 Discord Developer Portal 开启 Message Content Intent
- DM 会占用独立的会话，消耗额外的 Claude API 配额
- 测试确认正常后再考虑替换原版
