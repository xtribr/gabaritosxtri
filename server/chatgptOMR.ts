// ChatGPT (OpenAI) vision helper for OMR
// Expects OPENAI_API_KEY in env and supports overriding model via CHATGPT_MODEL
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const CHATGPT_MODEL = process.env.CHATGPT_MODEL || "gpt-4o-mini";
const OPENAI_BASE_URL = process.env.OPENAI_BASE_URL || "https://api.openai.com/v1";

export interface ChatGPTOMRResponse {
  answers: Array<string | null>;
  corrections?: Array<{
    q: number;
    omr: string | null;
    corrected: string | null;
    reason?: string;
  }>;
  rawText: string;
  model: string;
}

type ChatMessage = { role: string; content: any };

function buildPrompt(totalQuestions: number, omrAnswers?: Array<string | null>): ChatMessage[] {
  const systemPrompt = omrAnswers
    ? "You are an expert OMR validator. Analyze the answer sheet image and validate/correct the automated OMR readings. Look carefully at each bubble to determine if it's truly marked. Return JSON only with your corrected readings."
    : "You are a strict OMR reader. Extract the marked alternatives (A-E) for each question in the answer sheet. Return JSON only.";

  const userPrompt = omrAnswers
    ? `The automated OMR detected these answers: ${JSON.stringify(omrAnswers)}. 
       Carefully examine EACH bubble in the image for questions 1-${totalQuestions}. 
       Validate if the detected answer is correct. If a bubble appears unmarked but was detected, correct it to null. 
       If a different bubble is clearly marked, correct to the right option (A-E).
       Return JSON: {"answers":["A","B",...], "corrections": [{"q": 5, "omr": "A", "corrected": "B", "reason": "bubble A is faint, B is clearly marked"}]}`
    : `Identify marked options for questions 1-${totalQuestions}. Return a JSON like {"answers":["A","B",...,"E"]}. Use null for blank/ambiguous. No prose.`;

  return [
    {
      role: "system",
      content: systemPrompt,
    },
    {
      role: "user",
      content: [
        {
          type: "text",
          text: userPrompt,
        },
      ],
    },
  ];
}

export async function callChatGPTVisionOMR(
  imageBuffer: Buffer,
  totalQuestions: number,
  omrAnswers?: Array<string | null>
): Promise<ChatGPTOMRResponse> {
  if (!OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not set");
  }

  const base64 = imageBuffer.toString("base64");

  const messages = buildPrompt(totalQuestions, omrAnswers);
  const lastMsg = messages[messages.length - 1];
  if (lastMsg && typeof lastMsg !== "string" && "content" in lastMsg && Array.isArray((lastMsg as any).content)) {
    (lastMsg as any).content.push({
      type: "image_url",
      image_url: { url: `data:image/png;base64,${base64}` },
    });
  }

  const body = {
    model: CHATGPT_MODEL,
    messages,
    max_tokens: omrAnswers ? 1500 : 600,
    temperature: 0,
  };

  const response = await fetch(`${OPENAI_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI API error ${response.status}: ${errorText}`);
  }

  const data = await response.json();
  const rawText: string = data?.choices?.[0]?.message?.content?.trim?.() || "";

  const parsed = parseAnswersWithCorrections(rawText, totalQuestions, omrAnswers);
  return {
    answers: parsed.answers,
    corrections: parsed.corrections,
    rawText,
    model: data?.model || CHATGPT_MODEL,
  };
}

function normalizeAnswers(arr: any[], totalQuestions: number): Array<string | null> {
  const normalized: Array<string | null> = [];
  for (let i = 0; i < totalQuestions; i++) {
    const val = arr[i];
    if (typeof val === "string" && /[A-E]/i.test(val)) {
      normalized.push(val.trim().toUpperCase());
    } else if (val === null || val === undefined || val === "") {
      normalized.push(null);
    } else {
      normalized.push(null);
    }
  }
  return normalized;
}

function parseAnswersWithCorrections(
  raw: string,
  totalQuestions: number,
  omrAnswers?: Array<string | null>
): {
  answers: Array<string | null>;
  corrections?: Array<{ q: number; omr: string | null; corrected: string | null; reason?: string }>;
} {
  let cleaned = raw.trim();
  cleaned = cleaned.replace(/```json/gi, "").replace(/```/g, "").trim();

  try {
    const parsed = JSON.parse(cleaned);
    if (Array.isArray(parsed.answers)) {
      return {
        answers: normalizeAnswers(parsed.answers, totalQuestions),
        corrections: parsed.corrections || undefined,
      };
    }
  } catch (e) {
    // ignore and try regex parsing below
  }

  const match = cleaned.match(/\{[\s\S]*"answers"[\s\S]*\}/);
  if (match) {
    try {
      const parsed = JSON.parse(match[0]);
      if (Array.isArray(parsed.answers)) {
        return {
          answers: normalizeAnswers(parsed.answers, totalQuestions),
          corrections: parsed.corrections || undefined,
        };
      }
    } catch (e) {
      // ignore
    }
  }

  const letters = cleaned.match(/[A-E]/gi) || [];
  if (letters.length > 0) {
    return {
      answers: normalizeAnswers(letters, totalQuestions),
      corrections: undefined,
    };
  }

  return {
    answers: Array.from({ length: totalQuestions }, () => null),
    corrections: undefined,
  };
}

