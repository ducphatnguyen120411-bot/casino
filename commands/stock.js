const { EmbedBuilder, SlashCommandBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('stock')
        .setDescription('📈 Sàn chứng khoán tập trung Verdict (VSE)')
        .addSubcommand(sub => 
            sub.setName('view')
                .setDescription('Xem bảng giá và biểu đồ')
                // .setRequired(false) giúp người dùng chỉ cần gõ /stock view rồi Enter luôn
                .addStringOption(opt => opt.setName('symbol').setDescription('Mã niêm yết (Mặc định: VCASH)').setRequired(false)))
        .addSubcommand(sub => 
            sub.setName('buy')
                .setDescription('Mua tài sản niêm yết')
                .addStringOption(opt => opt.setName('symbol').setRequired(true).setDescription('Mã niêm yết'))
                .addIntegerOption(opt => opt.setName('qty').setRequired(true).setMinValue(1).setDescription('Số lượng mua')))
        .addSubcommand(sub => 
            sub.setName('sell')
                .setDescription('Bán tài sản đang sở hữu')
                .addStringOption(opt => opt.setName('symbol').setRequired(true).setDescription('Mã niêm yết'))
                .addIntegerOption(opt => opt.setName('qty').setRequired(true).setMinValue(1).setDescription('Số lượng bán'))),

    async execute(interaction) {
        const { prisma } = interaction.client; 
        if (!prisma) return interaction.reply({ content: "❌ Lỗi hệ thống: Không tìm thấy kết nối Database!", ephemeral: true });

        await interaction.deferReply();

        const userAuth = interaction.user;
        const subcommand = interaction.options.getSubcommand();
        // Nếu không nhập symbol, tự động lấy 'VCASH'
        const symbol = (interaction.options.getString('symbol') || 'VCASH').toUpperCase();
        const qty = interaction.options.getInteger('qty');

        // 1. KIỂM TRA TRẠNG THÁI SÀN (Từ bảng Market)
        const market = await prisma.market.findUnique({ where: { id: 1 } });
        if (market?.status === 'CLOSED' && subcommand !== 'view') {
            return interaction.editReply("🛑 **Sàn chứng khoán hiện đang đóng cửa nghỉ lễ!**");
        }

        // 2. XỬ LÝ DỮ LIỆU STOCK
        let stock = await prisma.stock.findUnique({ where: { symbol } });
        if (!stock) {
            const defaults = {
                'VCASH': { name: 'Verdict Cash Coin', price: 100.0 },
                'BTC': { name: 'Bitcoin Digital', price: 55000.0 },
                'GOLD': { name: 'SJC Gold Bar', price: 2400.0 },
                'TSLA': { name: 'Tesla Inc', price: 180.0 }
            };
            const def = defaults[symbol];
            if (!def) return interaction.editReply(`❌ Mã **${symbol}** không có trên sàn VSE!`);
            
            stock = await prisma.stock.create({
                data: { symbol, name: def.name, price: def.price, history: JSON.stringify([def.price]) }
            });
        }

        // 3. XỬ LÝ DỮ LIỆU USER
        const userData = await prisma.user.upsert({
            where: { id: userAuth.id },
            update: {},
            create: { id: userAuth.id, balance: 100000, stocks: "{}" }
        });

        let portfolio = {};
        try { portfolio = JSON.parse(userData.stocks || "{}"); } catch(e) { portfolio = {}; }
        const owned = portfolio[symbol] || 0;
        const feeRate = 0.01; // Phí 1%

        // --- LOGIC LỆNH VIEW ---
        if (subcommand === 'view') {
            let history = [];
            try { history = JSON.parse(stock.history || "[]"); } catch(e) { history = [stock.price]; }
            
            const currentPrice = stock.price;
            const openPrice = history[0] || currentPrice;
            const diff = currentPrice - openPrice;
            const diffPct = ((diff / openPrice) * 100).toFixed(2);
            const color = diff >= 0 ? 0x00FF7F : 0xFF4757;

            const embed = new EmbedBuilder()
                .setTitle(`${diff >= 0 ? '📈' : '📉'} THỊ TRƯỜNG VSE: ${stock.symbol}`)
                .setDescription(`**${stock.name}**`)
                .setColor(color)
                .addFields(
                    { name: '💰 Giá khớp lệnh', value: `\`${currentPrice.toLocaleString()}\` VCASH`, inline: true },
                    { name: '📊 Biến động (24h)', value: `\`${diff >= 0 ? '+' : ''}${diffPct}%\``, inline: true },
                    { name: '💳 Ví của bạn', value: `\`${userData.balance.toLocaleString()}\` VCASH`, inline: true },
                    { name: '💼 Đang sở hữu', value: `\`${owned}\` đơn vị (≈ \`${(owned * currentPrice).toLocaleString()}\`)` },
                    { name: '🕒 Diễn biến giá (Nến)', value: `\`\`\`diff\n${createVisualChart(history.slice(-15))}\n\`\`\`` }
                )
                .setFooter({ text: 'Phí giao dịch: 1% • Cập nhật tự động' })
                .setTimestamp();

            return interaction.editReply({ embeds: [embed] });
        }

        // --- LOGIC MUA ---
        if (subcommand === 'buy') {
            const totalCost = Math.round((qty * stock.price) * (1 + feeRate));
            if (userData.balance < totalCost) {
                return interaction.editReply(`❌ Bạn không đủ tiền! Cần \`${(totalCost - userData.balance).toLocaleString()}\` VCASH nữa.`);
            }

            portfolio[symbol] = owned + qty;
            await prisma.user.update({
                where: { id: userAuth.id },
                data: { 
                    balance: { decrement: totalCost }, 
                    stocks: JSON.stringify(portfolio) 
                }
            });

            return interaction.editReply(`✅ **Khớp lệnh Mua!** Bạn đã sở hữu thêm \`${qty}\` ${symbol}.\nTổng chi: \`${totalCost.toLocaleString()}\` VCASH.`);
        }

        // --- LOGIC BÁN ---
        if (subcommand === 'sell') {
            if (owned < qty) return interaction.editReply(`❌ Bạn chỉ có \`${owned}\` mã **${symbol}** trong ví!`);

            const totalGain = Math.round((qty * stock.price) * (1 - feeRate));
            portfolio[symbol] = owned - qty;
            if (portfolio[symbol] <= 0) delete portfolio[symbol];

            await prisma.user.update({
                where: { id: userAuth.id },
                data: { 
                    balance: { increment: totalGain }, 
                    stocks: JSON.stringify(portfolio) 
                }
            });

            return interaction.editReply(`✅ **Khớp lệnh Bán!** Bạn nhận về \`${totalGain.toLocaleString()}\` VCASH sau thuế phí.`);
        }
    }
};

/**
 * Tạo biểu đồ dạng text đơn giản
 */
function createVisualChart(data) {
    if (data.length < 2) return "Dữ liệu đang được đồng bộ...";
    const max = Math.max(...data);
    const min = Math.min(...data);
    const range = max - min || 1;
    const levels = [' ', '▂', '▃', '▄', '▅', '▆', '▇', '█'];
    
    return data.map((val, i) => {
        const prev = data[i-1] || val;
        const prefix = val >= prev ? "+" : "-";
        const idx = Math.min(Math.floor(((val - min) / range) * 7), 7);
        return `${prefix}${levels[idx]}`;
    }).join(' ');
}
