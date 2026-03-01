const { EmbedBuilder, SlashCommandBuilder } = require('discord.js');

// Biến global để đảm bảo Market Engine chỉ chạy 1 lần duy nhất khi bot start
let marketEngineStarted = false;

module.exports = {
    data: new SlashCommandBuilder()
        .setName('stock')
        .setDescription('Sàn chứng khoán tập trung Verdict (VSE)')
        .addSubcommand(sub => 
            sub.setName('view')
            .setDescription('Xem bảng giá và biểu đồ')
            .addStringOption(opt => opt.setName('symbol').setDescription('Mã: VCASH, GOLD, BTC, ETH, TSLA').setRequired(false)))
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
        // --- 1. KHỞI TẠO MARKET ENGINE (CHẠY NGẦM) ---
        if (!marketEngineStarted) {
            marketEngineStarted = true;
            console.log("🚀 [Market Engine] Đã khởi động hệ thống biến động giá tự động.");
            
            // Cứ mỗi 60 giây cập nhật giá toàn sàn
            setInterval(async () => {
                const stocks = await prisma.stock.findMany();
                for (const s of stocks) {
                    // Biến động ngẫu nhiên: -3% đến +3.5% (hơi thiên về tăng trưởng)
                    const change = 1 + (Math.random() * 0.065 - 0.03);
                    const newPrice = Math.max(0.1, s.price * change);
                    
                    let history = Array.isArray(s.history) ? s.history : [];
                    history.push(newPrice);
                    if (history.length > 25) history.shift(); // Giữ 25 điểm dữ liệu

                    await prisma.stock.update({
                        where: { symbol: s.symbol },
                        data: { price: newPrice, history: history }
                    });
                }
            }, 60000);
        }

        // --- 2. XỬ LÝ INPUT ---
        const isSlash = interaction.options !== undefined;
        const userId = isSlash ? interaction.user.id : interaction.author.id;
        const subcommand = isSlash ? interaction.options.getSubcommand() : interaction.content.split(' ')[1];
        const symbol = (isSlash ? interaction.options.getString('symbol') : interaction.content.split(' ')[2])?.toUpperCase() || 'VCASH';
        const qty = isSlash ? interaction.options.getInteger('qty') : parseInt(interaction.content.split(' ')[3]);

        // Danh sách mã mặc định nếu DB trống
        const defaultStocks = [
            { symbol: 'VCASH', name: 'Verdict Cash Coin', price: 100 },
            { symbol: 'BTC', name: 'Bitcoin Digital', price: 55000 },
            { symbol: 'GOLD', name: 'SJC Gold Bar', price: 2400 },
            { symbol: 'TSLA', name: 'Tesla Inc', price: 180 }
        ];

        // --- 3. LẤY DỮ LIỆU ---
        let stock = await prisma.stock.findUnique({ where: { symbol } });
        if (!stock) {
            const def = defaultStocks.find(s => s.symbol === symbol);
            if (!def && subcommand !== 'view') return interaction.reply(`❌ Mã **${symbol}** chưa niêm yết!`);
            
            // Tự động tạo mã nếu là view hoặc mã mặc định
            stock = await prisma.stock.create({
                data: { 
                    symbol: def?.symbol || symbol, 
                    name: def?.name || `${symbol} Asset`, 
                    price: def?.price || 50, 
                    history: [def?.price || 50] 
                }
            });
        }

        let user = await prisma.user.findUnique({ where: { id: userId } });
        if (!user) {
            user = await prisma.user.create({ data: { id: userId, balance: 5000, stocks: {} } });
        }

        let portfolio = typeof user.stocks === 'string' ? JSON.parse(user.stocks) : (user.stocks || {});
        const owned = portfolio[symbol] || 0;

        // --- 4. CÁC LỆNH CHÍNH ---
        
        // VIEW: Xem biểu đồ & Giá
        if (subcommand === 'view') {
            const history = stock.history || [stock.price];
            const currentPrice = stock.price;
            const openPrice = history[0] || currentPrice;
            const diff = currentPrice - openPrice;
            const diffPct = ((diff / openPrice) * 100).toFixed(2);

            const chart = renderChart(history); // Gọi hàm vẽ chart bên dưới

            const embed = new EmbedBuilder()
                .setTitle(`🏛️ SÀN CHỨNG KHOÁN VERDICT [${stock.symbol}]`)
                .setDescription(`**${stock.name}**`)
                .setColor(diff >= 0 ? '#00ff7f' : '#ff4500')
                .addFields(
                    { name: '💰 Giá khớp lệnh', value: `> **${currentPrice.toLocaleString(undefined, {minimumFractionDigits: 2})}** Cash`, inline: true },
                    { name: '📊 Biến động', value: `\`${diff >= 0 ? '▲' : '▼'} ${diff.toFixed(2)} (${diffPct}%)\``, inline: true },
                    { name: '💼 Tài sản của bạn', value: `Số lượng: \`${owned}\` ${symbol}\nGiá trị: \`${(owned * currentPrice).toLocaleString()}\` Cash` },
                    { name: '📉 Biểu đồ xu hướng (1h)', value: `\`\`\`py\n${chart}\n\`\`\`` }
                )
                .setFooter({ text: 'Phí giao dịch: 1% | Cập nhật tự động' })
                .setTimestamp();

            return interaction.reply({ embeds: [embed] });
        }

        // BUY & SELL
        if (subcommand === 'buy' || subcommand === 'sell') {
            if (!qty || qty <= 0) return interaction.reply('⚠️ Số lượng phải là số nguyên dương!');
            const fee = 0.01;

            if (subcommand === 'buy') {
                const totalCost = (qty * stock.price) * (1 + fee);
                if (user.balance < totalCost) return interaction.reply(`⚠️ Bạn nghèo quá! Cần **${totalCost.toLocaleString()}** Cash để mua.`);

                portfolio[symbol] = owned + qty;
                await prisma.user.update({
                    where: { id: userId },
                    data: { balance: { decrement: totalCost }, stocks: portfolio }
                });
                return interaction.reply(`✅ **MUA THÀNH CÔNG**\nKhớp lệnh: \`${qty}\` ${symbol}\nTổng chi: \`${totalCost.toLocaleString()}\` Cash (Phí 1%)`);
            }

            if (subcommand === 'sell') {
                if (owned < qty) return interaction.reply(`⚠️ Bạn không đủ cổ phiếu **${symbol}** để bán!`);
                const totalGain = (qty * stock.price) * (1 - fee);

                portfolio[symbol] = owned - qty;
                await prisma.user.update({
                    where: { id: userId },
                    data: { balance: { increment: totalGain }, stocks: portfolio }
                });
                return interaction.reply(`✅ **BÁN THÀNH CÔNG**\nKhớp lệnh: \`${qty}\` ${symbol}\nThực nhận: \`${totalGain.toLocaleString()}\` Cash (Phí 1%)`);
            }
        }
    }
};

// --- HÀM TRỢ GIÚP: VẼ BIỂU ĐỒ NẾN UNICODE ---
function renderChart(data) {
    if (!data || data.length < 2) return "Đang thu thập thêm dữ liệu...";
    const levels = [' ', '▂', '▃', '▄', '▅', '▆', '▇', '█'];
    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min;

    return data.slice(-20).map(v => {
        const index = range === 0 ? 3 : Math.floor(((v - min) / range) * (levels.length - 1));
        return levels[index];
    }).join('');
}
