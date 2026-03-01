const { 
    SlashCommandBuilder, EmbedBuilder, ChannelType, 
    PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder 
} = require('discord.js');

const voiceSession = new Map();

module.exports = {
    data: new SlashCommandBuilder()
        .setName('realestate')
        .setDescription('🏰 Hệ thống Chuỗi Bất động sản Voice')
        .addSubcommand(sub => 
            sub.setName('buy')
                .setDescription('Mua thêm nhà (Tối đa 10 căn - Giá: 50k)')
                .addStringOption(opt => opt.setName('name').setDescription('Tên căn hộ').setRequired(true)))
        .addSubcommand(sub => 
            sub.setName('info')
                .setDescription('Xem danh sách tất cả nhà bạn đang sở hữu'))
        .addSubcommand(sub => 
            sub.setName('upgrade')
                .setDescription('Nâng cấp một căn nhà cụ thể'))
        .addSubcommand(sub => 
            sub.setName('sell')
                .setDescription('Bán một căn nhà trong chuỗi sở hữu')),

    async execute(interaction, prisma) {
        const { options, user, guild } = interaction;
        const sub = options.getSubcommand();

        let userData = await prisma.user.upsert({
            where: { id: user.id },
            update: {},
            create: { id: user.id, balance: 100000 }
        });

        // Lấy danh sách nhà hiện tại
        const userHouses = await prisma.house.findMany({ where: { ownerId: user.id } });

        // --- MUA NHÀ (Giới hạn 10 căn) ---
        if (sub === 'buy') {
            if (userHouses.length >= 10) return interaction.reply("❌ Bạn đã đạt giới hạn tối đa **10 căn nhà**!");
            
            const price = 50000;
            if (userData.balance < price) return interaction.reply(`❌ Thiếu **${(price - userData.balance).toLocaleString()}** Cash!`);

            await interaction.deferReply();
            const rand = Math.random() * 100;
            let rarity = { name: "Bình Dân", multi: 1.2, color: "#95a5a6", emoji: "🏠" };
            if (rand > 98) rarity = { name: "Huyền Thoại", multi: 8.0, color: "#ffac33", emoji: "🌌" };
            else if (rand > 85) rarity = { name: "Cực Hiếm", multi: 3.5, color: "#a633ff", emoji: "💎" };

            try {
                const voiceChannel = await guild.channels.create({
                    name: `${rarity.emoji} | ${options.getString('name')}`,
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
                return interaction.editReply(`✅ Đã mua căn nhà thứ **${userHouses.length + 1}** thành công!`);
            } catch (err) { return interaction.editReply("❌ Lỗi quyền hạn Bot."); }
        }

        // --- THÔNG TIN CHUỖI NHÀ (INFO) ---
        if (sub === 'info') {
            const embed = new EmbedBuilder()
                .setTitle(`🏨 Chuỗi Bất động sản của ${user.username}`)
                .setColor('#2ecc71')
                .addFields({ name: '💳 Tổng tài sản ví', value: `\`${userData.balance.toLocaleString()}\` Cash` });

            if (userHouses.length === 0) embed.setDescription("Bạn chưa sở hữu căn nhà nào.");
            else {
                userHouses.forEach((h, i) => {
                    embed.addFields({
                        name: `${i + 1}. ${h.name} [Lv.${h.level}]`,
                        value: `💎 ${h.rarity} | 📈 x${h.multiplier.toFixed(1)} | 💰 ${h.currentValue.toLocaleString()} | 📍 <#${h.channelId}>`
                    });
                });
            }
            return interaction.reply({ embeds: [embed] });
        }

        // --- NÂNG CẤP & BÁN (Cần chọn nhà) ---
        if (sub === 'upgrade' || sub === 'sell') {
            if (userHouses.length === 0) return interaction.reply("❌ Bạn không có nhà để thực hiện thao tác này!");

            // Tạo Menu chọn nhà để nâng cấp/bán
            const selectMenu = new StringSelectMenuBuilder()
                .setCustomId('select_house')
                .setPlaceholder('Chọn căn nhà bạn muốn thao tác...')
                .addOptions(userHouses.map(h => ({
                    label: h.name,
                    description: `${h.rarity} - Trị giá: ${h.currentValue.toLocaleString()}`,
                    value: `${sub}_${h.id}`
                })));

            const row = new ActionRowBuilder().addComponents(selectMenu);
            const response = await interaction.reply({ content: `📍 Bạn muốn **${sub === 'upgrade' ? 'Nâng cấp' : 'Bán'}** căn nhà nào?`, components: [row] });

            const collector = response.createMessageComponentCollector({ filter: i => i.user.id === user.id, time: 20000 });
            
            collector.on('collect', async i => {
                const [action, houseId] = i.values[0].split('_');
                const targetHouse = userHouses.find(h => h.id === houseId);

                if (action === 'upgrade') {
                    const cost = Math.floor(targetHouse.currentValue * 0.4);
                    if (userData.balance < cost) return i.reply({ content: "❌ Không đủ tiền!", ephemeral: true });

                    await prisma.$transaction([
                        prisma.user.update({ where: { id: user.id }, data: { balance: { decrement: cost } } }),
                        prisma.house.update({ where: { id: houseId }, data: { level: { increment: 1 }, multiplier: { increment: 0.5 }, currentValue: { increment: cost } } })
                    ]);
                    await i.update({ content: `✅ Đã nâng cấp **${targetHouse.name}**!`, components: [] });
                } else {
                    const refund = Math.floor(targetHouse.currentValue * 0.7);
                    await prisma.$transaction([
                        prisma.user.update({ where: { id: user.id }, data: { balance: { increment: refund } } }),
                        prisma.house.delete({ where: { id: houseId } })
                    ]);
                    const chan = guild.channels.cache.get(targetHouse.channelId);
                    if (chan) await chan.delete().catch(() => {});
                    await i.update({ content: `💰 Đã bán **${targetHouse.name}**, nhận lại **${refund.toLocaleString()}**!`, components: [] });
                }
            });
        }
    },

    // --- XỬ LÝ VOICE (Hàm handleVoice giữ nguyên logic cũ) ---
    async handleVoice(oldState, newState, prisma) {
        // ... (Logic cộng tiền dựa trên channelId của căn nhà bất kỳ trong DB) ...
        const uid = newState.id;
        if (!oldState.channelId && newState.channelId) voiceSession.set(uid, Date.now());
        if (oldState.channelId && !newState.channelId) {
            const start = voiceSession.get(uid);
            if (!start) return;
            const mins = Math.floor((Date.now() - start) / 60000);
            voiceSession.delete(uid);
            const house = await prisma.house.findUnique({ where: { channelId: oldState.channelId } });
            if (house && mins >= 1) {
                const earn = Math.floor(mins * 25 * house.multiplier);
                await prisma.user.update({ where: { id: uid }, data: { balance: { increment: earn } } });
                if (house.ownerId === uid) {
                    await prisma.house.update({ where: { id: house.id }, data: { currentValue: { increment: Math.floor(earn * 0.3) } } });
                }
            }
        }
    }
};
