const { 
    SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, 
    ButtonBuilder, ButtonStyle, ComponentType 
} = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('taixiu')
        .setDescription('💎 Sòng bài Thượng lưu Verdict - Thử vận may của bạn')
        .addIntegerOption(opt => 
            opt.setName('money')
                .setDescription('Số tiền đặt cược (Tối thiểu 100)')
                .setRequired(true)
                .setMinValue(100)),

    // FIX: Truyền đúng prisma từ index.js vào
    async execute(interaction, prisma) {
        const amount = interaction.options.getInteger('money');
        const user = interaction.user;

        try {
            // 1. Kiểm tra ví
            let userData = await prisma.user.upsert({
                where: { id: user.id },
                update: {},
                create: { id: user.id, balance: 50000 } 
            });

            if (userData.balance < amount) {
                return interaction.reply({ 
                    content: `❌ **Rất tiếc!** Bạn thiếu \`${(amount - userData.balance).toLocaleString()}\` Cash để theo ván này.`, 
                    ephemeral: true 
                });
            }

            // 2. Giao diện sảnh chờ Luxury
            const lobbyEmbed = new EmbedBuilder()
                .setAuthor({ name: 'VERDICT SUPREME CASINO', iconURL: 'https://i.imgur.com/8E89vXp.png' })
                .setTitle('🎰 VÁN CƯỢC MỚI ĐANG MỞ')
                .setColor(0xD4AF37)
                .setThumbnail(user.displayAvatarURL())
                .setDescription(
                    `👋 Chào mừng quý khách **${user.username}**,\n` +
                    `Mức cược: **\`${amount.toLocaleString()}\`** Cash.\n\n` +
                    `┎──────────────────┒\n` +
                    `┃   **CHỌN CỬA ĐẶT CỦA BẠN** ┃\n` +
                    `┖──────────────────┚`
                )
                .addFields(
                    { name: '🔴 TÀI', value: '`11 - 18 điểm`', inline: true },
                    { name: '🔵 XỈU', value: '`3 - 10 điểm`', inline: true }
                )
                .setFooter({ text: '⏳ Bạn có 15 giây để quyết định!' });

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('tx_tai').setLabel('ĐẶT TÀI').setEmoji('🔴').setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId('tx_xiu').setLabel('ĐẶT XỈU').setEmoji('🔵').setStyle(ButtonStyle.Secondary)
            );

            const response = await interaction.reply({ embeds: [lobbyEmbed], components: [row], fetchReply: true });

            const collector = response.createMessageComponentCollector({
                filter: i => i.user.id === user.id,
                componentType: ComponentType.Button,
                time: 15000,
                max: 1
            });

            collector.on('collect', async i => {
                await i.deferUpdate();
                const userChoice = i.customId === 'tx_tai' ? '🔴 TÀI' : '🔵 XỈU';
                
                // --- HIỆU ỨNG LẮC BÁT KỊCH TÍNH (Khôi phục) ---
                const loadingFrames = [
                    '┠─⚪────────┨', '┠──⚪───────┨', '┠───⚪──────┨', '┠────⚪─────┨',
                    '┠─────⚪────┨', '┠──────⚪───┨', '┠───────⚪──┨', '┠────────⚪─┨'
                ];
                let frame = 0;

                const shakingInterval = setInterval(() => {
                    interaction.editReply({ 
                        content: `🎰 **ĐANG LẮC BÁT...**\n\`${loadingFrames[frame % loadingFrames.length]}\``, 
                        embeds: [], components: [] 
                    }).catch(() => clearInterval(shakingInterval));
                    frame++;
                }, 400);

                // --- XỬ LÝ KẾT QUẢ ---
                setTimeout(async () => {
                    clearInterval(shakingInterval);

                    const d = Array.from({ length: 3 }, () => Math.floor(Math.random() * 6) + 1);
                    const total = d.reduce((a, b) => a + b, 0);
                    const isTai = total >= 11;
                    const winSide = isTai ? 'tx_tai' : 'tx_xiu';
                    const isWin = i.customId === winSide;
                    const change = isWin ? amount : -amount;

                    const updatedUser = await prisma.user.update({
                        where: { id: user.id },
                        data: { balance: { increment: change } }
                    });

                    const diceIcons = { 1: '⚀', 2: '⚁', 3: '⚂', 4: '⚃', 5: '⚄', 6: '⚅' };
                    const diceString = d.map(v => diceIcons[v]).join(' ');
                    
                    const resultEmbed = new EmbedBuilder()
                        .setAuthor({ name: isWin ? '⚜️ CHIẾN THẮNG TUYỆT ĐỐI' : '💸 HẸN GẶP LẠI LẦN SAU' })
                        .setColor(isWin ? 0x2ecc71 : 0xe74c3c)
                        .setTitle(`${diceString} ➜ ${total} (${isTai ? '🔴 TÀI' : '🔵 XỈU'})`)
                        .setDescription(
                            `### ${isWin ? '🎊 Chúc mừng Quý khách!' : '📉 May mắn chưa mỉm cười...'}\n` +
                            `┃ **Cửa chọn:** \`${userChoice}\`\n` +
                            `┃ **Kết quả:** \`${isTai ? 'TÀI' : 'XỈU'}\`\n` +
                            `┃ **Biến động:** \`${isWin ? '+' : '-'}${amount.toLocaleString()}\` Cash\n` +
                            `┃ **Số dư mới:** \`${updatedUser.balance.toLocaleString()}\` Cash`
                        )
                        .setThumbnail(isWin ? 'https://i.imgur.com/u5tXJgX.png' : 'https://i.imgur.com/7S8Y8fS.png')
                        .setTimestamp();

                    await interaction.editReply({ 
                        content: isWin ? `🏆 **${user.username}** vừa thắng lớn!` : `🍿 Chia buồn cùng **${user.username}**!`, 
                        embeds: [resultEmbed] 
                    });

                }, 4000); 
            });

            collector.on('end', (collected, reason) => {
                if (reason === 'time' && collected.size === 0) {
                    interaction.editReply({ content: '⏰ Hết thời gian đặt cược!', embeds: [], components: [] }).catch(() => {});
                }
            });

        } catch (err) {
            console.error(err);
            if (!interaction.replied) interaction.reply({ content: '❌ Casino đang bảo trì!', ephemeral: true });
        }
    }
};
