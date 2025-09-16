import { useEffect, useRef, useState } from 'react';
import { Box, Button, Chip, Paper, Stack, TextField, ToggleButton, ToggleButtonGroup, Typography, Alert, Menu, MenuItem, Dialog, DialogTitle, DialogContent, DialogActions } from '@mui/material';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { askAssistant } from './askAssistant';
import { useAssistantContext } from './AssistantContext';
import { useAssistantStore, AssistantMessage, AssistantState } from './AssistantStore';

export default function AssistantChat() {
  const messages = useAssistantStore((s: AssistantState) => s.messages);
  const setMessages = useAssistantStore((s: AssistantState) => s.setMessages);
  const addMessage = useAssistantStore((s: AssistantState) => s.addMessage);
  const clear = useAssistantStore((s: AssistantState) => s.clear);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const { mode, setMode, scope } = useAssistantContext();
  const [stageAnchorEl, setStageAnchorEl] = useState<null | HTMLElement>(null);
  const [amountOpen, setAmountOpen] = useState(false);
  const [amountValue, setAmountValue] = useState('');
  
  const sendText = async (text: string) => {
    if (!text.trim() || loading) return;
    const next = [...messages, { role: 'user' as const, content: text }];
    setMessages(next);
    setLoading(true);
    try {
      const contextMsg = {
        role: 'system' as const,
        content: `Context: assistant_mode=${mode}; app_scope=${scope}. If creating or updating deals, default deal_kind to the selected mode when it makes sense. Prefer concise Markdown in replies.`,
      };
      const data = await askAssistant(messages.length === 0 ? [contextMsg, ...next] : next);
      const content = data?.content ?? (typeof data === 'string' ? data : JSON.stringify(data));
      addMessage({ role: 'assistant', content });
    } catch (e: any) {
      const msg = e?.message || e?.toString?.() || 'Unknown error';
      addMessage({ role: 'assistant', content: `Sorry, something went wrong. ${msg}` });
    } finally {
      setLoading(false);
    }
  };

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
      const contextMsg = {
        role: 'system' as const,
        content: `Context: assistant_mode=${mode}; app_scope=${scope}. If creating or updating deals, default deal_kind to the selected mode when it makes sense. Prefer concise Markdown in replies.`,
      };
      const data = await askAssistant(messages.length === 0 ? [contextMsg, ...next] : next);
      const content = data?.content ?? (typeof data === 'string' ? data : JSON.stringify(data));
      addMessage({ role: 'assistant', content });
    } catch (e: any) {
      const msg = e?.message || e?.toString?.() || 'Unknown error';
      addMessage({ role: 'assistant', content: `Sorry, something went wrong. ${msg}` });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Stack spacing={2} sx={{ p: 2 }}>
      <Stack direction="row" alignItems="center" spacing={2}>
        <Typography variant="h5" sx={{ flexGrow: 1 }}>Assistant</Typography>
        <ToggleButtonGroup size="small" value={mode} exclusive onChange={(_, v) => v && setMode(v)}>
          <ToggleButton value="auto">Auto</ToggleButton>
          <ToggleButton value="sales">Sales</ToggleButton>
          <ToggleButton value="procurement">Procurement</ToggleButton>
        </ToggleButtonGroup>
      </Stack>
      <Paper variant="outlined" sx={{ p: 2, height: 400, overflowY: 'auto' }}>
        <Stack spacing={1}>
          {messages.map((m: AssistantMessage, i: number) => {
            const isAsk = m.role === 'assistant' && m.content.trim().startsWith('[ASK]');
            const isConfirm = isAsk && /\bConfirm to proceed\?/i.test(m.content);
            return (
              <Box key={i} sx={{ textAlign: m.role === 'user' ? 'right' : 'left' }}>
                <Typography variant="body2" color="text.secondary">{m.role}</Typography>
                {isAsk ? (
                  <Alert severity="info" variant="outlined" sx={{ display: 'inline-block', textAlign: 'left' }}>
                    <Typography variant="subtitle2" sx={{ mb: 0.5 }}>{isConfirm ? 'Confirm Action' : 'Need more info'}</Typography>
                    <Typography variant="body2" sx={{ mb: 1 }}>
                      {m.content.replace(/^\[ASK\]\s*/,'')}
                    </Typography>
                    {isConfirm && (
                      <Stack direction="row" spacing={1}>
                        <Button size="small" variant="contained" disabled={loading} onClick={() => sendText('Yes')}>Approve</Button>
                        <Button size="small" variant="outlined" disabled={loading} onClick={() => sendText('No')}>Skip</Button>
                      </Stack>
                    )}
                  </Alert>
                ) : (
                  <Typography variant="body1" component="div">
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      components={{
                        a: ({node, children, ...props}) => (
                          <a {...props} target="_blank" rel="noopener noreferrer">{children}</a>
                        ),
                      }}
                    >
                      {m.content}
                    </ReactMarkdown>
                  </Typography>
                )}
              </Box>
            );
          })}
          {loading && (
            <Typography variant="body2" color="text.secondary">Assistant is typing…</Typography>
          )}
          <div ref={bottomRef} />
        </Stack>
      </Paper>
      {/* Quick-fill chips for common asks */}
      {(() => {
        const lastAssistant = [...messages].reverse().find(m => m.role === 'assistant');
        const isAsk = !!lastAssistant && lastAssistant.content.trim().startsWith('[ASK]');
        const isConfirm = isAsk && /\bConfirm to proceed\?/i.test(lastAssistant!.content);
        if (!isAsk || isConfirm) return null;
        const salesStages = ['Lead','Qualified','Proposal','Won','Lost'];
        const procurementStages = ['Sourcing','RFQ','Negotiation','Ordered','Received'];
        const stages = mode === 'procurement' ? procurementStages : mode === 'sales' ? salesStages : [];
        return (
          <Stack direction="row" spacing={1} flexWrap="wrap">
            <Chip label="Sales" size="small" onClick={() => sendText('Sales')} />
            <Chip label="Procurement" size="small" onClick={() => sendText('Procurement')} />
            <Chip label="Pick Stage" size="small" onClick={(e) => setStageAnchorEl(e.currentTarget)} />
            <Chip label="Set Amount" size="small" onClick={() => { setAmountValue(''); setAmountOpen(true); }} />
            <Menu anchorEl={stageAnchorEl} open={!!stageAnchorEl} onClose={() => setStageAnchorEl(null)}>
              {mode === 'auto' && (
                <>
                  <MenuItem disabled>Sales Stages</MenuItem>
                  {salesStages.map(s => (<MenuItem key={`s-${s}`} onClick={() => { setStageAnchorEl(null); sendText(s); }}>{s}</MenuItem>))}
                  <MenuItem disabled>Procurement Stages</MenuItem>
                  {procurementStages.map(s => (<MenuItem key={`p-${s}`} onClick={() => { setStageAnchorEl(null); sendText(s); }}>{s}</MenuItem>))}
                </>
              )}
              {mode !== 'auto' && stages.map(s => (
                <MenuItem key={s} onClick={() => { setStageAnchorEl(null); sendText(s); }}>{s}</MenuItem>
              ))}
            </Menu>
            <Dialog open={amountOpen} onClose={() => setAmountOpen(false)}>
              <DialogTitle>Set Amount/Budget</DialogTitle>
              <DialogContent>
                <TextField
                  autoFocus
                  margin="dense"
                  label="Amount"
                  type="number"
                  fullWidth
                  value={amountValue}
                  onChange={(e) => setAmountValue(e.target.value)}
                />
              </DialogContent>
              <DialogActions>
                <Button onClick={() => setAmountOpen(false)}>Cancel</Button>
                <Button onClick={() => {
                  const v = parseFloat(amountValue);
                  if (!isNaN(v) && isFinite(v)) {
                    setAmountOpen(false);
                    sendText(`Amount is ${v}`);
                  } else {
                    setAmountOpen(false);
                  }
                }} variant="contained">OK</Button>
              </DialogActions>
            </Dialog>
          </Stack>
        );
      })()}
      <Stack direction="row" spacing={1} flexWrap="wrap">
        <Chip label="Summarize my pipeline" onClick={() => setInput('Summarize my pipeline this month.')} size="small" />
        <Chip label="Find contacts at ACME" onClick={() => setInput('Find relevant contacts at ACME and suggest next steps.')} size="small" />
        <Chip label="Draft follow-up email" onClick={() => setInput('Draft a follow-up email for my last note on the current deal.')} size="small" />
      </Stack>
      <Stack direction="row" spacing={1}>
        <TextField fullWidth size="small" value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') send(); }} placeholder="Ask the CRM assistant..." />
        <Button variant="outlined" onClick={() => clear()} disabled={loading}>Clear</Button>
        <Button variant="contained" onClick={send} disabled={loading}>Send</Button>
      </Stack>
    </Stack>
  );
}
