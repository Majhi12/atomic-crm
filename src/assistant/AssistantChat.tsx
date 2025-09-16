import { useEffect, useRef, useState } from 'react';
import { Box, Button, Chip, Paper, Stack, TextField, ToggleButton, ToggleButtonGroup, Typography, Alert, Menu, MenuItem, Dialog, DialogTitle, DialogContent, DialogActions, List, ListItemButton, ListItemText, CircularProgress } from '@mui/material';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { askAssistant } from './askAssistant';
import { useAssistantContext } from './AssistantContext';
import { useAssistantStore, AssistantMessage, AssistantState } from './AssistantStore';
import { supabase } from '../providers/supabase/supabase';

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
  const [fieldDialog, setFieldDialog] = useState<{ open: boolean; label: string; type: 'text'|'email'|'tel'; phrasePrefix: string; value: string }>({ open: false, label: '', type: 'text', phrasePrefix: '', value: '' });
  const [companyDialog, setCompanyDialog] = useState<{ open: boolean; kind: 'company'|'vendor'|'contact'|'deal'; query: string; results: Array<{ id: number; name: string }>; loading: boolean }>({ open: false, kind: 'company', query: '', results: [], loading: false });
  const [dealKindToggle, setDealKindToggle] = useState<'sales'|'procurement'>(() => (mode === 'procurement' ? 'procurement' : 'sales'));
  const [costOpen, setCostOpen] = useState(false);
  const [costValue, setCostValue] = useState('');
  
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
        const askText = lastAssistant!.content.toLowerCase();
        const isContactAsk = askText.includes('create a contact') || (askText.includes('first name') && askText.includes('last name') && askText.includes('email'));
        const isDealAsk = askText.includes('create a deal') || askText.includes('title and company') || askText.includes('company?') || askText.includes('vendor');
        const isStageAsk = askText.includes('stage');
        const isUpdateStageAsk = askText.includes('move') && askText.includes('deal') && askText.includes('stage');
        const isNoteAsk = askText.includes('attach the note') || (askText.includes('note') && askText.includes('entity'));
        return (
          <Stack direction="row" spacing={1} flexWrap="wrap">
            <Chip label="Sales" size="small" onClick={() => sendText('Sales')} />
            <Chip label="Procurement" size="small" onClick={() => sendText('Procurement')} />
            {(isDealAsk || isStageAsk || isUpdateStageAsk) && (
              <Chip label="Pick Stage" size="small" onClick={(e) => setStageAnchorEl(e.currentTarget)} />
            )}
            <Chip label="Set Amount" size="small" onClick={() => { setAmountValue(''); setAmountOpen(true); }} />
            {(isDealAsk || mode === 'procurement') && (
              <Chip label="Set Cost" size="small" onClick={() => { setCostValue(''); setCostOpen(true); }} />
            )}
            {isDealAsk && (
              <>
                <Chip label="Deal Title" size="small" onClick={() => setFieldDialog({ open: true, label: 'Deal title', type: 'text', phrasePrefix: 'Title is', value: '' })} />
                <Chip label={`Deal kind: ${dealKindToggle === 'sales' ? 'Sales' : 'Procurement'}`} size="small" onClick={() => {
                  const next = dealKindToggle === 'sales' ? 'procurement' : 'sales';
                  setDealKindToggle(next);
                  sendText(`Deal kind is ${next}`);
                }} />
              </>
            )}
            {isContactAsk && (
              <>
                <Chip label="First name" size="small" onClick={() => setFieldDialog({ open: true, label: 'First name', type: 'text', phrasePrefix: 'First name is', value: '' })} />
                <Chip label="Last name" size="small" onClick={() => setFieldDialog({ open: true, label: 'Last name', type: 'text', phrasePrefix: 'Last name is', value: '' })} />
                <Chip label="Email" size="small" onClick={() => setFieldDialog({ open: true, label: 'Email', type: 'email', phrasePrefix: 'Email is', value: '' })} />
                <Chip label="Phone" size="small" onClick={() => setFieldDialog({ open: true, label: 'Phone', type: 'tel', phrasePrefix: 'Phone is', value: '' })} />
                <Chip label="Assign Company" size="small" onClick={() => setCompanyDialog({ open: true, kind: 'company', query: '', results: [], loading: false })} />
              </>
            )}
            {isDealAsk && (
              <>
                <Chip label="Pick Company" size="small" onClick={() => setCompanyDialog({ open: true, kind: 'company', query: '', results: [], loading: false })} />
                <Chip label="Pick Vendor" size="small" onClick={() => setCompanyDialog({ open: true, kind: 'vendor', query: '', results: [], loading: false })} />
                <Chip label="Pick Contact" size="small" onClick={() => setCompanyDialog({ open: true, kind: 'contact', query: '', results: [], loading: false })} />
              </>
            )}
            {isUpdateStageAsk && (
              <Chip label="Pick Deal" size="small" onClick={() => setCompanyDialog({ open: true, kind: 'deal', query: '', results: [], loading: false })} />
            )}
            {isNoteAsk && (
              <>
                <Chip label="Attach: Contact" size="small" onClick={() => setCompanyDialog({ open: true, kind: 'contact', query: '', results: [], loading: false })} />
                <Chip label="Attach: Company" size="small" onClick={() => setCompanyDialog({ open: true, kind: 'company', query: '', results: [], loading: false })} />
                <Chip label="Attach: Deal" size="small" onClick={() => setCompanyDialog({ open: true, kind: 'deal', query: '', results: [], loading: false })} />
                <Chip label="Note Text" size="small" onClick={() => setFieldDialog({ open: true, label: 'Note text', type: 'text', phrasePrefix: 'Note is', value: '' })} />
              </>
            )}
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
            <Dialog open={fieldDialog.open} onClose={() => setFieldDialog(s => ({ ...s, open: false }))}>
              <DialogTitle>Set {fieldDialog.label}</DialogTitle>
              <DialogContent>
                <TextField
                  autoFocus
                  margin="dense"
                  label={fieldDialog.label}
                  type={fieldDialog.type}
                  fullWidth
                  value={fieldDialog.value}
                  onChange={(e) => setFieldDialog(s => ({ ...s, value: e.target.value }))}
                />
              </DialogContent>
              <DialogActions>
                <Button onClick={() => setFieldDialog(s => ({ ...s, open: false }))}>Cancel</Button>
                <Button variant="contained" onClick={() => {
                  const v = fieldDialog.value.trim();
                  if (v) {
                    setFieldDialog(s => ({ ...s, open: false }));
                    sendText(`${fieldDialog.phrasePrefix} ${v}`);
                  } else {
                    setFieldDialog(s => ({ ...s, open: false }));
                  }
                }}>OK</Button>
              </DialogActions>
            </Dialog>
            <Dialog open={companyDialog.open} onClose={() => setCompanyDialog(s => ({ ...s, open: false }))} fullWidth maxWidth="sm">
              <DialogTitle>
                {companyDialog.kind === 'company' && 'Pick Company'}
                {companyDialog.kind === 'vendor' && 'Pick Vendor'}
                {companyDialog.kind === 'contact' && 'Pick Contact'}
                {companyDialog.kind === 'deal' && 'Pick Deal'}
              </DialogTitle>
              <DialogContent>
                <TextField
                  autoFocus
                  margin="dense"
                  label={companyDialog.kind === 'contact' ? 'Search contacts' : companyDialog.kind === 'deal' ? 'Search deals' : 'Search companies'}
                  type="text"
                  fullWidth
                  value={companyDialog.query}
                  onChange={async (e) => {
                    const q = e.target.value;
                    setCompanyDialog(s => ({ ...s, query: q, loading: true }));
                    if (!q.trim()) {
                      setCompanyDialog(s => ({ ...s, results: [], loading: false }));
                      return;
                    }
                    if (companyDialog.kind === 'contact') {
                      const { data, error: _err } = await supabase
                        .from('contacts_summary')
                        .select('id, first_name, last_name, email')
                        .or(`first_name.ilike.%${q}%,last_name.ilike.%${q}%,email.ilike.%${q}%`)
                        .limit(15);
                      const results = (data || []).map((c: any) => ({ id: c.id, name: `${c.first_name} ${c.last_name}${c.email ? ` (${c.email})` : ''}` }));
                      setCompanyDialog(s => ({ ...s, results, loading: false }));
                    } else if (companyDialog.kind === 'deal') {
                      const { data, error: _err } = await supabase
                        .from('deals')
                        .select('id, title, deal_kind')
                        .ilike('title', `%${q}%`)
                        .limit(15);
                      const results = (data || []).map((d: any) => ({ id: d.id, name: `${d.title}${d.deal_kind ? ` [${d.deal_kind}]` : ''}` }));
                      setCompanyDialog(s => ({ ...s, results, loading: false }));
                    } else {
                      const { data, error: _err } = await supabase
                        .from('companies')
                        .select('id,name')
                        .ilike('name', `%${q}%`)
                        .limit(15);
                      setCompanyDialog(s => ({ ...s, results: data || [], loading: false }));
                    }
                  }}
                />
                {companyDialog.loading ? (
                  <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
                    <CircularProgress size={20} />
                  </Box>
                ) : (
                  <List dense>
                    {companyDialog.results.map((c) => (
                      <ListItemButton key={c.id} onClick={() => {
                        let phrase = '';
                        if (companyDialog.kind === 'company') phrase = `company_id is ${c.id}`;
                        if (companyDialog.kind === 'vendor') phrase = `vendor_company_id is ${c.id}`;
                        if (companyDialog.kind === 'contact') phrase = `contact_id is ${c.id}`;
                        if (companyDialog.kind === 'deal') phrase = `deal_id is ${c.id}`;
                        setCompanyDialog(s => ({ ...s, open: false }));
                        sendText(phrase);
                      }}>
                        <ListItemText primary={c.name} secondary={`ID ${c.id}`} />
                      </ListItemButton>
                    ))}
                  </List>
                )}
              </DialogContent>
              <DialogActions>
                <Button onClick={() => setCompanyDialog(s => ({ ...s, open: false }))}>Close</Button>
              </DialogActions>
            </Dialog>
            <Dialog open={costOpen} onClose={() => setCostOpen(false)}>
              <DialogTitle>Set Cost/Budget</DialogTitle>
              <DialogContent>
                <TextField
                  autoFocus
                  margin="dense"
                  label="Cost"
                  type="number"
                  fullWidth
                  value={costValue}
                  onChange={(e) => setCostValue(e.target.value)}
                />
              </DialogContent>
              <DialogActions>
                <Button onClick={() => setCostOpen(false)}>Cancel</Button>
                <Button onClick={() => {
                  const v = parseFloat(costValue);
                  if (!isNaN(v) && isFinite(v)) {
                    setCostOpen(false);
                    sendText(`Cost is ${v}`);
                  } else {
                    setCostOpen(false);
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
