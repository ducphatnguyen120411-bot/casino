const { EmbedBuilder } = require('discord.js');

module.exports = {
    async execute(message, args, prisma) {
        const userId = message.author.id;
        const action = args[0]?.toLowerCase();

        // 🟢 1. LẤY DỮ LIỆU THỊ TRƯỜNG TỪ DATABASE
        let market = await prisma.market.upsert({
            where: { id: 1 },
            update: {},
            create: { id: 1, price: 100.0, history: [100, 102, 98, 105, 101] }
        });

        let history = market.history;
        const oldPrice = market.price;
        
        // Thuật toán biến động giá thực tế (Random Walk)
        const volatility = 0.05; // 5% biến động
        const change = oldPrice * volatility * (Math.random() * 2 - 1);
        const currentPrice = parseFloat((oldPrice + change).toFixed(2));

        // Cập nhật lịch sử giá vào DB
        history.push(currentPrice);
        if (history.length > 15) history.shift();

        await prisma.market.update({
            where: { id: 1 },
            data: { price: currentPrice, history: history }
        });

        // 🔴 2. VẼ BIỂU ĐỒ NẾN (CANDLESTICK VISUAL)
        const drawGraph = (data) => {
            const min = Math.min(...data);
            const max = Math.max(...data);
            const range = max - min || 1;
            return data.map((p, i) => {
                const prev = data[i - 1] || p;
                const emoji = p >= prev ? '📈' : '📉'; // Nến xanh/đỏ
                return emoji;
            }).join('');
        };

        const diff = (currentPrice - history[0]).toFixed(2);
        const diffPercent = ((diff / history[0]) * 100).toFixed(2);
        const status = diff >= 0 ? '🐂 BULL MARKET (TĂNG TRƯỞNG)' : '🐻 BEAR MARKET (SUY THOÁI)';
        const themeColor = diff >= 0 ? '#2ecc71' : '#e74c3c';

        // 🏦 3. TRUY VẤN VÍ CHUNG NGƯỜI DÙNG
        let userData = await prisma.user.upsert({
            where: { id: userId },
            update: {},
            create: { id: userId, balance: 1000, stocks: {} }
        });

        let userStocks = userData.stocks || {};
        const owned = userStocks.VCASH || 0;

        // --- GIAO DIỆN CHÍNH ---
        if (!action || action === 'view') {
            const embed = new EmbedBuilder()
                .setTitle(`🏛️ SÀN CHỨNG KHOÁN TRUNG ƯƠNG (VCASH)`)
                .setColor(themeColor)
                .setDescription(`**Trạng thái:** \`${status}\`\n**Biến động 24h:** \`${diff > 0 ? '+' : ''}${diff} (${diffPercent}%)\``)
                .setThumbnail('https://i.imgur.com/8pP4XjL.png') // Icon sàn chứng khoán
                .addFields(
                    { name: '💰 GIÁ NIÊM YẾT', value: `> **${currentPrice.toLocaleString()}** Cash`, inline: true },
                    { name: '💼 TÀI SẢN CỦA BẠN', value: `> **${owned}** Cổ phiếu`, inline: true },
                    { name: '📊 BIỂU ĐỒ XU HƯỚNG', value: `\`\`\`diff\n${history.map(h => (h >= currentPrice ? '+' : '-') + h.toFixed(1)).join(' ')}\`\`\`\n${drawGraph(history)}`, inline: false },
                    { name: '💵 GIÁ TRỊ VÍ CHUNG', value: `\`${userData.balance.toLocaleString()}\` Cash`, inline: true },
                    { name: '🏦 GIÁ TRỊ CỔ PHIẾU', value: `\`${(owned * currentPrice).toLocaleString()}\` Cash`, inline: true }
                )
                .setFooter({ text: 'Phí giao dịch: 1% | Dùng !stock buy/sell [số lượng]' })
                .setTimestamp();

            return message.reply({ embeds: [embed] });
        }

        // --- LOGIC MUA/BÁN VỚI PHÍ GIAO DỊCH 1% ---
        const qty = parseInt(args[1]);
        if (isNaN(qty) || qty <= 0) return message.reply('❌ Số lượng phải là số nguyên dương!');

        if (action === 'buy') {
            const subTotal = qty * currentPrice;
            const fee = subTotal * 0.01; // Thuế 1%
            const totalCost = subTotal + fee;

            if (userData.balance < totalCost) return message.reply('⚠️ Ví chung không đủ tiền (bao gồm 1% phí)!');

            userStocks.VCASH = owned + qty;
            await prisma.user.update({
                where: { id: userId },
                data: { balance: { decrement: totalCost }, stocks: userStocks }
            });

            return message.reply(`✅ **KHỚP LỆNH MUA:**\n📥 Đã nhận: \`${qty}\` VCASH\n💸 Tổng chi (phí 1%): \`${totalCost.toLocaleString()}\` Cash`);
        }

        if (action === 'sell') {
            if (owned < qty) return message.reply('❌ Bạn không đủ cổ phiếu!');

            const subTotal = qty * currentPrice;
            const fee = subTotal * 0.01;
            const totalGain = subTotal - fee;

            userStocks.VCASH = owned - qty;
            await prisma.user.update({
                where: { id: userId },
                data: { balance: { increment: totalGain }, stocks: userStocks }
            });

            return message.reply(`✅ **KHỚP LỆNH BÁN:**\n📤 Đã bán: \`${qty}\` VCASH\n💰 Thu về (trừ phí 1%): \`${totalGain.toLocaleString()}\` Cash`);
        }
    }
};
