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
        // 1. Phân biệt Slash Command và Prefix Command
        const isSlash = input.applicationId !== undefined;
        const author = isSlash ? input.user : input.author;
        
        // Lấy User đối tượng (nếu là prefix thì check mentions)
        const userObj = isSlash 
            ? (input.options.getUser('user') || author) 
            : (input.mentions.users.first() || author);

        const isSelf = userObj.id === author.id;

        // 2. Xử lý phản hồi ban đầu (Chỉ defer nếu là Slash)
        if (isSlash) {
            await input.deferReply();
        }

        try {
            // 3. Lấy hoặc tạo dữ liệu người dùng
            let userData = await prisma.user.findUnique({ where: { id: userObj.id } });

            if (!userData) {
                userData = await prisma.user.create({
                    data: { id: userObj.id, balance: 1000, msgCount: 0 }
                });
            }

            // 4. Logic tính danh hiệu
            const level = Math.floor(userData.msgCount / 100);
            let rankName = '🌱 Thành Viên';
            if (level > 10) rankName = '💎 Đại Gia';
            else if (level > 5) rankName = '🌟 Tích Cực';

            // 5. Tạo Embed
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
                    text: `Yêu cầu bởi ${author.username}`, 
                    iconURL: author.displayAvatarURL() 
                })
                .setTimestamp();

            // 6. Trả lời (Slash dùng editReply, Prefix dùng reply)
            if (isSlash) {
                return await input.editReply({ embeds: [embed] });
            } else {
                return await input.reply({ embeds: [embed] });
            }

        } catch (error) {
            console.error('❌ Lỗi thực thi ví:', error);
            const errorMsg = '⚠️ Có lỗi xảy ra khi truy cập dữ liệu ví!';
            
            if (isSlash) return await input.editReply(errorMsg);
            return input.reply(errorMsg);
        }
    }
};
