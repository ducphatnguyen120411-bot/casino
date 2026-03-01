const { EmbedBuilder, SlashCommandBuilder, AttachmentBuilder } = require('discord.js');

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

    async execute(interaction, prisma) {
        // Hỗ trợ cả Prefix và Slash
        const isSlash = interaction.options !== undefined;
        if (isSlash) await interaction.deferReply();

        const userAuth = isSlash ? interaction.user : interaction.author;
        const subcommand = isSlash ? interaction.options.getSubcommand() : interaction.content.split(' ')[1];
        const symbol = (isSlash ? interaction.options.getString('symbol') : interaction.content.split(' ')[2])?.toUpperCase() || 'VCASH';
        const qty = isSlash ? interaction.options.getInteger('qty') : parseInt(interaction.content.split(' ')[3]);

        // 1. LẤY DỮ LIỆU CỔ PHIẾU
        let stock = await prisma.stock.findUnique({ where: { symbol } });
        if (!stock) {
            // Danh sách mã mặc định
            const defaults = {
                'VCASH': { name: 'Verdict Cash Coin', price: 100 },
                'BTC': { name: 'Bitcoin Digital', price: 55000 },
                'GOLD': { name: 'SJC Gold Bar', price: 2400 },
                'TSLA': { name: 'Tesla Inc', price: 180 }
            };
            const def = defaults[symbol];
            if (!def) {
                const msg = `❌ Mã **${symbol}** không tồn tại trên sàn!`;
                return isSlash ? interaction.editReply(msg) : interaction.reply(msg);
            }
            stock = await prisma.stock.create({
                data: { symbol, name: def.name, price: def.price, history: JSON.stringify([def.price]) }
            });
        }

        // 2. LẤY DỮ LIỆU USER
        let userData = await prisma.user.findUnique({ where: { id: userAuth.id } });
        if (!userData) {
            userData = await prisma.user.create({ data: { id: userAuth.id, balance: 5000, stocks: "{}" } });
        }

        let portfolio = {};
        try { portfolio = JSON.parse(userData.stocks || "{}"); } catch(e) { portfolio = {}; }
        const owned = portfolio[symbol] || 0;

        // --- LỆNH VIEW ---
        if (subcommand === 'view' || !subcommand) {
            let history = [];
            try { history = JSON.parse(stock.history || "[]"); } catch(e) { history = [stock.price]; }
            
            const currentPrice = stock.price;
            const openPrice = history[0] || currentPrice;
            const diff = currentPrice - openPrice;
            const diffPct = ((diff / openPrice) * 100).toFixed(2);
            const trendIcon = diff >= 0 ? '📈' : '📉';
            const color = diff >= 0 ? '#00ff7f' : '#ff4757';

            // Vẽ biểu đồ xịn hơn
            const chartData = history.slice(-15);
            const visualChart = createVisualChart(chartData);

            const embed = new EmbedBuilder()
                .setTitle(`${trendIcon} NIÊM YẾT: ${stock.symbol} (${stock.name})`)
                .setColor(color)
                .setThumbnail(userAuth.displayAvatarURL())
                .addFields(
                    { name: '💵 Giá hiện tại', value: `\`${currentPrice.toLocaleString()} VCASH\``, inline: true },
                    { name: '📊 Biến động', value: `\`${diff >= 0 ? '+' : ''}${diffPct}%\``, inline: true },
                    { name: '💼 Sở hữu', value: `\`${owned}\` đơn vị (Trị giá: \`${(owned * currentPrice).toLocaleString()}\`)`, inline: false },
                    { name: '🕒 Biểu đồ nến (Gần nhất)', value: `\`\`\`diff\n${visualChart}\n\`\`\`` }
                )
                .setFooter({ text: 'Sàn VSE • Phí giao dịch 1% • Lệnh: !stock buy/sell [mã] [số lượng]' })
                .setTimestamp();

            return isSlash ? interaction.editReply({ embeds: [embed] }) : interaction.reply({ embeds: [embed] });
        }

        // --- LỆNH BUY / SELL ---
        if (subcommand === 'buy' || subcommand === 'sell') {
            if (!qty || qty <= 0) {
                const msg = '⚠️ Số lượng phải lớn hơn 0!';
                return isSlash ? interaction.editReply(msg) : interaction.reply(msg);
            }

            const fee = 0.01;
            if (subcommand === 'buy') {
                const totalCost = (qty * stock.price) * (1 + fee);
                if (userData.balance < totalCost) {
                    const msg = `❌ Không đủ tiền! Cần \`${totalCost.toLocaleString()}\` VCASH.`;
                    return isSlash ? interaction.editReply(msg) : interaction.reply(msg);
                }
                portfolio[symbol] = (portfolio[symbol] || 0) + qty;
                await prisma.user.update({
                    where: { id: userAuth.id },
                    data: { balance: { decrement: totalCost }, stocks: JSON.stringify(portfolio) }
                });
                const msg = `✅ Đã mua \`${qty}\` **${symbol}**. Tổng chi: \`${totalCost.toLocaleString()}\` (Phí 1%)`;
                return isSlash ? interaction.editReply(msg) : interaction.reply(msg);
            }

            if (subcommand === 'sell') {
                if (owned < qty) {
                    const msg = `❌ Bạn chỉ có \`${owned}\` cổ phiếu **${symbol}**!`;
                    return isSlash ? interaction.editReply(msg) : interaction.reply(msg);
                }
                const totalGain = (qty * stock.price) * (1 - fee);
                portfolio[symbol] = owned - qty;
                await prisma.user.update({
                    where: { id: userAuth.id },
                    data: { balance: { increment: totalGain }, stocks: JSON.stringify(portfolio) }
                });
                const msg = `✅ Đã bán \`${qty}\` **${symbol}**. Nhận về: \`${totalGain.toLocaleString()}\` (Phí 1%)`;
                return isSlash ? interaction.editReply(msg) : interaction.reply(msg);
            }
        }
    }
};

// HÀM VẼ BIỂU ĐỒ NẾN MÀU SẮC (Dùng Diff Highlight)
function createVisualChart(data) {
    if (data.length < 2) return "Chưa đủ dữ liệu biểu đồ...";
    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min;
    const bars = [' ', '▂', '▃', '▄', '▅', '▆', '▇', '█'];
    
    let result = "";
    for (let i = 0; i < data.length; i++) {
        const val = data[i];
        const prev = data[i-1] || val;
        const prefix = val >= prev ? "+" : "-"; // Dùng ký tự của Markdown diff
        const index = range === 0 ? 3 : Math.floor(((val - min) / range) * (bars.length - 1));
        result += `${prefix} ${bars[index]} `;
    }
    return result;
}
