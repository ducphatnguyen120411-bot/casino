module.exports = {
    async execute(message, prisma) {
        message.channel.send("🎯 Chuẩn bị... Khi nào thấy biểu tượng 💥 hãy nhấn vào nó!");
        const delay = Math.floor(Math.random() * 5000) + 2000;
        
        setTimeout(async () => {
            const msg = await message.channel.send("💥 NHẤN NGAY!");
            await msg.react("💥");

            const filter = (reaction, user) => reaction.emoji.name === '💥' && !user.bot;
            const collector = msg.createReactionCollector({ filter, time: 5000, max: 1 });

            collector.on('collect', async (reaction, user) => {
                await prisma.user.update({ where: { id: user.id }, data: { balance: { increment: 100 } } });
                message.channel.send(`🏆 **${user.username}** phản xạ cực nhanh! Nhận **100 Verdict Cash**.`);
            });
        }, delay);
    }
};
