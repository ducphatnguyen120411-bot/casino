const { EmbedBuilder, SlashCommandBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('stock')
        .setDescription('📈 Sàn chứng khoán tập trung Verdict (VSE)')
        .addSubcommand(sub => 
            sub.setName('view')
            .setDescription('Xem bảng giá và biểu đồ')
            .addStringOption(opt => opt.setName('symbol').setDescription('Mã: VCASH, BTC, GOLD, TSLA...').setRequired(false)))
        .addSubcommand(sub => 
            sub.setName('buy')
            .setDescription('Mua cổ phiếu')
            .addStringOption(opt => opt.setName('symbol').setRequired(true).setDescription('Mã niêm yết'))
            .addIntegerOption(opt => opt.setName('qty').setRequired(true).setDescription('Số lượng mua')))
        .addSubcommand(sub => 
            sub.setName('sell')
            .setDescription('Bán cổ phiếu')
            .addStringOption(opt => opt.setName('symbol').setRequired(true).setDescription('Mã niêm yết'))
            .addIntegerOption(opt => opt.setName('qty').setRequired(true).setDescription('Số lượng bán'))),

    async execute(interaction) {
        // LẤY PRISMA TỪ CLIENT (Quan trọng để fix lỗi undefined)
        const { prisma } = interaction.client; 
        if (!prisma) return interaction.reply({ content: "❌ Lỗi hệ thống: Không tìm thấy kết nối Database!", ephemeral: true });

        await interaction.deferReply();

        const userAuth = interaction.user;
        const subcommand = interaction.options.getSubcommand();
        const symbol = interaction.options.getString('symbol')?.toUpperCase() || 'VCASH';
        const qty = interaction.options.getInteger('qty');

        // 1. DỮ LIỆU CỔ PHIẾU
        let stock = await prisma.stock.findUnique({ where: { symbol } });
        
        if (!stock) {
            const defaults = {
                'VCASH': { name: 'Verdict Cash Coin', price: 100 },
                'BTC': { name: 'Bitcoin Digital', price: 55000 },
                'GOLD': { name: 'SJC Gold Bar', price: 2400 },
                'TSLA': { name: 'Tesla Inc', price: 180 }
            };
            const def = defaults[symbol];
            if (!def) return interaction.editReply(`❌ Mã **${symbol}** không tồn tại trên sàn!`);
            
            stock = await prisma.stock.create({
                data: { symbol, name: def.name, price: def.price, history: JSON.stringify([def.price]) }
            });
        }

        // 2. DỮ LIỆU USER
        let userData = await prisma.user.findUnique({ where: { id: userAuth.id } });
        if (!userData) {
            userData = await prisma.user.create({ data: { id: userAuth.id, balance: 5000, stocks: "{}" } });
        }

        let portfolio = {};
        try { portfolio = JSON.parse(userData.stocks || "{}"); } catch(e) { portfolio = {}; }
        const owned = portfolio[symbol] || 0;

        // --- LỆNH VIEW ---
        if (subcommand === 'view') {
            let history = [];
            try { history = JSON.parse(stock.history || "[]"); } catch(e) { history = [stock.price]; }
            
            const currentPrice = stock.price;
            const openPrice = history[0] || currentPrice;
            const diff = currentPrice - openPrice;
            const diffPct = ((diff / openPrice) * 100).toFixed(2);
            const color = diff >= 0 ? 0x00FF7F : 0xFF4757;

            const visualChart = createVisualChart(history.slice(-20));

            const embed = new EmbedBuilder()
                .setTitle(`${diff >= 0 ? '📈' : '📉'} THỊ TRƯỜNG: ${stock.symbol}`)
                .setDescription(`**${stock.name}**`)
                .setColor(color)
                .addFields(
                    { name: '💰 Giá khớp lệnh', value: `\`${currentPrice.toLocaleString()}\` VCASH`, inline: true },
                    { name: '📊 Biến động (24h)', value: `\`${diff >= 0 ? '+' : ''}${diffPct}%\``, inline: true },
                    { name: '💳 Ví của bạn', value: `\`${userData.balance.toLocaleString()}\` VCASH`, inline: true },
                    { name: '💼 Đang sở hữu', value: `\`${owned}\` đơn vị (≈ \`${(owned * currentPrice).toLocaleString()}\`)` },
                    { name: '🕒 Diễn biến giá', value: `\`\`\`diff\n${visualChart}\n\`\`\`` }
                )
                .setFooter({ text: 'Sàn VSE • Phí 1% • Cập nhật mỗi 5 phút' })
                .setTimestamp();

            return interaction.editReply({ embeds: [embed] });
        }

        // --- LỆNH BUY / SELL ---
        const fee = 0.01;
        if (subcommand === 'buy') {
            const totalCost = Math.round((qty * stock.price) * (1 + fee));
            if (userData.balance < totalCost) return interaction.editReply(`❌ Bạn thiếu \`${(totalCost - userData.balance).toLocaleString()}\` VCASH để thực hiện lệnh này.`);

            portfolio[symbol] = (portfolio[symbol] || 0) + qty;
            await prisma.user.update({
                where: { id: userAuth.id },
                data: { balance: { decrement: totalCost }, stocks: JSON.stringify(portfolio) }
            });

            return interaction.editReply(`✅ **Mua thành công!** Bạn đã mua \`${qty}\` ${symbol} với giá \`${totalCost.toLocaleString()}\` VCASH.`);
        }

        if (subcommand === 'sell') {
            if (owned < qty) return interaction.editReply(`❌ Bạn chỉ có \`${owned}\` cổ phiếu **${symbol}**!`);

            const totalGain = Math.round((qty * stock.price) * (1 - fee));
            portfolio[symbol] = owned - qty;
            await prisma.user.update({
                where: { id: userAuth.id },
                data: { balance: { increment: totalGain }, stocks: JSON.stringify(portfolio) }
            });

            return interaction.editReply(`✅ **Bán thành công!** Bạn nhận về \`${totalGain.toLocaleString()}\` VCASH sau khi trừ phí.`);
        }
    }
};

function createVisualChart(data) {
    if (data.length < 2) return "Đang khởi tạo dữ liệu...";
    const max = Math.max(...data);
    const min = Math.min(...data);
    const range = max - min || 1;
    const levels = [' ', '▂', '▃', '▄', '▅', '▆', '▇', '█'];
    
    return data.map((val, i) => {
        const prev = data[i-1] || val;
        const prefix = val >= prev ? "+" : "-";
        const idx = Math.floor(((val - min) / range) * 7);
        return `${prefix}${levels[idx]}`;
    }).join(' ');
}
