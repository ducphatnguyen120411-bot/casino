const { EmbedBuilder, SlashCommandBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('daily')
        .setDescription('🎁 Nhận thưởng điểm danh hàng ngày'),

    async execute(input, prisma) {
        // Hỗ trợ cả Slash (interaction) và Prefix (message)
        const userObj = input.user || input.author;
        const userId = userObj.id;
        
        const now = new Date();
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);

        try {
            let user = await prisma.user.findUnique({ where: { id: userId } });

            // 1. Kiểm tra cooldown (Đã nhận trong hôm nay chưa)
            if (user && user.lastDaily && new Date(user.lastDaily) >= todayStart) {
                const failEmbed = new EmbedBuilder()
                    .setColor('#ff4d4d')
                    .setAuthor({ name: 'Hệ Thống Điểm Danh', iconURL: 'https://cdn-icons-png.flaticon.com/512/1163/1163474.png' })
                    .setDescription('❌ **Bạn đã nhận thưởng hôm nay rồi!**\n\n*Hãy quay lại sau 00:00 đêm nay để tiếp tục nhận lương nhé.*');
                
                return input.reply({ embeds: [failEmbed], ephemeral: true });
            }

            // 2. Thực hiện cộng tiền
            const reward = 500;
            const updatedUser = await prisma.user.upsert({
                where: { id: userId },
                update: { 
                    balance: { increment: reward }, 
                    lastDaily: new Date() 
                },
                create: { 
                    id: userId, 
                    balance: 1000 + reward, // Tặng 1000 khởi nghiệp + 500 daily
                    lastDaily: new Date(), 
                    msgCount: 0 
                }
            });

            // 3. Gửi Embed thành công
            const successEmbed = new EmbedBuilder()
                .setColor('#f1c40f')
                .setTitle('✨ ĐIỂM DANH THÀNH CÔNG')
                .setThumbnail('https://cdn-icons-png.flaticon.com/512/6159/6159838.png')
                .setDescription(`Chúc mừng **${userObj.username}**! Bạn vừa nhận được quà từ hệ thống.`)
                .addFields(
                    { name: '🎁 Phần thưởng:', value: `\`+${reward.toLocaleString()} VCASH\``, inline: true },
                    { name: '💰 Số dư hiện tại:', value: `\`${updatedUser.balance.toLocaleString()} VCASH\``, inline: true }
                )
                .setFooter({ text: 'Hẹn gặp lại bạn vào ngày mai!', iconURL: userObj.displayAvatarURL() })
                .setTimestamp();

            return input.reply({ embeds: [successEmbed] });

        } catch (error) {
            console.error('❌ Lỗi thực thi daily:', error);
            return input.reply('Có lỗi xảy ra khi xử lý điểm danh!');
        }
    }
};
