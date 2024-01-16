import { error, getInput, info, notice, setFailed } from '@actions/core'
import {
  ChatCompletionRequestMessageRoleEnum,
  Configuration,
  OpenAIApi,
} from 'openai'
import { encode } from 'gpt-3-encoder'

const API_KEY = getInput('apikey')
const BASE_PATH = getInput('basePath') || 'https://api.openai.com/v1'
const MODEL = getInput('model') || 'gpt-3.5-turbo-16k'
const PROMPT =
  getInput('prompt') ||
  'Please translate the given text into naturalistic {targetLanguage}.'
if (!API_KEY) {
  setFailed('Error: API_KEY could not be retrieved.')
}

const configuration = new Configuration({
  apiKey: API_KEY,
  basePath: BASE_PATH,
})
const openAIApi = new OpenAIApi(configuration)

export const askGPT = async (text: string, prompt: string): Promise<string> => {
  const {
    data: {
      choices: [{ message: { content: content } = { content: '' } }],
    },
  } = await openAIApi
    .createChatCompletion({
      model: MODEL,
      messages: [
        {
          role: ChatCompletionRequestMessageRoleEnum.System,
          content: prompt,
        },
        { role: ChatCompletionRequestMessageRoleEnum.User, content: text },
      ],
      top_p: 0.5,
      stream: true
    })
    .catch((err) => {
      error(err)

      const notifications = [
        'If the status code is 400, the file exceeds token limit without line breaks. \nPlease open one line as appropriate.',
        'If the status code is 404, you do not have right access to the model.',
      ]
      notifications.forEach((msg) => notice(msg))

      process.exit(1)
    })

  if (content === '') {
    info('Possible Error: Translation result is empty')
  }

  return content
}

export const gptTranslate = async (
  text: string,
  targetLanguage: string,
  targetFileExt: string, // filename extension. Must be within availableFileExtensions.
  splitter = `\n\n`,
): Promise<string> => {
  const maxToken =
    (MODEL.includes('32k') ? 32768 : MODEL.includes('16k') ? 16384 : 4096) / 2
  const prompt = PROMPT.replaceAll(
    '{targetLanguage}',
    targetLanguage,
  ).replaceAll('{targetFileExt}', targetFileExt)

  let translated = ''
  let chunk = ''

  info(`${new Date().toLocaleString()} Start translating with ${MODEL}...`)
  const contentChunks = text.split(splitter)
  for (let i = 0; i < contentChunks.length; i++) {
    if (encode(chunk + contentChunks[i]).length > maxToken) {
      const translatedContent = await askGPT(chunk, prompt)
      translated += translatedContent + splitter
      chunk = ''
    }
    chunk += contentChunks[i] + (i < contentChunks.length - 1 ? splitter : '')
  }
  translated += await askGPT(chunk, prompt)
  info('Translation completed!')

  return translated
}
