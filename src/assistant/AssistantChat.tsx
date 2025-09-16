import { useEffect, useRef, useState } from 'react';
import { Box, Button, Paper, Stack, TextField, Typography } from '@mui/material';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { askAssistant } from './askAssistant';

export default function AssistantChat() {
  const [messages, setMessages] = useState<{ role: 'user' | 'assistant'; content: string }[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const send = async () => {
    if (!input.trim() || loading) return;
    const next = [...messages, { role: 'user' as const, content: input }];
    setMessages(next);
    setInput('');
    setLoading(true);
    try {
      const data = await askAssistant(next);
      const content = data?.content ?? (typeof data === 'string' ? data : JSON.stringify(data));
      setMessages(m => [...m, { role: 'assistant', content }]);
    } catch (e: any) {
      const msg = e?.message || e?.toString?.() || 'Unknown error';
      setMessages(m => [...m, { role: 'assistant', content: `Sorry, something went wrong. ${msg}` }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Stack spacing={2} sx={{ p: 2 }}>
      <Typography variant="h5">Assistant</Typography>
      <Paper variant="outlined" sx={{ p: 2, height: 400, overflowY: 'auto' }}>
        <Stack spacing={1}>
          {messages.map((m, i) => (
            <Box key={i} sx={{ textAlign: m.role === 'user' ? 'right' : 'left' }}>
              <Typography variant="body2" color="text.secondary">{m.role}</Typography>
              <Typography variant="body1" component="div">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.content}</ReactMarkdown>
              </Typography>
            </Box>
          ))}
          <div ref={bottomRef} />
        </Stack>
      </Paper>
      <Stack direction="row" spacing={1}>
        <TextField fullWidth size="small" value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') send(); }} placeholder="Ask the CRM assistant..." />
        <Button variant="contained" onClick={send} disabled={loading}>Send</Button>
      </Stack>
    </Stack>
  );
}
