const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');

module.exports = {
    name: 'reaction',
    async execute(message, prisma) {
        // --- 1. GIAO DIỆN CHUẨN BỊ ---
        const prepEmbed = new EmbedBuilder()
            .setColor('#f1c40f')
            .setTitle('🎯 TRÒ CHƠI PHẢN XẠ')
            .setDescription('**Luật chơi:** Khi nút chuyển sang màu **XANH** và hiện biểu tượng 💥, hãy nhấn thật nhanh!\n\n⏳ *Đang thiết lập trận đấu...*')
            .setFooter({ text: 'Phần thưởng: 100 Verdict Cash' });

        // Nút bấm ở trạng thái chờ (vô hiệu hóa)
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('react_button')
                .setLabel('Đợi đã...')
                .setEmoji('⏳')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(true)
        );

        const gameMsg = await message.channel.send({ embeds: [prepEmbed], components: [row] });

        // --- 2. RANDOM THỜI GIAN CHỜ (3-7 giây) ---
        const delay = Math.floor(Math.random() * 4000) + 3000;

        // Đợi delay
        await new Promise(resolve => setTimeout(resolve, delay));

        // --- 3. KÍCH HOẠT TRÒ CHƠI ---
        const startTime = Date.now();

        const activeEmbed = new EmbedBuilder()
            .setColor('#ff4757')
            .setTitle('💥 NHẤN NGAY !!!')
            .setDescription('QUẤT LUÔN! AI NHANH TAY NHẤT?')
            .setImage('https://i.imgur.com/8vVz7uN.gif');

        const activeRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('react_button')
                .setLabel('BẤM ĐÂY!')
                .setEmoji('💥')
                .setStyle(ButtonStyle.Success)
                .setDisabled(false)
        );

        await gameMsg.edit({ embeds: [activeEmbed], components: [activeRow] });

        // --- 4. BỘ LỌC VÀ THU THẬP TƯƠNG TÁC ---
        const collector = gameMsg.createMessageComponentCollector({
            componentType: ComponentType.Button,
            time: 10000, // Cho phép 10 giây để bấm
            max: 1 // Chỉ lấy người đầu tiên
        });

        collector.on('collect', async (interaction) => {
            const reactionTime = ((Date.now() - startTime) / 1000).toFixed(3);
            const user = interaction.user;

            // Trả lời interaction ngay lập tức để tránh lỗi "Interaction Failed"
            await interaction.deferUpdate();

            try {
                // 5. CẬP NHẬT DATABASE
                await prisma.user.upsert({
                    where: { id: user.id },
                    update: { balance: { increment: 100 } },
                    create: { id: user.id, balance: 1100, msgCount: 0 }
                });

                const winEmbed = new EmbedBuilder()
                    .setColor('#2ed573')
                    .setAuthor({ name: user.username, iconURL: user.displayAvatarURL() })
                    .setTitle('🏆 CHIẾN THẮNG!')
                    .addFields(
                        { name: '⏱️ Tốc độ', value: `\`${reactionTime} giây\``, inline: true },
                        { name: '💰 Thưởng', value: `\`+100 VCASH\``, inline: true }
                    )
                    .setFooter({ text: 'Game kết thúc' })
                    .setTimestamp();

                // Vô hiệu hóa nút sau khi có người thắng
                const disabledRow = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId('react_button')
                        .setLabel(`Thắng cuộc: ${user.username}`)
                        .setStyle(ButtonStyle.Secondary)
                        .setDisabled(true)
                );

                await gameMsg.edit({ embeds: [winEmbed], components: [disabledRow] });

            } catch (error) {
                console.error("Lỗi Reaction Game:", error);
            }
        });

        collector.on('end', async (collected) => {
            if (collected.size === 0) {
                const timeoutEmbed = new EmbedBuilder()
                    .setColor('#7f8c8d')
                    .setTitle('😴 HẾT GIỜ')
                    .setDescription('Không có ai đủ nhanh tay cả. Trận đấu đã hủy bỏ!');
                
                const finalRow = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId('timeout')
                        .setLabel('Hết thời gian')
                        .setStyle(ButtonStyle.Danger)
                        .setDisabled(true)
                );

                await gameMsg.edit({ embeds: [timeoutEmbed], components: [finalRow] }).catch(() => null);
            }
        });
    }
};
