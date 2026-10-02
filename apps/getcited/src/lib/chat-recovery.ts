import type { UIMessage } from 'ai';

export const CHAT_MESSAGE_BYTES = 16 * 1024;
export const INTERRUPTED_TOOL = 'This tool did not finish. Dispatched usage may be billed. Send a new message only when you want to try again.';
export const INTERRUPTED_RESPONSE = 'The response did not finish. Restore the conversation to check saved work. Any dispatched usage is recorded.';
export const MESSAGE_TOO_LARGE = 'Keep the complete message and attachment within 16 KiB. Shorten the text or remove the attachment.';
export function userMessage(id: string, text: string, attachment?: { name: string; text: string } | null): UIMessage {
  const content = attachment ? `Attached file "${attachment.name}":\n\n\`\`\`\n${attachment.text}\n\`\`\`\n\n${text}` : text;
  const message: UIMessage = { id, role: 'user', parts: [{ type: 'text', text: content }] };
  if (new TextEncoder().encode(JSON.stringify(message)).byteLength > CHAT_MESSAGE_BYTES) throw new Error(MESSAGE_TOO_LARGE);
  return message;
}
/** Preserve incomplete inputs for display; omit them from later model history. */
export function recoverChatMessages(messages: UIMessage[], interrupted: boolean): UIMessage[] {
  return messages.map(message => {
    if (message.role !== 'assistant') return message;
    let unfinished = false;
    const parts = message.parts.map(part => {
      if ((part.type === 'dynamic-tool' || part.type.startsWith('tool-')) && 'state' in part && (part.state === 'input-streaming' || part.state === 'input-available')) {
        unfinished = true;
        // Arguments that never arrived must not become a fabricated tool call.
        // The inactive card shows interruption and ignoreIncompleteToolCalls
        // excludes this state from the next provider request.
        if (part.state === 'input-streaming') return part;
        return { ...part, state: 'output-error', errorText: INTERRUPTED_TOOL } as UIMessage['parts'][number];
      }
      return part;
    });
    if ((unfinished || interrupted && message === messages.at(-1)) && !parts.some(p => p.type === 'text' && p.text === INTERRUPTED_RESPONSE)) parts.push({ type: 'text', text: INTERRUPTED_RESPONSE });
    return { ...message, parts };
  });
}
const PUBLIC_ERRORS = new Set([
  'The included usage budget is used. The prepared example remains free.',
  'Provider capacity is busy or this operation reached its call limit.',
  'Wait for the current operation to finish.',
  'Provider request did not complete. Usage may have been incurred; no automatic retry.',
  'Add an OpenAI key for Self Serve, or select We Serve in Configure.',
  MESSAGE_TOO_LARGE, 'Send a text message of up to 16 KiB.', 'Please wait before trying again.',
  'Save a new ordinary configuration before chatting with a provider.',
  'The prepared conversation is free and read-only. Start a new thread with an ordinary configuration.',
  'Start a new message or thread.', 'Create an owned thread first.',
  'The assistant could not complete this response. Any dispatched usage is recorded.',
  'The service could not complete this request. Please try again later.',
]);
export function chatErrorMessage(error: unknown): string {
  let candidate:unknown=error;
  for(let i=0;i<4&&candidate instanceof Error;i++){
    if(PUBLIC_ERRORS.has(candidate.message))return candidate.message;
    candidate=candidate.cause;
  }
  return INTERRUPTED_RESPONSE;
}
