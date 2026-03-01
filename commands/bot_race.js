const { SlashCommandBuilder, EmbedBuilder, AttachmentBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('race')
        .setDescription('Đặt cược đua ngựa Verdict - Thử thách vận may!')
        .addIntegerOption(opt => opt.setName('bet').setDescription('Số tiền cược (Tối thiểu 100)').setRequired(true).setMinValue(100))
        .addStringOption(opt => opt.setName('horse').setDescription('Chọn chiến mã của bạn')
            .setRequired(true)
            .addChoices(
                { name: '🔴 Ngựa Đỏ (Xích Thố)', value: 'Ngựa Đỏ' },
                { name: '🔵 Ngựa Xanh (Hải Mã)', value: 'Ngựa Xanh' },
                { name: '🟢 Ngựa Lục (Phong Mã)', value: 'Ngựa Lục' },
                { name: '🟡 Ngựa Vàng (Kim Mã)', value: 'Ngựa Vàng' }
            )),

    async execute(interaction, prisma) {
        const userId = interaction.user.id;
        const bet = interaction.options.getInteger('bet');
        const chosenHorse = interaction.options.getString('horse');

        // 1. Kiểm tra tài khoản
        const user = await prisma.user.findUnique({ where: { id: userId } });
        if (!user || user.balance < bet) {
            return interaction.reply({ 
                content: `❌ **Giao dịch thất bại!** Bạn cần thêm \`${bet - (user?.balance || 0)}\` Cash nữa để tham gia.`, 
                ephemeral: true 
            });
        }

        // Trừ tiền ngay để tránh bug double-spend
        await prisma.user.update({
            where: { id: userId },
            data: { balance: { decrement: bet } }
        });

        const horses = [
            { name: 'Ngựa Đỏ', emoji: '🔴', pos: 0, color: 0xFF0000 },
            { name: 'Ngựa Xanh', emoji: '🔵', pos: 0, color: 0x0000FF },
            { name: 'Ngựa Lục', emoji: '🟢', pos: 0, color: 0x00FF00 },
            { name: 'Ngựa Vàng', emoji: '🟡', pos: 0, color: 0xFFFF00 }
        ];

        const finishLine = 12; // Rút ngắn một chút để đua nhanh hơn, kịch tính hơn
        let winner = null;

        // Tạo Embed ban đầu
        const mainEmbed = new EmbedBuilder()
            .setTitle('🏁 ĐƯỜNG ĐUA KHỐC LIỆT')
            .setDescription('`Đang chuẩn bị xuất phát...`')
            .setColor('#2f3136')
            .setFooter({ text: `Người chơi: ${interaction.user.username} | Cược: ${bet.toLocaleString()} Cash`, iconURL: interaction.user.displayAvatarURL() });

        const message = await interaction.reply({ embeds: [mainEmbed], fetchReply: true });

        // 2. Vòng lặp cuộc đua
        const raceInterval = setInterval(async () => {
            // Cập nhật vị trí ngựa ngẫu nhiên
            horses.forEach(h => {
                if (!winner) {
                    const move = Math.floor(Math.random() * 3); // 0, 1 hoặc 2 bước
                    h.pos += move;
                    if (h.pos >= finishLine) {
                        h.pos = finishLine;
                        winner = h;
                    }
                }
            });

            // Vẽ đường đua (Dùng emoji để đẹp hơn)
            const track = horses.map(h => {
                const progress = '▬'.repeat(h.pos);
                const remaining = '┈'.repeat(finishLine - h.pos);
                const horseIcon = h.pos >= finishLine ? '🏆' : '🐎';
                const highlight = h.name === chosenHorse ? '⭐' : '';
                return `\`${h.emoji}\` ${progress}${horseIcon}${remaining} | **${h.name}** ${highlight}`;
            }).join('\n\n');

            const updateEmbed = EmbedBuilder.from(mainEmbed)
                .setDescription(`**VẬN ĐỘNG VIÊN ĐANG BỨT TỐC:**\n\n${track}`)
                .setColor(winner ? winner.color : '#f1c40f');

            // 3. Kết thúc cuộc đua
            if (winner) {
                clearInterval(raceInterval);
                const isWin = (winner.name === chosenHorse);
                const prize = isWin ? Math.floor(bet * 1.95) : 0; // Trừ nhẹ "phí sàn" 5% hoặc giữ nguyên 2.0 tùy bạn

                let resultStatus = '';
                if (isWin) {
                    await prisma.user.update({
                        where: { id: userId },
                        data: { 
                            balance: { increment: prize + bet }, // Cộng lại vốn + lời
                            totalWins: { increment: 1 }
                        }
                    });
                    resultStatus = `🎉 **CHIẾN THẮNG!**\nBạn đã chọn đúng **${winner.name}** và nhận được \`${prize.toLocaleString()}\` Cash!`;
                    updateEmbed.setThumbnail('https://i.imgur.com/m69p96n.gif'); // Thêm hiệu ứng chúc mừng
                } else {
                    resultStatus = `💸 **THẤT BẠI!**\n**${winner.name}** đã về nhất. Bạn đã mất \`${bet.toLocaleString()}\` Cash cho nhà cái.`;
                }

                updateEmbed.addFields({ name: 'Kết quả', value: resultStatus });
                
                await interaction.editReply({ embeds: [updateEmbed] });
            } else {
                // Chỉ edit nếu chưa có người thắng để tránh lỗi Discord rate limit khi kết thúc
                await interaction.editReply({ embeds: [updateEmbed] }).catch(() => {});
            }
        }, 2500); // 2.5s là khoảng cách an toàn nhất cho Discord API
    }
};
