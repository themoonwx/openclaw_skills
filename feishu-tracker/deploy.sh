#!/bin/bash
# 飞书 tracker 集成一键部署脚本

set -e

echo === 飞书 Tracker 集成一键部署 ===

# 1. 进入 OpenClaw 飞书扩展目录
cd ~/openclaw/extensions/feishu/src

# 2. 备份原文件
cp send.ts send.ts.bak.$(date +%Y%m%d)
echo "✓ 备份 send.ts"

# 3. 添加 tracker 功能
python3 << 'PYEOF'
with open('send.ts', 'r') as f:
    content = f.read()

# 添加 import
if 'import fs from "fs"' not in content:
    content = content.replace(
        'import type { FeishuSendResult } from ./types.js;',
        '''import type { FeishuSendResult } from ./types.js;

// Tracker 文件路径
const TRACKER_FILE = /home/ubuntu/.openclaw/message_tracker.json;

/**
 * 写入消息到 tracker 文件（供提醒服务使用）
 */
function writeToTracker(messageId: string, text: string, receiveId: string) {
  try {
    let data = { messages: {} };
    if (fs.existsSync(TRACKER_FILE)) {
      try {
        const existing = fs.readFileSync(TRACKER_FILE, utf8);
        data = JSON.parse(existing);
        if (!data.messages) data.messages = {};
      } catch {}
    }
    
    const now = Date.now();
    data.messages[messageId] = {
      id: messageId,
      messageId: messageId,
      text: text,
      receiveId: receiveId,
      sentTime: now,
      timestamp: now,
      chatId: receiveId,
    };
    
    fs.writeFileSync(TRACKER_FILE, JSON.stringify(data, null, 2));
    console.log([tracker] written:, messageId?.slice(-8));
  } catch (e) {
    console.error([tracker] error:, e);
  }
}

import fs from fs;'''
    )

# 添加 create 调用
if 'writeToTracker(msgId' not in content:
    content = content.replace(
        '''assertFeishuMessageApiSuccess(response, Feishu send failed);
  return toFeishuSendResult(response, receiveId);
}

export type SendFeishuCardParams''',
        '''assertFeishuMessageApiSuccess(response, Feishu send failed);
  
  // 写入 tracker 文件
  const msgId = response.data?.message_id;
  if (msgId && text) {
    writeToTracker(msgId, text, receiveId);
  }
  
  return toFeishuSendResult(response, receiveId);
}

export type SendFeishuCardParams'''
    )

# 添加 reply 调用
if content.count('writeToTracker') == 1:
    content = content.replace(
        '''assertFeishuMessageApiSuccess(response, Feishu reply failed);
    return toFeishuSendResult(response, receiveId);
  }

  const response = await client.im.message.create({''',
        '''assertFeishuMessageApiSuccess(response, Feishu reply failed);
    
    // 写入 tracker 文件
    const msgId = response.data?.message_id;
    if (msgId && text) {
      writeToTracker(msgId, text, receiveId);
    }
    
    return toFeishuSendResult(response, receiveId);
  }

  const response = await client.im.message.create({'''
    )

with open('send.ts', 'w') as f:
    f.write(content)

print('Done')
PYEOF

echo "✓ 修改 send.ts"

# 4. 重新构建
cd ~/openclaw
npm run build
echo "✓ 构建完成"

# 5. 重启 OpenClaw
sudo systemctl restart openclaw
echo "✓ 重启 OpenClaw"

# 6. 启动提醒服务
sudo systemctl start v4-reminder
echo "✓ 启动提醒服务"

echo ""
echo "=== 部署完成 ==="
echo "测试：在飞书给机器人发消息，10秒后未读会收到提醒"
