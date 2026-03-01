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

// --- [MỚI] TỰ ĐỘNG ĐĂNG KÝ LỆNH SLASH ---
async function deployCommands() {
    const commands = [
        require('./commands/bot_vi').data.toJSON(),
        require('./commands/bot_realestate').data.toJSON(),
        require('./commands/bot_stock').data.toJSON(),
        require('./commands/bot_race').data.toJSON(),
        require('./commands/bot_daily').data.toJSON(),
    ];

    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
    try {
        console.log('🔄 Đang cập nhật Slash Commands...');
        await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), { body: commands });
        console.log('✅ Đã đồng bộ tất cả lệnh!');
    } catch (e) { console.error(e); }
}

// --- [MỚI] TỰ ĐỘNG CẬP NHẬT GIÁ CỔ PHIẾU (Mỗi 5 phút) ---
setInterval(async () => {
    const market = await prisma.market.findUnique({ where: { id: 1 } });
    if (market) {
        const change = (Math.random() * 4 - 2); // Biến động -2% đến +2%
        const newPrice = Math.max(10, market.price + change);
        let history = market.history;
        history.push(newPrice);
        if (history.length > 20) history.shift();

        await prisma.market.update({
            where: { id: 1 },
            data: { price: newPrice, history: history }
        });
    }
}, 300000); 

// Tự động đếm tin nhắn và Reset nhiệm vụ hàng ngày
client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    // --- [MỚI] Xử lý lệnh Prefix !vi ---
    if (message.content.toLowerCase() === '!vi') {
        const vi = require('./commands/bot_vi');
        return vi.execute(message, prisma);
    }

    const today = new Date().toDateString();
    await prisma.user.upsert({
        where: { id: message.author.id },
        update: { msgCount: { increment: 1 } },
        create: { id: message.author.id, balance: 1000, lastDaily: new Date() }
    });

    const user = await prisma.user.findUnique({ where: { id: message.author.id } });
    if (user && user.lastDaily && user.lastDaily.toDateString() !== today) {
        await prisma.user.update({
            where: { id: message.author.id },
            data: { msgCount: 1, hasWonToday: false, claimedChatter: false, claimedWin: false, lastDaily: new Date() }
        });
    }
});

// Logic Bất Động Sản: Treo Voice nhận Cash
client.on('voiceStateUpdate', async (oldState, newState) => {
    const userId = oldState.member.id;
    if (!oldState.channelId && newState.channelId) {
        voiceTimers.set(userId, Date.now());
    } else if (oldState.channelId && !newState.channelId) {
        const startTime = voiceTimers.get(userId);
        if (startTime) {
            const minutes = Math.floor((Date.now() - startTime) / 60000);
            if (minutes > 0) {
                const user = await prisma.user.findUnique({ where: { id: userId } });
                const reward = minutes * ((user?.level || 1) * 10) * (minutes >= 60 ? 1.5 : 1);
                await prisma.user.update({
                    where: { id: userId },
                    data: { balance: { increment: Math.floor(reward) } }
                });
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
        console.error(error);
        if (!interaction.replied) interaction.reply({ content: '❌ Lỗi thực thi lệnh!', ephemeral: true });
    }
});

client.once('ready', () => {
    console.log(`✅ ${client.user.tag} Online!`);
    deployCommands(); // Chạy đăng ký lệnh khi bot bật
});

client.login(process.env.DISCORD_TOKEN);;
