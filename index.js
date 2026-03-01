const { Client, GatewayIntentBits, Collection, REST, Routes } = require('discord.js');
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
const voiceTimers = new Map();

// --- TỰ ĐỘNG ĐĂNG KÝ LỆNH SLASH ---
async function deployCommands() {
    // Chỉ đăng ký nếu có đủ thông tin môi trường
    if (!process.env.DISCORD_TOKEN || !process.env.CLIENT_ID) {
        return console.error('❌ Thiếu DISCORD_TOKEN hoặc CLIENT_ID trong .env');
    }

    const commands = [
        require('./commands/bot_vi').data.toJSON(),
        require('./commands/bot_realestate').data.toJSON(),
        require('./commands/stock').data.toJSON()
        require('./commands/bot_race').data.toJSON(),
        require('./commands/bot_daily').data.toJSON(),
    ];

    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
    try {
        console.log('🔄 Đang đồng bộ Slash Commands...');
        await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), { body: commands });
        console.log('✅ Đã đồng bộ tất cả lệnh!');
    } catch (e) { 
        console.error('❌ Lỗi đăng ký lệnh:', e); 
    }
}

// --- CẬP NHẬT GIÁ CỔ PHIẾU (Mỗi 5 phút) ---
setInterval(async () => {
    try {
        const market = await prisma.market.findUnique({ where: { id: 1 } });
        if (market) {
            const change = (Math.random() * 4 - 2); // -2% đến +2%
            const newPrice = Math.max(10, market.price + (market.price * (change / 100)));
            let history = Array.isArray(market.history) ? market.history : [];
            
            history.push(parseFloat(newPrice.toFixed(2)));
            if (history.length > 20) history.shift();

            await prisma.market.update({
                where: { id: 1 },
                data: { price: newPrice, history: history }
            });
            console.log(`📈 Cập nhật giá thị trường: ${newPrice.toFixed(2)} VCASH`);
        }
    } catch (e) {
        console.error('❌ Lỗi cập nhật thị trường:', e);
    }
}, 300000); 

// Tự động đếm tin nhắn và Reset nhiệm vụ
client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.guild) return;

    // Lệnh Prefix !vi
    if (message.content.toLowerCase() === '!vi') {
        try {
            const vi = require('./commands/bot_vi');
            return vi.execute(message, prisma);
        } catch (e) { console.error(e); }
    }

    const today = new Date().toDateString();
    try {
        const user = await prisma.user.upsert({
            where: { id: message.author.id },
            update: { msgCount: { increment: 1 } },
            create: { id: message.author.id, balance: 1000, lastDaily: new Date(), msgCount: 1 }
        });

        // Reset nhiệm vụ nếu qua ngày mới
        if (user.lastDaily && user.lastDaily.toDateString() !== today) {
            await prisma.user.update({
                where: { id: message.author.id },
                data: { 
                    msgCount: 1, 
                    hasWonToday: false, 
                    claimedChatter: false, 
                    claimedWin: false, 
                    lastDaily: new Date() 
                }
            });
        }
    } catch (e) { console.error('❌ Lỗi DB (Message):', e); }
});

// Treo Voice nhận Cash
client.on('voiceStateUpdate', async (oldState, newState) => {
    const userId = oldState.member.id;

    if (!oldState.channelId && newState.channelId) {
        voiceTimers.set(userId, Date.now());
    } else if (oldState.channelId && !newState.channelId) {
        const startTime = voiceTimers.get(userId);
        if (startTime) {
            const minutes = Math.floor((Date.now() - startTime) / 60000);
            if (minutes > 0) {
                try {
                    const user = await prisma.user.findUnique({ where: { id: userId } });
                    const reward = minutes * ((user?.level || 1) * 10) * (minutes >= 60 ? 1.5 : 1);
                    await prisma.user.update({
                        where: { id: userId },
                        data: { balance: { increment: Math.floor(reward) } }
                    });
                    console.log(`💰 ${oldState.member.user.tag} nhận ${Math.floor(reward)} cho ${minutes}p voice.`);
                } catch (e) { console.error(e); }
            }
            voiceTimers.delete(userId);
        }
    }
});

// Xử lý Interaction
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand()) return;
    try {
        const command = require(`./commands/bot_${interaction.commandName}`);
        await command.execute(interaction, prisma);
    } catch (error) {
        console.error('❌ Lỗi thực thi interaction:', error);
        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({ content: '❌ Lỗi hệ thống khi thực hiện lệnh này!', ephemeral: true });
        }
    }
});

client.once('ready', () => {
    console.log(`✅ ${client.user.tag} đã sẵn sàng!`);
    deployCommands();
});

client.login(process.env.DISCORD_TOKEN);
