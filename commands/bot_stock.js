const { EmbedBuilder, SlashCommandBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('stock')
        .setDescription('Sàn chứng khoán trung ương Verdict')
        .addSubcommand(sub => sub.setName('view').setDescription('Xem biểu đồ và giá hiện tại'))
        .addSubcommand(sub => 
            sub.setName('buy')
            .setDescription('Mua cổ phiếu VCASH')
            .addIntegerOption(opt => opt.setName('qty').setDescription('Số lượng muốn mua').setRequired(true)))
        .addSubcommand(sub => 
            sub.setName('sell')
            .setDescription('Bán cổ phiếu VCASH')
            .addIntegerOption(opt => opt.setName('qty').setDescription('Số lượng muốn bán').setRequired(true))),

    async execute(interaction, prisma) {
        // Hỗ trợ cả Prefix !stock view/buy/sell
        const isSlash = interaction.options !== undefined;
        const userId = isSlash ? interaction.user.id : interaction.author.id;
        const subcommand = isSlash ? interaction.options.getSubcommand() : interaction.content.split(' ')[1]?.toLowerCase() || 'view';
        const qty = isSlash ? interaction.options.getInteger('qty') : parseInt(interaction.content.split(' ')[2]);

        // 🟢 1. LẤY DỮ LIỆU THỊ TRƯỜNG (Giá chung toàn server)
        let market = await prisma.market.findUnique({ where: { id: 1 } });
        
        // Khởi tạo nếu chưa có
        if (!market) {
            market = await prisma.market.create({
                data: { id: 1, price: 100.0, history: [100, 101, 99, 102] }
            });
        }

        const currentPrice = market.price;
        const history = market.history;
        const firstPrice = history[0];
        const diff = (currentPrice - firstPrice).toFixed(2);
        const diffPercent = ((diff / firstPrice) * 100).toFixed(2);
        const themeColor = diff >= 0 ? '#2ecc71' : '#e74c3c';

        // 🏦 2. LẤY DỮ LIỆU NGƯỜI DÙNG
        let userData = await prisma.user.upsert({
            where: { id: userId },
            update: {},
            create: { id: userId, balance: 1000, stocks: { VCASH: 0 } }
        });

        let userStocks = userData.stocks || { VCASH: 0 };
        const owned = userStocks.VCASH || 0;

        // --- SUBCOMMAND: VIEW ---
        if (subcommand === 'view') {
            const drawGraph = (data) => {
                return data.map((p, i) => {
                    const prev = data[i - 1] || p;
                    return p >= prev ? '📈' : '📉';
                }).join('');
            };

            const embed = new EmbedBuilder()
                .setTitle(`🏛️ THỊ TRƯỜNG CHỨNG KHOÁN (VCASH)`)
                .setColor(themeColor)
                .setThumbnail('https://i.imgur.com/8pP4XjL.png')
                .addFields(
                    { name: '💰 GIÁ HIỆN TẠI', value: `> **${currentPrice.toFixed(2)}** Cash`, inline: true },
                    { name: '💼 ĐANG SỞ HỮU', value: `> **${owned}** VCASH`, inline: true },
                    { name: '📊 XU HƯỚNG', value: `\`\`\`diff\n${history.map(h => (h >= currentPrice ? '+' : '-') + h.toFixed(1)).join(' ')}\`\`\`\n${drawGraph(history)}`, inline: false },
                    { name: '📈 Biến động', value: `\`${diff > 0 ? '+' : ''}${diff} (${diffPercent}%)\``, inline: true },
                    { name: '🏦 Tổng vốn', value: `\`${(owned * currentPrice).toLocaleString()}\` Cash`, inline: true }
                )
                .setFooter({ text: 'Giá cập nhật tự động mỗi 5 phút | Phí 1%' })
                .setTimestamp();

            return isSlash ? interaction.reply({ embeds: [embed] }) : interaction.reply({ embeds: [embed] });
        }

        // --- LOGIC MUA/BÁN ---
        if (isNaN(qty) || qty <= 0) return interaction.reply('❌ Vui lòng nhập số lượng hợp lệ!');

        if (subcommand === 'buy') {
            const totalCost = (qty * currentPrice) * 1.01; // Giá + 1% phí
            if (userData.balance < totalCost) return interaction.reply(`⚠️ Bạn không đủ tiền! Cần: **${totalCost.toLocaleString()}** Cash.`);

            userStocks.VCASH = owned + qty;
            await prisma.user.update({
                where: { id: userId },
                data: { 
                    balance: { decrement: totalCost },
                    stocks: userStocks
                }
            });
            return interaction.reply(`✅ Mua thành công **${qty}** VCASH. Phí: 1%`);
        }

        if (subcommand === 'sell') {
            if (owned < qty) return interaction.reply('❌ Bạn không có đủ cổ phiếu để bán!');
            
            const totalGain = (qty * currentPrice) * 0.99; // Giá - 1% phí
            userStocks.VCASH = owned - qty;
            
            await prisma.user.update({
                where: { id: userId },
                data: { 
                    balance: { increment: totalGain },
                    stocks: userStocks
                }
            });
            return interaction.reply(`✅ Đã bán **${qty}** VCASH. Thu về: **${totalGain.toLocaleString()}** Cash (Trừ 1% phí).`);
        }
    }
};
