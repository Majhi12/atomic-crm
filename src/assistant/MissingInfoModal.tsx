import { Dialog, DialogTitle, DialogContent, DialogActions, TextField, Button, Stack } from '@mui/material';
import { useState, useEffect } from 'react';

export default function MissingInfoModal({ open, initial, onCancel, onConfirm }: {
  open: boolean;
  initial: { company_name?: string; email?: string; phone?: string };
  onCancel: () => void;
  onConfirm: (vals: { company_name?: string; email?: string; phone?: string }) => void;
}) {
  const [company, setCompany] = useState(initial?.company_name || '');
  const [email, setEmail] = useState(initial?.email || '');
  const [phone, setPhone] = useState(initial?.phone || '');

  useEffect(() => {
    setCompany(initial?.company_name || '');
    setEmail(initial?.email || '');
    setPhone(initial?.phone || '');
  }, [open, initial?.company_name, initial?.email, initial?.phone]);

  return (
    <Dialog open={open} onClose={onCancel} fullWidth maxWidth="sm">
      <DialogTitle>Provide missing info</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <TextField label="Company name" value={company} onChange={(e)=>setCompany(e.target.value)} fullWidth />
          <TextField label="Email" type="email" value={email} onChange={(e)=>setEmail(e.target.value)} fullWidth />
          <TextField label="Phone" type="tel" value={phone} onChange={(e)=>setPhone(e.target.value)} fullWidth />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel}>Cancel</Button>
        <Button variant="contained" onClick={()=> onConfirm({ company_name: company, email, phone })}>Continue</Button>
      </DialogActions>
    </Dialog>
  );
}
