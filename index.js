const { Client, GatewayIntentBits, Collection, REST, Routes } = require('discord.js');
const { PrismaClient } = require('@prisma/client');
const fs = require('fs'); // Thêm để kiểm tra file tồn tại
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

// --- 1. ĐĂNG KÝ LỆNH SLASH (Chống crash khi thiếu file) ---
async function deployCommands() {
    if (!process.env.DISCORD_TOKEN || !process.env.CLIENT_ID) {
        return console.error('❌ Thiếu biến môi trường CLIENT_ID hoặc TOKEN');
    }

    const commandFiles = [
        './commands/bot_vi',
        './commands/bot_realestate',
        './commands/stock',
        './commands/bot_race',
        './commands/bot_daily',
        './commands/tasks' // File gây lỗi ở ảnh image_ce7d73.png
    ];

    const commands = [];
    for (const path of commandFiles) {
        try {
            if (fs.existsSync(`${path}.js`)) {
                const cmd = require(path);
                if (cmd.data) commands.push(cmd.data.toJSON());
            } else {
                console.warn(`⚠️ Bỏ qua: Không tìm thấy file ${path}.js`);
            }
        } catch (e) {
            console.error(`❌ Lỗi khi load ${path}:`, e.message);
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

// --- 2. CẬP NHẬT THỊ TRƯỜNG (Fix lỗi No tables) ---
setInterval(async () => {
    try {
        const market = await prisma.market.upsert({
            where: { id: 1 },
            update: {}, 
            create: { id: 1, price: 100.0, history: [100.0] }
        });
        // ... logic cập nhật giá ...
    } catch (e) {
        console.error('❌ Lỗi DB: Kiểm tra lại DATABASE_URL (P1001)');
    }
}, 300000); 

// --- 3. XỬ LÝ INTERACTION ---
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand()) return;
    
    // Tự động tìm file tương ứng với tên lệnh
    const cmdName = interaction.commandName;
    let fileName = `./commands/bot_${cmdName}.js`;
    
    // Ngoại lệ cho các file không có tiền tố bot_
    if (cmdName === 'tasks' || cmdName === 'stock') fileName = `./commands/${cmdName}.js`;

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
