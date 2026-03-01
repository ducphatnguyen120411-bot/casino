const { 
    SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, 
    ButtonBuilder, ButtonStyle, ComponentType 
} = require('discord.js');

// Lưu lịch sử (Sẽ reset khi bot restart - Muốn vĩnh viễn nên dùng DB)
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
        // Tự động nhận diện Slash hoặc Prefix
        const isInteraction = !!input.options;
        const amount = isInteraction ? input.options.getInteger('money') : parseInt(args[0]);
        const user = isInteraction ? input.user : input.author;

        // Kiểm tra đầu vào
        if (!amount || isNaN(amount) || amount < 100) {
            const errorMsg = "❌ Quý khách vui lòng nhập số tiền cược hợp lệ (Tối thiểu 100)!";
            return isInteraction ? input.reply({ content: errorMsg, ephemeral: true }) : input.reply(errorMsg);
        }

        try {
            // 1. Kiểm tra ví & Khởi tạo (Dùng upsert để đảm bảo user luôn tồn tại)
            let userData = await prisma.user.upsert({
                where: { id: user.id },
                update: {},
                create: { id: user.id, balance: 50000 } 
            });

            if (userData.balance < amount) {
                const lowMoney = `⚠️ **Số dư không đủ!** Bạn cần thêm \`${(amount - userData.balance).toLocaleString()}\` Cash.`;
                return isInteraction ? input.reply({ content: lowMoney, ephemeral: true }) : input.reply(lowMoney);
            }

            // 2. Chuẩn bị giao diện Soi Cầu
            const cauDisplay = history.length > 0 
                ? history.slice(-10).map(res => res === 'TAI' ? '🔴' : '🔵').join(' ') 
                : '`Chưa có dữ liệu ván đấu`';

            const lobbyEmbed = new EmbedBuilder()
                .setColor(0xD4AF37)
                .setTitle('⚜️ VERDICT PRESTIGE CASINO ⚜️')
                .setThumbnail(user.displayAvatarURL())
                .setDescription(
                    ````arm\n` +
                    `CHỦ BÀN: ${user.username.toUpperCase()}\n` +
                    `MỨC CƯỢC: ${amount.toLocaleString()} CASH\n` +
                    `──────────────────────────────\n` +
                    `SOI CẦU: ${history.slice(-5).join(' - ') || 'N/A'}\n` +
                    ````\n` +
                    `**📊 Lịch sử ván đấu:**\n${cauDisplay}\n\n` +
                    `*Quý khách vui lòng chọn cửa đặt...*`
                )
                .setFooter({ text: '⏳ Hệ thống tự hủy sau 15s' });

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('TAI').setLabel('ĐẶT TÀI').setEmoji('🔴').setStyle(ButtonStyle.Danger),
                new ButtonBuilder().setCustomId('XIU').setLabel('ĐẶT XỈU').setEmoji('🔵').setStyle(ButtonStyle.Primary)
            );

            const response = isInteraction 
                ? await input.reply({ embeds: [lobbyEmbed], components: [row], fetchReply: true })
                : await input.reply({ embeds: [lobbyEmbed], components: [row] });

            const collector = response.createMessageComponentCollector({
                filter: i => i.user.id === user.id,
                time: 15000,
                max: 1
            });

            collector.on('collect', async i => {
                // 3. LOCK TIỀN NGAY & Vô hiệu hóa nút (Tránh bug)
                await i.update({ content: '⚙️ **Đang ghi nhận đặt cược...**', components: [], embeds: [] });
                
                await prisma.user.update({ 
                    where: { id: user.id }, 
                    data: { balance: { decrement: amount } } 
                });

                const userChoice = i.customId;

                // --- HIỆU ỨNG LẮC BÁT PROGRESS BAR (Mượt hơn) ---
                const progressFrames = [
                    '✨ **Đang xốc đĩa...**\n`[▓░░░░░░░░░] 10%`',
                    '✨ **Đang xốc đĩa...**\n`[▓▓▓░░░░░░░] 35%`',
                    '🎲 **Đang mở bát...**\n`[▓▓▓▓▓▓░░░░] 60%`',
                    '🎲 **Đang mở bát...**\n`[▓▓▓▓▓▓▓▓▓▓] 100%`'
                ];

                for (const frame of progressFrames) {
                    await i.editReply({ content: frame });
                    await new Promise(r => setTimeout(r, 500));
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
                const diceString = d.map(v => diceIcons[v]).join(' ');
                
                // --- GIAO DIỆN KẾT QUẢ SANG TRỌNG ---
                const resultEmbed = new EmbedBuilder()
                    .setColor(isWin ? 0x2ECC71 : 0xE74C3C)
                    .setTitle(`${isWin ? '🎊' : '💸'} Kết Quả: ${diceString} ➜ ${total} (${result})`)
                    .setDescription(
                        ````ansi\n` +
                        `[0;33m╔══════════════════════════════════╗[0m\n` +
                        `  [1;37mTHÔNG TIN VÁN ĐẤU[0m\n` +
                        `[0;33m╚══════════════════════════════════╝[0m\n` +
                        ` ▸ Người chơi:  ${user.username}\n` +
                        ` ▸ Lựa chọn:    ${userChoice === 'TAI' ? '[0;31mTÀI[0m' : '[0;34mXỈU[0m'}\n` +
                        ` ▸ Biến động:   ${isWin ? '[0;32m+' : '[0;31m-'}${amount.toLocaleString()} Cash[0m\n` +
                        ` ▸ Số dư mới:   [0;36m${finalBalance.toLocaleString()}[0m Cash\n` +
                        `────────────────────────────────────\n` +
                        ````\n` +
                        `**📊 Cầu hiện tại:** ${history.slice(-10).map(r => r === 'TAI' ? '🔴' : '🔵').join(' ')}`
                    );

                await i.editReply({ content: null, embeds: [resultEmbed] });
            });

            collector.on('end', (collected, reason) => {
                if (reason === 'time' && collected.size === 0) {
                    const timeoutMsg = '💤 **Ván đấu đã hủy** do quý khách không thao tác.';
                    isInteraction 
                        ? input.editReply({ content: timeoutMsg, embeds: [], components: [] }).catch(() => {})
                        : response.edit({ content: timeoutMsg, embeds: [], components: [] }).catch(() => {});
                }
            });

        } catch (err) {
            console.error('Lỗi TaiXiu:', err);
            if (isInteraction) {
                if (!input.replied) input.reply({ content: '❌ Lỗi hệ thống!', ephemeral: true });
            }
        }
    }
};
