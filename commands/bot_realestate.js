const voiceTiemrs = new Map();

module.exports = {
    handleVoice(oldState, newState, prisma) {
        if (!oldState.channelId && newState.channelId) { // Tham gia voice
            voiceTiemrs.set(newState.member.id, Date.now());
        } else if (oldState.channelId && !newState.channelId) { // Thoát voice
            const startTime = voiceTiemrs.get(oldState.member.id);
            if (startTime) {
                const minutes = Math.floor((Date.now() - startTime) / 60000);
                const reward = minutes * 10; // 10 cash mỗi phút "thuê đất" voice
                prisma.user.update({
                    where: { id: oldState.member.id },
                    data: { balance: { increment: reward } }
                }).then(() => {
                    console.log(`Cấp ${reward} cho ${oldState.member.user.tag}`);
                });
                voiceTiemrs.delete(oldState.member.id);
            }
        }
    }
};
