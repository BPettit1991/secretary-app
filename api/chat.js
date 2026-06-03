import { parseCookies, getAccessToken } from './auth.js';

const SYSTEM_PROMPT = `You are SECRETARY — a world-class AI butler. Think Alfred Pennyworth meets J.A.R.V.I.S: impeccably capable, quietly intelligent, always one step ahead. You exist to handle the tedious, surface the important, and give Benja back his time.

## Character
- Composed and precise. Never flustered, never verbose.
- Proactive — you notice things in the context and surface them without being asked
- Formal but warm. "Sir" when it's natural. Never sycophantic.
- Results-first. Say what you did, not what you're about to do.
- Dry wit is welcome when appropriate.

## Benja's world
Three contexts, constantly juggling:
- **LATS** — his company. ISO compliance, Sprinto evidence, RC documentation, Shopify store, Klaviyo campaigns, client work
- **Rainbow** — day job. Corporate structure, meetings, reports, stakeholder management
- **Real Life** — personal. Home, finances, life admin

## Infrastructure
- **MAIN-LAP** — Windows 11, primary machine. C:\\Users\\benja\\
- **BLACKBETTY** — Windows, secondary machine. Often low on storage.
- **MAC-MINI** — 2010 Mac Mini running macOS Ventura via OCLP. On home network.
- **TERTIARY** — Windows, third machine. Frequently offline.
- **OneDrive** — 1 TB primary cloud storage
- **Proxmox server** — self-hosted backend

## Operating rules
1. **Act, don't narrate.** When asked to do something, do it with tools. Report what happened.
2. **No unnecessary confirmation** for simple tasks (create a task, open a file, check calendar).
3. **Always draft emails** before sending — show the draft for review.
4. **Lead with the most important thing** when multiple things are happening.
5. **Be specific** — reference actual task names, file paths, people's names from context.
6. **Flag urgency unprompted** — if you see something overdue or a conflict, say so.

## Response style
- Short paragraphs, generous line breaks
- **Bold** for names, deadlines, key items
- Bullet lists for multiple items
- Code blocks for file paths and commands
- Maximum ~200 words unless detail is genuinely needed`;


const TOOLS = [
  {
    name: 'create_task',
    description: 'Create a task in Microsoft To-Do',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Task title' },
        importance: { type: 'string', enum: ['high', 'normal', 'low'], description: 'Priority level' },
        due_date: { type: 'string', description: 'Due date in YYYY-MM-DD format' },
        list_name: { type: 'string', description: 'LATS, Rainbow, or Real Life' },
        notes: { type: 'string', description: 'Additional notes' },
      },
      required: ['title'],
    },
  },
  {
    name: 'complete_task',
    description: 'Mark a task as completed',
    input_schema: {
      type: 'object',
      properties: {
        task_title: { type: 'string', description: 'Title of the task to complete (partial match ok)' },
      },
      required: ['task_title'],
    },
  },
  {
    name: 'create_calendar_event',
    description: 'Create a calendar event in Outlook',
    input_schema: {
      type: 'object',
      properties: {
        subject: { type: 'string' },
        start: { type: 'string', description: 'ISO 8601 datetime e.g. 2026-06-04T09:00:00' },
        end: { type: 'string', description: 'ISO 8601 datetime' },
        location: { type: 'string' },
        body: { type: 'string', description: 'Event description/notes' },
      },
      required: ['subject', 'start', 'end'],
    },
  },
  {
    name: 'get_emails',
    description: 'Get recent emails from Outlook inbox',
    input_schema: {
      type: 'object',
      properties: {
        count: { type: 'number', description: 'Number of emails to fetch (default 10)' },
        filter: { type: 'string', description: 'Filter: unread, flagged, or leave empty for all recent' },
      },
    },
  },
  {
    name: 'draft_email',
    description: 'Draft an email for review before sending. Always use this instead of send_email unless explicitly told to send immediately.',
    input_schema: {
      type: 'object',
      properties: {
        to: { type: 'string', description: 'Recipient email or name' },
        subject: { type: 'string' },
        body: { type: 'string', description: 'Email body in plain text' },
        cc: { type: 'string', description: 'CC recipients' },
      },
      required: ['subject', 'body'],
    },
  },
  {
    name: 'send_email',
    description: 'Send an email immediately. Only use when user explicitly says to send without review.',
    input_schema: {
      type: 'object',
      properties: {
        to: { type: 'string', description: 'Recipient email address' },
        subject: { type: 'string' },
        body: { type: 'string' },
        cc: { type: 'string' },
      },
      required: ['to', 'subject', 'body'],
    },
  },
  {
    name: 'open_path',
    description: 'Open a file or folder on the local machine via the bridge',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Windows file path e.g. C:\\Users\\benja\\lats' },
      },
      required: ['path'],
    },
  },
  {
    name: 'open_url',
    description: 'Open a URL in the browser',
    input_schema: {
      type: 'object',
      properties: {
        url: { type: 'string' },
        reason: { type: 'string', description: 'Brief description of why' },
      },
      required: ['url'],
    },
  },
  {
    name: 'run_command',
    description: 'Run a PowerShell command on the local machine via the bridge. Use for system operations, file management, checking disk space, etc.',
    input_schema: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'PowerShell command to execute' },
        description: { type: 'string', description: 'What this command does' },
      },
      required: ['command', 'description'],
    },
  },
  {
    name: 'search_onedrive',
    description: 'Search for files in OneDrive by name or content',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search term' },
        file_type: { type: 'string', description: 'e.g. xlsx, docx, pdf (optional)' },
      },
      required: ['query'],
    },
  },
];

// ── Tool executors ──────────────────────────────────────────────────────────

async function execCreateTask(input, token) {
  // Find or create the list
  const listsRes = await fetch('https://graph.microsoft.com/v1.0/me/todo/lists', {
    headers: { Authorization: `Bearer ${token}` },
  });
  const lists = await listsRes.json();
  const listName = input.list_name || 'Tasks';
  let list = (lists.value || []).find(l =>
    l.displayName.toLowerCase() === listName.toLowerCase()
  );

  if (!list) {
    // Create the list if it doesn't exist
    const createRes = await fetch('https://graph.microsoft.com/v1.0/me/todo/lists', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ displayName: listName }),
    });
    list = await createRes.json();
  }

  const task = {
    title: input.title,
    importance: input.importance || 'normal',
  };
  if (input.due_date) {
    task.dueDateTime = { dateTime: `${input.due_date}T00:00:00`, timeZone: 'Australia/Melbourne' };
  }
  if (input.notes) {
    task.body = { content: input.notes, contentType: 'text' };
  }

  const res = await fetch(`https://graph.microsoft.com/v1.0/me/todo/lists/${list.id}/tasks`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(task),
  });
  const data = await res.json();
  if (!res.ok) return { error: data.error?.message };
  return { created: true, title: data.title, id: data.id, list: listName };
}

async function execCompleteTask(input, token) {
  const listsRes = await fetch('https://graph.microsoft.com/v1.0/me/todo/lists', {
    headers: { Authorization: `Bearer ${token}` },
  });
  const lists = await listsRes.json();

  for (const list of lists.value || []) {
    const tasksRes = await fetch(
      `https://graph.microsoft.com/v1.0/me/todo/lists/${list.id}/tasks?$filter=status ne 'completed'`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const tasks = await tasksRes.json();
    const match = (tasks.value || []).find(t =>
      t.title.toLowerCase().includes(input.task_title.toLowerCase())
    );
    if (match) {
      const res = await fetch(
        `https://graph.microsoft.com/v1.0/me/todo/lists/${list.id}/tasks/${match.id}`,
        {
          method: 'PATCH',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'completed' }),
        }
      );
      if (res.ok) return { completed: true, title: match.title };
    }
  }
  return { error: `Task matching "${input.task_title}" not found` };
}

async function execCreateCalendarEvent(input, token) {
  const event = {
    subject: input.subject,
    start: { dateTime: input.start, timeZone: 'Australia/Melbourne' },
    end: { dateTime: input.end, timeZone: 'Australia/Melbourne' },
  };
  if (input.location) event.location = { displayName: input.location };
  if (input.body) event.body = { content: input.body, contentType: 'text' };

  const res = await fetch('https://graph.microsoft.com/v1.0/me/events', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(event),
  });
  const data = await res.json();
  if (!res.ok) return { error: data.error?.message };
  return { created: true, subject: data.subject, start: data.start?.dateTime, id: data.id };
}

async function execGetEmails(input, token) {
  const count = input.count || 10;
  let url = `https://graph.microsoft.com/v1.0/me/messages?$top=${count}&$orderby=receivedDateTime desc&$select=subject,from,receivedDateTime,isRead,bodyPreview,importance`;
  if (input.filter === 'unread') url += `&$filter=isRead eq false`;
  if (input.filter === 'flagged') url += `&$filter=flag/flagStatus eq 'flagged'`;

  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const data = await res.json();
  if (!res.ok) return { error: data.error?.message };
  return {
    emails: (data.value || []).map(e => ({
      id: e.id,
      subject: e.subject,
      from: e.from?.emailAddress?.name || e.from?.emailAddress?.address,
      received: e.receivedDateTime,
      isRead: e.isRead,
      preview: e.bodyPreview?.slice(0, 200),
      importance: e.importance,
    })),
  };
}

async function execSendEmail(input, token) {
  const msg = {
    message: {
      subject: input.subject,
      body: { contentType: 'Text', content: input.body },
      toRecipients: [{ emailAddress: { address: input.to } }],
    },
  };
  if (input.cc) {
    msg.message.ccRecipients = [{ emailAddress: { address: input.cc } }];
  }

  const res = await fetch('https://graph.microsoft.com/v1.0/me/sendMail', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(msg),
  });

  if (res.status === 202) return { sent: true, to: input.to, subject: input.subject };
  const data = await res.json().catch(() => ({}));
  return { error: data.error?.message || `HTTP ${res.status}` };
}

async function execSearchOneDrive(input, token) {
  const res = await fetch(
    `https://graph.microsoft.com/v1.0/me/drive/root/search(q='${encodeURIComponent(input.query)}')?$top=10&$select=name,webUrl,lastModifiedDateTime,size,file`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const data = await res.json();
  if (!res.ok) return { error: data.error?.message };
  const results = (data.value || []).filter(f => {
    if (input.file_type) return f.name?.toLowerCase().endsWith(`.${input.file_type.toLowerCase()}`);
    return true;
  });
  return {
    results: results.map(f => ({
      name: f.name,
      url: f.webUrl,
      modified: f.lastModifiedDateTime,
      size: f.size,
    })),
  };
}

// ── Main handler ────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { message, context, history = [] } = req.body || {};
  if (!message) return res.status(400).json({ error: 'message required' });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' });

  let token = null;
  try {
    const auth = await getAccessToken(req);
    token = auth.accessToken;
  } catch (e) {
    // proceed without token — tools requiring it will fail gracefully
  }

  const now = new Date();
  const contextBlock = context ? `
## Live snapshot — ${now.toLocaleString('en-AU', { timeZone: 'Australia/Melbourne' })}

### Calendar (next 7 days)
${(context.calendar || []).slice(0, 15).map(e => {
    const d = new Date(e.start);
    return `- ${d.toLocaleString('en-AU', { timeZone: 'Australia/Melbourne', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} — ${e.subject}${e.location ? ` @ ${e.location}` : ''}`;
  }).join('\n') || '- No events'}

### Open tasks
${(context.tasks || []).slice(0, 25).map(t =>
    `- [${(t.importance || 'normal').toUpperCase()}] ${t.title}${t.due ? ` · due ${t.due}` : ''} (${t.list || 'Tasks'})`
  ).join('\n') || '- No open tasks'}

### OneDrive storage
${context.storage ? `${Math.round(context.storage.used / 1e9)} GB used of ${Math.round(context.storage.total / 1e9)} GB (${Math.round(context.storage.remaining / 1e9)} GB free)` : 'Unknown'}
` : '';

  // Build conversation history for Claude
  const messages = [
    ...history.slice(-10), // last 10 exchanges for context
    { role: 'user', content: message },
  ];

  // Agentic loop — Claude may call multiple tools
  const clientActions = []; // open_path, open_url, draft_email — handled by frontend
  const executedTools = []; // what was done server-side

  try {
    let response = await callClaude(apiKey, SYSTEM_PROMPT + contextBlock, messages, TOOLS);

    // Tool use loop
    let iterations = 0;
    while (response.stop_reason === 'tool_use' && iterations < 5) {
      iterations++;
      const toolUseBlocks = response.content.filter(b => b.type === 'tool_use');
      const toolResults = [];

      for (const toolUse of toolUseBlocks) {
        const { name, input, id } = toolUse;
        let result;

        try {
          if (name === 'create_task') {
            result = token
              ? await execCreateTask(input, token)
              : { error: 'Not authenticated with Microsoft' };
            if (result.created) executedTools.push({ type: 'task_created', ...result });
          } else if (name === 'complete_task') {
            result = token ? await execCompleteTask(input, token) : { error: 'Not authenticated' };
            if (result.completed) executedTools.push({ type: 'task_completed', ...result });
          } else if (name === 'create_calendar_event') {
            result = token ? await execCreateCalendarEvent(input, token) : { error: 'Not authenticated' };
            if (result.created) executedTools.push({ type: 'event_created', ...result });
          } else if (name === 'get_emails') {
            result = token ? await execGetEmails(input, token) : { error: 'Not authenticated — Mail scope may not be granted' };
          } else if (name === 'send_email') {
            result = token ? await execSendEmail(input, token) : { error: 'Not authenticated' };
            if (result.sent) executedTools.push({ type: 'email_sent', ...result });
          } else if (name === 'draft_email') {
            result = { drafted: true, ...input };
            clientActions.push({ type: 'draft_email', ...input });
          } else if (name === 'open_path') {
            result = { queued: true, path: input.path };
            clientActions.push({ type: 'open_path', path: input.path });
          } else if (name === 'open_url') {
            result = { queued: true, url: input.url };
            clientActions.push({ type: 'open_url', url: input.url });
          } else if (name === 'run_command') {
            result = { queued: true, command: input.command, description: input.description };
            clientActions.push({ type: 'run_command', command: input.command, description: input.description });
          } else if (name === 'search_onedrive') {
            result = token ? await execSearchOneDrive(input, token) : { error: 'Not authenticated' };
          } else {
            result = { error: `Unknown tool: ${name}` };
          }
        } catch (err) {
          result = { error: err.message };
        }

        toolResults.push({ type: 'tool_result', tool_use_id: id, content: JSON.stringify(result) });
      }

      // Feed results back to Claude
      messages.push({ role: 'assistant', content: response.content });
      messages.push({ role: 'user', content: toolResults });
      response = await callClaude(apiKey, SYSTEM_PROMPT + contextBlock, messages, TOOLS);
    }

    // Extract final text
    const text = response.content
      .filter(b => b.type === 'text')
      .map(b => b.text)
      .join('\n')
      .trim();

    res.json({ response: text, actions: clientActions, executed: executedTools });
  } catch (err) {
    console.error('Chat error:', err);
    res.status(500).json({ error: err.message });
  }
}

async function callClaude(apiKey, system, messages, tools) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-opus-4-5',
      max_tokens: 2048,
      system,
      tools,
      messages,
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || `Claude API ${res.status}`);
  return data;
}
