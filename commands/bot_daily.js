module.exports = {
    async execute(message, prisma) {
        const userId = message.author.id;
        const user = await prisma.user.upsert({
            where: { id: userId },
            update: {},
            create: { id: userId }
        });

        const now = new Date();
        if (user.lastDaily && now - user.lastDaily < 86400000) {
            return message.reply("⏳ Bạn đã nhận Verdict Cash hôm nay rồi. Quay lại sau nhé!");
        }

        await prisma.user.update({
            where: { id: userId },
            data: { balance: { increment: 500 }, lastDaily: now }
        });
        message.reply("💰 Bạn nhận được **500 Verdict Cash** nhiệm vụ hàng ngày!");
    }
};
