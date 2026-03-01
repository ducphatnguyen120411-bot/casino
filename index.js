const { Client, GatewayIntentBits, Collection } = require('discord.js');
const { PrismaClient } = require('@prisma/client');
require('dotenv').config();

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildVoiceStates
    ]
});

const prisma = new PrismaClient();

// Tải các module lệnh
const daily = require('./commands/bot_daily');
const stock = require('./commands/bot_stock');
const blackmarket = require('./commands/bot_blackmarket');
const realestate = require('./commands/bot_realestate');
const reaction = require('./commands/bot_reaction');
const race = require('./commands/bot_race');
const vi = require('./commands/bot_vi'); // Lệnh hiển thị ví chung

client.on('ready', () => {
    console.log(`✅ Verdict System Online | Bot: ${client.user.tag}`);
});

// --- LOGIC XỬ LÝ TIN NHẮN & LỆNH ---
client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    // 1. Tự động đếm tin nhắn cho Nhiệm vụ hàng ngày & Cập nhật Ví chung
    const today = new Date().toDateString();
    
    // Sử dụng upsert để đảm bảo người dùng luôn có ví tiền khi bắt đầu tương tác
    await prisma.user.upsert({
        where: { id: message.author.id },
        update: { 
            msgCount: { increment: 1 } 
            // Nếu muốn reset msgCount theo ngày, bạn có thể thêm logic kiểm tra date ở đây
        },
        create: { 
            id: message.author.id, 
            balance: 1000, 
            msgCount: 1,
            lastDaily: new Date()
        }
    });

    // 2. Xử lý Lệnh Prefix (!)
    if (!message.content.startsWith('!')) return;

    const args = message.content.slice(1).trim().split(/ +/);
    const commandName = args.shift().toLowerCase();

    try {
        switch (commandName) {
            case 'vi':
            case 'bal':
            case 'money':
                await vi.execute(message, prisma);
                break;
            case 'daily':
                await daily.execute(message, prisma);
                break;
            case 'stock':
                await stock.execute(message, args, prisma);
                break;
            case 'blackmarket':
                await blackmarket.execute(message, args, prisma);
                break;
            case 'duel':
            case 'reaction':
                await reaction.execute(message, prisma);
                break;
            case 'race':
                await race.execute(message, args, prisma);
                break;
            case 're':
            case 'realestate':
                await realestate.execute(message, args, prisma);
                break;
        }
    } catch (error) {
        console.error(`Lỗi thực thi lệnh ${commandName}:`, error);
        message.reply('❌ Có lỗi xảy ra khi thực hiện lệnh này!');
    }
});

// --- LOGIC BẤT ĐỘNG SẢN: TREO VOICE NHẬN TIỀN ---
client.on('voiceStateUpdate', (oldState, newState) => {
    // Đảm bảo module realestate có hàm handleVoice để xử lý cộng tiền balance
    if (realestate.handleVoice) {
        realestate.handleVoice(oldState, newState, prisma);
    }
});

client.login(process.env.DISCORD_TOKEN);
