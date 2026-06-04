// OpenAI-compatible 大模型客户端
// 调用 Chat Completions 接口并解析模型返回的结构化决策

function getConfig() {
  return {
    enabled: process.env.LLM_ENABLED === 'true',
    apiKey: process.env.LLM_API_KEY,
    baseUrl: process.env.LLM_BASE_URL || 'https://api.openai.com/v1',
    model: process.env.LLM_MODEL || 'gpt-4o-mini',
    timeoutMs: Number(process.env.LLM_TIMEOUT_MS || 15000),
    maxCompletionTokens: Number(process.env.LLM_MAX_COMPLETION_TOKENS || 1024)
  };
}

function buildSystemPrompt() {
  return [
    '重要：你必须且只能输出一个 JSON 对象，不能包含任何其他内容。不要输出 Markdown 代码块，不要输出解释文字，不要输出前缀或后缀。你的整个回复必须是一个可被 JSON.parse 直接解析的有效 JSON。',
    '',
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
    '设备可能包含 capabilities，表示红外家电可控能力；优先根据 capabilities 判断设备能做什么。',
    '设备 controlType=ir 表示未来通过红外控制，当前阶段只生成建议，不能声称已经真实发射红外。',
    '设备 assumedState 表示系统推测状态，stateConfidence=assumed 表示状态来自最后命令推测而非设备真实上报。',
    '空调支持参数化温度控制：当 capabilities.temperature 存在且 actions 包含 set_temperature 时，可以返回 action.value 表示目标温度。',
    'set_temperature 的 value 必须符合 capabilities.temperature 的 min、max、step。',
    '如果用户要求的具体动作不在设备 actions 中，必须说明当前不支持该具体动作，needConfirm=false 且 action=null。',
    '如果设备不存在、动作不支持、用户没有控制意图或不需要控制设备，必须返回 action=null 且 needConfirm=false。',
    '如果设备已经处于目标状态，不要重复建议同一个动作，可以解释当前状态。',
    '如果空调 status=on 且 targetTemperature 等于你准备设置的温度，不要重复建议 set_temperature；应说明已经设置好了。',
    '位置和问题类型要优先匹配：照明问题优先考虑灯，温度/闷热/睡眠舒适优先考虑空调或风扇。',
    '',
    'JSON 响应格式（严格遵守）：',
    '{',
    '  "reply": "你的回复文字",',
    '  "intent": "device_control|knowledge_question|general_chat|...",',
    '  "needConfirm": true或false,',
    '  "action": null 或 {"deviceId":"设备id","command":"动作","value":可选值}',
    '}',
    '',
    '硬件状态会通过 hardware 字段传入。hardware.online=false 表示 ESP32 未连接，此时绝对不能生成 action，必须在 reply 中说明硬件未连接，并设置 needConfirm=false、action=null。',
    '',
    '记住：只输出 JSON，不要输出其他任何内容。'
  ].join('\n');
}

function buildUserPrompt({ message, environment, devices, hardware }) {
  return JSON.stringify({
    userMessage: message,
    environment,
    devices,
    hardware,
    deviceStateNotes: [
      'air_conditioner 可能包含 targetTemperature，表示当前设定温度。',
      'targetTemperature 表示空调当前设定温度，不是室内环境温度。',
      'controlType=ir 表示红外控制设备；当前软件原型记录的是推测状态。',
      'capabilities 描述设备能力，irProfile 预留品牌、型号和红外码映射。',
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

async function callLlmDecision({ message, environment, devices, hardware }) {
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
        'api-key': config.apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: config.model,
        temperature: 0.2,
        response_format: { type: 'json_object' },
        max_completion_tokens: Number.isFinite(config.maxCompletionTokens) && config.maxCompletionTokens > 0
          ? config.maxCompletionTokens
          : 1024,
        messages: [
          {
            role: 'system',
            content: buildSystemPrompt()
          },
          {
            role: 'user',
            content: buildUserPrompt({ message, environment, devices, hardware })
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

async function checkLlmHealth() {
  const config = getConfig();

  if (!config.enabled) {
    return { reachable: false, reason: 'LLM 未启用' };
  }

  if (!config.apiKey) {
    return { reachable: false, reason: '未配置 API Key' };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4000);

  try {
    const response = await fetch(buildEndpoint(config.baseUrl), {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: config.model,
        max_completion_tokens: 1,
        messages: [{ role: 'user', content: 'hi' }]
      }),
      signal: controller.signal
    });

    clearTimeout(timeout);

    if (response.ok) {
      return { reachable: true, model: config.model };
    }

    // 401/403 说明 API 可达但认证失败
    if (response.status === 401 || response.status === 403) {
      return { reachable: true, model: config.model, authError: true };
    }

    return { reachable: false, reason: `API 返回 ${response.status}` };
  } catch (error) {
    clearTimeout(timeout);
    return { reachable: false, reason: error.name === 'AbortError' ? '连接超时' : error.message };
  }
}

module.exports = {
  callLlmDecision,
  checkLlmHealth,
  getConfig
};
