const { Client, GatewayIntentBits, REST, Routes, Collection, Events } = require('discord.js');
const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path'); // Thêm path để quản lý đường dẫn chuẩn hơn
require('dotenv').config();

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildVoiceStates // Bắt buộc để chạy BĐS Voice
    ]
});

const prisma = new PrismaClient();
client.commands = new Collection();

// --- 1. LOAD COMMANDS (SLASH & MODULES) ---
const commandFiles = fs.readdirSync('./commands').filter(file => file.endsWith('.js'));
const commandsJSON = [];

// Pre-load các module prefix để tối ưu hiệu năng
const prefixModules = {
    admin: fs.existsSync('./commands/admin.js') ? require('./commands/admin.js') : null,
    vi: fs.existsSync('./commands/bot_vi.js') ? require('./commands/bot_vi.js') : null,
    daily: fs.existsSync('./commands/bot_daily.js') ? require('./commands/bot_daily.js') : null
};

for (const file of commandFiles) {
    const command = require(`./commands/${file}`);
    if (command.data && command.execute) {
        client.commands.set(command.data.name, command);
        commandsJSON.push(command.data.toJSON());
    }
}

// --- 2. VOICE STATE UPDATER (Dành cho Bất Động Sản) ---
client.on(Events.VoiceStateUpdate, async (oldState, newState) => {
    const realEstate = client.commands.get('realestate');
    if (realEstate && realEstate.handleVoice) {
        // Chạy ngầm để không block các tiến trình khác
        realEstate.handleVoice(oldState, newState, prisma).catch(e => console.error('❌ Lỗi Voice BĐS:', e));
    }
});

// --- 3. XỬ LÝ MESSAGE (PREFIX COMMANDS) ---
client.on(Events.MessageCreate, async (message) => {
    if (message.author.bot || !message.guild) return;

    // Chat to Earn & Tự động tạo User (Dùng catch để tránh treo bot)
    try {
        await prisma.user.upsert({
            where: { id: message.author.id },
            update: { msgCount: { increment: 1 } },
            create: { id: message.author.id, balance: 1000, msgCount: 1 }
        });
    } catch (e) { console.error('Lỗi DB User:', e.message); }

    if (!message.content.startsWith('!')) return;

    const args = message.content.slice(1).trim().split(/ +/);
    const commandName = args.shift().toLowerCase();

    try {
        if (['nap', 'tru', 'pay'].includes(commandName) && prefixModules.admin) {
            return await prefixModules.admin.execute(message, prisma, args, commandName);
        }
        if (commandName === 'vi' && prefixModules.vi) {
            return await prefixModules.vi.execute(message, prisma);
        }
        if (commandName === 'daily' && prefixModules.daily) {
            return await prefixModules.daily.execute(message, prisma);
        }
    } catch (e) {
        console.error(`❌ Lỗi lệnh !${commandName}:`, e.message);
    }
});

// --- 4. XỬ LÝ SLASH INTERACTION (Lệnh /) ---
client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isChatInputCommand()) return;
    const command = client.commands.get(interaction.commandName);
    if (!command) return;

    try {
        await command.execute(interaction, prisma);
    } catch (error) {
        console.error(`❌ Lỗi lệnh /${interaction.commandName}:`, error);
        const errorMsg = { content: '❌ Có lỗi xảy ra khi thực thi lệnh!', ephemeral: true };
        if (interaction.deferred || interaction.replied) await interaction.editReply(errorMsg);
        else await interaction.reply(errorMsg);
    }
});

// --- 5. HỆ THỐNG THỊ TRƯỜNG (MARKET) ---
setInterval(async () => {
    try {
        const market = await prisma.market.findUnique({ where: { id: 1 } });
        const oldPrice = market ? market.price : 100.0;
        
        const change = (Math.random() * 4 - 2); 
        const newPrice = Math.max(10, oldPrice + (oldPrice * (change / 100)));
        
        let history = [];
        if (market && market.history) {
            try { 
                history = typeof market.history === 'string' ? JSON.parse(market.history) : market.history; 
            } catch (e) { history = []; }
        }
        
        history.push(parseFloat(newPrice.toFixed(2)));
        if (history.length > 20) history.shift();

        await prisma.market.upsert({
            where: { id: 1 },
            update: { price: newPrice, history: JSON.stringify(history) },
            create: { id: 1, price: newPrice, history: JSON.stringify(history) }
        });
        console.log(`📈 [MARKET] Updated: ${newPrice.toFixed(2)} VCASH`);
    } catch (e) { console.error('❌ Lỗi Market:', e.message); }
}, 300000);

// --- 6. KHỞI CHẠY BOT ---
client.once('ready', async () => {
    console.log(`✅ Bot Online: ${client.user.tag}`);
    
    // Đăng ký Slash Commands
    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
    try {
        await rest.put(
            Routes.applicationCommands(process.env.CLIENT_ID),
            { body: commandsJSON }
        );
        console.log('✅ Đã đồng bộ Slash Commands thành công!');
    } catch (error) {
        console.error('❌ Lỗi đồng bộ Slash Commands:', error);
    }
});

// Chống crash bot khi gặp lỗi không mong muốn
process.on('unhandledRejection', error => console.error('Unhandled promise rejection:', error));

client.login(process.env.DISCORD_TOKEN);
