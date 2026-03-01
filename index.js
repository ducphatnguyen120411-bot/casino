const { Client, GatewayIntentBits, Collection } = require('discord.js');
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
client.commands = new Collection();

// Import các module lệnh
const daily = require('./commands/bot_daily');
const stock = require('./commands/bot_stock');
const blackmarket = require('./commands/bot_blackmarket');
const realestate = require('./commands/bot_realestate');
const reaction = require('./commands/bot_reaction');
const race = require('./commands/bot_race');

client.on('ready', () => {
    console.log(`✅ Verdict Cash System is online as ${client.user.tag}`);
});

client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.content.startsWith('!')) return;

    const args = message.content.slice(1).trim().split(/ +/);
    const command = args.shift().toLowerCase();

    // Logic xử lý lệnh (Ví dụ sơ khai)
    if (command === 'daily') daily.execute(message, prisma);
    if (command === 'stock') stock.execute(message, args, prisma);
    if (command === 'blackmarket') blackmarket.execute(message, args, prisma);
    if (command === 'duel') reaction.execute(message, prisma);
    if (command === 'race') race.execute(message, args, prisma);
});

// Logic Real Estate: Cộng tiền khi ở trong Voice Channel
client.on('voiceStateUpdate', (oldState, newState) => {
    realestate.handleVoice(oldState, newState, prisma);
});

client.login(process.env.DISCORD_TOKEN);
