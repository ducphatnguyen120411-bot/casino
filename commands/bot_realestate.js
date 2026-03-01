const { 
    SlashCommandBuilder, EmbedBuilder, ChannelType, 
    PermissionFlagsBits, ActionRowBuilder, StringSelectMenuBuilder 
} = require('discord.js');

const voiceSession = new Map();

module.exports = {
    data: new SlashCommandBuilder()
        .setName('realestate')
        .setDescription('🏰 Hệ thống Chuỗi Bất động sản Voice Premium')
        .addSubcommand(sub => 
            sub.setName('buy')
                .setDescription('🏢 Đầu tư bất động sản mới (Giá: 50,000 Cash)')
                .addStringOption(opt => opt.setName('name').setDescription('Đặt tên cho căn hộ của bạn').setRequired(true)))
        .addSubcommand(sub => 
            sub.setName('info')
                .setDescription('📋 Xem danh mục đầu tư và số dư ví'))
        .addSubcommand(sub => 
            sub.setName('upgrade')
                .setDescription('🛠️ Nâng cấp cơ sở hạ tầng (Tăng hệ số thu nhập)'))
        .addSubcommand(sub => 
            sub.setName('sell')
                .setDescription('💰 Thanh lý bất động sản (Nhận lại 70% giá trị)')),

    async execute(interaction, prisma) {
        const { options, user, guild } = interaction;
        const sub = options.getSubcommand();

        // 1. Khởi tạo/Lấy dữ liệu người dùng
        let userData = await prisma.user.upsert({
            where: { id: user.id },
            update: {},
            create: { id: user.id, balance: 100000 }
        });

        const userHouses = await prisma.house.findMany({ where: { ownerId: user.id } });

        // --- SUBCOMMAND: BUY ---
        if (sub === 'buy') {
            if (userHouses.length >= 10) return interaction.reply({ content: "⚠️ **Giới hạn sở hữu:** Bạn chỉ có thể quản lý tối đa 10 căn nhà.", ephemeral: true });
            
            const price = 50000;
            if (userData.balance < price) return interaction.reply({ content: `❌ **Tài chính không đủ:** Bạn còn thiếu \`${(price - userData.balance).toLocaleString()}\` Cash.`, ephemeral: true });

            await interaction.deferReply();
            
            // Random độ hiếm với tỷ lệ chuyên nghiệp
            const rand = Math.random() * 100;
            let rarity = { name: "Thường", multi: 1.2, color: 0x95a5a6, emoji: "🏠" };
            if (rand > 99) rarity = { name: "Huyền Thoại", multi: 10.0, color: 0xffac33, emoji: "🌌" };
            else if (rand > 90) rarity = { name: "Cực Hiếm", multi: 4.5, color: 0xa633ff, emoji: "💎" };
            else if (rand > 70) rarity = { name: "Cao Cấp", multi: 2.5, color: 0x3498db, emoji: "🏢" };

            try {
                const voiceChannel = await guild.channels.create({
                    name: `${rarity.emoji}┃${options.getString('name')}`,
                    type: ChannelType.GuildVoice,
                    permissionOverwrites: [
                        { id: guild.id, deny: [PermissionFlagsBits.Connect], allow: [PermissionFlagsBits.ViewChannel] },
                        { id: user.id, allow: [PermissionFlagsBits.Connect, PermissionFlagsBits.Speak, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.MuteMembers] },
                    ],
                });

                await prisma.$transaction([
                    prisma.user.update({ where: { id: user.id }, data: { balance: { decrement: price } } }),
                    prisma.house.create({
                        data: {
                            ownerId: user.id, channelId: voiceChannel.id, name: options.getString('name'),
                            rarity: rarity.name, multiplier: rarity.multi, currentValue: price, level: 1
                        }
                    })
                ]);

                const successEmbed = new EmbedBuilder()
                    .setTitle("🎉 Giao dịch thành công!")
                    .setDescription(`Bạn đã sở hữu bất động sản mới: **${options.getString('name')}**`)
                    .setColor(rarity.color)
                    .addFields(
                        { name: "💎 Độ hiếm", value: rarity.name, inline: true },
                        { name: "📈 Hệ số", value: `x${rarity.multi}`, inline: true },
                        { name: "📍 Vị trí", value: `<#${voiceChannel.id}>`, inline: true }
                    )
                    .setTimestamp();

                return interaction.editReply({ embeds: [successEmbed] });
            } catch (err) { 
                console.error(err);
                return interaction.editReply("❌ **Lỗi:** Bot thiếu quyền `ManageChannels` hoặc `Administrator`."); 
            }
        }

        // --- SUBCOMMAND: INFO ---
        if (sub === 'info') {
            const embed = new EmbedBuilder()
                .setAuthor({ name: `Danh mục đầu tư: ${user.username}`, iconURL: user.displayAvatarURL() })
                .setColor(0x2ecc71)
                .setDescription(`💰 **Số dư ví:** \`${userData.balance.toLocaleString()}\` Cash\n🏢 **Tổng số nhà:** ${userHouses.length}/10`)
                .setThumbnail(user.displayAvatarURL());

            if (userHouses.length === 0) {
                embed.addFields({ name: "Trạng thái", value: "Bạn chưa có tài sản nào. Hãy dùng `/realestate buy` để bắt đầu." });
            } else {
                userHouses.forEach((h, i) => {
                    embed.addFields({
                        name: `🏠 ${i + 1}. ${h.name} (Lv.${h.level})`,
                        value: `> **Độ hiếm:** ${h.rarity}\n> **Thu nhập:** x${h.multiplier.toFixed(1)}\n> **Trị giá:** \`${h.currentValue.toLocaleString()}\` Cash\n> **Vị trí:** <#${h.channelId}>`,
                        inline: false
                    });
                });
            }
            return interaction.reply({ embeds: [embed] });
        }

        // --- SUBCOMMAND: UPGRADE / SELL (UI Tương tác) ---
        if (sub === 'upgrade' || sub === 'sell') {
            if (userHouses.length === 0) return interaction.reply({ content: "❌ Bạn không sở hữu bất động sản nào để thực hiện.", ephemeral: true });

            const selectMenu = new StringSelectMenuBuilder()
                .setCustomId('re_select')
                .setPlaceholder('Chọn căn nhà muốn thao tác...')
                .addOptions(userHouses.map(h => ({
                    label: `[Lv.${h.level}] ${h.name}`,
                    description: `Giá trị: ${h.currentValue.toLocaleString()} - Multi: x${h.multiplier}`,
                    value: `${sub}_${h.id}`
                })));

            const row = new ActionRowBuilder().addComponents(selectMenu);
            const response = await interaction.reply({ 
                content: `### 🛠️ Quản lý Bất động sản\nChọn một tài sản bên dưới để **${sub === 'upgrade' ? 'Nâng cấp' : 'Thanh lý'}**.`, 
                components: [row] 
            });

            const collector = response.createMessageComponentCollector({ filter: i => i.user.id === user.id, time: 30000 });

            collector.on('collect', async i => {
                const [action, houseId] = i.values[0].split('_');
                const targetHouse = await prisma.house.findUnique({ where: { id: houseId } });
                if (!targetHouse) return i.update({ content: "❌ Tài sản này không còn tồn tại.", components: [] });

                if (action === 'upgrade') {
                    const upgradeCost = Math.floor(targetHouse.currentValue * 0.5);
                    if (userData.balance < upgradeCost) return i.reply({ content: `❌ Cần \`${upgradeCost.toLocaleString()}\` để nâng cấp. Bạn còn thiếu \`${(upgradeCost - userData.balance).toLocaleString()}\`.`, ephemeral: true });

                    await prisma.$transaction([
                        prisma.user.update({ where: { id: user.id }, data: { balance: { decrement: upgradeCost } } }),
                        prisma.house.update({ 
                            where: { id: houseId }, 
                            data: { 
                                level: { increment: 1 }, 
                                multiplier: { increment: 0.8 }, 
                                currentValue: { increment: upgradeCost } 
                            } 
                        })
                    ]);
                    await i.update({ content: `✅ **Nâng cấp thành công!**\n**${targetHouse.name}** đã đạt **Level ${targetHouse.level + 1}**. Thu nhập đã tăng lên!`, components: [] });
                } else {
                    const refund = Math.floor(targetHouse.currentValue * 0.7);
                    await prisma.$transaction([
                        prisma.user.update({ where: { id: user.id }, data: { balance: { increment: refund } } }),
                        prisma.house.delete({ where: { id: houseId } })
                    ]);
                    const chan = guild.channels.cache.get(targetHouse.channelId);
                    if (chan) await chan.delete().catch(() => {});
                    await i.update({ content: `💰 **Đã bán thanh lý!**\nBạn nhận lại \`${refund.toLocaleString()}\` Cash từ **${targetHouse.name}**.`, components: [] });
                }
            });
        }
    },

    // --- VOICE HANDLER (Cải tiến cơ chế cộng tiền) ---
    async handleVoice(oldState, newState, prisma) {
        const uid = newState.id;
        
        // Khi tham gia
        if (!oldState.channelId && newState.channelId) {
            voiceSession.set(uid, Date.now());
        }
        
        // Khi rời đi
        if (oldState.channelId && !newState.channelId) {
            const start = voiceSession.get(uid);
            if (!start) return;

            const durationMs = Date.now() - start;
            const mins = Math.floor(durationMs / 60000);
            voiceSession.delete(uid);

            if (mins < 1) return;

            const house = await prisma.house.findUnique({ where: { channelId: oldState.channelId } });
            if (house) {
                const baseRate = 50; // Tăng lương cơ bản
                const earn = Math.floor(mins * baseRate * house.multiplier);
                
                // Cộng tiền cho người treo
                await prisma.user.update({ where: { id: uid }, data: { balance: { increment: earn } } });

                // Nếu là chủ nhà đang treo ở nhà mình: Tăng giá trị BĐS (Lãi kép)
                if (house.ownerId === uid) {
                    await prisma.house.update({ 
                        where: { id: house.id }, 
                        data: { currentValue: { increment: Math.floor(earn * 0.2) } } 
                    });
                }
            }
        }
    }
};
