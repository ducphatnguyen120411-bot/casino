const { Client, GatewayIntentBits, REST, Routes } = require('discord.js');
const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
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

// --- 1. ĐĂNG KÝ LỆNH SLASH (Chỉ đăng ký những gì đang có) ---
async function deployCommands() {
    if (!process.env.DISCORD_TOKEN || !process.env.CLIENT_ID) {
        return console.error('❌ Thiếu DISCORD_TOKEN hoặc CLIENT_ID trong Variables');
    }

    // Danh sách chuẩn theo ảnh cấu trúc thư mục của ông
    const commandFiles = [
        './commands/bot_vi',
        './commands/bot_realestate',
        './commands/stock',
        './commands/bot_race',
        './commands/bot_daily'
    ];

    const commands = [];
    for (const path of commandFiles) {
        try {
            if (fs.existsSync(`${path}.js`)) {
                const cmd = require(path);
                if (cmd.data) commands.push(cmd.data.toJSON());
            }
        } catch (e) {
            console.error(`❌ Lỗi load ${path}:`, e.message);
        }
    }

    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
    try {
        console.log('🔄 Đang đồng bộ Slash Commands...');
        await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), { body: commands });
        console.log('✅ Đã đồng bộ tất cả lệnh!');
    } catch (e) { 
        console.error('❌ Lỗi đăng ký lệnh:', e); 
    }
}

// --- 2. TỰ ĐỘNG CẬP NHẬT THỊ TRƯỜNG (Mỗi 5 phút) ---
setInterval(async () => {
    try {
        const market = await prisma.market.upsert({
            where: { id: 1 },
            update: {}, 
            create: { id: 1, price: 100.0, history: [100.0] }
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
        console.log(`📈 Giá thị trường: ${newPrice.toFixed(2)} VCASH`);
    } catch (e) {
        console.error('❌ Lỗi DB (Kiểm tra DATABASE_URL):', e.message);
    }
}, 300000); 

// --- 3. XỬ LÝ TIN NHẮN & NHIỆM VỤ ---
client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.guild) return;

    // Lệnh Prefix !vi
    if (message.content.toLowerCase().startsWith('!vi')) {
        try {
            const vi = require('./commands/bot_vi');
            return vi.execute(message, prisma);
        } catch (e) { console.error(e); }
    }

    // Đếm tin nhắn và tạo User nếu chưa có
    try {
        await prisma.user.upsert({
            where: { id: message.author.id },
            update: { msgCount: { increment: 1 } },
            create: { id: message.author.id, balance: 1000, msgCount: 1 }
        });
    } catch (e) { console.error('❌ Lỗi lưu User:', e.message); }
});

// --- 4. XỬ LÝ LỆNH SLASH ---
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    const cmdName = interaction.commandName;
    let fileName = `./commands/bot_${cmdName}.js`;
    if (cmdName === 'stock') fileName = `./commands/stock.js`;

    try {
        if (fs.existsSync(fileName)) {
            const command = require(fileName);
            await command.execute(interaction, prisma);
        }
    } catch (error) {
        console.error('❌ Lỗi thực thi:', error);
    }
});

client.once('ready', () => {
    console.log(`✅ ${client.user.tag} đã sẵn sàng!`);
    deployCommands();
});

client.login(process.env.DISCORD_TOKEN);
