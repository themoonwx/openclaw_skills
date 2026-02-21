#!/usr/bin/env node
/**
 * 飞书消息智能提醒系统 V3 - 文本消息版
 * 
 * 核心功能:
 * 1. 消息发送后10秒未读 → 发送普通文本消息提醒
 * 2. 同一消息只提醒一次（去重逻辑）
 * 3. 用户已读 → 更新状态，后续不再提醒
 * 4. 文本消息包含：原始消息摘要、查看链接
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const Lark = require('@larksuiteoapi/node-sdk');

const APP_ID = 'cli_a91b6915be789bde';
const APP_SECRET = 'VCV1XuIQjgXXHrdSZ1cMG1JcwFZIpJGo';
const USER_ID = 'ou_c066be226b4b13e5430264165cfc83d7';
const USER_ID_INTERNAL = 'e1g33fa8'; // 内部user_id格式，用于加急推送

// 配置文件路径
const CONFIG_FILE = '/home/ubuntu/.openclaw/config.json';
const TRACKER_FILE = '/home/ubuntu/openclaw/message_tracker.json';
const REMINDER_FILE = '/home/ubuntu/.openclaw/workspace/todo_reminder_data.json';

// 提醒配置
const REMINDER_SECONDS = 10;
const CHECK_INTERVAL_MS = 5000; // 每5秒检查一次
const REMINDER_THRESHOLD_MS = REMINDER_SECONDS * 1000;

// 飞书客户端
const client = new Lark.Client({
  appId: APP_ID,
  appSecret: APP_SECRET,
  appType: Lark.AppType.SelfBuild,
});

/**
 * 加载配置
 */
function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    }
  } catch(e) {
    console.error('读取配置文件失败:', e.message);
  }
  return {};
}

const config = loadConfig();

/**
 * 读取提醒数据
 */
function loadReminderData() {
  try {
    if (fs.existsSync(REMINDER_FILE)) {
      const data = JSON.parse(fs.readFileSync(REMINDER_FILE, 'utf8'));
      // 兼容旧格式（待办数据）
      if (data.todos) {
        // 旧格式，迁移或重置
        return { reminders: {}, messageReminderMap: {} };
      }
      return {
        reminders: data.reminders || {},
        messageReminderMap: data.messageReminderMap || {}
      };
    }
  } catch(e) {
    console.error('读取提醒数据失败:', e.message);
  }
  return { reminders: {}, messageReminderMap: {} };
}

/**
 * 保存提醒数据
 */
function saveReminderData(data) {
  try {
    fs.writeFileSync(REMINDER_FILE, JSON.stringify(data, null, 2));
    return true;
  } catch(e) {
    console.error('保存提醒数据失败:', e.message);
    return false;
  }
}

/**
 * 从tracker文件读取消息
 */
function getMessagesFromTracker() {
  try {
    if (!fs.existsSync(TRACKER_FILE)) {
      return [];
    }
    const data = JSON.parse(fs.readFileSync(TRACKER_FILE, 'utf8'));
    return Object.values(data.messages || {});
  } catch(e) {
    console.error('读取tracker文件失败:', e.message);
    return [];
  }
}

/**
 * 更新tracker文件中的消息状态
 */
function updateMessageStatus(messageId, updates) {
  try {
    if (!fs.existsSync(TRACKER_FILE)) {
      console.error(`❌ 更新失败: tracker文件不存在 (${TRACKER_FILE})`);
      return false;
    }
    
    const data = JSON.parse(fs.readFileSync(TRACKER_FILE, 'utf8'));
    if (!data.messages) {
      console.error(`❌ 更新失败: tracker文件中没有messages对象`);
      return false;
    }
    if (!data.messages[messageId]) {
      console.error(`❌ 更新失败: 消息ID不存在于tracker中: ${messageId?.slice(-8)}`);
      return false;
    }
    
    Object.assign(data.messages[messageId], updates);
    fs.writeFileSync(TRACKER_FILE, JSON.stringify(data, null, 2));
    console.log(`✅ tracker状态已更新: ${messageId?.slice(-8)}, reminderSent=${updates.reminderSent}`);
    return true;
  } catch(e) {
    console.error('❌ 更新tracker异常:', e.message);
  }
  return false;
}

/**
 * 检查消息已读状态
 */
async function checkMessageReadStatus(messageId) {
  try {
    const response = await client.im.message.readUsers({
      path: { message_id: messageId },
      params: { user_id_type: 'open_id' }  // 使用 open_id
    });
    
    if (response.code === 0 && response.data) {
      const readUsers = response.data.items || [];
      return readUsers.some(u => 
        u.user_id === USER_ID || u.open_id === USER_ID
      );
    }
  } catch(e) {
    console.error(`检查已读状态异常 (${messageId?.slice(-8)}):`, e.message);
  }
  return null;
}

/**
 * 发送普通文本消息提醒 - 带紧急推送
 */
async function sendReminderMessage(messageId, messageText, isUrgent = false) {
  // 截取消息摘要
  const summary = messageText ? 
    (messageText.length > 100 ? messageText.substring(0, 100) + '...' : messageText) 
    : '未读消息';
  
  // 纯文本消息内容，如果是紧急提醒则添加标记
  const urgentPrefix = isUrgent ? '[URGENT] ' : '';
  const text = `${urgentPrefix}未读提醒：您有一条未读消息`;
  
  try {
    // 1. 先发送普通消息
    const result = await client.im.message.create({
      params: { receive_id_type: 'open_id' },
      data: {
        receive_id: USER_ID,
        msg_type: 'text',
        content: JSON.stringify({ text })
      }
    });
    
    if (result.code === 0 && result.data?.message_id) {
      const reminderId = result.data.message_id;
      console.log(`✅ 提醒消息已发送: ${reminderId}`);
      
      // 2. 调用 urgentApp API 加急
      try {
        await client.im.message.urgentApp({
          path: { message_id: reminderId },
          params: { user_id_type: 'user_id' },
          data: { user_id_list: [USER_ID_INTERNAL] }
        });
        console.log('✅ 加急成功');
      } catch(e) {
        console.warn('加急失败:', e.message);
      }
      
      return reminderId;
    } else {
      console.error(`发送提醒失败: code=${result.code}, msg=${result.msg}`);
    }
  } catch(e) {
    console.error('发送提醒异常:', e.message);
  }
  return null;
}

/**
 * 检查是否已经发送过提醒（去重逻辑）
 * 注意：只有真正发送过提醒的消息才会被记录到 messageReminderMap
 */
function hasReminderSent(messageId) {
  const reminderData = loadReminderData();
  return messageId in reminderData.messageReminderMap;
}

/**
 * 创建提醒记录
 */
function createReminderRecord(messageId, reminderMessageId) {
  const reminderData = loadReminderData();
  
  reminderData.reminders[messageId] = {
    reminderMessageId,
    status: 'sent',
    sentAt: Date.now()
  };
  reminderData.messageReminderMap[messageId] = messageId;
  
  saveReminderData(reminderData);
  console.log(`📝 提醒记录已创建: ${messageId}`);
}

/**
 * 获取提醒状态
 */
function getReminderStatus(messageId) {
  const reminderData = loadReminderData();
  return reminderData.reminders[messageId]?.status || null;
}

/**
 * 清理过期提醒记录
 * 注意：只清理 reminders 中的记录，不清理 messageReminderMap
 * 因为已发送的提醒需要持久保留以避免重复发送
 */
function cleanupOldReminders() {
  const reminderData = loadReminderData();
  const now = Date.now();
  const maxAgeMs = 24 * 60 * 60 * 1000; // 24小时
  
  let cleaned = 0;
  
  for (const [msgId, reminder] of Object.entries(reminderData.reminders)) {
    if (now - reminder.sentAt > maxAgeMs) {
      delete reminderData.reminders[msgId];
      // 注意：即使 reminders 中的记录过期，也不删除 messageReminderMap
      // 因为 messageReminderMap 中的消息是真正发送过提醒的，需要持久保留
      cleaned++;
    }
  }
  
  if (cleaned > 0) {
    saveReminderData(reminderData);
    console.log(`🧹 清理了 ${cleaned} 条过期提醒记录`);
  }
}

/**
 * 主检查逻辑
 */
async function checkAndSendReminders() {
  if (shuttingDown) {
    console.log('🛑 服务正在关闭，跳过检查');
    return;
  }
  
  // 清理过期记录
  cleanupOldReminders();
  
  const messages = getMessagesFromTracker();
  
  if (messages.length === 0) {
    console.log('📭 无跟踪消息');
    return;
  }
  
  const now = Date.now();
  
  // 筛选需要发送提醒的消息:
  // 1. 超过提醒阈值(10秒)
  // 2. 未发送过提醒（去重）
  // 3. 未被标记已完成
  // 4. 过滤系统消息（Exec: 或 ⚠️）
  let eligibleMessages = messages.filter(msg => {
    const age = now - (msg.sentTime || msg.timestamp);
    const reminderStatus = getReminderStatus(msg.id || msg.messageId);
    
    // 过滤系统消息
    const msgText = msg.text || '';
    const isSystemMessage = msgText.includes('Exec:') || msgText.includes('⚠️');
    if (isSystemMessage) {
      console.log(`🚫 跳过系统消息: ${(msg.id || msg.messageId)?.slice(-8)}`);
      return false;
    }
    
    // [URGENT] 消息立即提醒，不等待10秒
    const isUrgent = msgText.includes('[URGENT]');
    if (isUrgent) {
      // URGENT消息不等待阈值，立即处理
      // 排除已发送提醒(sent)和已读(read)的消息
      return reminderStatus !== 'sent' && reminderStatus !== 'read';
    }
    
    // 排除已发送提醒(sent)和已读(read)的消息
    return age >= REMINDER_THRESHOLD_MS && 
           reminderStatus !== 'sent' &&
           reminderStatus !== 'read';
  });
  
  // 按时间排序: 最新的先处理（最容易未读的优先检查）
  eligibleMessages.sort((a, b) => {
    const timeA = a.sentTime || a.timestamp || 0;
    const timeB = b.sentTime || b.timestamp || 0;
    return timeB - timeA;
  });
  
  if (eligibleMessages.length === 0) {
    console.log('✅ 无需发送提醒的消息');
    return;
  }
  
  console.log(`📋 发现 ${eligibleMessages.length} 条需要检查的消息`);
  
  // 限制每次处理数量
  const MAX_PROCESS = 10;
  const messagesToProcess = eligibleMessages.slice(0, MAX_PROCESS);
  
  // 遍历处理每条消息
  for (const msg of messagesToProcess) {
    const msgId = msg.id || msg.messageId;
    
    if (!msgId || !msgId.startsWith('om_') || msgId.length < 20) {
      console.log(`⚠️ 无效消息ID: ${msgId}`);
      continue;
    }
    
    // 检查是否已经发送过提醒（去重）
    if (hasReminderSent(msgId)) {
      console.log(`⏭️ 已发送过提醒，跳过: ${msgId.slice(-8)}`);
      continue;
    }
    
    // 额外检查：已读消息不再处理
    const currentStatus = getReminderStatus(msgId);
    if (currentStatus === 'read') {
      console.log(`⏭️ 已读，跳过: ${msgId.slice(-8)}`);
      continue;
    }
    
    console.log(`🔍 检查消息: ${msgId.slice(-8)} (${Math.round((now - msg.sentTime)/1000)}秒前)`);
    
    // 检查已读状态
    const isRead = await checkMessageReadStatus(msgId);
    
    if (isRead === null) {
      console.log(`⚠️ 检查失败，跳过: ${msgId.slice(-8)}`);
      continue;
    }
    
    if (isRead) {
      console.log(`✅ 已读，记录状态: ${msgId.slice(-8)}`);
      // 标记为已读（不发送提醒）
      updateMessageStatus(msgId, { checked: true, readTime: now });
      
      // 记录已检查状态（避免后续重复检查），但不添加到 messageReminderMap
      // 只有真正发送过提醒的消息才应该添加到 messageReminderMap
      const reminderData = loadReminderData();
      reminderData.reminders[msgId] = {
        status: 'read',
        checkedAt: now
      };
      // 注意：已读消息不添加到 messageReminderMap，只在 reminders 中标记 status: 'read'
      saveReminderData(reminderData);
    } else {
      console.log(`🔔 未读，发送文本提醒: ${msgId.slice(-8)}`);
      
      // 检查原始消息是否包含 [URGENT]
      const msgText = msg.text || '';
      const isUrgent = msgText.includes('[URGENT]');
      
      // 发送文本提醒，传递是否紧急
      const reminderMessageId = await sendReminderMessage(msgId, msg.text, isUrgent);
      
      if (reminderMessageId) {
        // 创建提醒记录
        createReminderRecord(msgId, reminderMessageId);
        
        // 更新tracker状态，并检查是否成功
        const updateSuccess = updateMessageStatus(msgId, { 
          reminderSent: true,
          reminderMessageId: reminderMessageId,
          reminderSentTime: now
        });
        
        if (updateSuccess) {
          console.log(`✅ 提醒发送成功: ${msgId.slice(-8)}`);
        } else {
          console.log(`❌ 提醒已发送但状态更新失败: ${msgId.slice(-8)}`);
        }
      } else {
        console.log(`❌ 提醒发送失败: ${msgId.slice(-8)}`);
      }
    }
  }
}

// 服务控制
let running = false;
let shuttingDown = false;

async function startService() {
  if (running) return;
  console.log('🚀 V3文本提醒服务已启动');
  console.log(`⏱️ 提醒阈值: ${REMINDER_SECONDS}秒`);
  console.log(`📁 Tracker文件: ${TRACKER_FILE}`);
  console.log(`📁 提醒数据文件: ${REMINDER_FILE}`);
  running = true;
  
  while (running) {
    if (shuttingDown) {
      console.log('🛑 服务正在关闭，退出循环');
      break;
    }
    
    try {
      await checkAndSendReminders();
    } catch(e) {
      console.error('检查异常:', e.message, e.stack);
    }
    
    if (!running || shuttingDown) {
      break;
    }
    
    await new Promise(r => setTimeout(r, CHECK_INTERVAL_MS));
  }
  
  console.log('👋 V3文本提醒服务已停止');
}

// 命令行处理
const cmd = process.argv[2];
const arg1 = process.argv[3];

if (cmd === 'start') {
  startService();
  
  const shutdown = (signal) => {
    console.log(`\n🛑 收到 ${signal} 信号，正在停止服务...`);
    shuttingDown = true;
    running = false;
  };
  
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  
} else if (cmd === 'status') {
  // 查看状态
  const reminderData = loadReminderData();
  const messages = getMessagesFromTracker();
  
  console.log('📊 V3文本提醒系统状态:');
  console.log(`   跟踪消息: ${messages.length}`);
  console.log(`   提醒记录总数: ${Object.keys(reminderData.reminders).length}`);
  
  let sent = 0, read = 0;
  for (const reminder of Object.values(reminderData.reminders)) {
    if (reminder.status === 'sent') sent++;
    else if (reminder.status === 'read') read++;
  }
  
  console.log(`   已发送提醒: ${sent}`);
  console.log(`   已读（未提醒）: ${read}`);
  
} else if (cmd === 'clear') {
  // 清除所有提醒数据
  try {
    fs.writeFileSync(REMINDER_FILE, JSON.stringify({ reminders: {}, messageReminderMap: {} }, null, 2));
    console.log('✅ 已清除所有提醒数据');
  } catch(e) {
    console.error('清除失败:', e.message);
    process.exit(1);
  }
} else {
  console.log('用法: start | status | clear');
}
