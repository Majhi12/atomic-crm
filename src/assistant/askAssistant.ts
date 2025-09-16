import { supabase } from '../providers/supabase/supabase';

export async function askAssistant(messages: Array<{ role: 'user'|'assistant'|'system'; content: string }>) {
  const { data: sessionResp } = await supabase.auth.getSession();
  const token = sessionResp?.session?.access_token;
  const { data, error } = await supabase.functions.invoke<any>('assistant', {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    body: { messages },
  });
  if (error) throw new Error(error.message || 'Assistant error');
  return data;
}
