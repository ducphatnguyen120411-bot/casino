const { EmbedBuilder, SlashCommandBuilder } = require('discord.js');

module.exports = {
    // Hỗ trợ cả Slash Command cho hiện đại
    data: new SlashCommandBuilder()
        .setName('vi')
        .setDescription('Xem ví tiền chung và tài sản của bạn')
        .addUserOption(opt => opt.setName('user').setDescription('Xem ví của người khác')),

    async execute(interaction, prisma) {
        // Lấy User (hỗ trợ cả lệnh prefix !vi và slash /vi)
        const target = interaction.options?.getUser('user') || interaction.user;
        
        // 1. Truy vấn "Ví Chung" từ Database
        const userData = await prisma.user.findUnique({
            where: { id: target.id }
        });

        // Nếu người dùng chưa có trong DB (người mới hoàn toàn)
        if (!userData) {
            return interaction.reply({ 
                content: `❌ **${target.username}** chưa mở tài khoản ngân hàng Verdict!`, 
                ephemeral: true 
            });
        }

        // 2. Định nghĩa danh hiệu dựa trên số dư (Tạo độ oai)
        let rank = "Dân Nghèo";
        if (userData.balance >= 1000000) rank = "💎 Tỷ Phú Verdict";
        else if (userData.balance >= 100000) rank = "💰 Đại Gia Khu Vực";
        else if (userData.balance >= 50000) rank = "🏦 Doanh Nhân Trẻ";
        else if (userData.balance >= 10000) rank = "💵 Khá Giả";

        // 3. Tạo Embed "Ví Tiền Chung" siêu đẹp
        const walletEmbed = new EmbedBuilder()
            .setTitle('💳 THẺ TÀI KHOẢN VERDICT')
            .setDescription(`Chào mừng trở lại, **${target.username}**!`)
            .setColor(userData.balance > 0 ? '#f1c40f' : '#e74c3c') // Vàng nếu có tiền, đỏ nếu nợ/hết tiền
            .setThumbnail(target.displayAvatarURL({ dynamic: true }))
            .addFields(
                { 
                    name: '🏦 Số Dư Ví Chung', 
                    value: `> **${userData.balance.toLocaleString()}** Verdict Cash`, 
                    inline: false 
                },
                { 
                    name: '🏗️ Bất Động Sản', 
                    value: `Level **${userData.level}**`, 
                    inline: true 
                },
                { 
                    name: '🎖️ Danh Hiệu', 
                    value: `*${rank}*`, 
                    inline: true 
                },
                { 
                    name: '📈 Thống Kê', 
                    value: `Thắng **${userData.totalWins}** trận game`, 
                    inline: true 
                }
            )
            .setImage('https://i.imgur.com/vHqY7bK.png') // Thanh gạch ngang trang trí (tùy chọn)
            .setFooter({ text: 'Số dư này dùng chung cho: Đua Ngựa, Phản Xạ, BĐS và Chứng Khoán' })
            .setTimestamp();

        return interaction.reply({ embeds: [walletEmbed] });
    }
};
