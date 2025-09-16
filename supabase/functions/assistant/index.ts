// @ts-nocheck
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import OpenAI from "https://esm.sh/openai@4.56.0";
import { z } from "https://deno.land/x/zod@v3.23.8/mod.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const apiKey = Deno.env.get('OPENAI_API_KEY');
const tavilyKey = Deno.env.get('TAVILY_API_KEY');
const openai = new OpenAI({ apiKey: apiKey ?? '' });

serve(async (req) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  } as const;

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (!apiKey) {
    return new Response('OPENAI_API_KEY is not set', { status: 500, headers: corsHeaders });
  }
  const authHeader = req.headers.get('Authorization') || '';
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? Deno.env.get("PROJECT_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SERVICE_ROLE_KEY")!,
    { global: { headers: { Authorization: authHeader } } }
  );
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) return new Response('Unauthorized', { status: 401, headers: corsHeaders });

  const body = await req.json();
  const { messages } = body as { messages: Array<{role:"user"|"assistant"|"system"; content:string}> };

  const tools = [
    { type: "function", function: { name: "search_contacts", description: "Full-text search contacts by name/email/company.", parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"] } } },
  { type: "function", function: { name: "create_contact", description: "Create a new contact (gracefully accepts minimal details).", parameters: { type: "object", properties: { first_name: { type: "string", nullable: true }, last_name: { type: "string", nullable: true }, email: { type: "string", nullable: true }, phone: { type: "string", nullable: true }, company_id: { type: "number", nullable: true }, company_name: { type: "string", nullable: true }, notes: { type: "string", nullable: true } }, required: [] } } },
    { type: "function", function: { name: "add_note", description: "Attach a note to a contact/company/deal.", parameters: { type: "object", properties: { entity_type: { enum: ["contact","company","deal"] }, entity_id: { type: "number" }, text: { type: "string" } }, required: ["entity_type","entity_id","text"] } } },
    { type: "function", function: { name: "search_notes", description: "Search notes by text and/or entity filter.", parameters: { type: "object", properties: { query: { type: "string", nullable: true }, entity_type: { enum: ["contact","company","deal"], nullable: true }, entity_id: { type: "number", nullable: true } }, required: [] } } },
    { type: "function", function: { name: "create_deal", description: "Create a new deal/opportunity (sales or procurement).",
      parameters: { type: "object", properties: {
        title: { type: "string" },
        deal_kind: { enum: ["sales","procurement","partnership"], nullable: true },
        company_id: { type: "number" },
        vendor_company_id: { type: "number", nullable: true },
        contact_id: { type: "number", nullable: true },
        amount: { type: "number", nullable: true },
        cost: { type: "number", nullable: true },
        stage: { type: "string", nullable: true }
      }, required: ["title","company_id"] }
    } },
    { type: "function", function: { name: "update_deal_stage", description: "Move a deal to a new pipeline stage.", parameters: { type: "object", properties: { deal_id: { type: "number" }, stage: { type: "string" } }, required: ["deal_id","stage"] } } },
    { type: "function", function: { name: "pipeline_summary", description: "Summarize pipeline value and counts for advice.", parameters: { type: "object", properties: { kind: { enum: ["sales","procurement","partnership"], nullable: true }, time_window: { type: "string", nullable: true } }, required: [] } } },
    { type: "function", function: { name: "suggest_followup_email", description: "Draft a concise follow-up email using recent notes and current stage.", parameters: { type: "object", properties: { entity_type: { enum: ["contact","company","deal"] }, entity_id: { type: "number" } }, required: ["entity_type","entity_id"] } } }
  ] as any[];

  if (tavilyKey) {
    tools.push({
      type: "function",
      function: {
        name: "web_search",
        description: "Search the web for leads or info (companies, contacts, roles, industries). Use when data may not exist in CRM.",
        parameters: {
          type: "object",
          properties: {
            query: { type: "string" },
            max_results: { type: "number", nullable: true }
          },
          required: ["query"]
        }
      }
    });
  }

  const sys = {
    role: 'system' as const,
    content:
      [
  'You are the in-app CRM assistant. Format responses as concise Markdown with short headings, bullet lists, and proper [links](https://example.com).',
        '- Ask clarifying questions when queries are ambiguous (e.g., geography, industry, role).',
        '- Before any WRITE (create contact, add note, create deal, update stage), briefly confirm intent and required fields if missing. Ask one short question, then wait.',
        '- When you need missing details, start your message with "[ASK] Need more info:" followed by one short question. Then wait for the user to reply.',
        '- When you must confirm before a write, start with "[ASK] Confirm to proceed?" then summarize the action in one sentence and wait for Yes/No.',
        '- When searching for new leads not in the CRM, use web_search (if available), summarize findings, and propose which to add as contacts.',
        '- For CRM queries (find contacts, notes, deals), prefer CRM tools first.',
        '- Suggest deal creation when user intent implies an opportunity; ask for amount/budget, counterpart, and desired stage if missing.',
        '- Keep answers concise, then offer next actions as options.',
        'Deals can be sales (revenue) or procurement (spend). Choose the kind based on user wording. Sales stages: Lead→Qualified→Proposal→Won/Lost. Procurement stages: Sourcing→RFQ→Negotiation→Ordered→Received. Use tools for database actions; be concise; ask one brief clarifying question if needed.',
      ].join(' '),
  };

  const history: Array<any> = [sys, ...messages];

  async function getCurrentSalesId() {
    const me = await supabase.from('sales').select('id').eq('user_id', user.id).maybeSingle();
    return me.data?.id as number | undefined;
  }

  async function upsertCompanyByName(name: string) {
    const existing = await supabase.from('companies').select('id').ilike('name', name).maybeSingle();
    if (existing.data?.id) return existing.data.id as number;
    const inserted = await supabase.from('companies').insert({ name }).select('id').single();
    if (inserted.error) throw inserted.error;
    return inserted.data.id as number;
  }

  const CreateContact = z.object({
    first_name: z.string().trim().optional(),
    last_name: z.string().trim().optional(),
    email: z.string().trim().email().optional(),
    phone: z.string().trim().min(5).optional(),
    company_id: z.number().optional(),
    company_name: z.string().trim().optional(),
    notes: z.string().optional(),
  }).refine(v => (v.first_name || v.last_name || v.company_name) && (v.email || v.phone), {
    message: 'Provide at least a name/company and one of email or phone.'
  });
  let turns = 0;
  while (turns < 3) {
    const chat = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: history as any,
      tools: tools as any
    });

    const msg = chat.choices[0].message as any;
    const toolCall = msg.tool_calls?.[0];
    if (!toolCall) {
      return new Response(JSON.stringify(msg), { headers: { ...corsHeaders, "Content-Type": "application/json" }});
    }

    const args = JSON.parse(toolCall.function.arguments || "{}");
    let toolResult: unknown;
    switch (toolCall.function.name) {
      case 'search_contacts': {
        const q = String(args.query || '').trim();
        if (!q) { toolResult = { error: 'query required' }; break; }
        // Basic search on first_name/last_name/email_fts
        const res = await supabase
          .from('contacts_summary')
          .select('id, first_name, last_name, email_jsonb, company_id, company_name')
          .or(`first_name.ilike.%${q}%,last_name.ilike.%${q}%,email_fts.ilike.%${q}%`)
          .limit(25);
        toolResult = res;
        break; }
      case 'search_notes': {
        const q = String(args.query || '').trim();
        const et = args.entity_type ? String(args.entity_type) : undefined;
        const eid = args.entity_id ? Number(args.entity_id) : undefined;
        if (!q && !et && !eid) { toolResult = { error: 'provide query or entity filter' }; break; }
        let query = supabase
          .from('notes')
          .select('id, entity_type, entity_id, text, created_at')
          .order('created_at', { ascending: false })
          .limit(50);
        if (q) query = query.ilike('text', `%${q}%`);
        if (et) query = query.eq('entity_type', et);
        if (eid) query = query.eq('entity_id', eid);
        toolResult = await query;
        break; }
      case 'create_contact': {
        try {
          const parsed = CreateContact.parse({
            first_name: args.first_name,
            last_name: args.last_name,
            email: args.email,
            phone: args.phone,
            company_id: args.company_id,
            company_name: args.company_name,
            notes: args.notes,
          });
          let companyId = parsed.company_id;
          if (!companyId && parsed.company_name) {
            companyId = await upsertCompanyByName(parsed.company_name);
          }
          const first = parsed.first_name ?? 'Vendor';
          const last  = parsed.last_name  ?? 'Contact';
          const salesId = await getCurrentSalesId();
          const res = await supabase.from('contacts').insert({
            first_name: first,
            last_name: last,
            email_jsonb: parsed.email ? [{ email: parsed.email, type: 'Other' }] : null,
            phone_jsonb: parsed.phone ? [{ number: parsed.phone, type: 'Other' }] : null,
            company_id: companyId ?? null,
            sales_id: salesId ?? null,
          }).select().single();
          if (res.error) { toolResult = res; break; }
          // Optional: attach note to contact using contactNotes table
          if (parsed.notes) {
            const salesId2 = salesId ?? await getCurrentSalesId();
            await supabase.from('contactNotes').insert({
              contact_id: res.data.id,
              text: parsed.notes,
              sales_id: salesId2 ?? null,
            });
          }
          toolResult = { created: res.data };
        } catch (e) {
          toolResult = { needs_more: true, ask: '[ASK] Need more info: Provide at least a name/company and one of email or phone.' };
        }
        break; }
      case 'add_note':
        if (!args?.entity_type || !args?.entity_id || !String(args?.text || '').trim()) {
          toolResult = { ask: 'Which entity should I attach the note to (contact or deal and its id)? What should the note say?' };
          break;
        }
        if (args.entity_type === 'contact') {
          const salesId = await getCurrentSalesId();
          toolResult = await supabase.from('contactNotes').insert({
            contact_id: args.entity_id,
            text: args.text,
            sales_id: salesId ?? null,
          }).select().single();
        } else if (args.entity_type === 'deal') {
          const salesId = await getCurrentSalesId();
          toolResult = await supabase.from('dealNotes').insert({
            deal_id: args.entity_id,
            text: args.text,
            sales_id: salesId ?? null,
          }).select().single();
        } else {
          toolResult = { ask: 'Company notes are not supported. Attach note to a related contact or deal instead.' };
        }
        break;
      case 'create_deal': {
        const deal_kind = String(args.deal_kind || 'sales');
        let stage = args.stage ? String(args.stage) : undefined;
        if (!args?.title || !args?.company_id) {
          toolResult = { ask: 'To create a deal, what is the title and company? Is this sales or procurement, and any amount/budget?' };
          break;
        }
        if (!stage) {
          // pick first stage for kind
          const st = await supabase
            .from('deal_stage_sets')
            .select('stage, position')
            .eq('deal_kind', deal_kind)
            .order('position', { ascending: true })
            .limit(1)
            .maybeSingle();
          stage = st.data?.stage || (deal_kind === 'procurement' ? 'Sourcing' : 'Lead');
        }
        const payload: any = {
          name:       args.title,
          deal_kind,
          company_id: args.company_id,
          vendor_company_id: args.vendor_company_id ?? null,
          contact_id: args.contact_id ?? null,
          amount:     args.amount ?? null,
          cost:       args.cost ?? null,
          stage,
          // sales_id: optional, inferred via triggers/UI elsewhere
        };
        toolResult = await supabase.from('deals').insert(payload).select().single();
        break; }
      case 'update_deal_stage': {
        if (!args?.deal_id || !args?.stage) {
          toolResult = { ask: 'Which deal (id) should I move and to what stage?' };
          break;
        }
        toolResult = await supabase
          .from('deals')
          .update({ stage: args.stage })
          .eq('id', args.deal_id)
          .select().single();
        break; }
      case 'pipeline_summary': {
        const kind = args.kind ? String(args.kind) : undefined;
        const tw = String(args.time_window || 'month');
        const now = new Date();
        const start = new Date(now.getFullYear(), now.getMonth(), 1);
        const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
        // fetch deals in window
        let q = supabase
          .from('deals')
          .select('id, deal_kind, amount, cost, stage, created_at')
          .gte('created_at', start.toISOString())
          .lt('created_at', end.toISOString())
          .limit(1000);
        if (kind) q = q.eq('deal_kind', kind);
        const resp = await q;
        if (resp.error) { toolResult = resp; break; }
        const rows = resp.data || [];
        const agg: Record<string, { count: number; total_amount: number; total_cost: number }> = {};
        for (const r of rows) {
          const k = r.deal_kind || 'unknown';
          if (!agg[k]) agg[k] = { count: 0, total_amount: 0, total_cost: 0 };
          agg[k].count += 1;
          agg[k].total_amount += Number(r.amount || 0);
          agg[k].total_cost += Number(r.cost || 0);
        }
        toolResult = { window: tw, by_kind: agg };
        break; }
      case 'suggest_followup_email': {
        const et = String(args.entity_type);
        const eid = Number(args.entity_id);
        // Fetch last few notes from appropriate table
        let notes: any = { data: [] };
        if (et === 'deal') {
          notes = await supabase
            .from('dealNotes')
            .select('text, date')
            .eq('deal_id', eid)
            .order('date', { ascending: false })
            .limit(5);
        } else if (et === 'contact') {
          notes = await supabase
            .from('contactNotes')
            .select('text, date')
            .eq('contact_id', eid)
            .order('date', { ascending: false })
            .limit(5);
        }
        let stageInfo = '';
        if (et === 'deal') {
          const d = await supabase.from('deals').select('title, stage, deal_kind').eq('id', eid).maybeSingle();
          if (d.data) stageInfo = `Deal: ${d.data.title} | Kind: ${d.data.deal_kind} | Stage: ${d.data.stage}`;
        }
        const context = [
          stageInfo,
          'Recent notes:',
          ...(notes.data?.map((n: any) => `- ${n.text}`) || [])
        ].filter(Boolean).join('\n');

        const draft = await openai.chat.completions.create({
          model: 'gpt-4o-mini',
          messages: [
            { role: 'system', content: 'Write a concise 4-6 sentence professional follow-up email with a clear CTA. Return only the email body, no preface.' },
            { role: 'user', content: `Context:\n${context}\n\nDraft the follow-up email:` }
          ]
        });
        toolResult = { draft: draft.choices[0]?.message?.content || '' };
        break; }
      case 'web_search': {
        if (!tavilyKey) { toolResult = { error: 'web_search unavailable' }; break; }
        const body = {
          api_key: tavilyKey,
          query: String(args.query || ''),
          max_results: Number(args.max_results ?? 5),
        };
        const resp = await fetch('https://api.tavily.com/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });
        const json = await resp.json();
        // Return a simplified set
        toolResult = {
          results: (json?.results || []).slice(0, body.max_results).map((r: any) => ({
            title: r.title,
            url: r.url,
            snippet: r.content || r.snippet || ''
          }))
        };
        break; }
      default:
        toolResult = { error: `Unknown tool ${toolCall.function.name}` };
    }

    history.push(msg);
    history.push({
      role: 'tool',
      tool_call_id: toolCall.id,
      content: JSON.stringify(toolResult)
    });
    turns += 1;
  }

  return new Response(JSON.stringify({ role: 'assistant', content: 'Let’s continue — what should I do next?' }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" }
  });
});
// ci: auto-deploy trigger (noop change)
