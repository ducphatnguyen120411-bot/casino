const { EmbedBuilder, SlashCommandBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('vi')
        .setDescription('💰 Xem ví tiền và số dư tài khoản')
        .addUserOption(option => 
            option.setName('user')
                .setDescription('Chọn người muốn xem ví (để trống để xem ví mình)')
                .setRequired(false)),

    async execute(input, prisma) {
        // 1. Nhận diện loại lệnh
        const isSlash = !!input.options;
        const author = isSlash ? input.user : input.author;
        
        // Xác định đối tượng cần xem ví
        const userObj = isSlash 
            ? (input.options.getUser('user') || author) 
            : (input.mentions.users.first() || author);

        const isSelf = userObj.id === author.id;

        // 2. Phản hồi tạm thời nếu là Slash
        if (isSlash) await input.deferReply();

        try {
            // 3. Lấy dữ liệu (Sử dụng upsert để tối ưu tốc độ)
            const userData = await prisma.user.upsert({
                where: { id: userObj.id },
                update: {}, // Nếu có rồi thì không làm gì cả
                create: { id: userObj.id, balance: 50000, msgCount: 0 } // Quà tân thủ 50k
            });

            // 4. Tính toán danh hiệu & Level
            const level = Math.floor(userData.msgCount / 100);
            let rankName = '🌱 Thành Viên';
            let rankColor = '#95a5a6';

            if (level >= 50) {
                rankName = '👑 Huyền Thoại';
                rankColor = '#f1c40f';
            } else if (level >= 10) {
                rankName = '💎 Đại Gia';
                rankColor = '#3498db';
            } else if (level >= 5) {
                rankName = '🌟 Tích Cực';
                rankColor = '#2ecc71';
            }

            // 5. Thiết kế Embed "Thượng Lưu"
            const embed = new EmbedBuilder()
                .setColor(isSelf ? '#D4AF37' : rankColor) // Màu vàng Gold nếu là ví mình
                .setAuthor({ 
                    name: `HỆ THỐNG TÀI CHÍNH VERDICT`, 
                    iconURL: 'https://i.imgur.com/8E89vXp.png' 
                })
                .setTitle(`💳 Thẻ Thành Viên: ${userObj.username}`)
                .setThumbnail(userObj.displayAvatarURL({ dynamic: true, size: 512 }))
                .setDescription(
                    isSelf 
                    ? `Chào mừng trở lại, **${userObj.username}**. Dưới đây là tình trạng tài sản của bạn.` 
                    : `Đang truy cập hồ sơ tài chính của **${userObj.username}**...`
                )
                .addFields(
                    { 
                        name: '💵 TỔNG TÀI SẢN', 
                        value: `\`\`\`arm\n💰 ${userData.balance.toLocaleString()} VCASH\n\`\`\``, 
                        inline: false 
                    },
                    { 
                        name: '📊 THỐNG KÊ', 
                        value: `💬 **Tương tác:** \`${userData.msgCount}\` tin\n🏆 **Cấp bậc:** \`${rankName}\``, 
                        inline: true 
                    },
                    { 
                        name: '🎖️ TRÌNH ĐỘ', 
                        value: `⭐ **Level:** \`${level}\` \n✨ **Uy tín:** \`100%\``, 
                        inline: true 
                    }
                )
                .setFooter({ 
                    text: `ID: ${userObj.id} • Yêu cầu bởi ${author.username}`, 
                    iconURL: author.displayAvatarURL() 
                })
                .setTimestamp();

            // 6. Gửi phản hồi
            if (isSlash) {
                return await input.editReply({ embeds: [embed] });
            } else {
                return await input.reply({ embeds: [embed] });
            }

        } catch (error) {
            console.error('❌ Lỗi ví:', error);
            const errorMsg = '⚠️ Máy chủ ngân hàng đang bận, vui lòng thử lại sau!';
            
            if (isSlash) return await input.editReply(errorMsg);
            return input.reply(errorMsg);
        }
    }
};
