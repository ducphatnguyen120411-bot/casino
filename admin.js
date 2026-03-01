const { EmbedBuilder } = require('discord.js');

// ID Role Admin của ông
const ADMIN_ROLE_ID = '1465374336214106237';

module.exports = {
    async execute(message, prisma, args, command) {
        const author = message.author;

        // =========================================================
        // 1. LỆNH !NAP (CHỈ ADMIN)
        // =========================================================
        if (command === 'nap') {
            if (!message.member.roles.cache.has(ADMIN_ROLE_ID)) return message.reply('🚫 Quyền hạn không đủ!');

            const targetUser = message.mentions.users.first();
            const amount = parseInt(args[1]);

            if (!targetUser || isNaN(amount) || amount <= 0) {
                return message.reply('⚠️ **Cú pháp:** `!nap @user [số tiền]`');
            }

            const user = await prisma.user.upsert({
                where: { id: targetUser.id },
                update: { balance: { increment: amount } },
                create: { id: targetUser.id, balance: 1000 + amount, msgCount: 0 }
            });

            const embed = new EmbedBuilder()
                .setTitle('💳 NẠP TIỀN THÀNH CÔNG')
                .setColor('#2ecc71')
                .addFields(
                    { name: '👤 Người nhận', value: `${targetUser}`, inline: true },
                    { name: '💰 Số tiền', value: `\`+${amount.toLocaleString()}\` VCASH`, inline: true },
                    { name: '🏦 Số dư mới', value: `\`${user.balance.toLocaleString()}\` VCASH` }
                )
                .setFooter({ text: `Admin: ${author.username}` })
                .setTimestamp();

            return message.reply({ embeds: [embed] });
        }

        // =========================================================
        // 2. LỆNH !TRU (CHỈ ADMIN)
        // =========================================================
        if (command === 'tru') {
            if (!message.member.roles.cache.has(ADMIN_ROLE_ID)) return message.reply('🚫 Quyền hạn không đủ!');

            const targetUser = message.mentions.users.first();
            const amount = parseInt(args[1]);

            if (!targetUser || isNaN(amount) || amount <= 0) {
                return message.reply('⚠️ **Cú pháp:** `!tru @user [số tiền]`');
            }

            const userData = await prisma.user.findUnique({ where: { id: targetUser.id } });
            if (!userData || userData.balance < amount) return message.reply('❌ Người này không đủ tiền để trừ!');

            const user = await prisma.user.update({
                where: { id: targetUser.id },
                data: { balance: { decrement: amount } }
            });

            const embed = new EmbedBuilder()
                .setTitle('💸 TRỪ TIỀN THÀNH CÔNG')
                .setColor('#e74c3c')
                .addFields(
                    { name: '👤 Đối tượng', value: `${targetUser}`, inline: true },
                    { name: '📉 Số tiền trừ', value: `\`-${amount.toLocaleString()}\` VCASH`, inline: true },
                    { name: '🏦 Số dư còn lại', value: `\`${user.balance.toLocaleString()}\` VCASH` }
                )
                .setFooter({ text: `Admin: ${author.username}` })
                .setTimestamp();

            return message.reply({ embeds: [embed] });
        }

        // =========================================================
        // 3. LỆNH !PAY (DÀNH CHO USER)
        // =========================================================
        if (command === 'pay') {
            const targetUser = message.mentions.users.first();
            const amount = parseInt(args[1]);

            if (!targetUser || isNaN(amount) || amount <= 0) {
                return message.reply('⚠️ **Cú pháp:** `!pay @user [số tiền]`');
            }

            if (targetUser.id === author.id) return message.reply('🚫 Đừng tự chuyển cho mình ông giáo ơi!');

            try {
                const senderData = await prisma.user.findUnique({ where: { id: author.id } });
                if (!senderData || senderData.balance < amount) {
                    return message.reply(`❌ Ví ông không đủ tiền! (Hiện có: **${senderData?.balance || 0} VCASH**)`);
                }

                // Thực hiện chuyển tiền an toàn
                await prisma.$transaction([
                    prisma.user.update({ where: { id: author.id }, data: { balance: { decrement: amount } } }),
                    prisma.user.upsert({
                        where: { id: targetUser.id },
                        update: { balance: { increment: amount } },
                        create: { id: targetUser.id, balance: 1000 + amount, msgCount: 0 }
                    })
                ]);

                const embed = new EmbedBuilder()
                    .setTitle('✨ CHUYỂN TIỀN THÀNH CÔNG')
                    .setColor('#3498db')
                    .setDescription(`${author} đã gửi tiền cho ${targetUser}`)
                    .addFields({ name: '💰 Số tiền chuyển', value: `\`${amount.toLocaleString()} VCASH\`` })
                    .setTimestamp();

                return message.reply({ embeds: [embed] });
            } catch (err) {
                return message.reply('❌ Giao dịch thất bại!');
            }
        }
    }
};
