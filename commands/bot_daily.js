const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

module.exports = {
    name: 'tasks',
    description: 'Hệ thống nhiệm vụ hàng ngày của Verdict Cash',
    async execute(message, prisma) {
        const userId = message.author.id;
        const now = new Date();
        const todayStart = new Date(now.setHours(0, 0, 0, 0)); // Bắt đầu ngày hôm nay

        // 1. Lấy hoặc tạo User và nạp dữ liệu nhiệm vụ (giả định dùng trường metadata hoặc table riêng)
        // Ở đây mình tối ưu bằng cách dùng prisma.user.upsert
        let user = await prisma.user.upsert({
            where: { id: userId },
            update: {},
            create: { 
                id: userId, 
                balance: 0, 
                lastDaily: new Date(0),
                msgCount: 0 // Giả định bạn có trường này để đếm tin nhắn trong ngày
            }
        });

        // 2. Định nghĩa danh sách nhiệm vụ
        const tasks = [
            {
                id: 'daily_claim',
                name: '🎁 Điểm danh hàng ngày',
                reward: 500,
                check: () => new Date(user.lastDaily) < todayStart,
                status: () => new Date(user.lastDaily) >= todayStart ? '✅ Đã xong' : '⏳ Chưa nhận'
            },
            {
                id: 'chatter',
                name: '💬 Người nói nhiều',
                description: 'Gửi ít nhất 20 tin nhắn hôm nay',
                reward: 1000,
                // Giả sử bạn có hệ thống đếm tin nhắn lưu vào DB
                check: () => user.msgCount >= 20 && !user.claimedChatter, 
                status: () => user.claimedChatter ? '✅ Đã xong' : `${user.msgCount}/20 tin nhắn`
            },
            {
                id: 'big_win',
                name: '🎲 Thần bài',
                description: 'Thắng 1 ván game bất kỳ',
                reward: 1500,
                check: () => user.hasWonToday && !user.claimedWin,
                status: () => user.claimedWin ? '✅ Đã xong' : '❌ Chưa đạt'
            }
        ];

        // 3. Xử lý logic nếu người dùng muốn "Nhận thưởng" (Ví dụ dùng args: !daily claim)
        const args = message.content.split(' ');
        if (args[1] === 'claim') {
            let totalClaimed = 0;
            let updateData = {};

            if (tasks[0].check()) {
                totalClaimed += tasks[0].reward;
                updateData.lastDaily = new Date();
                updateData.balance = { increment: tasks[0].reward };
            }
            
            // Các nhiệm vụ khác logic tương tự...
            if (Object.keys(updateData).length > 0) {
                await prisma.user.update({ where: { id: userId }, data: updateData });
                return message.reply(`🎉 Bạn đã nhận được tổng cộng **${totalClaimed} Verdict Cash**!`);
            } else {
                return message.reply(`🔔 Bạn không có nhiệm vụ nào mới để nhận thưởng.`);
            }
        }

        // 4. Tạo giao diện Embed danh sách nhiệm vụ
        const taskEmbed = new EmbedBuilder()
            .setColor('#2ecc71')
            .setTitle('📜 BẢNG NHIỆM VỤ VERDICT')
            .setThumbnail(message.author.displayAvatarURL())
            .setDescription('Hoàn thành các thử thách dưới đây để nhận thêm Cash!')
            .setTimestamp();

        tasks.forEach(t => {
            taskEmbed.addFields({ 
                name: t.name, 
                value: `Thưởng: **${t.reward}**\nTrạng thái: \`${t.status()}\``, 
                inline: false 
            });
        });

        // 5. Thêm nút bấm cho chuyên nghiệp
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('claim_daily')
                .setLabel('Nhận thưởng nhanh')
                .setStyle(ButtonStyle.Success)
                .setEmoji('💰')
        );

        return message.reply({ 
            content: `Gõ \`!tasks claim\` hoặc nhấn nút bên dưới để nhận thưởng!`,
            embeds: [taskEmbed], 
            components: [row] 
        });
    }
};
