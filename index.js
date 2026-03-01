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
    if (!process.env.DISCORD_TOKEN || !process.env.CLIENT_ID) {
        return console.error('❌ Thiếu DISCORD_TOKEN hoặc CLIENT_ID trong tab Variables của Railway');
    }

    const commands = [
        require('./commands/bot_vi').data.toJSON(),
        require('./commands/bot_realestate').data.toJSON(),
        require('./commands/stock').data.toJSON(), // Đã khớp với file stock ông gửi
        require('./commands/bot_race').data.toJSON(),
        require('./commands/bot_daily').data.toJSON(),
        require('./commands/tasks').data.toJSON(), // Đã thêm lệnh tasks mới sửa
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

// --- CẬP NHẬT GIÁ THỊ TRƯỜNG (Fix lỗi "No tables") ---
setInterval(async () => {
    try {
        // Sử dụng upsert để đảm bảo ID 1 luôn tồn tại, tránh crash khi DB trống
        const market = await prisma.market.upsert({
            where: { id: 1 },
            update: {}, 
            create: { id: 1, price: 100.0, history: [100, 101, 99, 102] }
        });

        const change = (Math.random() * 4 - 2); 
        const newPrice = Math.max(10, market.price + (market.price * (change / 100)));
        let history = Array.isArray(market.history) ? market.history : [];
        
        history.push(parseFloat(newPrice.toFixed(2)));
        if (history.length > 20) history.shift();

        await prisma.market.update({
            where: { id: 1 },
            data: { price: newPrice, history: history }
        });
        console.log(`📈 Cập nhật giá thị trường: ${newPrice.toFixed(2)} VCASH`);
    } catch (e) {
        console.error('❌ Lỗi cập nhật thị trường:', e.message);
    }
}, 300000); 

// --- SỰ KIỆN MESSAGE (PREFIX & NHIỆM VỤ) ---
client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.guild) return;

    // Lệnh Prefix !vi
    if (message.content.toLowerCase().startsWith('!vi')) {
        try {
            const command = require('./commands/bot_vi');
            return command.execute(message, prisma);
        } catch (e) { console.error(e); }
    }

    // Tự động đếm tin nhắn và Reset nhiệm vụ ngày
    try {
        const user = await prisma.user.upsert({
            where: { id: message.author.id },
            update: { msgCount: { increment: 1 } },
            create: { id: message.author.id, balance: 1000, msgCount: 1 }
        });

        const today = new Date().toDateString();
        if (user.updatedAt && user.updatedAt.toDateString() !== today) {
            await prisma.user.update({
                where: { id: message.author.id },
                data: { msgCount: 1, hasWonToday: false, claimedChatter: false, claimedWin: false }
            });
        }
    } catch (e) { console.error('❌ Lỗi DB (Message):', e.message); }
});

// --- XỬ LÝ INTERACTION (SLASH & BUTTON) ---
client.on('interactionCreate', async (interaction) => {
    // 1. Xử lý Slash Command
    if (interaction.isChatInputCommand()) {
        try {
            const commandName = interaction.commandName === 'tasks' ? 'tasks' : `bot_${interaction.commandName}`;
            const command = require(`./commands/${commandName}`);
            await command.execute(interaction, prisma);
        } catch (error) {
            console.error('❌ Lỗi thực thi Slash:', error);
            if (!interaction.replied) await interaction.reply({ content: '❌ Lỗi hệ thống!', ephemeral: true });
        }
    }

    // 2. Xử lý Button (Dành cho lệnh !tasks)
    if (interaction.isButton()) {
        if (interaction.customId.startsWith('claim_tasks')) {
            const userId = interaction.customId.split('_')[2];
            if (interaction.user.id !== userId) {
                return interaction.reply({ content: '❌ Đây không phải bảng nhiệm vụ của bạn!', ephemeral: true });
            }
            // Gọi lại file tasks để xử lý logic claim
            const tasksCmd = require('./commands/tasks');
            // Giả lập interaction để chạy logic claim
            interaction.options = { getString: () => 'claim' }; 
            await tasksCmd.execute(interaction, prisma);
        }
    }
});

client.once('ready', () => {
    console.log(`✅ ${client.user.tag} đã sẵn sàng!`);
    deployCommands();
});

client.login(process.env.DISCORD_TOKEN);
