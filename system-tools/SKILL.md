---
name: openclaw-system-tools
description: OpenClaw 系统工具集 - 健康检查、备份、验证、定时任务管理等运维工具。适用于日常系统维护和监控。
---

# OpenClaw 系统工具集

一套完整的 OpenClaw 系统运维工具，包含健康检查、配置备份、日志管理等。

## 功能列表

### 1. 健康检查 (health-check.sh)
- Gateway 进程检测
- API 响应检测
- 配置有效性验证
- 磁盘/内存监控

### 2. 配置备份 (backup-config.sh)
- 自动备份 OpenClaw 配置
- 带时间戳的备份文件
- 保留历史版本

### 3. 配置验证 (validate-config.sh)
- JSON 格式验证
- 必需字段检查

### 4. 任务队列 (task-queue.sh)
- 基于文件的任务队列
- flock 防止并发冲突
- 崩溃恢复支持

### 5. 日志轮转
- logrotate 配置
- 自动压缩和清理

## 安装

```bash
# 复制脚本到 ~/scripts
cp -r scripts/* ~/scripts/
chmod +x ~/scripts/*.sh
```

## 使用方法

### 健康检查
```bash
# 直接运行
~/scripts/health-check.sh

# 定时任务 (每5分钟)
*/5 * * * * ~/scripts/health-check.sh >> /var/log/openclaw/health.log 2>&1
```

### 配置备份
```bash
# 手动备份
~/scripts/backup-config.sh

# 定时任务 (每天3点)
0 3 * * * ~/scripts/backup-config.sh >> /var/log/openclaw/backup.log 2>&1
```

### 配置验证
```bash
~/scripts/validate-config.sh
```

### 任务队列
```bash
# 添加任务
~/scripts/task-queue.sh add <任务ID> <数据>

# 获取下一个任务
~/scripts/task-queue.sh next

# 标记处理中
~/scripts/task-queue.sh process <任务ID>

# 标记完成
~/scripts/task-queue.sh complete <任务ID> <结果>

# 崩溃恢复
~/scripts/task-queue.sh recover
```

## 配置说明

### 环境要求
- Bash
- jq
- curl
- redis-cli (可选)

### 日志位置
- `/var/log/openclaw/health.log`
- `/var/log/openclaw/backup.log`

### 备份位置
- `~/.openclaw/configs/backup/`

## 定时任务示例

```bash
# 健康检查 - 每5分钟
*/5 * * * * /home/ubuntu/scripts/health-check.sh >> /var/log/openclaw/health.log 2>&1

# 配置备份 - 每天3点
0 3 * * * /home/ubuntu/scripts/backup-config.sh >> /var/log/openclaw/backup.log 2>&1
```

## systemd 集成

### 服务 override 配置
```bash
sudo mkdir -p /etc/systemd/system/openclaw.service.d/
sudo tee /etc/systemd/system/openclaw.service.d/override.conf << 'EOF'
[Service]
StartLimitBurst=3
StartLimitIntervalSec=300
WatchdogSec=0
MemoryMax=6G
EOF

sudo systemctl daemon-reload
sudo systemctl restart openclaw
```

## 监控指标

| 指标 | 阈值 | 说明 |
|------|------|------|
| Gateway | 进程存在 | 核心服务 |
| API | HTTP 200 | 响应检测 |
| 磁盘 | < 90% | 空间监控 |
| 内存 | < 80% | 内存使用 |

## 许可证

MIT
