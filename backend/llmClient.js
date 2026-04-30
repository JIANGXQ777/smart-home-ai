// OpenAI-compatible 大模型客户端
// 调用 Chat Completions 接口并解析模型返回的结构化决策

function getConfig() {
  return {
    enabled: process.env.LLM_ENABLED === 'true',
    apiKey: process.env.LLM_API_KEY,
    baseUrl: process.env.LLM_BASE_URL || 'https://api.openai.com/v1',
    model: process.env.LLM_MODEL || 'gpt-4o-mini',
    timeoutMs: Number(process.env.LLM_TIMEOUT_MS || 15000)
  };
}

function buildSystemPrompt() {
  return [
    '你是 Smart Home AI 的家居决策助手。',
    '你需要根据用户输入、环境信息和设备列表，生成一个安全、可执行的家居控制建议。',
    '你不能直接执行设备动作，只能建议动作，并等待用户确认。',
    '你只能选择 paired=true 的设备。',
    '你只能选择设备 actions 中存在的 command。',
    '如果用户意图不明确、设备不存在、动作不支持或不需要控制设备，必须返回 action=null 且 needConfirm=false。',
    '如果设备已经处于目标状态，不要重复建议同一个动作。',
    '输出必须是 JSON 对象，不能包含 Markdown、代码块或额外解释。',
    'JSON 字段固定为 reply、intent、needConfirm、action。',
    'action 为 null，或包含 deviceId 和 command。'
  ].join('\n');
}

function buildUserPrompt({ message, environment, devices }) {
  return JSON.stringify({
    userMessage: message,
    environment,
    devices,
    outputExample: {
      reply: '当前卧室温度29度，睡前会偏热。我建议把卧室空调设置为26度，需要我帮你设置吗？',
      intent: 'comfort_sleep',
      needConfirm: true,
      action: {
        deviceId: 'bedroom_ac',
        command: 'set_temp_26'
      }
    }
  });
}

function buildEndpoint(baseUrl) {
  const normalized = baseUrl.replace(/\/+$/, '');
  if (normalized.endsWith('/chat/completions')) {
    return normalized;
  }
  return `${normalized}/chat/completions`;
}

function extractJsonText(text) {
  const trimmed = text.trim();
  if (trimmed.startsWith('```')) {
    return trimmed
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();
  }
  return trimmed;
}

function parseDecisionContent(content) {
  if (typeof content !== 'string' || content.trim() === '') {
    throw new Error('LLM response content is empty');
  }
  return JSON.parse(extractJsonText(content));
}

async function callLlmDecision({ message, environment, devices }) {
  const config = getConfig();

  if (!config.enabled) {
    throw new Error('LLM is not enabled');
  }

  if (!config.apiKey) {
    throw new Error('LLM_API_KEY is missing');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs);

  try {
    const response = await fetch(buildEndpoint(config.baseUrl), {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: config.model,
        temperature: 0.2,
        messages: [
          {
            role: 'system',
            content: buildSystemPrompt()
          },
          {
            role: 'user',
            content: buildUserPrompt({ message, environment, devices })
          }
        ]
      }),
      signal: controller.signal
    });

    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`LLM request failed: ${response.status} ${detail}`);
    }

    const data = await response.json();
    const content = data &&
      data.choices &&
      data.choices[0] &&
      data.choices[0].message &&
      data.choices[0].message.content;

    return parseDecisionContent(content);
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = {
  callLlmDecision,
  getConfig
};
