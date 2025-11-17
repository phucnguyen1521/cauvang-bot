require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');
const mongoose = require('mongoose');
const cron = require('node-cron');
const fs = require('fs');
const User = require('./models/User');

// --- Cấu hình ---
const CHANNEL_ID = '1439884988140097637';
const TOP_CHANNEL_ID = '1439884988140097637';
const keywordGroups = JSON.parse(fs.readFileSync('./keywords.json', 'utf8'));

// --- Cooldown & Limit ---
const userCooldowns = {}; // userId -> command -> timestamp
const userDailyLimits = {}; // userId -> command -> count

function getCooldown(level) {
  // Level càng cao, cooldown càng lâu (ms)
  switch (level) {
    case 0: return 6000 * 1000; // 120s
    case 1: return 600 * 1000; // 60s
    case 2: return 30 * 1000; // 30s
    case 3: return 20 * 1000; // 20s
    case 4: return 10 * 1000; // 10s
    default: return 300 * 1000;
  }
}

function getDailyLimit(level) {
  // Level càng cao, dùng được nhiều lần 1 ngày
  return 5 + level * 2;
}

// --- Helper ---
function getLevel(exp) {
  if (exp <= 0) return 0;
  if (exp <= 20) return 1;
  if (exp <= 60) return 2;
  if (exp <= 120) return 3;
  return 4;
}

// --- Replies theo level ---
function getReply(level, userData) {
  if (level === 0 && userData.justHitLevel0) return randomLevel0Easter();
  switch (level) {
    case 0: return randomDogOnly();
    case 1: return randomLevel1();
    case 2: return randomLevel2();
    case 3: return randomLevel3();
    case 4: return randomLevel4();
    default: return 'gâu gâu';
  }
}
function randomLevel0Easter() { const arr = ['…em chỉ là con chó thôi mà… 😔','gâu… chủ đừng ghét em nữa…','em sẽ cố ngoan hơn…','đừng bỏ em nha…','nếu chủ muốn… em sẽ không sủa nữa…']; return arr[Math.floor(Math.random() * arr.length)]; }
function randomDogOnly() { return ['gâu...', 'ẳng...', 'gâu gâu...', 'ẳng ẳng...'][Math.floor(Math.random()*4)]; }
function randomLevel1() { return ['gâu gâu!', 'ẳng ẳng!', 'Gâu Gâu.....', 'gâu gâu!!'][Math.floor(Math.random()*4)]; }
function randomLevel2() { return ['gâu gâu! (dịch: em đói)','ẳng… (hình như chủ muốn gì đó?)','gâu gâu! Đi chơi không!','em thương chủ lắm đó gâu~'][Math.floor(Math.random()*4)]; }
function randomLevel3() { return ['Ai gọi em đó hả? Em đây!','Cho em ăn cái xương đi 🦴','Em thương chủ lắm luôn á!','Hôm nay chơi với em hông?','Em hiểu chủ nói gì rồi đó nha!'][Math.floor(Math.random()*5)]; }
function randomLevel4() { return ['Cậu Vàng đã xuất hiện!','Chủ gọi là có liền!','Em trung thành vô điều kiện!','gâu gâu… à nhầm, xin lỗi chủ thói quen cũ 😎'][Math.floor(Math.random()*5)]; }

// --- Kiểm tra từ khóa ---
function getKeywordReply(content) {
  const lower = content.toLowerCase();
  for (const group of keywordGroups) {
    if (group.words.some(word => lower.includes(word))) {
      const replies = group.replies;
      return { reply: replies[Math.floor(Math.random() * replies.length)], isBad: group === keywordGroups[0] };
    }
  }
  return null;
}

// --- Cooldown helpers ---
function canUseCommand(userId, command, level) {
  if (!userCooldowns[userId]) userCooldowns[userId] = {};
  if (!userDailyLimits[userId]) userDailyLimits[userId] = {};

  // Reset daily count lúc 0h
  const today = new Date().toDateString();
  if (!userDailyLimits[userId][command]) userDailyLimits[userId][command] = { date: today, count: 0 };
  if (userDailyLimits[userId][command].date !== today) userDailyLimits[userId][command] = { date: today, count: 0 };

  const lastUsed = userCooldowns[userId][command] || 0;
  const cooldown = getCooldown(level);
  const limit = getDailyLimit(level);
  const count = userDailyLimits[userId][command].count;

  return Date.now() - lastUsed >= cooldown && count < limit;
}

function setCommandUsed(userId, command) {
  if (!userCooldowns[userId]) userCooldowns[userId] = {};
  if (!userDailyLimits[userId]) userDailyLimits[userId] = {};
  const today = new Date().toDateString();
  userCooldowns[userId][command] = Date.now();
  if (!userDailyLimits[userId][command] || userDailyLimits[userId][command].date !== today) {
    userDailyLimits[userId][command] = { date: today, count: 1 };
  } else {
    userDailyLimits[userId][command].count++;
  }
}

// --- Bot client ---
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// --- Khi bot sẵn sàng ---
client.once('clientReady', () => console.log('Bot Cậu Vàng đã online!'));

// --- Xử lý tin nhắn ---
client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  if (message.channel.id !== CHANNEL_ID) return;

  let user = await User.findOne({ userId: message.author.id });
  if (!user) {
    user = new User({ userId: message.author.id, username: message.author.username, exp: 10, level: 0, points: 10, justHitLevel0: false });
  }

  const level = getLevel(user.exp);

  // Nếu tag bot + từ khóa
  if (message.mentions.has(client.user)) {
    const keyword = getKeywordReply(message.content);
    if (keyword) {
      if (keyword.isBad) { // nếu chửi
        user.exp -= 10;
        if (user.exp <= 0 && !user.justHitLevel0) user.justHitLevel0 = true;
        console.log(`${message.author.username} bị trừ điểm. EXP hiện tại: ${user.exp}`);
      }
      await user.save();
      message.reply(keyword.reply);
      return;
    }

    // Không match từ khóa -> reply level
    const replyLevel = getReply(level, user);
    if (level === 0 && user.justHitLevel0) user.justHitLevel0 = false;
    await user.save();
    message.reply(replyLevel);
    return;
  }

  // --- Lệnh vui với cooldown & daily limit ---
  const commands = {
    '!feed': 5,
    '!pet': 3,
    '!play': 4
  };

  if (commands[message.content]) {
    if (!canUseCommand(user.userId, message.content, level)) {
      message.reply('Chờ chút đi nha, không thể spam liên tục 😅');
      return;
    }
    user.exp += commands[message.content];
    await user.save();
    setCommandUsed(user.userId, message.content);
    let replies = {
      '!feed': 'Gâu gâu! Em ăn ngon lắm 🦴',
      '!pet': '*lăn bụng ra đòi vuốt*',
      '!play': 'Gâu gâu! Em chạy vòng vòng kìa!'
    };
    message.reply(replies[message.content]);
    return;
  }

  // Lệnh check điểm
  if (message.content === '!score') {
    message.reply(`Bạn có ${user.points} điểm! Level ${level}`);
  }

  await user.save();
});

// --- Cron job công bố top 5 ---
cron.schedule('0 0 1 * *', async () => {
  const channel = await client.channels.fetch(TOP_CHANNEL_ID);
  const topUsers = await User.find().sort({ points: -1 }).limit(5);

  let messageText = '🏆 Top 5 điểm tháng này:\n';
  topUsers.forEach((u, index) => {
    messageText += `${index + 1}: ${u.username} ${u.points} điểm! Level ${getLevel(u.exp)}\n`;
  });

  channel.send(messageText);
});

// --- Kết nối MongoDB + login bot ---
mongoose.connect(process.env.MONGODB_URI)
  .then(() => {
    console.log('Đã kết nối MongoDB');
    client.login(process.env.DISCORD_TOKEN);
  })
  .catch(err => console.error('Lỗi kết nối MongoDB:', err));
