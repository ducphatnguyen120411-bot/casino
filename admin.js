const { EmbedBuilder } = require('discord.js');

// ID Role Admin của bạn
const ADMIN_ROLE_ID = '1465374336214106237';

module.exports = {
    name: 'messageCreate',
    async execute(message, prisma) {
        if (!message.content.startsWith('!') || message.author.bot) return;

        const args = message.content.slice(1).trim().split(/ +/);
        const command = args.shift().toLowerCase();

        // 1. KIỂM TRA QUYỀN
        if (!message.member.roles.cache.has(ADMIN_ROLE_ID)) return;

        // --- LỆNH !NAP ---
        if (command === 'nap') {
            const targetUser = message.mentions.users.first();
            const amount = parseInt(args[1]);

            if (!targetUser || isNaN(amount) || amount <= 0) {
                return message.reply('⚠️ **Cú pháp:** `!nap @user [số tiền]`');
            }

            try {
                const user = await prisma.user.upsert({
                    where: { id: targetUser.id },
                    update: { balance: { increment: amount } },
                    create: { id: targetUser.id, balance: amount }
                });

                const napEmbed = new EmbedBuilder()
                    .setTitle('💳 GIAO DỊCH NẠP TIỀN THÀNH CÔNG')
                    .setColor('#2ecc71') // Màu xanh lá
                    .setThumbnail(targetUser.displayAvatarURL())
                    .addFields(
                        { name: '👤 Người nhận', value: `${targetUser}`, inline: true },
                        { name: '💰 Số tiền nạp', value: `\`+${amount.toLocaleString()}\` Cash`, inline: true },
                        { name: '🏦 Số dư mới', value: `\`${user.balance.toLocaleString()}\` Cash`, inline: false }
                    )
                    .setFooter({ text: `Admin: ${message.author.username}`, iconURL: message.author.displayAvatarURL() })
                    .setTimestamp();

                return message.reply({ embeds: [napEmbed] });
            } catch (err) {
                return message.reply('❌ **Lỗi:** Không thể kết nối đến Database.');
            }
        }

        // --- LỆNH !TRU ---
        if (command === 'tru') {
            const targetUser = message.mentions.users.first();
            const amount = parseInt(args[1]);

            if (!targetUser || isNaN(amount) || amount <= 0) {
                return message.reply('⚠️ **Cú pháp:** `!tru @user [số tiền]`');
            }

            try {
                const userData = await prisma.user.findUnique({ where: { id: targetUser.id } });
                if (!userData || userData.balance < amount) {
                    return message.reply('❌ **Thất bại:** Người dùng không đủ số dư để trừ!');
                }

                const user = await prisma.user.update({
                    where: { id: targetUser.id },
                    data: { balance: { decrement: amount } }
                });

                const truEmbed = new EmbedBuilder()
                    .setTitle('💸 GIAO DỊCH TRỪ TIỀN THÀNH CÔNG')
                    .setColor('#e74c3c') // Màu đỏ
                    .setThumbnail(targetUser.displayAvatarURL())
                    .addFields(
                        { name: '👤 Đối tượng', value: `${targetUser}`, inline: true },
                        { name: '📉 Số tiền trừ', value: `\`-${amount.toLocaleString()}\` Cash`, inline: true },
                        { name: '🏦 Số dư còn lại', value: `\`${user.balance.toLocaleString()}\` Cash`, inline: false }
                    )
                    .setFooter({ text: `Admin: ${message.author.username}`, iconURL: message.author.displayAvatarURL() })
                    .setTimestamp();

                return message.reply({ embeds: [truEmbed] });
            } catch (err) {
                return message.reply('❌ **Lỗi:** Không thể thực hiện lệnh trừ tiền.');
            }
        }
    }
};
