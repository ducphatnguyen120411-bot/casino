module.exports = {
    async execute(message, args, prisma) {
        // Logic đơn giản: Xem giá hoặc mua
        const price = (Math.random() * 100 + 10).toFixed(2);
        if (!args[0]) return message.reply(`📈 Mã VCASH hiện tại: **${price} Verdict Cash** / cổ phiếu.`);
        // Thêm logic mua/bán tại đây...
    }
};
