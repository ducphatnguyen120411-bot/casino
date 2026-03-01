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
        // --- PHÂN BIỆT SLASH VÀ PREFIX ---
        const isSlash = interaction.options !== undefined;
        const userId = isSlash ? interaction.user.id : interaction.author.id;
        
        // Hàm phản hồi dùng chung để tránh lỗi .reply
        const sendReply = async (content) => {
            if (isSlash) return interaction.reply(content);
            return interaction.reply(content); // interaction ở đây là 'message' nếu là prefix
        };

        const subcommand = isSlash ? interaction.options.getSubcommand() : interaction.content.split(' ')[1]?.toLowerCase() || 'view';
        const qty = isSlash ? interaction.options.getInteger('qty') : parseInt(interaction.content.split(' ')[2]);

        // 🟢 1. LẤY DỮ LIỆU THỊ TRƯỜNG
        let market = await prisma.market.findUnique({ where: { id: 1 } });
        if (!market) {
            market = await prisma.market.create({
                data: { id: 1, price: 100.0, history: [100, 101, 99, 102] }
            });
        }

        const currentPrice = market.price;
        const history = Array.isArray(market.history) ? market.history : [];
        const firstPrice = history[0] || currentPrice;
        const diff = (currentPrice - firstPrice).toFixed(2);
        const diffPercent = ((diff / firstPrice) * 100).toFixed(2);
        const themeColor = diff >= 0 ? '#2ecc71' : '#e74c3c';

        // 🏦 2. LẤY DỮ LIỆU NGƯỜI DÙNG
        let userData = await prisma.user.findUnique({ where: { id: userId } });
        if (!userData) {
            userData = await prisma.user.create({
                data: { id: userId, balance: 1000, stocks: { VCASH: 0 } }
            });
        }

        // Fix lỗi JSON: Ép kiểu stocks về Object nếu nó đang là String hoặc Null
        let userStocks = typeof userData.stocks === 'string' ? JSON.parse(userData.stocks) : (userData.stocks || {});
        if (!userStocks || typeof userStocks !== 'object') userStocks = { VCASH: 0 };
        
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
                    { name: '📊 XU HƯỚNG', value: `\`\`\`diff\n${history.slice(-10).map(h => (h >= currentPrice ? '+' : '-') + Number(h).toFixed(1)).join(' ')}\`\`\`\n${drawGraph(history.slice(-15))}`, inline: false },
                    { name: '📈 Biến động', value: `\`${diff > 0 ? '+' : ''}${diff} (${diffPercent}%)\``, inline: true },
                    { name: '🏦 Tổng vốn', value: `\`${(owned * currentPrice).toLocaleString()}\` Cash`, inline: true }
                )
                .setFooter({ text: 'Giá cập nhật mỗi 5 phút | Phí 1%' })
                .setTimestamp();

            return sendReply({ embeds: [embed] });
        }

        // --- LOGIC MUA/BÁN ---
        if (subcommand === 'buy' || subcommand === 'sell') {
            if (isNaN(qty) || qty <= 0) return sendReply('❌ Vui lòng nhập số lượng là số nguyên dương!');

            if (subcommand === 'buy') {
                const totalCost = (qty * currentPrice) * 1.01;
                if (userData.balance < totalCost) return sendReply(`⚠️ Bạn không đủ tiền! Cần: **${totalCost.toLocaleString()}** Cash.`);

                userStocks.VCASH = owned + qty;
                await prisma.user.update({
                    where: { id: userId },
                    data: { 
                        balance: { decrement: totalCost },
                        stocks: userStocks // Truyền Object đã cập nhật
                    }
                });
                return sendReply(`✅ Mua thành công **${qty}** VCASH. Tổng chi: **${totalCost.toLocaleString()}** (đã bao gồm 1% phí)`);
            }

            if (subcommand === 'sell') {
                if (owned < qty) return sendReply('❌ Bạn không có đủ cổ phiếu để bán!');
                
                const totalGain = (qty * currentPrice) * 0.99;
                userStocks.VCASH = owned - qty;
                
                await prisma.user.update({
                    where: { id: userId },
                    data: { 
                        balance: { increment: totalGain },
                        stocks: userStocks
                    }
                });
                return sendReply(`✅ Đã bán **${qty}** VCASH. Thu về: **${totalGain.toLocaleString()}** Cash (Trừ 1% phí).`);
            }
        }
    }
};
