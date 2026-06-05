import Groq from 'groq-sdk'

export interface ContextSegment {
  index: number
  english: string
  chinese: string
}

const LANG_NAMES: Record<string, string> = {
  'en-US': 'English',
  'zh-CN': 'Chinese (Simplified)',
  'ja-JP': 'Japanese',
  'ko-KR': 'Korean',
  'es-ES': 'Spanish',
  'fr-FR': 'French',
  'de-DE': 'German',
}

function buildSystemPrompt(sourceLang: string, targetLang: string): string {
  const src = LANG_NAMES[sourceLang] ?? sourceLang
  const tgt = LANG_NAMES[targetLang] ?? targetLang
  return `You are a professional real-time simultaneous interpreter specializing in ${src} to ${tgt} translation.

Rules:
- Output ONLY the ${tgt} translation for the new segment — no explanations, no source language text, no extra symbols
- Use natural, colloquial ${tgt} suitable for spoken subtitles
- Keep proper nouns, names, and technical terms accurate
- After your main translation (on new lines), if you detect errors in previous translations given this new context, output corrections in this exact format:
  CORRECTION:N:corrected_text
  (where N is the segment number shown in the context, one correction per line)
- Do not add CORRECTION lines if previous translations were accurate`
}

export async function POST(request: Request) {
  const client = new Groq({ apiKey: process.env.GROQ_API_KEY })
  const { text, context, sourceLang = 'en-US', targetLang = 'zh-CN' } = (await request.json()) as {
    text: string
    context: ContextSegment[]
    sourceLang?: string
    targetLang?: string
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
          .map((c) => `${c.index + 1}. EN: "${c.english}"\n   Translation: "${c.chinese}"`)
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
            { role: 'system', content: buildSystemPrompt(sourceLang, targetLang) },
            {
              role: 'user',
              content: `${contextStr}Translate this new English segment:\n"${text}"`,
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
