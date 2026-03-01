const { 
    SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, 
    ButtonBuilder, ButtonStyle, ComponentType 
} = require('discord.js');

// Lưu lịch sử (Sẽ reset khi bot restart)
let history = []; 

module.exports = {
    data: new SlashCommandBuilder()
        .setName('taixiu')
        .setDescription('💎 Sòng bài Thượng lưu - Trải nghiệm đẳng cấp')
        .addIntegerOption(opt => 
            opt.setName('money')
                .setDescription('Số tiền đặt cược')
                .setRequired(true)
                .setMinValue(100)),

    async execute(input, prisma, args) {
        // --- PHẦN 1: NHẬN DIỆN LOẠI LỆNH (! hoặc /) ---
        const isSlash = !!input.options;
        const amount = isSlash ? input.options.getInteger('money') : parseInt(args[0]);
        const user = isSlash ? input.user : input.author;

        // Kiểm tra số tiền hợp lệ
        if (!amount || isNaN(amount) || amount < 100) {
            const msg = "❌ Quý khách vui lòng nhập số tiền cược hợp lệ (Ví dụ: `!taixiu 5000` hoặc dùng `/taixiu`)!";
            return isSlash ? input.reply({ content: msg, ephemeral: true }) : input.reply(msg);
        }

        try {
            // 1. Kiểm tra ví & Khởi tạo (Dùng upsert để tránh lỗi findUnique)
            let userData = await prisma.user.upsert({
                where: { id: user.id },
                update: {},
                create: { id: user.id, balance: 50000 } 
            });

            if (userData.balance < amount) {
                const lowMoney = `⚠️ **Số dư không đủ!** Bạn cần thêm \`${(amount - userData.balance).toLocaleString()}\` Cash.`;
                return isSlash ? input.reply({ content: lowMoney, ephemeral: true }) : input.reply(lowMoney);
            }

            // 2. Giao diện sảnh chờ
            const cauDisplay = history.length > 0 
                ? history.slice(-10).map(res => res === 'TAI' ? '🔴' : '🔵').join(' ') 
                : '`Chưa có dữ liệu ván đấu`';

            const lobbyEmbed = new EmbedBuilder()
                .setColor(0xD4AF37)
                .setTitle('⚜️ VERDICT PRESTIGE CASINO ⚜️')
                .setThumbnail(user.displayAvatarURL())
                .setDescription(
                    `\`\`\`arm\n` +
                    `CHỦ BÀN: ${user.username.toUpperCase()}\n` +
                    `MỨC CƯỢC: ${amount.toLocaleString()} CASH\n` +
                    `──────────────────────────────\n` +
                    `SOI CẦU: ${history.slice(-5).join(' - ') || 'N/A'}\n` +
                    `\`\`\`\n` +
                    `**📊 Lịch sử:** ${cauDisplay}`
                )
                .setFooter({ text: '⏳ Hệ thống tự hủy sau 15s' });

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('TAI').setLabel('ĐẶT TÀI').setEmoji('🔴').setStyle(ButtonStyle.Danger),
                new ButtonBuilder().setCustomId('XIU').setLabel('ĐẶT XỈU').setEmoji('🔵').setStyle(ButtonStyle.Primary)
            );

            // Gửi tin nhắn ban đầu
            const response = await input.reply({ embeds: [lobbyEmbed], components: [row], fetchReply: true });

            const collector = response.createMessageComponentCollector({
                filter: i => i.user.id === user.id,
                time: 15000,
                max: 1
            });

            collector.on('collect', async i => {
                // Khóa tiền và vô hiệu hóa nút ngay lập tức
                await i.update({ content: '⚙️ **Ghi nhận đặt cược...**', embeds: [], components: [] });
                
                await prisma.user.update({ 
                    where: { id: user.id }, 
                    data: { balance: { decrement: amount } } 
                });

                const userChoice = i.customId;

                // --- HIỆU ỨNG PROGRESS BAR ---
                const progressFrames = [
                    '✨ **Đang xốc đĩa...**\n`[▓░░░░░░░░░] 10%`',
                    '🎲 **Đang mở bát...**\n`[▓▓▓▓▓▓░░░░] 60%`',
                    '🎲 **Xong!**\n`[▓▓▓▓▓▓▓▓▓▓] 100%`'
                ];

                for (const frame of progressFrames) {
                    await i.editReply({ content: frame });
                    await new Promise(r => setTimeout(r, 600));
                }

                // 4. Xử lý kết quả
                const d = [Math.floor(Math.random() * 6) + 1, Math.floor(Math.random() * 6) + 1, Math.floor(Math.random() * 6) + 1];
                const total = d.reduce((a, b) => a + b, 0);
                const result = total >= 11 ? 'TAI' : 'XIU';
                const isWin = userChoice === result;

                history.push(result);
                if (history.length > 20) history.shift();

                let finalBalance;
                if (isWin) {
                    const updateWin = await prisma.user.update({
                        where: { id: user.id },
                        data: { balance: { increment: amount * 2 } }
                    });
                    finalBalance = updateWin.balance;
                } else {
                    const current = await prisma.user.findUnique({ where: { id: user.id } });
                    finalBalance = current.balance;
                }

                const diceIcons = { 1: '⚀', 2: '⚁', 3: '⚂', 4: '⚃', 5: '⚄', 6: '⚅' };
                const resultEmbed = new EmbedBuilder()
                    .setColor(isWin ? 0x2ECC71 : 0xE74C3C)
                    .setTitle(`${isWin ? '🎊' : '💸'} Kết Quả: ${d.map(v => diceIcons[v]).join(' ')} ➜ ${total} (${result})`)
                    .setDescription(
                        `\`\`\`ansi\n` +
                        `▸ Người chơi:  ${user.username}\n` +
                        `▸ Lựa chọn:    ${userChoice === 'TAI' ? '[0;31mTÀI[0m' : '[0;34mXỈU[0m'}\n` +
                        `▸ Biến động:   ${isWin ? '[0;32m+' : '[0;31m-'}${amount.toLocaleString()} Cash[0m\n` +
                        `▸ Số dư mới:   [0;36m${finalBalance.toLocaleString()}[0m Cash\n` +
                        `────────────────────────────────────\n` +
                        `\`\`\`\n` +
                        `**📊 Cầu hiện tại:** ${history.slice(-10).map(r => r === 'TAI' ? '🔴' : '🔵').join(' ')}`
                    );

                await i.editReply({ content: null, embeds: [resultEmbed] });
            });

            collector.on('end', (collected, reason) => {
                if (reason === 'time' && collected.size === 0) {
                    const timeoutMsg = '💤 **Ván đấu đã hủy** do quý khách không thao tác.';
                    isSlash ? input.editReply({ content: timeoutMsg, embeds: [], components: [] }).catch(() => {}) 
                            : response.edit({ content: timeoutMsg, embeds: [], components: [] }).catch(() => {});
                }
            });

        } catch (err) {
            console.error('Lỗi TaiXiu:', err);
            if (!input.replied) input.reply({ content: '❌ Casino đang bảo trì!', ephemeral: true });
        }
    }
};
