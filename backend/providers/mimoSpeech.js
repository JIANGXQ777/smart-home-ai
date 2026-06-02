// MiMo 语音识别提供者已移除
// 如需恢复语音功能，请重新实现此模块

module.exports = {
  transcribeWithMimo: async () => {
    throw new Error('MiMo 语音识别功能未启用');
  }
};
