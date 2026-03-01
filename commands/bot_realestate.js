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
                    return interaction.editReply({ content: "❌ Không thể tạo kênh Voice. Vui lòng kiểm tra quyền của Bot hoặc giới hạn Channel của Server!" });
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
                        // --- FIX A: KIỂM TRA QUYỀN XÓA CHANNEL ---
                        const refund = Math.floor(targetHouse.currentValue * 0.7);
                        await prisma.$transaction([
                            prisma.user.update({ where: { id: user.id }, data: { balance: { increment: refund } } }),
                            prisma.house.delete({ where: { id: houseId } })
                        ]);

                        const chan = guild.channels.cache.get(targetHouse.channelId);
                        // Chỉ xóa nếu channel tồn tại và bot có quyền xóa (deletable)
                        if (chan && chan.deletable) {
                            await chan.delete().catch(err => console.error("Lỗi xóa voice:", err));
                        }
                        
                        await i.update({ content: `💰 Đã thanh lý **${targetHouse.name}**, nhận lại \`${refund.toLocaleString()}\` Cash.`, components: [] });
                    }
                });

                // --- FIX B: DỌN DẸP COMPONENT KHI HẾT HẠN ---
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
    }
};
