const { 
    SlashCommandBuilder, EmbedBuilder, ChannelType, 
    PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle 
} = require('discord.js');

// Map để lưu thời gian người dùng vào Voice (Xử lý In-Memory)
const voiceSession = new Map();

module.exports = {
    data: new SlashCommandBuilder()
        .setName('realestate')
        .setDescription('🏰 Hệ thống Bất động sản Voice Premium')
        .addSubcommand(sub => 
            sub.setName('buy')
                .setDescription('Mua đất & Xây Voice Nhà (Giá: 50k)')
                .addStringOption(opt => opt.setName('name').setDescription('Tên căn hộ').setRequired(true)))
        .addSubcommand(sub => 
            sub.setName('home')
                .setDescription('Xem thông tin căn hộ và số dư'))
        .addSubcommand(sub => 
            sub.setName('sell')
                .setDescription('Bán căn hộ hiện tại cho ngân hàng (70% giá trị)')),

    async execute(interaction, prisma) {
        const { options, user, guild, channel } = interaction;
        const sub = options.getSubcommand();

        // 1. KHỞI TẠO DATA NGƯỜI DÙNG
        let userData = await prisma.user.upsert({
            where: { id: user.id },
            update: {},
            create: { id: user.id, balance: 100000 } // Tặng 100k trải nghiệm
        });

        // --- SUBCOMMAND: BUY (MUA NHÀ & GACHA) ---
        if (sub === 'buy') {
            const price = 50000;
            if (userData.balance < price) return interaction.reply(`❌ Bạn thiếu **${(price - userData.balance).toLocaleString()}** Cash!`);

            await interaction.deferReply();

            // Tỉ lệ Gacha Độ hiếm
            const rand = Math.random() * 100;
            let rarity = { name: "Bình Dân", multi: 1.2, color: "#95a5a6", emoji: "🏠" };
            if (rand > 98) rarity = { name: "Huyền Thoại", multi: 8.0, color: "#ffac33", emoji: "🌌" };
            else if (rand > 85) rarity = { name: "Cực Hiếm", multi: 3.5, color: "#a633ff", emoji: "💎" };
            else if (rand > 65) rarity = { name: "Sang Trọng", multi: 2.0, color: "#3380ff", emoji: "🏙️" };

            const houseName = options.getString('name');

            try {
                // Tạo Voice Channel thật
                const voiceChannel = await guild.channels.create({
                    name: `${rarity.emoji} | ${houseName}`,
                    type: ChannelType.GuildVoice,
                    permissionOverwrites: [
                        { id: guild.id, deny: [PermissionFlagsBits.Connect] },
                        { id: user.id, allow: [PermissionFlagsBits.Connect, PermissionFlagsBits.Speak, PermissionFlagsBits.ManageChannels] },
                    ],
                });

                await prisma.$transaction([
                    prisma.user.update({ where: { id: user.id }, data: { balance: { decrement: price } } }),
                    prisma.house.create({
                        data: {
                            ownerId: user.id,
                            channelId: voiceChannel.id,
                            name: houseName,
                            rarity: rarity.name,
                            multiplier: rarity.multi,
                            currentValue: price
                        }
                    })
                ]);

                const buyEmbed = new EmbedBuilder()
                    .setTitle('🎊 TÂN GIA THỊNH VƯỢNG!')
                    .setColor(rarity.color)
                    .setThumbnail(user.displayAvatarURL())
                    .setDescription(`Bạn đã sở hữu bất động sản: **${houseName}**`)
                    .addFields(
                        { name: '🌟 Độ hiếm', value: `**${rarity.name}**`, inline: true },
                        { name: '📈 Hệ số', value: `\`x${rarity.multi}\``, inline: true },
                        { name: '📍 Địa chỉ', value: `<#${voiceChannel.id}>`, inline: false }
                    )
                    .setFooter({ text: 'Treo Voice tại đây để tăng giá trị nhà!' });

                return interaction.editReply({ embeds: [buyEmbed] });
            } catch (err) {
                return interaction.editReply("❌ Lỗi: Bot thiếu quyền `ManageChannels`.");
            }
        }

        // --- SUBCOMMAND: HOME (THÔNG TIN) ---
        if (sub === 'home') {
            const houses = await prisma.house.findMany({ where: { ownerId: user.id } });
            
            const homeEmbed = new EmbedBuilder()
                .setAuthor({ name: `Tài sản của ${user.username}`, iconURL: user.displayAvatarURL() })
                .setColor('#2ecc71')
                .addFields({ name: '💳 Số dư ví', value: `\`${userData.balance.toLocaleString()}\` Cash` });

            if (houses.length === 0) {
                homeEmbed.setDescription("Hiện bạn chưa có nhà. Hãy dùng `/realestate buy`.");
            } else {
                houses.forEach((h, i) => {
                    homeEmbed.addFields({
                        name: `${i + 1}. ${h.name} [${h.rarity}]`,
                        value: `💰 Giá trị: \`${h.currentValue.toLocaleString()}\` | 📈 Hệ số: \`x${h.multiplier}\` | 🎙️ <#${h.channelId}>`
                    });
                });
            }

            return interaction.reply({ embeds: [homeEmbed] });
        }

        // --- SUBCOMMAND: SELL (BÁN NHÀ) ---
        if (sub === 'sell') {
            const house = await prisma.house.findFirst({ where: { ownerId: user.id } });
            if (!house) return interaction.reply("❌ Bạn không có nhà để bán!");

            const refund = Math.floor(house.currentValue * 0.7);
            
            await prisma.$transaction([
                prisma.user.update({ where: { id: user.id }, data: { balance: { increment: refund } } }),
                prisma.house.delete({ where: { id: house.id } })
            ]);

            // Xóa channel trên Discord
            const chan = guild.channels.cache.get(house.channelId);
            if (chan) await chan.delete().catch(() => {});

            return interaction.reply(`✅ Đã bán nhà **${house.name}**, bạn nhận lại **${refund.toLocaleString()}** Cash (Thuế 30%).`);
        }
    },

    // --- LOGIC XỬ LÝ VOICE (GỘP CHUNG TRONG FILE) ---
    // Hàm này cần được gọi từ file index.js (event voiceStateUpdate)
    async handleVoice(oldState, newState, prisma) {
        const userId = newState.id;

        // Vào Voice: Lưu thời gian
        if (!oldState.channelId && newState.channelId) {
            voiceSession.set(userId, Date.now());
        }

        // Thoát Voice: Tính tiền & Tăng giá nhà
        if (oldState.channelId && !newState.channelId) {
            const joinTime = voiceSession.get(userId);
            if (!joinTime) return;

            const mins = Math.floor((Date.now() - joinTime) / 60000);
            voiceSession.delete(userId);
            if (mins < 1) return;

            const house = await prisma.house.findUnique({ where: { channelId: oldState.channelId } });
            if (!house) return;

            const baseRate = 20; // 20 Cash mỗi phút
            const totalEarned = Math.floor(mins * baseRate * house.multiplier);

            // 1. Cộng tiền cho người treo
            await prisma.user.update({
                where: { id: userId },
                data: { balance: { increment: totalEarned } }
            });

            // 2. Nếu chủ nhà treo trong nhà mình -> Tăng giá trị nhà (Bất động sản lên giá)
            if (house.ownerId === userId) {
                const appreciation = Math.floor(totalEarned * 0.4); // Giá trị nhà tăng 40% số tiền kiếm được
                await prisma.house.update({
                    where: { id: house.id },
                    data: { currentValue: { increment: appreciation } }
                });
            }
        }
    }
};
