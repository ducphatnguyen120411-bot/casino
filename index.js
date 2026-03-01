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
const voiceTimers = new Map(); // Lưu thời gian bắt đầu vào Voice

// --- IMPORT CÁC MODULE LỆNH ---
const daily = require('./commands/bot_daily');
const reaction = require('./commands/bot_reaction');
const race = require('./commands/bot_race');
const realestate = require('./commands/bot_realestate'); // File quản lý BĐS
const vi = require('./commands/bot_vi'); // File hiển thị ví tiền chung

client.on('ready', () => {
    console.log(`✅ Verdict System Online | Bot: ${client.user.tag}`);
});

// --- LOGIC XỬ LÝ TIN NHẮN & VÍ TIỀN CHUNG ---
client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    // Tự động tạo ví hoặc đếm tin nhắn cho Daily Task
    await prisma.user.upsert({
        where: { id: message.author.id },
        update: { msgCount: { increment: 1 } },
        create: { id: message.author.id, balance: 1000, msgCount: 1 }
    });

    // Chỉ xử lý các lệnh bắt đầu bằng dấu !
    if (!message.content.startsWith('!')) return;

    const args = message.content.slice(1).trim().split(/ +/);
    const commandName = args.shift().toLowerCase();

    try {
        switch (commandName) {
            case 'vi':
            case 'bal':
                await vi.execute(message, prisma);
                break;
            case 'daily':
                await daily.execute(message, prisma);
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
                // Gọi hàm execute trong file bot_realestate.js
                await realestate.execute(message, prisma); 
                break;
        }
    } catch (error) {
        console.error(`Lỗi thực thi lệnh ${commandName}:`, error);
    }
});

// --- LOGIC CỘNG TIỀN TREO VOICE (VÍ CHUNG) ---
client.on('voiceStateUpdate', async (oldState, newState) => {
    const userId = oldState.member.id;

    // 1. Khi bắt đầu vào Voice
    if (!oldState.channelId && newState.channelId) {
        voiceTimers.set(userId, Date.now());
    } 
    // 2. Khi thoát Voice
    else if (oldState.channelId && !newState.channelId) {
        const startTime = voiceTimers.get(userId);
        if (startTime) {
            const minutes = Math.floor((Date.now() - startTime) / 60000);
            
            if (minutes > 0) {
                const user = await prisma.user.findUnique({ where: { id: userId } });
                const currentLevel = user?.level || 1;
                
                // Công thức: phút * (level * 10)
                let reward = minutes * (currentLevel * 10);
                if (minutes >= 60) reward = Math.floor(reward * 1.5); // Bonus treo lâu

                await prisma.user.update({
                    where: { id: userId },
                    data: { balance: { increment: reward } }
                });
                
                console.log(`💰 ${oldState.member.user.tag} nhận ${reward} Cash vào ví chung.`);
            }
            voiceTimers.delete(userId);
        }
    }
});

client.login(process.env.DISCORD_TOKEN);
