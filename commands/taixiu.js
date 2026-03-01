const { 
    SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, 
    ButtonBuilder, ButtonStyle 
} = require('discord.js');

let history = []; 

module.exports = {
    data: new SlashCommandBuilder()
        .setName('taixiu')
        .setDescription('💎 Casino Thượng Lưu - Chọn cửa trước, đặt tiền sau'),

    async execute(input, prisma) {
        const user = input.user || input.author;

        try {
            // 1. Khởi tạo dữ liệu người dùng
            let userData = await prisma.user.upsert({
                where: { id: user.id },
                update: {},
                create: { id: user.id, balance: 50000 } 
            });

            // --- BƯỚC 1: HIỆN BẢNG CHỌN CỬA ---
            const cauDisplay = history.length > 0 
                ? history.slice(-10).map(res => res === 'TAI' ? '🔴' : '🔵').join(' ') 
                : '`Chưa có dữ liệu ván đấu`';

            const startEmbed = new EmbedBuilder()
                .setColor(0xD4AF37)
                .setTitle('⚜️ VERDICT PRESTIGE CASINO ⚜️')
                .setThumbnail(user.displayAvatarURL())
                .setDescription(
                    `Chào mừng **${user.username}**,\nVui lòng chọn cửa quý khách muốn đặt cược.\n\n` +
                    `💰 **Ví:** \`${userData.balance.toLocaleString()}\` VCASH\n` +
                    `📊 **Cầu:** ${cauDisplay}`
                )
                .setFooter({ text: '⏳ Hết hạn sau 15s' });

            const startRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('choice_TAI').setLabel('ĐẶT TÀI').setEmoji('🔴').setStyle(ButtonStyle.Danger),
                new ButtonBuilder().setCustomId('choice_XIU').setLabel('ĐẶT XỈU').setEmoji('🔵').setStyle(ButtonStyle.Primary)
            );

            const msg = await input.reply({ embeds: [startEmbed], components: [startRow], fetchReply: true });

            // Collector 1: Chọn Tài hay Xỉu
            const collector1 = msg.createMessageComponentCollector({ filter: i => i.user.id === user.id, time: 15000, max: 1 });

            collector1.on('collect', async iChoice => {
                const userChoice = iChoice.customId.replace('choice_', '');

                // --- BƯỚC 2: HIỆN BẢNG CHỌN TIỀN ---
                const moneyEmbed = new EmbedBuilder()
                    .setColor(userChoice === 'TAI' ? 0xE74C3C : 0x3498DB)
                    .setTitle(`🎯 QUÝ KHÁCH ĐÃ CHỌN: ${userChoice}`)
                    .setDescription(`Vui lòng chọn số tiền muốn đặt cược vào cửa **${userChoice}**.`);

                const moneyRow = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('bet_1000').setLabel('1,000').setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder().setCustomId('bet_5000').setLabel('5,000').setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder().setCustomId('bet_10000').setLabel('10,000').setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder().setCustomId('bet_allin').setLabel('ALL IN').setStyle(ButtonStyle.Danger)
                );

                await iChoice.update({ embeds: [moneyEmbed], components: [moneyRow] });

                // Collector 2: Chọn số tiền
                const collector2 = msg.createMessageComponentCollector({ filter: i => i.user.id === user.id, time: 15000, max: 1 });

                collector2.on('collect', async iBet => {
                    let amount = iBet.customId === 'bet_allin' ? userData.balance : parseInt(iBet.customId.replace('bet_', ''));

                    if (userData.balance < amount || amount < 100) {
                        return iBet.update({ content: '❌ Số dư không đủ để thực hiện giao dịch!', embeds: [], components: [] });
                    }

                    // Khóa tiền
                    await prisma.user.update({ where: { id: user.id }, data: { balance: { decrement: amount } } });

                    // --- BƯỚC 3: HIỆU ỨNG MỞ TỪNG VIÊN ---
                    const diceIcons = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];
                    const d = [Math.floor(Math.random() * 6) + 1, Math.floor(Math.random() * 6) + 1, Math.floor(Math.random() * 6) + 1];
                    const total = d.reduce((a, b) => a + b, 0);
                    const result = total >= 11 ? 'TAI' : 'XIU';
                    const isWin = userChoice === result;

                    // Lắc bát
                    await iBet.update({ content: '🎲 **Đang lắc bát...**', embeds: [], components: [] });
                    await new Promise(r => setTimeout(r, 1500));

                    // Mở từng viên
                    let openMsg = `🛑 **KẾT QUẢ VÁN ĐẤU**\n\n`;
                    
                    openMsg += `🎲 Viên 1: **${diceIcons[d[0]-1]}** (${d[0]})\n`;
                    await iBet.editReply({ content: openMsg + `⏳ *Đang mở viên 2...*` });
                    await new Promise(r => setTimeout(r, 1200));

                    openMsg += `🎲 Viên 2: **${diceIcons[d[1]-1]}** (${d[1]})\n`;
                    await iBet.editReply({ content: openMsg + `⏳ *Đang mở viên cuối...*` });
                    await new Promise(r => setTimeout(r, 1200));

                    openMsg += `🎲 Viên 3: **${diceIcons[d[2]-1]}** (${d[2]})\n`;
                    await iBet.editReply({ content: openMsg + `\n➔ **Tổng điểm: ${total}**` });
                    await new Promise(r => setTimeout(r, 1000));

                    // Chốt tiền và lịch sử
                    history.push(result);
                    if (history.length > 20) history.shift();

                    const finalUser = await prisma.user.update({
                        where: { id: user.id },
                        data: { balance: { increment: isWin ? amount * 2 : 0 } }
                    });

                    // --- BƯỚC 4: BẢNG KẾT QUẢ CUỐI ---
                    const resEmbed = new EmbedBuilder()
                        .setColor(isWin ? 0x2ECC71 : 0xE74C3C)
                        .setTitle(`${isWin ? '🎊 CHIẾN THẮNG' : '💸 THẤT BẠI'} - ${result}`)
                        .setDescription(
                            `\`\`\`ansi\n` +
                            ` ▸ Cửa đặt:    ${userChoice === 'TAI' ? '[0;31mTÀI[0m' : '[0;34mXỈU[0m'}\n` +
                            ` ▸ Biến động:  ${isWin ? '[0;32m+' : '[0;31m-'}${amount.toLocaleString()} Cash[0m\n` +
                            ` ▸ Số dư mới:  [0;36m${finalUser.balance.toLocaleString()}[0m Cash\n` +
                            `────────────────────────────────────\n` +
                            `\`\`\`\n` +
                            `**📊 Cầu:** ${history.slice(-10).map(r => r === 'TAI' ? '🔴' : '🔵').join(' ')}`
                        );

                    await iBet.editReply({ content: '✅ **Ván đấu kết thúc!**', embeds: [resEmbed] });
                });
            });

        } catch (err) {
            console.error(err);
        }
    }
};
