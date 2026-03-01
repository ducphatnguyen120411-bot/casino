const { 
    SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, 
    ButtonBuilder, ButtonStyle, ComponentType 
} = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('taixiu') // Tên lệnh duy nhất
        .setDescription('🎲 Trò chơi Tài Xỉu cược bằng nút bấm')
        .addIntegerOption(opt => 
            opt.setName('money')
                .setDescription('Số tiền đặt cược')
                .setRequired(true)
                .setMinValue(100)),

    async execute(interaction, prisma) {
        const amount = interaction.options.getInteger('money');
        const user = interaction.user;

        // 1. Kiểm tra tiền trong Database
        const userData = await prisma.user.findUnique({ where: { id: user.id } });
        if (!userData || userData.balance < amount) {
            return interaction.reply({ content: '❌ Bạn không đủ tiền để "khô máu"!', ephemeral: true });
        }

        // 2. Tạo giao diện đặt cược
        const embed = new EmbedBuilder()
            .setTitle('🎲 SÒNG BẠC MAY RỦI')
            .setColor(0xf1c40f)
            .setDescription(`Người chơi: **${user.username}**\nMức cược: **${amount.toLocaleString()}** Cash\n\n*Hãy chọn cửa bạn tin tưởng:*`)
            .setFooter({ text: 'Bạn có 15 giây để chọn!' });

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('tx_tai').setLabel('TÀI (11-18)').setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId('tx_xiu').setLabel('XỈU (3-10)').setStyle(ButtonStyle.Primary)
        );

        const response = await interaction.reply({ embeds: [embed], components: [row], fetchReply: true });

        // 3. Lắng nghe nút bấm
        const collector = response.createMessageComponentCollector({
            filter: i => i.user.id === user.id, // Chỉ người gọi lệnh mới bấm được
            componentType: ComponentType.Button,
            time: 15000,
            max: 1
        });

        collector.on('collect', async i => {
            // Hiệu ứng chờ cho kịch tính
            await i.update({ content: '🎲 **Đang lắc xúc xắc...**', components: [], embeds: [] });
            
            setTimeout(async () => {
                const dice = Array.from({ length: 3 }, () => Math.floor(Math.random() * 6) + 1);
                const total = dice.reduce((a, b) => a + b, 0);
                const winSide = total >= 11 ? 'tx_tai' : 'tx_xiu';
                const isWin = i.customId === winSide;

                // Cập nhật tiền vào Database
                await prisma.user.update({
                    where: { id: user.id },
                    data: { balance: isWin ? { increment: amount } : { decrement: amount } }
                });

                const resultEmbed = new EmbedBuilder()
                    .setTitle(isWin ? '🎉 CHIẾN THẮNG RỰC RỠ!' : '💀 TRẮNG TAY RỒI!')
                    .setColor(isWin ? 0x2ecc71 : 0xe74c3c)
                    .setDescription(`Kết quả: **${dice.join(' 🎲 ')} = ${total}** (${total >= 11 ? 'TÀI' : 'XỈU'})`)
                    .addFields(
                        { name: 'Cửa bạn chọn', value: i.customId === 'tx_tai' ? 'TÀI' : 'XỈU', inline: true },
                        { name: 'Biến động', value: `**${isWin ? '+' : '-'}${amount.toLocaleString()}** Cash`, inline: true }
                    );

                await interaction.editReply({ content: null, embeds: [resultEmbed] });
            }, 2000); // Chờ 2 giây
        });

        collector.on('end', (collected, reason) => {
            if (reason === 'time' && collected.size === 0) {
                interaction.editReply({ content: '⏰ Hết thời gian, phiên cược bị hủy!', components: [], embeds: [] });
            }
        });
    }
};
