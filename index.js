require('dotenv').config(); // Tải biến môi trường từ file .env
const { Client, GatewayIntentBits, Collection, REST, Routes } = require('discord.js');
const { PrismaClient } = require('@prisma/client');
const fs = require('node:fs');
const path = require('node:path');

// 1. Khởi tạo Client với các quyền (Intents) cần thiết
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildVoiceStates, // Cần thiết cho Real Estate (Voice income)
        GatewayIntentBits.MessageContent,
    ],
});

// 2. Khởi tạo Prisma và gắn vào Client để dùng chung
const prisma = new PrismaClient();
client.prisma = prisma;
client.commands = new Collection();

// 3. Command Handler: Tự động nạp các file .js trong thư mục /commands
const commandsPath = path.join(__dirname, 'commands');
if (!fs.existsSync(commandsPath)) fs.mkdirSync(commandsPath); // Tự tạo thư mục nếu chưa có

const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
const commandsJSON = [];

console.log('--- 🛠️  ĐANG NẠP LỆNH ---');
for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const command = require(filePath);

    if ('data' in command && 'execute' in command) {
        client.commands.set(command.data.name, command);
        commandsJSON.push(command.data.toJSON());
        console.log(`✅ Đã nạp: /${command.data.name}`);
    } else {
        console.warn(`[⚠️] Lệnh tại ${file} thiếu "data" hoặc "execute".`);
    }
}

// 4. Sự kiện khi Bot sẵn sàng (Ready)
client.once('ready', async () => {
    console.log('--------------------------');
    console.log(`🚀 Bot đã sẵn sàng: ${client.user.tag}`);
    console.log('--------------------------');

    // Đăng ký Slash Commands với Discord
    const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);

    try {
        console.log('🔄 Đang đồng bộ Slash Commands...');
        
        // Đăng ký cho Guild cụ thể (Cập nhật ngay lập tức để test)
        await rest.put(
            Routes.applicationGuildCommands(client.user.id, process.env.GUILD_ID),
            { body: commandsJSON }
        );

        console.log('✨ Đồng bộ lệnh thành công!');
    } catch (error) {
        console.error('❌ Lỗi khi đăng ký lệnh:', error);
    }
});

// 5. Xử lý tương tác (Interaction Handler)
client.on('interactionCreate', async interaction => {
    // Chỉ xử lý lệnh Chat Input (Slash Commands)
    if (!interaction.isChatInputCommand()) return;

    const command = client.commands.get(interaction.commandName);
    if (!command) return;

    try {
        // Thực thi lệnh (Truyền prisma vào để các file command sử dụng)
        await command.execute(interaction, prisma);
    } catch (error) {
        console.error(`❌ Lỗi thực thi lệnh ${interaction.commandName}:`, error);

        const errorMessage = { 
            content: '⚠️ Đã xảy ra lỗi nội bộ khi thực hiện lệnh này!', 
            ephemeral: true 
        };

        if (interaction.replied || interaction.deferred) {
            await interaction.followUp(errorMessage).catch(() => {});
        } else {
            await interaction.reply(errorMessage).catch(() => {});
        }
    }
});

// 6. Xử lý các lỗi hệ thống (Chống Crash Bot)
process.on('unhandledRejection', error => {
    console.error('🔴 Lỗi chưa xử lý (Unhandled Rejection):', error);
});

process.on('uncaughtException', error => {
    console.error('🔴 Lỗi chưa xử lý (Uncaught Exception):', error);
});

// 7. Đăng nhập
client.login(process.env.TOKEN);
