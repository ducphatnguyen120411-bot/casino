const { Client, GatewayIntentBits, REST, Routes, Collection, Events } = require('discord.js');
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
client.commands = new Collection();

// --- 1. LOAD SLASH COMMANDS ---
const commandFiles = fs.readdirSync('./commands').filter(file => file.endsWith('.js'));
const commandsJSON = [];

for (const file of commandFiles) {
    const command = require(`./commands/${file}`);
    if (command.data && command.execute) {
        client.commands.set(command.data.name, command);
        commandsJSON.push(command.data.toJSON());
    }
}

// --- 2. XỬ LÝ LỆNH PREFIX (!nap, !tru, !pay, !vi, !daily) ---
const ADMIN_ROLE_ID = '1465374336214106237';

client.on(Events.MessageCreate, async (message) => {
    if (message.author.bot || !message.guild) return;

    // Tự động tạo User & Đếm tin nhắn (Chat to Earn)
    await prisma.user.upsert({
        where: { id: message.author.id },
        update: { msgCount: { increment: 1 } },
        create: { id: message.author.id, balance: 1000, msgCount: 1 }
    }).catch(e => console.error('Lỗi DB User:', e.message));

    if (!message.content.startsWith('!')) return;

    const args = message.content.slice(1).trim().split(/ +/);
    const command = args.shift().toLowerCase();

    try {
        // Phân luồng lệnh Tiền tệ (Sửa lỗi đường dẫn module)
        if (['nap', 'tru', 'pay'].includes(command)) {
            const adminModule = require('./commands/admin.js');
            return await adminModule.execute(message, prisma, args, command);
        }

        // Phân luồng lệnh Cá nhân
        if (command === 'vi') {
            const vi = require('./commands/bot_vi.js');
            return await vi.execute(message, prisma);
        }

        if (command === 'daily') {
            const daily = require('./commands/bot_daily.js');
            return await daily.execute(message, prisma);
        }
    } catch (e) {
        console.error(`❌ Lỗi thực thi lệnh !${command}:`, e.message);
    }
});

// --- 3. XỬ LÝ SLASH INTERACTION (Lệnh /) ---
client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isChatInputCommand()) return;
    const command = client.commands.get(interaction.commandName);
    if (!command) return;
    try {
        await command.execute(interaction, prisma);
    } catch (error) {
        console.error(error);
        if (!interaction.replied) await interaction.reply({ content: '❌ Có lỗi xảy ra!', ephemeral: true });
    }
});

// --- 4. CẬP NHẬT THỊ TRƯỜNG (Sửa lỗi 'history' Invalid value) ---
setInterval(async () => {
    try {
        const market = await prisma.market.findUnique({ where: { id: 1 } });
        const oldPrice = market ? market.price : 100.0;
        
        const change = (Math.random() * 4 - 2); 
        const newPrice = Math.max(10, oldPrice + (oldPrice * (change / 100)));
        
        // Fix lỗi: Luôn lưu history dưới dạng String (JSON)
        let history = [];
        if (market && market.history) {
            try { history = JSON.parse(market.history); } catch (e) { history = []; }
        }
        
        history.push(parseFloat(newPrice.toFixed(2)));
        if (history.length > 20) history.shift();

        await prisma.market.upsert({
            where: { id: 1 },
            update: { 
                price: newPrice, 
                history: JSON.stringify(history) // Chuyển mảng thành chuỗi String
            },
            create: { 
                id: 1, 
                price: newPrice, 
                history: JSON.stringify(history) 
            }
        });
        console.log(`📈 Thị trường cập nhật: ${newPrice.toFixed(2)} VCASH`);
    } catch (e) { console.error('❌ Lỗi Market:', e.message); }
}, 300000); // 5 phút

client.once('ready', () => {
    console.log(`✅ Đã đăng nhập: ${client.user.tag}`);
    
    // Đăng ký Slash Commands
    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
    rest.put(Routes.applicationCommands(process.env.CLIENT_ID), { body: commandsJSON })
        .then(() => console.log('✅ Đã đồng bộ Slash Commands'))
        .catch(console.error);
});

client.login(process.env.DISCORD_TOKEN);
