// @ts-nocheck
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import OpenAI from "https://esm.sh/openai@4.56.0";
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
    { type: "function", function: { name: "create_contact", description: "Create a new contact.", parameters: { type: "object", properties: { first_name: { type: "string" }, last_name: { type: "string" }, email: { type: "string" }, phone: { type: "string", nullable: true }, company_id: { type: "number", nullable: true } }, required: ["first_name","last_name","email"] } } },
    { type: "function", function: { name: "add_note", description: "Attach a note to a contact/company/deal.", parameters: { type: "object", properties: { entity_type: { enum: ["contact","company","deal"] }, entity_id: { type: "number" }, text: { type: "string" } }, required: ["entity_type","entity_id","text"] } } },
    { type: "function", function: { name: "create_deal", description: "Create a new deal/opportunity.", parameters: { type: "object", properties: { title: { type: "string" }, company_id: { type: "number" }, contact_id: { type: "number", nullable: true }, amount: { type: "number", nullable: true }, stage: { type: "string", nullable: true } }, required: ["title","company_id"] } } },
    { type: "function", function: { name: "update_deal_stage", description: "Move a deal to a new pipeline stage.", parameters: { type: "object", properties: { deal_id: { type: "number" }, stage: { type: "string" } }, required: ["deal_id","stage"] } } },
    { type: "function", function: { name: "pipeline_summary", description: "Summarize pipeline value and counts for advice.", parameters: { type: "object", properties: { time_window: { type: "string", nullable: true } }, required: [] } } }
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
        'You are the in-app CRM assistant.',
        '- Ask clarifying questions when queries are ambiguous (e.g., geography, industry, role).',
        '- When you are about to WRITE data (create contact, add note, create deal, update stage), propose the plan and ask the user to confirm before executing.',
        '- When searching for new leads not in the CRM, use web_search (if available), summarize findings, and propose which to add as contacts.',
        '- For CRM queries (find contacts, notes, deals), prefer CRM tools first.',
        '- Suggest deal creation when user intent implies an opportunity; ask for amount/stage if missing.',
        '- Keep answers concise, then offer next actions as options.',
      ].join(' '),
  };

  const history: Array<any> = [sys, ...messages];
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
        // Basic search on first_name/last_name/email
        const res = await supabase
          .from('contacts_summary')
          .select('id, first_name, last_name, email, company_id')
          .or(`first_name.ilike.%${q}%,last_name.ilike.%${q}%,email.ilike.%${q}%`)
          .limit(25);
        toolResult = res;
        break; }
      case 'create_contact':
        toolResult = await supabase.from('contacts').insert({
          first_name: args.first_name,
          last_name:  args.last_name,
          email:      args.email,
          phone:      args.phone ?? null,
          company_id: args.company_id ?? null,
          owner_id:   user.id
        }).select().single();
        break;
      case 'add_note':
        toolResult = await supabase.from('notes').insert({
          entity_type: args.entity_type,
          entity_id:   args.entity_id,
          text:        args.text,
          author_id:   user.id
        }).select().single();
        break;
      case 'create_deal':
        toolResult = await supabase.from('deals').insert({
          title:      args.title,
          company_id: args.company_id,
          contact_id: args.contact_id ?? null,
          amount:     args.amount ?? null,
          stage:      args.stage ?? 'lead',
          owner_id:   user.id
        }).select().single();
        break;
      case 'update_deal_stage':
        toolResult = await supabase
          .from('deals')
          .update({ stage: args.stage })
          .eq('id', args.deal_id)
          .select().single();
        break;
      case 'pipeline_summary':
        toolResult = await supabase.rpc('pipeline_summary_fn');
        break;
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
