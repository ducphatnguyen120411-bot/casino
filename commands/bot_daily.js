const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, SlashCommandBuilder } = require('discord.js');

module.exports = {
    // 1. PHẢI CÓ CẤU TRÚC DATA NÀY ĐỂ KHÔNG LỖI index.js
    data: new SlashCommandBuilder()
        .setName('tasks')
        .setDescription('Hệ thống nhiệm vụ hàng ngày của Verdict Cash')
        .addStringOption(opt => 
            opt.setName('action')
                .setDescription('Chọn hành động')
                .addChoices({ name: 'claim', value: 'claim' })),

    async execute(interaction, prisma) {
        // 2. PHÂN BIỆT SLASH VÀ PREFIX
        const isSlash = interaction.options !== undefined;
        const userId = isSlash ? interaction.user.id : interaction.author.id;
        const userObj = isSlash ? interaction.user : interaction.author;

        const now = new Date();
        const todayStart = new Date(now.setHours(0, 0, 0, 0));

        // 3. LẤY DỮ LIỆU USER
        let user = await prisma.user.upsert({
            where: { id: userId },
            update: {},
            create: { 
                id: userId, 
                balance: 1000, 
                lastDaily: new Date(0),
                msgCount: 0 
            }
        });

        // 4. ĐỊNH NGHĨA NHIỆM VỤ
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
                reward: 1000,
                check: () => user.msgCount >= 20 && !user.claimedChatter, 
                status: () => user.claimedChatter ? '✅ Đã xong' : `${user.msgCount}/20 tin nhắn`
            }
        ];

        // 5. XỬ LÝ LOGIC CLAIM (NHẬN THƯỞNG)
        const action = isSlash ? interaction.options.getString('action') : interaction.content.split(' ')[1];

        if (action === 'claim') {
            let totalClaimed = 0;
            let updateData = { balance: { increment: 0 } };

            // Kiểm tra nhiệm vụ 1
            if (tasks[0].check()) {
                totalClaimed += tasks[0].reward;
                updateData.lastDaily = new Date();
                updateData.balance.increment += tasks[0].reward;
            }
            // Kiểm tra nhiệm vụ 2
            if (tasks[1].check()) {
                totalClaimed += tasks[1].reward;
                updateData.claimedChatter = true;
                updateData.balance.increment += tasks[1].reward;
            }

            if (totalClaimed > 0) {
                await prisma.user.update({ where: { id: userId }, data: updateData });
                const successMsg = `🎉 **${userObj.username}** đã nhận được **${totalClaimed}** Verdict Cash!`;
                return isSlash ? interaction.reply(successMsg) : interaction.reply(successMsg);
            } else {
                const failMsg = `🔔 Bạn không có nhiệm vụ nào đủ điều kiện nhận thưởng.`;
                return isSlash ? interaction.reply({ content: failMsg, ephemeral: true }) : interaction.reply(failMsg);
            }
        }

        // 6. GIAO DIỆN BẢNG NHIỆM VỤ
        const taskEmbed = new EmbedBuilder()
            .setColor('#2ecc71')
            .setTitle('📜 BẢNG NHIỆM VỤ VERDICT')
            .setThumbnail(userObj.displayAvatarURL())
            .setDescription('Hoàn thành thử thách để nhận Cash! Gõ `/tasks action:claim` hoặc `!tasks claim` để nhận.')
            .setTimestamp();

        tasks.forEach(t => {
            taskEmbed.addFields({ 
                name: t.name, 
                value: `💰 Thưởng: **${t.reward}**\nTrạng thái: \`${t.status()}\``, 
                inline: false 
            });
        });

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`claim_tasks_${userId}`) // Gắn ID user để tránh người khác bấm hộ
                .setLabel('Nhận thưởng nhanh')
                .setStyle(ButtonStyle.Success)
                .setEmoji('💰')
        );

        return isSlash ? 
            interaction.reply({ embeds: [taskEmbed], components: [row] }) : 
            interaction.reply({ embeds: [taskEmbed], components: [row] });
    }
};
