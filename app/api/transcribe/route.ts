import Groq from 'groq-sdk'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const client = new Groq({ apiKey: process.env.GROQ_API_KEY })

  const formData = await request.formData()
  const audio = formData.get('audio') as File | null
  const language = (formData.get('language') as string | null) ?? 'en'

  if (!audio) {
    return Response.json({ error: 'No audio provided' }, { status: 400 })
  }

  try {
    const transcription = await client.audio.transcriptions.create({
      file: audio,
      model: 'whisper-large-v3-turbo',
      language,
      response_format: 'json',
    })
    return Response.json({ text: transcription.text })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return Response.json({ error: msg }, { status: 500 })
  }
}
