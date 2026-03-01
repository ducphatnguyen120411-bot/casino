const { Client, GatewayIntentBits, Collection, Events, REST, Routes } = require('discord.js');
const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
require('dotenv').config();

// 1. Khởi tạo Client với đầy đủ Intents
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildVoiceStates // Quan trọng cho RealEstate
    ]
});

const prisma = new PrismaClient();
client.commands = new Collection();

// 2. Tự động Load tất cả Commands trong thư mục /commands
const commandFiles = fs.readdirSync('./commands').filter(file => file.endsWith('.js'));
const slashCommandsJSON = [];

for (const file of commandFiles) {
    try {
        const command = require(`./commands/${file}`);
        // Lưu vào Collection để dùng cho cả Slash và Prefix
        if (command.data) {
            client.commands.set(command.data.name, command);
            slashCommandsJSON.push(command.data.toJSON());
        } else if (command.name) {
            client.commands.set(command.name, command);
        }
    } catch (error) {
        console.error(`❌ Không thể load file ${file}:`, error.message);
    }
}

// 3. Sự kiện: Khi Bot sẵn sàng (Ready)
client.once(Events.ClientReady, async (c) => {
    console.log(`✅ Bot Online: ${c.user.tag}`);
    
    // Đăng ký Slash Commands với Discord
    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
    try {
        await rest.put(
            Routes.applicationCommands(process.env.CLIENT_ID),
            { body: slashCommandsJSON }
        );
        console.log('🚀 Đã đồng bộ thành công Slash Commands!');
    } catch (error) {
        console.error('❌ Lỗi đồng bộ Slash Commands:', error);
    }
});

// 4. Xử lý Lệnh Prefix (Dành cho TaiXiu, Vi, Daily, RealEstate...)
client.on(Events.MessageCreate, async (message) => {
    if (message.author.bot || !message.guild) return;

    // Chat to Earn (Cộng 10 Cash mỗi tin nhắn)
    await prisma.user.upsert({
        where: { id: message.author.id },
        update: { balance: { increment: 10 }, msgCount: { increment: 1 } },
        create: { id: message.author.id, balance: 1010, msgCount: 1 }
    }).catch(() => {});

    if (!message.content.startsWith('!')) return;

    const args = message.content.slice(1).trim().split(/ +/);
    const commandName = args.shift().toLowerCase();
    const command = client.commands.get(commandName);

    if (!command) return;

    try {
        // Hỗ trợ truyền prisma vào lệnh
        await command.execute(message, prisma, args, commandName);
    } catch (error) {
        console.error(`Lỗi thực thi !${commandName}:`, error);
        message.reply('⚠️ Có lỗi xảy ra khi thực hiện lệnh này!');
    }
});

// 5. Xử lý Slash Commands (Lệnh /)
client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    const command = client.commands.get(interaction.commandName);
    if (!command) return;

    try {
        await command.execute(interaction, prisma);
    } catch (error) {
        console.error(`Lỗi thực thi /${interaction.commandName}:`, error);
        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({ content: '❌ Lỗi hệ thống!', ephemeral: true });
        }
    }
});

// 6. Xử lý Voice Events (Dành riêng cho RealEstate - Thuê nhà cộng tiền)
client.on(Events.VoiceStateUpdate, async (oldState, newState) => {
    const reCommand = client.commands.get('realestate');
    if (reCommand && reCommand.handleVoice) {
        await reCommand.handleVoice(oldState, newState, prisma);
    }
});

// 7. Hệ thống Market Engine (Biến động giá Stock mỗi 5 phút)
setInterval(async () => {
    try {
        const stocks = await prisma.stock.findMany();
        for (const s of stocks) {
            const change = 1 + (Math.random() * 0.04 - 0.02); // -2% đến +2%
            const newPrice = Math.max(1, s.price * change);
            
            let history = [];
            try { history = JSON.parse(s.history || "[]"); } catch(e) { history = []; }
            history.push(parseFloat(newPrice.toFixed(2)));
            if (history.length > 20) history.shift();

            await prisma.stock.update({
                where: { symbol: s.symbol },
                data: { price: newPrice, history: JSON.stringify(history) }
            });
        }
        console.log('📉 [Market] Giá cổ phiếu đã cập nhật.');
    } catch (e) { console.error('Lỗi Market Engine:', e.message); }
}, 300000);

// Kết nối
client.login(process.env.DISCORD_TOKEN);
