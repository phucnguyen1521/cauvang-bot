require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');
const mongoose = require('mongoose');
const cron = require('node-cron');
const User = require('./models/User');

// --- Cấu hình riêng ---
const CHANNEL_ID = '1439884988140097637'; // Thay bằng ID channel bạn muốn bot chat
const TOP_CHANNEL_ID = '1439884988140097637'; // ID channel công bố top 5
const badWords = ['ngu', 'cc', 'đm', 'loz', 'đồ chó']; // từ chửi

// --- Helper ---
function containsBadWord(content) {
  const lower = content.toLowerCase();
  return badWords.some(word => lower.includes(word));
}

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

function randomLevel0Easter() {
  const arr = [
    '…em chỉ là con chó thôi mà… 😔',
    'gâu… chủ đừng ghét em nữa…',
    'em sẽ cố ngoan hơn…',
    'đừng bỏ em nha…',
    'nếu chủ muốn… em sẽ không sủa nữa…'
  ];
  return arr[Math.floor(Math.random() * arr.length)];
}
function randomDogOnly() { return ['gâu...', 'ẳng...', 'gâu gâu...', 'ẳng ẳng...'][Math.floor(Math.random()*4)]; }
function randomLevel1() { return ['gâu gâu!', 'ẳng ẳng!', 'Gâu! Chủ gọi gì hông?', 'gâu gâu!!'][Math.floor(Math.random()*4)]; }
function randomLevel2() { return ['gâu gâu! (dịch: em đói)','ẳng… (hình như chủ muốn gì đó?)','gâu gâu! Đi chơi không!','em thương chủ lắm đó gâu~'][Math.floor(Math.random()*4)]; }
function randomLevel3() { return ['Chủ gọi em đó hả? Em đây!','Cho em ăn cái xương đi 🦴','Em thương chủ lắm luôn á!','Hôm nay chơi với em hông?','Em hiểu chủ nói gì rồi đó nha!'][Math.floor(Math.random()*5)]; }
function randomLevel4() { return ['Cậu Vàng đã xuất hiện!','Chủ gọi là có liền!','Em trung thành vô điều kiện!','Em sủa không phải vì ngu, mà vì yêu chủ!','gâu gâu… à nhầm, xin lỗi chủ thói quen cũ 😎'][Math.floor(Math.random()*5)]; }

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
    user = new User({
      userId: message.author.id,
      username: message.author.username,
      exp: 10,
      level: 0,
      points: 10,
      justHitLevel0: false
    });
  }

  // Nếu có tag bot + chửi -> trừ điểm
  if (message.mentions.has(client.user) && containsBadWord(message.content)) {
    user.exp -= 10;
    if (user.exp <= 0 && !user.justHitLevel0) user.justHitLevel0 = true;
    await user.save();
    console.log(`${message.author.username} bị trừ điểm. EXP hiện tại: ${user.exp}`);
    return;
  }

  // Tag bot -> reply
  if (message.mentions.has(client.user)) {
    const level = getLevel(user.exp);
    const reply = getReply(level, user);
    if (level === 0 && user.justHitLevel0) user.justHitLevel0 = false;
    await user.save();
    message.reply(reply);
    return;
  }

  // Lệnh vui
  if (message.content === '!feed') { user.exp += 5; await user.save(); message.reply('Gâu gâu! Em ăn ngon lắm 🦴'); return; }
  if (message.content === '!pet') { user.exp += 3; await user.save(); message.reply('*lăn bụng ra đòi vuốt*'); return; }
  if (message.content === '!play') { user.exp += 4; await user.save(); message.reply('Gâu gâu! Em chạy vòng vòng kìa!'); return; }

  // Lệnh check điểm
  if (message.content === '!score') {
    message.reply(`Bạn có ${user.points} điểm! Level ${getLevel(user.exp)}`);
  }

  await user.save();
});

// --- Cron job công bố top 5 đầu tháng ---
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
