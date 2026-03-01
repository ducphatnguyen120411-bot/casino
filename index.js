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
client.on(Events.MessageCreate, async (message) => {
    if (message.author.bot || !message.guild) return;

    // Chat to Earn & Tự động tạo User
    await prisma.user.upsert({
        where: { id: message.author.id },
        update: { msgCount: { increment: 1 } },
        create: { id: message.author.id, balance: 1000, msgCount: 1 }
    }).catch(e => console.error('Lỗi DB User:', e.message));

    if (!message.content.startsWith('!')) return;

    const args = message.content.slice(1).trim().split(/ +/);
    const command = args.shift().toLowerCase();

    try {
        // Fix lỗi MODULE_NOT_FOUND bằng cách trỏ đúng vào thư mục commands
        if (['nap', 'tru', 'pay'].includes(command)) {
            const adminModule = require('./commands/admin.js');
            return await adminModule.execute(message, prisma, args, command);
        }

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
        // Truyền prisma vào để fix lỗi undefined findUnique
        await command.execute(interaction, prisma);
    } catch (error) {
        console.error(error);
        if (!interaction.replied) await interaction.reply({ content: '❌ Có lỗi xảy ra!', ephemeral: true });
    }
});

// --- 4. CẬP NHẬT THỊ TRƯỜNG (Fix lỗi 'history' Invalid value) ---
setInterval(async () => {
    try {
        const market = await prisma.market.findUnique({ where: { id: 1 } });
        const oldPrice = market ? market.price : 100.0;
        
        const change = (Math.random() * 4 - 2); 
        const newPrice = Math.max(10, oldPrice + (oldPrice * (change / 100)));
        
        // Luôn đảm bảo history là một mảng trước khi stringify
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
            update: { 
                price: newPrice, 
                history: JSON.stringify(history) // Fix: Chuyển về String để DB không báo lỗi
            },
            create: { 
                id: 1, 
                price: newPrice, 
                history: JSON.stringify(history) 
            }
        });
        console.log(`📈 Market Update: ${newPrice.toFixed(2)} VCASH`);
    } catch (e) { console.error('❌ Lỗi Market:', e.message); }
}, 300000);

client.once('ready', () => {
    console.log(`✅ Bot Online: ${client.user.tag}`);
    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
    rest.put(Routes.applicationCommands(process.env.CLIENT_ID), { body: commandsJSON })
        .then(() => console.log('✅ Đã đồng bộ Slash Commands'))
        .catch(console.error);
});

client.login(process.env.DISCORD_TOKEN);
