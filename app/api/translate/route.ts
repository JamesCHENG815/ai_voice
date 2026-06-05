import Groq from 'groq-sdk'

const client = new Groq({ apiKey: process.env.GROQ_API_KEY })

export interface ContextSegment {
  index: number
  english: string
  chinese: string
}

const SYSTEM_PROMPT = `You are a professional real-time simultaneous interpreter specializing in English to Chinese (Simplified) translation.

Rules:
- Output ONLY the Chinese translation for the new segment — no explanations, no English text, no extra symbols
- Use natural, colloquial Chinese suitable for spoken subtitles
- Keep proper nouns, names, and technical terms accurate
- After your main translation (on new lines), if you detect errors in previous translations given this new context, output corrections in this exact format:
  CORRECTION:N:corrected_chinese_text
  (where N is the segment number shown in the context, one correction per line)
- Do not add CORRECTION lines if previous translations were accurate`

export async function POST(request: Request) {
  const { text, context } = (await request.json()) as {
    text: string
    context: ContextSegment[]
  }

  if (!text?.trim()) {
    return new Response(JSON.stringify({ error: 'No text provided' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const contextStr =
    context.length > 0
      ? `Previous conversation segments (for context and error correction):\n${context
          .map(
            (c) =>
              `${c.index + 1}. EN: "${c.english}"\n   ZH: "${c.chinese}"`
          )
          .join('\n')}\n\n`
      : ''

  const encoder = new TextEncoder()

  const readable = new ReadableStream({
    async start(controller) {
      try {
        const stream = await client.chat.completions.create({
          model: 'llama-3.3-70b-versatile',
          max_tokens: 1024,
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            {
              role: 'user',
              content: `${contextStr}Translate this new English segment to Chinese:\n"${text}"`,
            },
          ],
          stream: true,
        })

        for await (const chunk of stream) {
          const text = chunk.choices[0]?.delta?.content ?? ''
          if (text) {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ type: 'delta', text })}\n\n`)
            )
          }
        }

        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ type: 'done' })}\n\n`)
        )
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ type: 'error', message: msg })}\n\n`)
        )
      } finally {
        controller.close()
      }
    },
  })

  return new Response(readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
}
