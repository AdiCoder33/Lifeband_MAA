// Simple client for Meditron-7B (OpenAI-compatible endpoint via llama.cpp)

const BASE_URL = 'http://192.168.X.X:8080'; // replace with your host
const API_KEY = 'my-secret-key'; // replace with your key
const MODEL_NAME = 'meditron-7b';

type ChatMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

type ChoiceMessage = {
  message?: ChatMessage;
};

type ChatResponse = {
  choices?: Array<ChoiceMessage>;
};

export async function askMeditron(userQuestion: string): Promise<string> {
  if (!userQuestion?.trim()) {
    throw new Error('Please enter a question.');
  }

  const messages: ChatMessage[] = [
    {
      role: 'system',
      content:
        'You are Meditron, a careful medical assistant. Answer in clear, simple English for a non-medical person. Be conservative and safe. Always add a final line saying: "This is general information only. A pregnant woman must follow her doctor’s advice."',
    },
    { role: 'user', content: userQuestion.trim() },
  ];

  const body = {
    model: MODEL_NAME,
    messages,
    max_tokens: 220,
    temperature: 0.3,
    stop: ['<|im_end|>', '<|im_start|>'],
  };

  let res: Response;
  try {
    res = await fetch(`${BASE_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${API_KEY}`,
      },
      body: JSON.stringify(body),
    });
  } catch (error) {
    throw new Error('Network error while contacting Meditron.');
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Meditron request failed (${res.status}): ${text || 'Unknown error'}`);
  }

  let data: ChatResponse;
  try {
    data = (await res.json()) as ChatResponse;
  } catch (error) {
    throw new Error('Invalid JSON response from Meditron.');
  }

  const content = data?.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error('Meditron did not return a message.');
  }

  return content.trim();
}

export default askMeditron;
