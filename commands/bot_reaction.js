const { EmbedBuilder } = require('discord.js');

module.exports = {
    name: 'reaction',
    async execute(message, prisma) {
        // 1. Giao diện chuẩn bị
        const prepEmbed = new EmbedBuilder()
            .setColor('#f1c40f')
            .setTitle('🎯 TRÒ CHƠI PHẢN XẠ')
            .setDescription('Chuẩn bị... Khi biểu tượng 💥 xuất hiện, hãy nhấn vào nó thật nhanh!')
            .setFooter({ text: 'Phần thưởng: 100 Verdict Cash + Hoàn thành nhiệm vụ ngày' });

        const gameMsg = await message.channel.send({ embeds: [prepEmbed] });

        // CHỐNG SPAM: Đảm bảo tin nhắn không có reaction nào trước khi game bắt đầu
        try {
            await gameMsg.reactions.removeAll();
        } catch (e) { /* Bỏ qua nếu bot thiếu quyền */ }

        // 2. Random thời gian chờ từ 2 đến 5 giây
        const delay = Math.floor(Math.random() * 3000) + 2000;

        setTimeout(async () => {
            const startTime = Date.now();

            // 3. Đổi giao diện sang trạng thái kích hoạt
            const activeEmbed = new EmbedBuilder()
                .setColor('#ff4757')
                .setTitle('💥 NHẤN NGAY !!!')
                .setDescription('Ai nhanh tay nhất sẽ thắng!')
                .setImage('https://i.imgur.com/8vVz7uN.gif');

            await gameMsg.edit({ embeds: [activeEmbed] });
            
            // Thêm reaction ngay khi đổi giao diện
            await gameMsg.react("💥");

            // 4. Bộ lọc: Chỉ tính người nhấn đầu tiên và không phải Bot
            const filter = (reaction, user) => reaction.emoji.name === '💥' && !user.bot;
            
            // Thu thập 1 người duy nhất (max: 1)
            const collector = gameMsg.createReactionCollector({ filter, time: 8000, max: 1 });

            collector.on('collect', async (reaction, user) => {
                const reactionTime = ((Date.now() - startTime) / 1000).toFixed(3);

                try {
                    // 5. Cập nhật Database: Tăng tiền + Đánh dấu đã thắng cho nhiệm vụ ngày
                    const updatedUser = await prisma.user.upsert({
                        where: { id: user.id },
                        update: { 
                            balance: { increment: 100 },
                            hasWonToday: true // QUAN TRỌNG: Kết nối với bot_daily/tasks
                        },
                        create: { 
                            id: user.id, 
                            balance: 1100, // 1000 mặc định + 100 thưởng
                            hasWonToday: true 
                        }
                    });

                    // 6. Embed thông báo thắng cuộc
                    const winEmbed = new EmbedBuilder()
                        .setColor('#2ed573')
                        .setAuthor({ name: user.username, iconURL: user.displayAvatarURL() })
                        .setTitle('🏆 CHIẾN THẮNG!')
                        .addFields(
                            { name: '⏱️ Tốc độ', value: `\`${reactionTime} giây\``, inline: true },
                            { name: '💰 Verdict Cash', value: `\`+100\``, inline: true },
                            { name: '🌟 Nhiệm vụ', value: '`Đã hoàn thành mục Thần Bài`', inline: false }
                        )
                        .setFooter({ text: 'Sử dụng !tasks claim để nhận thêm thưởng lớn!' })
                        .setTimestamp();

                    await message.channel.send({ content: `<@${user.id}>`, embeds: [winEmbed] });
                } catch (error) {
                    console.error("Lỗi Prisma Reaction:", error);
                    message.channel.send(`❌ Có lỗi xảy ra khi lưu kết quả cho **${user.username}**.`);
                }
            });

            collector.on('end', async (collected) => {
                // Xóa icon 💥 cuối trận để tránh bấm nhầm sau này
                try {
                    await gameMsg.reactions.removeAll();
                } catch (e) { /* Bỏ qua */ }
                
                if (collected.size === 0) {
                    const timeoutEmbed = new EmbedBuilder()
                        .setColor('#7f8c8d')
                        .setTitle('😴 KHÔNG AI PHẢN HỒI')
                        .setDescription('Mọi người chậm chạp quá, trận đấu đã kết thúc!');
                    gameMsg.edit({ embeds: [timeoutEmbed] });
                }
            });

        }, delay);
    }
};
