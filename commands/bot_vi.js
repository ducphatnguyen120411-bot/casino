const { EmbedBuilder, SlashCommandBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('vi')
        .setDescription('💰 Xem ví tiền và số dư tài khoản')
        .addUserOption(option => 
            option.setName('user')
                .setDescription('Chọn người bạn muốn xem ví (để trống nếu xem ví của mình)')
                .setRequired(false)),

    async execute(input, prisma) {
        // Hỗ trợ cả Slash Command và Prefix Command (nếu bạn có hệ thống handler cũ)
        const userObj = input.options?.getUser('user') || input.author || input.user;
        const isSelf = userObj.id === (input.user?.id || input.author?.id);
        
        // Tránh lỗi khi tương tác mất quá lâu
        if (input.deferred || !input.replied) {
            try { await input.deferReply(); } catch (e) {}
        }

        try {
            // Lấy hoặc tạo dữ liệu người dùng
            let userData = await prisma.user.findUnique({ where: { id: userObj.id } });

            if (!userData) {
                userData = await prisma.user.create({
                    data: { id: userObj.id, balance: 1000, msgCount: 0 }
                });
            }

            // Tính toán danh hiệu dựa trên msgCount (Ví dụ)
            const level = Math.floor(userData.msgCount / 100);
            const rankName = level > 10 ? '💎 Đại Gia' : level > 5 ? '🌟 Tích Cực' : '🌱 Thành Viên';

            const embed = new EmbedBuilder()
                .setColor(isSelf ? '#00ff99' : '#ffcc00')
                .setAuthor({ 
                    name: `THÔNG TIN TÀI KHOẢN`, 
                    iconURL: 'https://cdn-icons-png.flaticon.com/512/2489/2489756.png' 
                })
                .setTitle(`${userObj.tag}`)
                .setThumbnail(userObj.displayAvatarURL({ dynamic: true, size: 512 }))
                .setDescription(isSelf ? '_Đây là ví cá nhân của bạn._' : `_Bạn đang xem ví của ${userObj.username}_`)
                .addFields(
                    { 
                        name: '💵 Tài Sản Hiện Có', 
                        value: `\`\`\`fix\n${userData.balance.toLocaleString()} VCASH\`\`\``, 
                        inline: false 
                    },
                    { 
                        name: '📊 Thống Kê', 
                        value: `💬 **Tin nhắn:** \`${userData.msgCount}\` \n🏆 **Danh hiệu:** \`${rankName}\``, 
                        inline: true 
                    },
                    { 
                        name: '🎖️ Cấp Độ', 
                        value: `⭐ **Level:** \`${level}\``, 
                        inline: true 
                    }
                )
                .setFooter({ 
                    text: `Yêu cầu bởi ${input.user?.username || input.author?.username}`, 
                    iconURL: (input.user || input.author).displayAvatarURL() 
                })
                .setTimestamp();

            return await input.editReply({ embeds: [embed] });

        } catch (error) {
            console.error('❌ Lỗi thực thi ví:', error);
            const errorMsg = 'Có lỗi xảy ra khi truy cập dữ liệu ví!';
            if (input.deferred) return await input.editReply(errorMsg);
            return input.reply(errorMsg);
        }
    }
};
