import { supabase } from '../providers/supabase/supabase';

export async function askAssistant(messages: Array<{ role: 'user'|'assistant'|'system'; content: string }>) {
  const { data, error } = await supabase.functions.invoke<any>('assistant', {
    method: 'POST',
    body: { messages },
  });
  if (error) throw new Error(error.message || 'Assistant error');
  return data;
}
