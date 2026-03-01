const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('race')
        .setDescription('🏇 Đua ngựa Verdict - Thử thách vận may!')
        .addIntegerOption(opt => 
            opt.setName('bet')
                .setDescription('Số tiền cược (Tối thiểu 100)')
                .setRequired(true)
                .setMinValue(100))
        .addStringOption(opt => 
            opt.setName('horse')
                .setDescription('Chọn chiến mã của bạn')
                .setRequired(true)
                .addChoices(
                    { name: '🔴 Xích Thố', value: 'Ngựa Đỏ' },
                    { name: '🔵 Hải Mã', value: 'Ngựa Xanh' },
                    { name: '🟢 Phong Mã', value: 'Ngựa Lục' },
                    { name: '🟡 Kim Mã', value: 'Ngựa Vàng' }
                )),

    async execute(interaction, prisma) {
        const userId = interaction.user.id;
        const bet = interaction.options.getInteger('bet');
        const chosenHorseName = interaction.options.getString('horse');

        // 1. Kiểm tra tài khoản
        const user = await prisma.user.findUnique({ where: { id: userId } });
        if (!user || user.balance < bet) {
            return interaction.reply({ 
                content: `❌ **Giao dịch thất bại!** Bạn cần thêm \`${(bet - (user?.balance || 0)).toLocaleString()}\` Cash nữa để tham gia.`, 
                ephemeral: true 
            });
        }

        // 2. Trừ tiền ngay lập tức để chống bug
        await prisma.user.update({
            where: { id: userId },
            data: { balance: { decrement: bet } }
        });

        const horses = [
            { name: 'Ngựa Đỏ', emoji: '🔴', pos: 0, color: 0xFF4B4B },
            { name: 'Ngựa Xanh', emoji: '🔵', pos: 0, color: 0x4B8BFF },
            { name: 'Ngựa Lục', emoji: '🟢', pos: 0, color: 0x4BFF7E },
            { name: 'Ngựa Vàng', emoji: '🟡', pos: 0, color: 0xFFD700 }
        ];

        const finishLine = 12; // Độ dài đường đua
        let winner = null;
        let isUpdating = false;

        const commentaries = [
            "Các nài ngựa đang quất roi kịch liệt!",
            "Một cú bứt tốc từ phía sau!",
            "Khán giả đang gào thét tên chiến mã!",
            "Đường đua đang nóng hơn bao giờ hết!",
            "Cú ngoặt bóng đầy bất ngờ!",
            "Chiến thắng đang ở rất gần!"
        ];

        // Tạo Embed ban đầu
        const mainEmbed = new EmbedBuilder()
            .setTitle('🏁 TRƯỜNG ĐUA VERDICT CHAMPIONSHIP')
            .setDescription(`🏇 **Cuộc đua đang chuẩn bị bắt đầu...**\n\n${renderTrack(horses, finishLine, chosenHorseName)}`)
            .setColor('#2F3136')
            .setFooter({ 
                text: `Player: ${interaction.user.username} | Cược: ${bet.toLocaleString()} Cash`, 
                iconURL: interaction.user.displayAvatarURL() 
            });

        const message = await interaction.reply({ embeds: [mainEmbed], fetchReply: true });

        // 3. Vòng lặp cuộc đua (3.5s mỗi bước để tuyệt đối không dính Rate Limit)
        const raceInterval = setInterval(async () => {
            if (isUpdating) return; // Nếu đang bận xử lý API thì đợi lượt sau
            isUpdating = true;

            // Di chuyển ngựa
            horses.forEach(h => {
                if (!winner) {
                    const move = Math.floor(Math.random() * 3) + 1; // Nhảy 1-3 bước
                    h.pos += move;
                    if (h.pos >= finishLine) {
                        h.pos = finishLine;
                        winner = h;
                    }
                }
            });

            const randomComment = commentaries[Math.floor(Math.random() * commentaries.length)];
            const updateEmbed = EmbedBuilder.from(mainEmbed)
                .setDescription(`💬 *"${randomComment}"*\n\n${renderTrack(horses, finishLine, chosenHorseName)}`);

            if (winner) {
                clearInterval(raceInterval);
                
                const isWin = (winner.name === chosenHorseName);
                const prize = Math.floor(bet * 1.95); // Tỉ lệ ăn 1.95 (trừ 5% phí sàn)

                let resultText = "";
                if (isWin) {
                    await prisma.user.update({
                        where: { id: userId },
                        data: { 
                            balance: { increment: prize + bet }, // Trả lại gốc + cộng lời
                            totalWins: { increment: 1 } 
                        }
                    });
                    resultText = `🎉 **CHIẾN THẮNG!**\nBạn đã chọn đúng **${winner.name}** và nhận được \`${prize.toLocaleString()}\` Cash (đã trừ phí).`;
                    updateEmbed.setThumbnail('https://i.imgur.com/m69p96n.gif');
                } else {
                    resultText = `💸 **THẤT BẠI!**\n**${winner.name}** đã về nhất. Bạn mất \`${bet.toLocaleString()}\` Cash.`;
                }

                updateEmbed
                    .setTitle(isWin ? '🏆 KẾT QUẢ: THẮNG CƯỢC' : '💀 KẾT QUẢ: THUA CƯỢC')
                    .setColor(winner.color)
                    .addFields({ name: 'Chi tiết', value: resultText });

                return await interaction.editReply({ embeds: [updateEmbed] }).catch(() => {});
            }

            // Gửi bản cập nhật vị trí
            try {
                await interaction.editReply({ embeds: [updateEmbed] });
            } catch (err) {
                clearInterval(raceInterval); // Dừng nếu tin nhắn bị xóa
            } finally {
                isUpdating = false;
            }

        }, 3500); // 3.5 giây là khoảng cách an toàn nhất cho Discord API
    }
};

/**
 * Hàm vẽ đường đua (Render đẹp)
 */
function renderTrack(horses, finishLine, chosenHorseName) {
    return horses.map(h => {
        const progress = '▬'.repeat(h.pos);
        const remaining = '┈'.repeat(finishLine - h.pos);
        const horseIcon = h.pos >= finishLine ? '🏆' : (h.name === chosenHorseName ? '🏇' : '🐎');
        const highlight = h.name === chosenHorseName ? ' ⭐' : '';
        
        // Sử dụng Code Block để các thanh tiến trình thẳng hàng nhau
        return `${h.emoji} **${h.name}**${highlight}\n\`|${progress}${horseIcon}${remaining}|\``;
    }).join('\n');
}
