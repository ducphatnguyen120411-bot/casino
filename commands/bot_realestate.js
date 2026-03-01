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
                .addStringOption(opt => opt.setName('name').setDescription('Đặt tên cho căn hộ của bạn').setRequired(true).setMaxLength(30)))
        .addSubcommand(sub => sub.setName('info').setDescription('📋 Xem danh mục đầu tư'))
        .addSubcommand(sub => sub.setName('upgrade').setDescription('🛠️ Nâng cấp cơ sở hạ tầng'))
        .addSubcommand(sub => sub.setName('sell').setDescription('💰 Thanh lý bất động sản (70% giá trị)')),

    async execute(interaction, prisma) {
        const { options, user, guild } = interaction;
        const sub = options.getSubcommand();

        try {
            // 1. Kiểm tra/Tạo User
            let userData = await prisma.user.upsert({
                where: { id: user.id },
                update: {},
                create: { id: user.id, balance: 100000, msgCount: 0 }
            });

            const userHouses = await prisma.house.findMany({ where: { ownerId: user.id } });

            // --- LỆNH MUA (BUY) ---
            if (sub === 'buy') {
                if (userHouses.length >= 10) return interaction.reply({ content: "⚠️ Bạn đã đạt giới hạn 10 bất động sản!", ephemeral: true });
                
                const price = 50000;
                if (userData.balance < price) return interaction.reply({ content: `❌ Thiếu \`${(price - userData.balance).toLocaleString()}\` Cash.`, ephemeral: true });

                await interaction.deferReply();
                
                try {
                    const rand = Math.random() * 100;
                    let rarity = { name: "Thường", multi: 1.2, color: 0x95a5a6, emoji: "🏠" };
                    if (rand > 99) rarity = { name: "Huyền Thoại", multi: 10.0, color: 0xffac33, emoji: "🌌" };
                    else if (rand > 90) rarity = { name: "Cực Hiếm", multi: 4.5, color: 0xa633ff, emoji: "💎" };
                    else if (rand > 70) rarity = { name: "Cao Cấp", multi: 2.5, color: 0x3498db, emoji: "🏢" };

                    const voiceChannel = await guild.channels.create({
                        name: `${rarity.emoji}┃${options.getString('name')}`,
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
                                ownerId: user.id, channelId: voiceChannel.id, name: options.getString('name'),
                                rarity: rarity.name, multiplier: rarity.multi, currentValue: price, level: 1
                            }
                        })
                    ]);

                    const embed = new EmbedBuilder()
                        .setTitle("🎉 ĐẦU TƯ THÀNH CÔNG")
                        .setColor(rarity.color)
                        .setDescription(`Chúc mừng bạn đã sở hữu bất động sản mới!`)
                        .addFields(
                            { name: "🏠 Tên", value: `**${options.getString('name')}**`, inline: true },
                            { name: "💎 Cấp bậc", value: `**${rarity.name}**`, inline: true },
                            { name: "📈 Thu nhập", value: `**x${rarity.multi}**`, inline: true },
                            { name: "📍 Vị trí", value: `<#${voiceChannel.id}>`, inline: false }
                        )
                        .setFooter({ text: "Sử dụng /realestate info để xem danh sách" });

                    return interaction.editReply({ embeds: [embed] });
                } catch (err) {
                    console.error("Lỗi tạo channel:", err);
                    return interaction.editReply({ content: "❌ Không thể tạo kênh Voice!" });
                }
            }

            // --- LỆNH INFO ---
            if (sub === 'info') {
                const embed = new EmbedBuilder()
                    .setAuthor({ name: `Danh mục BĐS: ${user.username}`, iconURL: user.displayAvatarURL() })
                    .setColor(0x2ecc71)
                    .setThumbnail(user.displayAvatarURL())
                    .setDescription(`💳 **Tài khoản:** \`${userData.balance.toLocaleString()}\` Cash\n🏰 **Tổng số căn:** \`${userHouses.length}/10\``);

                if (userHouses.length === 0) {
                    embed.addFields({ name: "Trạng thái", value: "Chưa có tài sản nào. Hãy dùng `/realestate buy`" });
                } else {
                    userHouses.forEach((h, i) => {
                        embed.addFields({ 
                            name: `🏠 ${i+1}. ${h.name} (Lv.${h.level})`, 
                            value: `> 💎 **${h.rarity}** | 📈 **x${h.multiplier.toFixed(1)}**\n> 💰 Trị giá: \`${h.currentValue.toLocaleString()}\` | <#${h.channelId}>` 
                        });
                    });
                }
                return interaction.reply({ embeds: [embed] });
            }

            // --- LỆNH UPGRADE / SELL ---
            if (sub === 'upgrade' || sub === 'sell') {
                if (userHouses.length === 0) return interaction.reply({ content: "❌ Bạn không có tài sản nào!", ephemeral: true });

                const selectMenu = new StringSelectMenuBuilder()
                    .setCustomId('re_select')
                    .setPlaceholder('Chọn tài sản...')
                    .addOptions(userHouses.map(h => ({
                        label: `[Lv.${h.level}] ${h.name}`,
                        description: `Multi: x${h.multiplier} - Trị giá: ${h.currentValue.toLocaleString()}`,
                        value: `${sub}_${h.id}`
                    })));

                const row = new ActionRowBuilder().addComponents(selectMenu);
                const response = await interaction.reply({ content: `### 🛠️ Quản lý BĐS\nChọn tài sản để **${sub}**:`, components: [row] });

                const collector = response.createMessageComponentCollector({ 
                    filter: i => i.user.id === user.id, 
                    time: 15000 
                });

                collector.on('collect', async i => {
                    const [action, houseId] = i.values[0].split('_');
                    const targetHouse = await prisma.house.findUnique({ where: { id: houseId } });
                    
                    if (!targetHouse) return i.update({ content: "❌ Không tìm thấy tài sản trong DB!", components: [] });

                    if (action === 'upgrade') {
                        const cost = Math.floor(targetHouse.currentValue * 0.5);
                        if (userData.balance < cost) return i.reply({ content: `❌ Thiếu \`${(cost - userData.balance).toLocaleString()}\` Cash.`, ephemeral: true });

                        await prisma.$transaction([
                            prisma.user.update({ where: { id: user.id }, data: { balance: { decrement: cost } } }),
                            prisma.house.update({ 
                                where: { id: houseId }, 
                                data: { level: { increment: 1 }, multiplier: { increment: 0.5 }, currentValue: { increment: cost } } 
                            })
                        ]);
                        await i.update({ content: `✅ Nâng cấp thành công **${targetHouse.name}**!`, components: [] });
                    } else if (action === 'sell') {
                        const refund = Math.floor(targetHouse.currentValue * 0.7);
                        await prisma.$transaction([
                            prisma.user.update({ where: { id: user.id }, data: { balance: { increment: refund } } }),
                            prisma.house.delete({ where: { id: houseId } })
                        ]);

                        const chan = guild.channels.cache.get(targetHouse.channelId);
                        if (chan && chan.deletable) {
                            await chan.delete().catch(err => console.error("Lỗi xóa voice:", err));
                        }
                        
                        await i.update({ content: `💰 Đã thanh lý **${targetHouse.name}**, nhận lại \`${refund.toLocaleString()}\` Cash.`, components: [] });
                    }
                });

                collector.on('end', async (collected, reason) => {
                    if (reason === 'time' && collected.size === 0) {
                        await interaction.editReply({ content: "⚠️ Hết thời gian thao tác!", components: [] }).catch(() => {});
                    }
                });
            }

        } catch (error) {
            console.error("Lỗi Real Estate:", error);
            if (!interaction.replied) await interaction.reply({ content: "❌ Lỗi hệ thống!", ephemeral: true });
        }
    },

    // Hàm handleVoice nằm riêng bên ngoài execute
    async handleVoice(oldState, newState, prisma) {
        try {
            const uid = newState.id;
            if (!oldState.channelId && newState.channelId) voiceSession.set(uid, Date.now());

            if (oldState.channelId && !newState.channelId) {
                const start = voiceSession.get(uid);
                if (!start) return;

                const mins = Math.floor((Date.now() - start) / 60000);
                voiceSession.delete(uid);
                if (mins < 1) return;

                const house = await prisma.house.findUnique({ where: { channelId: oldState.channelId } });
                if (house) {
                    const earn = Math.floor(mins * 50 * house.multiplier);
                    await prisma.user.update({ where: { id: uid }, data: { balance: { increment: earn } } });

                    if (house.ownerId === uid) {
                        await prisma.house.update({ 
                            where: { id: house.id }, 
                            data: { currentValue: { increment: Math.floor(earn * 0.2) } } 
                        });
                    }
                }
            }
        } catch (e) { console.error("Lỗi Voice BĐS:", e); }
    }
};
