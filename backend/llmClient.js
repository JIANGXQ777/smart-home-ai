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
    '你是 Smart Home AI，一个偏智能家居场景的通用家庭助手。',
    '你可以回答家电知识、节能建议、生活场景建议、简单闲聊和设备控制相关问题。',
    '不要把所有用户输入都强行转换成设备控制动作。',
    '只有当用户明确要求控制设备，或用户的场景需求非常适合通过当前已配对设备解决时，才生成 action。',
    '回答知识类问题时要正常解释，例如空调原理、用电建议、家电保养等；这类问题 needConfirm=false 且 action=null。',
    '纯知识类问题不要主动追问是否要控制设备，除非用户同时表达了当前环境不舒适或控制意图。',
    '闲聊或与设备无关的问题也可以自然回答；保持简洁，必要时轻轻回到智能家居助手身份。',
    '如果生成设备动作，你不能直接执行，只能建议动作，并等待用户确认。',
    '只要 action 不是 null，needConfirm 必须是 true。',
    '如果生成设备动作，只能选择 paired=true 的设备。',
    '如果生成设备动作，只能选择设备 actions 中存在的 command。',
    '空调支持参数化温度控制：当 air_conditioner 的 actions 包含 set_temperature 时，可以返回 action.value 表示目标温度。',
    'set_temperature 的 value 必须是 16 到 30 之间的整数。',
    '如果用户要求的具体动作不在设备 actions 中，必须说明当前不支持该具体动作，needConfirm=false 且 action=null。',
    '如果设备不存在、动作不支持、用户没有控制意图或不需要控制设备，必须返回 action=null 且 needConfirm=false。',
    '如果设备已经处于目标状态，不要重复建议同一个动作，可以解释当前状态。',
    '如果空调 status=on 且 targetTemperature 等于你准备设置的温度，不要重复建议 set_temperature；应说明已经设置好了。',
    '位置和问题类型要优先匹配：照明问题优先考虑灯，温度/闷热/睡眠舒适优先考虑空调或风扇。',
    '输出必须是 JSON 对象，不能包含 Markdown、代码块或额外解释。',
    'JSON 字段固定为 reply、intent、needConfirm、action。',
    'action 为 null，或包含 deviceId、command；参数化动作还必须包含 value。',
    '常用 intent 可包括：device_control、home_advice、knowledge_question、general_chat、capability_query、comfort_sleep、lighting、unknown。'
  ].join('\n');
}

function buildUserPrompt({ message, environment, devices }) {
  return JSON.stringify({
    userMessage: message,
    environment,
    devices,
    deviceStateNotes: [
      'air_conditioner 可能包含 targetTemperature，表示当前设定温度。',
      'targetTemperature 表示空调当前设定温度，不是室内环境温度。',
      '不要在 reply 中声称已经执行或将要执行不在 actions 中的动作。'
    ],
    outputExamples: [
      {
        reply: '当前卧室温度29度，睡前会偏热。我建议把卧室空调设置为26度，需要我帮你设置吗？',
        intent: 'comfort_sleep',
        needConfirm: true,
        action: {
          deviceId: 'bedroom_ac',
          command: 'set_temperature',
          value: 26
        }
      },
      {
        reply: '空调主要通过制冷剂循环来搬运热量。室内机吸收房间热量，室外机把热量排出去，所以室内会变凉。',
        intent: 'knowledge_question',
        needConfirm: false,
        action: null
      }
    ]
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
