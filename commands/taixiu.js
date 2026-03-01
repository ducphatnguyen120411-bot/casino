const { 
    SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, 
    ButtonBuilder, ButtonStyle, ComponentType 
} = require('discord.js');

// Lưu lịch sử phiên chạy (Nên dùng DB nếu muốn lưu vĩnh viễn)
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

    async execute(interaction, prisma) {
        const amount = interaction.options.getInteger('money');
        const user = interaction.user;

        try {
            // 1. Kiểm tra ví
            let userData = await prisma.user.upsert({
                where: { id: user.id },
                update: {},
                create: { id: user.id, balance: 50000 } 
            });

            if (userData.balance < amount) {
                return interaction.reply({ 
                    content: `⚠️ **Số dư không đủ!** Quý khách cần thêm \`${(amount - userData.balance).toLocaleString()}\` Cash.`, 
                    ephemeral: true 
                });
            }

            // 2. Logic Soi Cầu (Đã fix không dấu)
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

            const response = await interaction.reply({ embeds: [lobbyEmbed], components: [row], fetchReply: true });

            const collector = response.createMessageComponentCollector({
                filter: i => i.user.id === user.id,
                time: 15000,
                max: 1
            });

            collector.on('collect', async i => {
                // LOCK TIỀN NGAY
                await prisma.user.update({ where: { id: user.id }, data: { balance: { decrement: amount } } });

                const userChoice = i.customId; // 'TAI' hoặc 'XIU' (Không dấu)

                // --- HIỆU ỨNG LẮC BÁT PROGRESS BAR ---
                const progressFrames = [
                    '✨ **Đang xốc đĩa...**\n`[▓░░░░░░░░░] 10%`',
                    '✨ **Đang xốc đĩa...**\n`[▓▓▓░░░░░░░] 35%`',
                    '🎲 **Đang mở bát...**\n`[▓▓▓▓▓▓░░░░] 60%`',
                    '🎲 **Đang mở bát...**\n`[▓▓▓▓▓▓▓▓▓▓] 100%`'
                ];

                for (const frame of progressFrames) {
                    await i.update({ content: frame, embeds: [], components: [] }).catch(() => {});
                    await new Promise(r => setTimeout(r, 600));
                }

                // Xử lý xúc xắc
                const d = [Math.floor(Math.random() * 6) + 1, Math.floor(Math.random() * 6) + 1, Math.floor(Math.random() * 6) + 1];
                const total = d.reduce((a, b) => a + b, 0);
                const result = total >= 11 ? 'TAI' : 'XIU'; // Đồng bộ không dấu
                const isWin = userChoice === result;

                history.push(result);
                if (history.length > 20) history.shift();

                let finalBalance;
                if (isWin) {
                    const update = await prisma.user.update({
                        where: { id: user.id },
                        data: { balance: { increment: amount * 2 } }
                    });
                    finalBalance = update.balance;
                } else {
                    const current = await prisma.user.findUnique({ where: { id: user.id } });
                    finalBalance = current.balance;
                }

                const diceIcons = { 1: '⚀', 2: '⚁', 3: '⚂', 4: '⚃', 5: '⚄', 6: '⚅' };
                
                // --- GIAO DIỆN KẾT QUẢ SANG TRỌNG ---
                const resultEmbed = new EmbedBuilder()
                    .setColor(isWin ? 0x2ECC71 : 0xE74C3C)
                    .setTitle(`${isWin ? '🎊' : '💸'} Kết Quả: ${d.map(v => diceIcons[v]).join(' ')} ➜ ${total} (${result})`)
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

                await interaction.editReply({ content: null, embeds: [resultEmbed] });
            });

            collector.on('end', (collected, reason) => {
                if (reason === 'time' && collected.size === 0) {
                    interaction.editReply({ content: '💤 **Ván đấu đã hủy** do quý khách không thao tác.', embeds: [], components: [] }).catch(() => {});
                }
            });

        } catch (err) {
            console.error(err);
            if (!interaction.replied) interaction.reply({ content: '❌ Casino bảo trì!', ephemeral: true });
        }
    }
};
