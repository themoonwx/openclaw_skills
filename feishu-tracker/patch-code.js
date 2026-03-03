// 飞书 tracker 集成代码补丁
// 需要修改的文件: ~/openclaw/extensions/feishu/src/send.ts

const TRACKER_FILE = "/home/ubuntu/.openclaw/message_tracker.json";

// 1. 在文件顶部添加 import
// import fs from "fs";

// 2. 添加 tracker 写入函数
function writeToTracker(messageId, text, receiveId) {
  try {
    let data = { messages: {} };
    if (fs.existsSync(TRACKER_FILE)) {
      try {
        const existing = fs.readFileSync(TRACKER_FILE, "utf8");
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
    console.log("[tracker] written:", messageId?.slice(-8));
  } catch (e) {
    console.error("[tracker] error:", e);
  }
}

// 3. 在 sendMessageFeishu 函数的返回前添加:
//   const msgId = response.data?.message_id;
//   if (msgId && text) {
//     writeToTracker(msgId, text, receiveId);
//   }

// 4. 同理修改 reply 部分

console.log("Tracker 集成代码补丁");
