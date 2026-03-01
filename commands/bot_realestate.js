const { 
    SlashCommandBuilder, 
    EmbedBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle,
    PermissionFlagsBits 
} = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('realestate')
        .setDescription('Hệ thống Quản lý Bất động sản Voice')
        // Subcommand: Xem thông tin
        .addSubcommand(sub =>
            sub.setName('info')
               .setDescription('Xem tình trạng bất động sản và thu nhập hiện tại'))
        // Subcommand: Nâng cấp
        .addSubcommand(sub =>
            sub.setName('upgrade')
               .setDescription('Đầu tư thêm để nâng cấp khu đất (Tăng thu nhập)'))
        // Subcommand: Tặng tiền (Gift)
        .addSubcommand(sub =>
            sub.setName('gift')
               .setDescription('Chuyển Cash cho người chơi khác')
               .addUserOption(opt => opt.setName('target').setDescription('Người nhận').setRequired(true))
               .addIntegerOption(opt => opt.setName('amount').setDescription('Số lượng Cash').setRequired(true).setMinValue(1))),

    async execute(interaction, prisma) {
        const { options, user, guild } = interaction;
        const sub = options.getSubcommand();

        // 🛠️ HÀM HỖ TRỢ (HELPER FUNCTIONS)
        const getLandInfo = (lvl) => {
            const titles = [
                { min: 50, name: "🌌 Tinh Cầu Đế Chế", color: 0xff00ff },
                { min: 40, name: "🏰 Lâu Đài Phù Thủy", color: 0x9b59b6 },
                { min: 30, name: "🏙️ Tập Đoàn Tài Phiệt", color: 0x3498db },
                { min: 20, name: "🏢 Tòa Nhà Chọc Trời", color: 0x2ecc71 },
                { min: 10, name: "🏘️ Biệt Thự Sân Vườn", color: 0xf1c40f },
                { min: 5,  name: "🏠 Nhà Phố Hiện Đại", color: 0xe67e22 },
                { min: 0,  name: "⛺ Lều Cỏ Ven Đường", color: 0x95a5a6 }
            ];
            return titles.find(t => lvl >= t.min);
        };

        const drawBar = (lvl) => {
            const progress = (lvl % 10);
            const bar = "▰".repeat(progress) + "▱".repeat(10 - progress);
            return `\`[${bar}]\``;
        };

        // 🏦 LẤY DỮ LIỆU NGƯỜI DÙNG
        let userData = await prisma.user.upsert({
            where: { id: user.id },
            update: {},
            create: { id: user.id, balance: 1000, level: 1 }
        });

        const land = getLandInfo(userData.level);

        // --- 1. LỆNH INFO ---
        if (sub === 'info') {
            const nextCost = userData.level * 3500;
            const income = userData.level * 10;

            const infoEmbed = new EmbedBuilder()
                .setTitle(`${land.name}`)
                .setAuthor({ name: `Chủ sở hữu: ${user.username}`, iconURL: user.displayAvatarURL() })
                .setColor(land.color)
                .setThumbnail('https://cdn-icons-png.flaticon.com/512/602/602190.png')
                .addFields(
                    { name: '📊 Cấp độ khu đất', value: `Level **${userData.level}**`, inline: true },
                    { name: '💵 Thu nhập/phút', value: `\`${income}\` Cash`, inline: true },
                    { name: '🛠️ Tiến độ nâng cấp', value: `${drawBar(userData.level)}` },
                    { name: '💎 Phí nâng cấp tiếp theo', value: `**${nextCost.toLocaleString()}** Cash`, inline: false }
                )
                .setFooter({ text: 'Treo Voice để kiếm thêm tiền đầu tư!' })
                .setTimestamp();

            return interaction.reply({ embeds: [infoEmbed] });
        }

        // --- 2. LỆNH UPGRADE ---
        if (sub === 'upgrade') {
            const cost = userData.level * 3500;

            if (userData.balance < cost) {
                return interaction.reply({
                    content: `❌ **Giao dịch thất bại!** Bạn cần thêm \`${(cost - userData.balance).toLocaleString()}\` Cash để nâng cấp lên Level ${userData.level + 1}.`,
                    ephemeral: true
                });
            }

            // Dùng Transaction để đảm bảo an toàn dữ liệu
            const updated = await prisma.$transaction([
                prisma.user.update({
                    where: { id: user.id },
                    data: { balance: { decrement: cost }, level: { increment: 1 } }
                })
            ]);

            const newLand = getLandInfo(updated[0].level);
            
            const upEmbed = new EmbedBuilder()
                .setTitle('🏗️ Thi Công Hoàn Tất!')
                .setColor(0x2ecc71)
                .setDescription(`Chúc mừng! Khu đất của bạn đã đạt **Level ${updated[0].level}**.`)
                .addFields(
                    { name: '📍 Địa điểm mới', value: `${newLand.name}` },
                    { name: '📈 Thu nhập mới', value: `\`${updated[0].level * 10}\` Cash/phút`, inline: true },
                    { name: '📉 Tài khoản', value: `\`-${cost.toLocaleString()}\` Cash`, inline: true }
                )
                .setFooter({ text: 'Bất động sản của bạn đang tăng giá!' });

            return interaction.reply({ embeds: [upEmbed] });
        }

        // --- 3. LỆNH GIFT (CHUYỂN TIỀN) ---
        if (sub === 'gift') {
            const target = options.getUser('target');
            const amount = options.getInteger('amount');

            // Kiểm tra điều kiện
            if (target.id === user.id) return interaction.reply({ content: "Bạn không thể tự tặng tiền cho chính mình!", ephemeral: true });
            if (target.bot) return interaction.reply({ content: "Bot không có tài khoản ngân hàng đâu!", ephemeral: true });
            if (userData.balance < amount) return interaction.reply({ content: "Số dư của bạn không đủ để thực hiện giao dịch này!", ephemeral: true });

            // Xác nhận chuyển tiền qua Button
            const row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder().setCustomId('confirm_gift').setLabel('Xác nhận gửi').setStyle(ButtonStyle.Success),
                    new ButtonBuilder().setCustomId('cancel_gift').setLabel('Hủy bỏ').setStyle(ButtonStyle.Danger)
                );

            const confirmMsg = await interaction.reply({
                content: `🔔 Bạn có chắc muốn chuyển **${amount.toLocaleString()} Cash** cho **${target.username}** không?`,
                components: [row],
                fetchReply: true
            });

            const filter = i => i.user.id === user.id;
            const collector = confirmMsg.createMessageComponentCollector({ filter, time: 15000 });

            collector.on('collect', async i => {
                if (i.customId === 'confirm_gift') {
                    // Thực hiện chuyển tiền trong DB
                    try {
                        await prisma.$transaction([
                            prisma.user.update({ where: { id: user.id }, data: { balance: { decrement: amount } } }),
                            prisma.user.upsert({
                                where: { id: target.id },
                                update: { balance: { increment: amount } },
                                create: { id: target.id, balance: amount, level: 1 }
                            })
                        ]);

                        await i.update({ content: `✅ Đã chuyển thành công **${amount.toLocaleString()} Cash** cho ${target}.`, components: [] });
                    } catch (err) {
                        await i.update({ content: "❌ Đã xảy ra lỗi khi thực hiện giao dịch.", components: [] });
                    }
                } else {
                    await i.update({ content: "❌ Giao dịch đã bị hủy.", components: [] });
                }
            });

            collector.on('end', collected => {
                if (collected.size === 0) interaction.editReply({ content: "⏰ Đã hết thời gian xác nhận.", components: [] });
            });
        }
    }
};
