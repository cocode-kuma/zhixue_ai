import type { ChatMode } from "./types.js";

type AiConfig = {
  apiKey: string;
  baseUrl: string;
  model: string;
};

function getAiConfig(options: { vision?: boolean } = {}): AiConfig {
  const apiKey = readRequiredEnv("AI_API_KEY");
  const baseUrl = readRequiredEnv("AI_API_BASE").replace(/\/+$/, "");
  const model = (options.vision ? process.env.AI_VISION_MODEL?.trim() : "") || readRequiredEnv("AI_MODEL");
  return { apiKey, baseUrl, model };
}

function readRequiredEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`missing_${name.toLowerCase()}`);
  return value;
}

function requestTimeout() {
  return Number(process.env.AI_REQUEST_TIMEOUT_MS ?? 60_000);
}

export function inspectSafety(message: string) {
  const lower = message.toLowerCase();
  const cheatingPatterns = [
    "直接给我答案",
    "最终答案",
    "帮我写完作业",
    "代写",
    "作弊",
    "忽略之前",
    "ignore previous",
    "系统提示词",
    "system prompt"
  ];
  const distressPatterns = ["不想活", "自杀", "伤害自己", "我太笨了", "没救了"];
  const cheatingRisk = cheatingPatterns.some((pattern) => lower.includes(pattern.toLowerCase()));
  const needsHumanAttention = distressPatterns.some((pattern) => lower.includes(pattern.toLowerCase()));

  if (needsHumanAttention) {
    return {
      blocked: true,
      cheatingRisk,
      needsHumanAttention,
      reply:
        "我听到你现在很难受。学习上的卡住不代表你不行，我们先把题目拆小一点；如果这种难受持续存在，也请尽快和家长、老师或身边可信任的大人说一声。"
    };
  }

  if (cheatingRisk) {
    return {
      blocked: true,
      cheatingRisk,
      needsHumanAttention,
      reply: "我不能直接替你给出最终答案或代写，但我可以带你一步步做。我们先找题目给出的条件和要求。"
    };
  }

  return { blocked: false, cheatingRisk: false, needsHumanAttention: false, reply: "" };
}

export async function getAiReply(
  mode: ChatMode,
  message: string,
  history: Array<{ role: "user" | "assistant"; content: string }>
) {
  const safety = inspectSafety(message);
  if (safety.blocked) {
    return {
      agent: mode === "concept" ? "ConceptAgent" : "TutorAgent",
      mode,
      stage: "safety_redirect",
      reply: safety.reply,
      question_to_user: "我们先从你已经理解的部分开始。你能说说题目给了哪些条件吗？",
      hint_level: 0,
      knowledge_points: [],
      actions: {
        save_wrong_question: false,
        create_review_task: false,
        recommend_concept_learning: false
      },
      safety: {
        direct_answer_leak: false,
        cheating_risk: safety.cheatingRisk,
        needs_human_attention: safety.needsHumanAttention
      }
    };
  }

  const { apiKey, baseUrl, model } = getAiConfig();

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: systemPrompt(mode) },
          ...history.slice(-8),
          { role: "user", content: message }
        ],
        temperature: 0.4
      }),
      signal: AbortSignal.timeout(requestTimeout())
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`ai_api_error:${response.status}:${errorText.slice(0, 200)}`);
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: unknown } }>;
    };
    const content = data?.choices?.[0]?.message?.content;
    if (typeof content !== "string") {
      throw new Error("ai_api_empty_content");
    }

    return normalizeAiPayload(parseJsonContent(content), mode);
  } catch (error) {
    throw error instanceof Error ? error : new Error("ai_api_request_failed");
  }
}

export async function getLearningJson(task: string, userPrompt: string) {
  const { apiKey, baseUrl, model } = getAiConfig();

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: "system",
          content:
            "你是智学AI的学习系统Agent。只输出合法JSON，不要在JSON外层添加Markdown代码块或解释文字。JSON字符串字段里的题目、解析、报告、知识点说明可以使用Markdown排版；数学公式必须使用LaTeX，行内公式用 $...$，独立公式用 $$...$$。内容要适合中学生，不能直接鼓励作弊。"
        },
        {
          role: "user",
          content: `${task}\n\n${userPrompt}`
        }
      ],
      temperature: 0.45
    }),
    signal: AbortSignal.timeout(requestTimeout())
  });

  if (!response.ok) throw new Error(`learning_api_error:${response.status}`);
  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: unknown } }>;
  };
  const content = data.choices?.[0]?.message?.content;
  if (typeof content !== "string") throw new Error("learning_api_empty_content");
  return parseJsonContent(content);
}

export async function generateConversationTitle(mode: ChatMode, firstUserMessage: string, assistantReply: string) {
  const { apiKey, baseUrl, model } = getAiConfig();

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: "system",
          content:
            "你是标题生成器。根据学习对话生成一个简短中文标题，8到16个字，不要引号，不要标点，不要解释。"
        },
        {
          role: "user",
          content: `模式：${mode}\n用户：${firstUserMessage}\nAI：${assistantReply.slice(0, 500)}`
        }
      ],
      temperature: 0.2
    }),
    signal: AbortSignal.timeout(20_000)
  });

  if (!response.ok) return fallbackTitle(mode, firstUserMessage);
  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: unknown } }>;
  };
  const content = String(data.choices?.[0]?.message?.content ?? "").trim();
  return cleanTitle(content || fallbackTitle(mode, firstUserMessage));
}

export async function extractTextFromImage(dataUrl: string) {
  const { apiKey, baseUrl, model } = getAiConfig({ vision: true });

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: "system",
          content:
            "你是教育题目OCR助手。识别图片中的题目文字、公式和选项。只输出识别文本，不要解答。无法识别时说明原因。"
        },
        {
          role: "user",
          content: [
            { type: "text", text: "请识别这张题目图片中的全部文字和公式。" },
            { type: "image_url", image_url: { url: dataUrl } }
          ]
        }
      ],
      temperature: 0.1
    }),
    signal: AbortSignal.timeout(requestTimeout())
  });

  if (!response.ok) throw new Error(`ocr_api_error:${response.status}`);
  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: unknown } }>;
  };
  const content = String(data.choices?.[0]?.message?.content ?? "").trim();
  if (!content) throw new Error("ocr_empty_content");
  return content;
}

export async function gradeLearningWork(task: string, payload: unknown) {
  return getLearningJson(
    [
      "你是智学AI批改Agent。",
      "根据题目、参考答案和学生答案给出批改报告。",
      "JSON字段：score数字0-100；summary字符串；correct_points数组；wrong_points数组；suggestions数组；wrong_questions数组。",
      "wrong_questions每项包含title, reason, knowledge_point。",
      "批改要具体、温和，不要羞辱学生。"
    ].join("\n"),
    JSON.stringify({ task, payload })
  );
}

export async function generateVariantPractice(payload: unknown) {
  return getLearningJson(
    [
      "你是智学AI自适应练习Agent。",
      "根据错题/薄弱点生成同类变式题。",
      "JSON字段：title；knowledge_point；questions数组。",
      "questions每项包含question, answer, hint, difficulty。",
      "题目要同类但不能完全重复，难度从简单到中等。"
    ].join("\n"),
    JSON.stringify(payload)
  );
}

export async function generateGoalPlan(payload: unknown) {
  return getLearningJson(
    [
      "你是智学AI学习目标规划Agent。",
      "把学生目标拆成每日任务。",
      "JSON字段：summary；days数组；checkpoints数组。",
      "days每项包含day, task, practice, review, minutes, done=false。",
      "任务必须具体，适合中学生，每天15-30分钟。"
    ].join("\n"),
    JSON.stringify(payload)
  );
}

export async function streamAiReply(
  mode: ChatMode,
  message: string,
  history: Array<{ role: "user" | "assistant"; content: string }>,
  onDelta: (delta: string) => void
) {
  const safety = inspectSafety(message);
  if (safety.blocked) {
    const payload = {
      agent: mode === "concept" ? "ConceptAgent" : "TutorAgent",
      mode,
      stage: "safety_redirect",
      reply: safety.reply,
      question_to_user: "我们先从你已经理解的部分开始。你能说说题目给了哪些条件吗？",
      hint_level: 0,
      knowledge_points: [],
      actions: {
        save_wrong_question: false,
        create_review_task: false,
        recommend_concept_learning: false
      },
      safety: {
        direct_answer_leak: false,
        cheating_risk: safety.cheatingRisk,
        needs_human_attention: safety.needsHumanAttention
      }
    };
    onDelta(`${payload.reply}\n\n${payload.question_to_user}`);
    return payload;
  }

  const { apiKey, baseUrl, model } = getAiConfig();

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: streamingSystemPrompt(mode) },
        ...history.slice(-8),
        { role: "user", content: message }
      ],
      temperature: 0.4,
      stream: true
    }),
    signal: AbortSignal.timeout(requestTimeout())
  });

  if (!response.ok || !response.body) {
    const errorText = await response.text();
    throw new Error(`ai_stream_error:${response.status}:${errorText.slice(0, 200)}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let fullText = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const data = trimmed.slice("data:".length).trim();
      if (!data || data === "[DONE]") continue;

      try {
        const parsed = JSON.parse(data) as {
          choices?: Array<{ delta?: { content?: unknown }; message?: { content?: unknown } }>;
        };
        const delta = parsed.choices?.[0]?.delta?.content ?? parsed.choices?.[0]?.message?.content ?? "";
        if (typeof delta === "string" && delta) {
          fullText += delta;
          onDelta(delta);
        }
      } catch {
        continue;
      }
    }
  }

  return await payloadFromPlainText(mode, message, fullText);
}

function systemPrompt(mode: ChatMode) {
  const base =
    '????AI????????AI??????????????????????????????????JSON?JSON???????agent, mode, stage, reply, question_to_user, hint_level, knowledge_points, actions, safety?actions??save_wrong_question, create_review_task, recommend_concept_learning?safety??direct_answer_leak, cheating_risk, needs_human_attention?reply?question_to_user????Markdown?LaTeX??????????? $...$??????? $$...$$?';
  if (mode === "concept") {
    return `${base} ???????????????????????????????????????`;
  }
  return `${base} ?????????????????????????????????????`;
}

function streamingSystemPrompt(mode: ChatMode) {
  const base =
    "????AI????????AI???????????????????????????????????????????????????????????JSON???????Markdown?????????????????????????????????LaTeX??????? $...$??????? $$...$$??????????????????????";
  if (mode === "concept") {
    return `${base} ???????????????????????????????????????????????Markdown?LaTeX???`;
  }
  return `${base} ????????????????????????????????????????????????????LaTeX?????`;
}

async function payloadFromPlainText(mode: ChatMode, message: string, fullText: string) {
  const reply = fullText.trim() || "我们先把题目拆小一点。";
  const fallbackPayload = neutralTutorPayload(mode, reply);
  let config: AiConfig;
  try {
    config = getAiConfig();
  } catch {
    return fallbackPayload;
  }

  try {
    const response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`
      },
      body: JSON.stringify({
        model: config.model,
        messages: [
          {
            role: "system",
            content:
              "你是智学AI的对话元数据分析Agent。根据用户消息和AI已流式输出的辅导内容，输出合法JSON：agent, mode, stage, question_to_user, hint_level, knowledge_points, actions, safety。knowledge_points必须来自题目/上下文的真实学科概念，不确定时返回空数组，禁止用关键词硬猜。actions根据学生是否确实卡住或答错来判断，不要为了活跃度强行保存错题。不要在JSON外层添加Markdown。"
          },
          {
            role: "user",
            content: JSON.stringify({
              mode,
              user_message: message,
              assistant_reply: reply
            })
          }
        ],
        temperature: 0.15
      }),
      signal: AbortSignal.timeout(requestTimeout())
    });

    if (!response.ok) return fallbackPayload;
    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: unknown } }>;
    };
    const content = data.choices?.[0]?.message?.content;
    if (typeof content !== "string") return fallbackPayload;
    const payload = normalizeAiPayload(parseJsonContent(content), mode);
    return {
      ...payload,
      reply,
      knowledge_points: payload.knowledge_points.filter((item) => item.trim())
    };
  } catch {
    return fallbackPayload;
  }
}

function neutralTutorPayload(mode: ChatMode, reply: string) {
  return {
    agent: mode === "concept" ? "ConceptAgent" : "TutorAgent",
    mode,
    stage: mode === "concept" ? "intro" : "guidance",
    reply,
    question_to_user: "你能先说说你现在想到哪一步了吗？",
    hint_level: 1,
    knowledge_points: [],
    actions: {
      save_wrong_question: false,
      create_review_task: false,
      recommend_concept_learning: false
    },
    safety: {
      direct_answer_leak: false,
      cheating_risk: false,
      needs_human_attention: false
    }
  };
}

function parseJsonContent(content: string) {
  try {
    return JSON.parse(content) as Record<string, unknown>;
  } catch {
    const match = content.match(/\{[\s\S]*\}/);
    if (!match) {
      throw new Error("invalid_json_response");
    }
    return JSON.parse(match[0]) as Record<string, unknown>;
  }
}

function normalizeAiPayload(payload: Record<string, unknown>, mode: ChatMode) {
  return {
    agent: String(payload.agent ?? (mode === "concept" ? "ConceptAgent" : "TutorAgent")),
    mode,
    stage: String(payload.stage ?? "guidance"),
    reply: String(payload.reply ?? "我们先把问题拆小一点。"),
    question_to_user: String(payload.question_to_user ?? "你觉得第一步可以做什么？"),
    hint_level: Number(payload.hint_level ?? 1),
    knowledge_points: Array.isArray(payload.knowledge_points) ? payload.knowledge_points.map(String) : [],
    actions: {
      save_wrong_question: Boolean((payload.actions as { save_wrong_question?: boolean } | undefined)?.save_wrong_question),
      create_review_task: Boolean((payload.actions as { create_review_task?: boolean } | undefined)?.create_review_task),
      recommend_concept_learning: Boolean(
        (payload.actions as { recommend_concept_learning?: boolean } | undefined)?.recommend_concept_learning
      )
    },
    safety: {
      direct_answer_leak: false,
      cheating_risk: false,
      needs_human_attention: false
    }
  };
}

function fallbackTitle(mode: ChatMode, firstUserMessage: string) {
  const cleaned = cleanTitle(firstUserMessage);
  if (cleaned) return cleaned.slice(0, 16);
  if (mode === "concept") return "概念学习";
  if (mode === "free") return "学习问答";
  return "引导讲题";
}

function cleanTitle(title: string) {
  return title
    .replace(/["'“”‘’`]/g, "")
    .replace(/[。？！?,，.：:；;]/g, "")
    .replace(/\s+/g, "")
    .slice(0, 18);
}
