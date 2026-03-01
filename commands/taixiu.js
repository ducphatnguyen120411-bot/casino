const { 
    SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, 
    ButtonBuilder, ButtonStyle, ComponentType 
} = require('discord.js');

// Lưu lịch sử (Sẽ reset khi bot restart)
let history = []; 

module.exports = {
    data: new SlashCommandBuilder()
        .setName('taixiu')
        .setDescription('💎 Sòng bài Thượng lưu - Hiệu ứng shuffle đẳng cấp')
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
            // 1. Kiểm tra ví & Khởi tạo
            let userData = await prisma.user.upsert({
                where: { id: user.id },
                update: {},
                create: { id: user.id, balance: 50000 } 
            });

            if (userData.balance < amount) {
                const lowMoney = `⚠️ **Số dư không đủ!** Bạn cần thêm \`${(amount - userData.balance).toLocaleString()}\` Cash.`;
                return isSlash ? input.reply({ content: lowMoney, ephemeral: true }) : input.reply(lowMoney);
            }

            // 2. Giao diện sảnh chờ (Dàn dựng cực chuyên nghiệp)
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
                    `**📊 Lịch sử gần đây:**\n${cauDisplay}\n\n` +
                    `*Quý khách vui lòng chọn cửa đặt...*`
                )
                .setFooter({ text: '⏳ Hệ thống tự hủy sau 15s' });

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('TAI').setLabel('ĐẶT TÀI').setEmoji('🔴').setStyle(ButtonStyle.Danger),
                new ButtonBuilder().setCustomId('XIU').setLabel('ĐẶT XỈU').setEmoji('🔵').setStyle(ButtonStyle.Primary)
            );

            const response = await input.reply({ embeds: [lobbyEmbed], components: [row], fetchReply: true });

            const collector = response.createMessageComponentCollector({
                filter: i => i.user.id === user.id,
                time: 15000,
                max: 1
            });

            collector.on('collect', async i => {
                // Khóa tiền và xóa giao diện cũ
                await i.update({ content: '⚙️ **Đang ghi nhận đặt cược...**', embeds: [], components: [] });
                
                await prisma.user.update({ 
                    where: { id: user.id }, 
                    data: { balance: { decrement: amount } } 
                });

                const userChoice = i.customId;
                const diceIcons = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];

                // --- PHẦN 3: HIỆU ỨNG SHUFFLE XÚC XẮC XOAY ---
                for (let step = 0; step < 6; step++) {
                    const r1 = diceIcons[Math.floor(Math.random() * 6)];
                    const r2 = diceIcons[Math.floor(Math.random() * 6)];
                    const r3 = diceIcons[Math.floor(Math.random() * 6)];
                    
                    const progress = '▓'.repeat(step * 3) + '░'.repeat(15 - step * 3);
                    
                    const shuffleMsg = 
                        `🎰 **VERDICT CASINO - ĐANG LẮC BÁT...**\n` +
                        `🎲 **[ ${r1} ${r2} ${r3} ]**\n` +
                        `\`[${progress}]\` ${(step * 20)}%`;

                    await i.editReply({ content: shuffleMsg });
                    await new Promise(r => setTimeout(r, 500)); // Delay tạo độ hồi hộp
                }

                // 4. Tính toán kết quả thật
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

                const finalDiceStr = d.map(v => diceIcons[v-1]).join(' ');
                
                // --- PHẦN 5: GIAO DIỆN KẾT QUẢ ANSI ---
                const resultEmbed = new EmbedBuilder()
                    .setColor(isWin ? 0x2ECC71 : 0xE74C3C)
                    .setTitle(`${isWin ? '🎊 THẮNG LỚN' : '💸 THUA RỒI'}: ${finalDiceStr} ➜ ${total} (${result})`)
                    .setDescription(
                        `\`\`\`ansi\n` +
                        `[0;33m╔══════════════════════════════════╗[0m\n` +
                        `  [1;37mKẾT QUẢ VÁN ĐẤU TRỰC TUYẾN[0m\n` +
                        `[0;33m╚══════════════════════════════════╝[0m\n` +
                        ` ▸ Người chơi:  ${user.username}\n` +
                        ` ▸ Đã chọn:     ${userChoice === 'TAI' ? '[0;31mTÀI[0m' : '[0;34mXỈU[0m'}\n` +
                        ` ▸ Biến động:   ${isWin ? '[0;32m+' : '[0;31m-'}${amount.toLocaleString()} Cash[0m\n` +
                        ` ▸ Số dư mới:   [0;36m${finalBalance.toLocaleString()}[0m Cash\n` +
                        `────────────────────────────────────\n` +
                        `\`\`\`\n` +
                        `**📊 Soi cầu:** ${history.slice(-10).map(r => r === 'TAI' ? '🔴' : '🔵').join(' ')}`
                    );

                await i.editReply({ content: '✅ **Mở bát thành công!**', embeds: [resultEmbed] });
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
