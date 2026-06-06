import Groq from 'groq-sdk'

export const dynamic = 'force-dynamic'

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
  const chineseRule = targetLang === 'zh-CN'
    ? '\n5. Use Simplified Chinese characters (简体中文) ONLY. Never output Traditional Chinese (繁體字).'
    : ''
  return `You are a simultaneous interpreter. Translate ${src} to ${tgt}.

CRITICAL RULES — violations are unacceptable:
1. Output ONLY the translated text. No alternatives, no reasoning, no meta-commentary, no self-correction, no explanations.
2. If the input is a sentence fragment, translate it as-is.
3. Natural spoken ${tgt} only — concise, no filler.
4. Optionally append correction lines for previous segments using: CORRECTION:N:corrected_text${chineseRule}`
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
          max_tokens: 512,
          temperature: 0,
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
