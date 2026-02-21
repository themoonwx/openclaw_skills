---
name: openclaw-orchestrator
description: OpenClaw 任务编排器 - 提供任务队列、心跳检测、CC进程管理、运行时跟踪和事件钩子。适用于需要可靠任务执行、多阶段工作流和进程监控的场景。
---

# OpenClaw 任务编排器

一个功能完整的 OpenClaw 任务编排系统，提供任务队列、心跳检测、CC 进程管理和运行时跟踪功能。

## 功能特性

### 1. 任务编排器 (task-orchestrator.js)
- **运行时跟踪**：详细的任务执行日志和进度百分比
- **状态持久化**：Redis + 文件双存储
- **事件钩子**：任务开始/进度/完成/失败/重试回调
- **多阶段任务**：支持步骤式任务执行

### 2. 心跳服务 (heartbeat.js)
- **10秒间隔心跳**：定期检测系统状态
- **CC 存活检测**：30秒超时自动重启
- **自动恢复**：进程异常时自动重启
- **状态查询**：实时查看心跳状态

### 3. CC 进程管理器 (cc-manager.js)
- **进程生命周期**：启动/停止/重启
- **健康检测**：进程状态监控
- **PID 管理**：进程 ID 持久化

### 4. Redis 任务队列 (task-queue-redis.js)
- **BullMQ 队列**：高性能任务队列
- **自动降级**：Redis 不可用时自动切换到文件队列
- **消费者模式**：支持任务拉取和处理

## 安装依赖

```bash
npm install bullmq ioredis
```

## 使用方法

### 任务编排器

```bash
# 创建任务
node task-orchestrator.js create <taskId> <data>

# 查看任务状态
node task-orchestrator.js status <taskId>

# 列出所有任务
node task-orchestrator.js list

# 测试事件钩子
node task-orchestrator.js hook-test
```

### 心跳服务

```bash
# 启动心跳服务
node heartbeat.js start

# 停止心跳服务
node heartbeat.js stop

# 查看状态
node heartbeat.js status

# 执行一次心跳检测
node heartbeat.js once
```

### CC 进程管理器

```bash
# 启动 CC
node cc-manager.js start

# 停止 CC
node cc-manager.js stop

# 重启 CC
node cc-manager.js restart

# 查看状态
node cc-manager.js status
```

### Redis 任务队列

```bash
# 添加任务
node task-queue-redis.js enqueue <任务名> <数据>

# 获取任务
node task-queue-redis.js dequeue

# 查看队列状态
node task-queue-redis.js stats
```

## 事件钩子示例

```javascript
// 注册自定义钩子
registerHook('onTaskStart', (taskId, data) => {
  console.log(`🎯 任务 ${taskId} 开始执行`);
});

registerHook('onTaskProgress', (taskId, { percent, message }) => {
  console.log(`⏳ 进度: ${percent}% - ${message}`);
});

registerHook('onTaskComplete', (taskId, result) => {
  console.log(`✅ 任务 ${taskId} 已完成`);
});

registerHook('onTaskFail', (taskId, { error }) => {
  console.log(`❌ 任务 ${taskId} 失败: ${error}`);
});
```

## 配置说明

### 环境变量
- `REDIS_HOST`: Redis 主机 (默认: localhost)
- `REDIS_PORT`: Redis 端口 (默认: 6379)

### 配置文件
- `~/.cc-heartbeat.json`: 心跳状态
- `~/.cc-manager.pid`: CC 进程 ID
- `~/.task-state.json`: 任务状态持久化
- `~/.task-queue/queue.json`: 文件队列降级

## 适用场景

1. **多阶段任务**：需要分步骤执行的任务
2. **进程监控**：需要监控 CC 等进程存活
3. **任务追踪**：需要记录任务执行进度
4. **故障恢复**：需要自动重试和恢复
5. **事件驱动**：需要响应任务生命周期事件

## 与 OpenClaw 集成

此编排器可作为独立服务运行，也可与 OpenClaw 的 subagent 机制配合使用：

```javascript
// 在 OpenClaw 中调用
const { sessions_spawn } = require('openclaw-tools');

// 派发任务到队列
await enqueueTask({ type: 'research', query: '...' });
```

## 许可证

MIT

## 作者

OpenClaw Community
