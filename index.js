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
const voiceSessions = new Map(); // Lưu thời gian vào voice
client.commands = new Collection(); // Lưu trữ Slash Commands

// --- 1. TỰ ĐỘNG LOAD SLASH COMMANDS ---
const commandFiles = fs.readdirSync('./commands').filter(file => file.endsWith('.js'));
const commandsJSON = [];

for (const file of commandFiles) {
    const command = require(`./commands/${file}`);
    if (command.data && command.execute) {
        client.commands.set(command.data.name, command);
        commandsJSON.push(command.data.toJSON());
    }
}

// --- 2. ĐĂNG KÝ SLASH COMMANDS VỚI DISCORD ---
async function deployCommands() {
    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
    try {
        console.log('🔄 Đang đồng bộ Slash Commands...');
        await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), { body: commandsJSON });
        console.log('✅ Đã đồng bộ tất cả lệnh!');
    } catch (e) {
        console.error('❌ Lỗi đăng ký lệnh:', e);
    }
}

// --- 3. XỬ LÝ LỆNH ADMIN (!nap, !tru) & MESSAGE ---
const ADMIN_ROLE_ID = '1465374336214106237';

client.on(Events.MessageCreate, async (message) => {
    if (message.author.bot || !message.guild) return;

    const args = message.content.trim().split(/ +/);
    const prefix = args.shift().toLowerCase();

    // Logic Admin (!nap, !tru)
    if (['!nap', '!tru'].includes(prefix) && message.member.roles.cache.has(ADMIN_ROLE_ID)) {
        try {
            const adminCmd = require('./commands/admin_logic.js'); // File logic admin tách riêng cho sạch
            return adminCmd.execute(message, prisma, prefix === '!nap' ? 'add' : 'sub');
        } catch (e) { console.error('Lỗi lệnh Admin:', e); }
    }

    // Tự động tạo User/Tăng msgCount
    await prisma.user.upsert({
        where: { id: message.author.id },
        update: { msgCount: { increment: 1 } },
        create: { id: message.author.id, balance: 1000, msgCount: 1 }
    }).catch(e => console.error('Lỗi DB User:', e.message));
});

// --- 4. XỬ LÝ SLASH INTERACTION ---
client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    const command = client.commands.get(interaction.commandName);
    if (!command) return;

    try {
        await command.execute(interaction, prisma);
    } catch (error) {
        console.error(error);
        if (!interaction.replied) await interaction.reply({ content: '❌ Lỗi thực thi lệnh!', ephemeral: true });
    }
});

// --- 5. HỆ THỐNG VOICE INCOME (Kiếm tiền từ BĐS) ---
client.on(Events.VoiceStateUpdate, async (oldState, newState) => {
    const userId = newState.id;

    // Khi vào voice
    if (!oldState.channelId && newState.channelId) {
        voiceSessions.set(userId, Date.now());
    }

    // Khi rời voice
    if (oldState.channelId && !newState.channelId) {
        const joinTime = voiceSessions.get(userId);
        if (!joinTime) return;

        const durationMins = Math.floor((Date.now() - joinTime) / 60000);
        voiceSessions.delete(userId);

        if (durationMins < 1) return;

        // Kiểm tra xem kênh này có phải là Nhà của ai đó không
        const house = await prisma.house.findUnique({ where: { channelId: oldState.channelId } });
        if (house) {
            const earn = Math.floor(durationMins * 25 * house.multiplier);
            await prisma.user.update({
                where: { id: userId },
                data: { balance: { increment: earn } }
            });

            // Nếu chủ nhà treo máy, nhà tăng giá trị
            if (house.ownerId === userId) {
                await prisma.house.update({
                    where: { id: house.id },
                    data: { currentValue: { increment: Math.floor(earn * 0.3) } }
                });
            }
        }
    }
});

// --- 6. CẬP NHẬT THỊ TRƯỜNG CHỨNG KHOÁN (5 Phút) ---
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
        console.log(`📈 Thị trường cập nhật: ${newPrice.toFixed(2)} VCASH`);
    } catch (e) { console.error('Lỗi Market:', e.message); }
}, 300000);

client.once('ready', () => {
    console.log(`✅ Đã đăng nhập: ${client.user.tag}`);
    deployCommands();
});

client.login(process.env.DISCORD_TOKEN);
