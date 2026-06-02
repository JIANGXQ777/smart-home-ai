// 语音识别服务已移除
// 如需恢复语音功能，请重新实现此模块

module.exports = {
  getSpeechConfig: () => ({ enabled: false, provider: null }),
  transcribeAudio: async () => {
    throw new Error('语音识别功能未启用');
  },
  createSpeechError: (message, code = 'speech_error', status = 500) => {
    const error = new Error(message);
    error.code = code;
    error.status = status;
    return error;
  }
};
