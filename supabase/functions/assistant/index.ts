import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import OpenAI from "https://esm.sh/openai@4.56.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.3";

const openai = new OpenAI({ apiKey: Deno.env.get("OPENAI_API_KEY")! });

serve(async (req) => {
  const authHeader = req.headers.get("Authorization") || "";
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { global: { headers: { Authorization: authHeader } } }
  );
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) return new Response("Unauthorized", { status: 401 });

  const body = await req.json();
  const { messages } = body as { messages: Array<{role:"user"|"assistant"|"system"; content:string}> };

  const tools = [
    { type: "function", function: { name: "search_contacts", description: "Full-text search contacts by name/email/company.", parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"] } } },
    { type: "function", function: { name: "create_contact", description: "Create a new contact.", parameters: { type: "object", properties: { first_name: { type: "string" }, last_name: { type: "string" }, email: { type: "string" }, phone: { type: "string", nullable: true }, company_id: { type: "number", nullable: true } }, required: ["first_name","last_name","email"] } } },
    { type: "function", function: { name: "add_note", description: "Attach a note to a contact/company/deal.", parameters: { type: "object", properties: { entity_type: { enum: ["contact","company","deal"] }, entity_id: { type: "number" }, text: { type: "string" } }, required: ["entity_type","entity_id","text"] } } },
    { type: "function", function: { name: "create_deal", description: "Create a new deal/opportunity.", parameters: { type: "object", properties: { title: { type: "string" }, company_id: { type: "number" }, contact_id: { type: "number", nullable: true }, amount: { type: "number", nullable: true }, stage: { type: "string", nullable: true } }, required: ["title","company_id"] } } },
    { type: "function", function: { name: "update_deal_stage", description: "Move a deal to a new pipeline stage.", parameters: { type: "object", properties: { deal_id: { type: "number" }, stage: { type: "string" } }, required: ["deal_id","stage"] } } },
    { type: "function", function: { name: "pipeline_summary", description: "Summarize pipeline value and counts for advice.", parameters: { type: "object", properties: { time_window: { type: "string", nullable: true } }, required: [] } } }
  ];

  const sys = {
    role: "system" as const,
    content: "You are the in-app CRM assistant. When a user asks to find/add contacts, notes, or deals, call tools. Deals are sales opportunities with stage, amount, company, contact."
  };

  const chat = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [sys, ...messages],
    tools
  });

  const toolCall = chat.choices[0].message.tool_calls?.[0];
  if (!toolCall)
    return new Response(JSON.stringify(chat.choices[0].message), { headers: { "Content-Type": "application/json" }});

  const args = JSON.parse(toolCall.function.arguments || "{}");
  let toolResult: unknown;

  switch (toolCall.function.name) {
    case "search_contacts":
      toolResult = await supabase.from("contacts")
        .select("id, first_name, last_name, email, company_id")
        .ilike("first_name", `%${args.query}%`);
      break;
    case "create_contact":
      toolResult = await supabase.from("contacts").insert({
        first_name: args.first_name,
        last_name:  args.last_name,
        email:      args.email,
        phone:      args.phone ?? null,
        company_id: args.company_id ?? null,
        owner_id:   user.id
      }).select().single();
      break;
    case "add_note":
      toolResult = await supabase.from("notes").insert({
        entity_type: args.entity_type,
        entity_id:   args.entity_id,
        text:        args.text,
        author_id:   user.id
      }).select().single();
      break;
    case "create_deal":
      toolResult = await supabase.from("deals").insert({
        title:      args.title,
        company_id: args.company_id,
        contact_id: args.contact_id ?? null,
        amount:     args.amount ?? null,
        stage:      args.stage ?? "lead",
        owner_id:   user.id
      }).select().single();
      break;
    case "update_deal_stage":
      toolResult = await supabase.from("deals")
        .update({ stage: args.stage }).eq("id", args.deal_id)
        .select().single();
      break;
    case "pipeline_summary":
      toolResult = await supabase.rpc("pipeline_summary_fn");
      break;
  }

  const followup = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      sys,
      ...messages,
      { role: "tool", name: toolCall.function.name, content: JSON.stringify(toolResult) }
    ]
  });

  return new Response(JSON.stringify(followup.choices[0].message), {
    headers: { "Content-Type": "application/json" }
  });
});
